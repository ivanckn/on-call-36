"""Screen simulated AWB declarations against a narrow, versioned rule set.

The per-leg acceptance records represent qualified review upstream. This module
does not classify commodities or issue acceptance for carriage.
"""
from math import isfinite

POLICY_VERSION = "ONCALL36-DEMO-CX-2026-11"
IATA_BATTERIES = "IATA Lithium and Sodium Ion Battery Guidance, 2026"
CX_POLICY = "Cathay Cargo operator variations and dangerous goods acceptance"
LEG_RECORD = "Simulated AWB/leg acceptance record"
READY, REVIEW, BLOCKED = "ELIGIBLE_FOR_PLANNING", "NEEDS_DG_REVIEW", "BLOCKED"


def issue(status, code, message, source=LEG_RECORD):
    return dict(status=status, code=code, message=message, source=source)


def positive(value):
    return type(value) in (int, float) and isfinite(value) and value > 0


def check(shipment, flight):
    items = shipment.get("regulatedItems", [])
    findings = []
    if shipment.get("dg") and not items:
        findings.append(issue(REVIEW, "DECLARATION_MISSING", "Obtain the verified dangerous-goods entry and package data."))
    if shipment.get("liquid") and not any(item.get("liquid") is True for item in items):
        if shipment.get("nonDgLiquidVerified") is not True:
            findings.append(issue(REVIEW, "LIQUID_CLASSIFICATION_MISSING", "Verify the liquid classification and package data."))
        else:
            findings.append(issue(READY, "LIQUID_CLASSIFICATION_VERIFIED",
                                  "Non-dangerous liquid classification recorded in the demo."))
    if items and flight.get("operator") != "CX":
        findings.append(issue(REVIEW, "OPERATOR_POLICY_MISSING", "Obtain the operating carrier's applicable rules."))
    approvals = shipment.get("dgLegAcceptance", {}).get(flight["id"], {})
    entries = [item.get("entryId") for item in items]
    if len(set(entries)) != len(entries):
        findings.append(issue(REVIEW, "DUPLICATE_PACKAGE_ENTRY", "Resolve duplicate package-entry IDs before planning."))
    for item in items:
        findings.extend(check_entry(item, flight, approvals))
    if any(item.get("un") == "UN1845" for item in items):
        cap = flight.get("dryIceCapacityKg")
        if type(cap) not in (int, float) or not isfinite(cap) or cap < 0:
            findings.append(issue(REVIEW, "DRY_ICE_BUDGET_UNAVAILABLE", "Confirm the permitted remaining dry-ice capacity."))
        elif dry_ice_kg(shipment) > cap:
            findings.append(issue(BLOCKED, "DRY_ICE_EXCEEDS_LEG_BUDGET", "This AWB alone exceeds the simulated leg's dry-ice budget."))
    blocked = any(f["status"] == BLOCKED for f in findings)
    review = any(f["status"] == REVIEW for f in findings)
    return dict(status=BLOCKED if blocked else REVIEW if review else READY,
                policyVersion=POLICY_VERSION, findings=findings,
                declaredUNs=sorted({item["un"] for item in items if item.get("un")}))


def check_entry(item, flight, approvals):
    un, pkg = item.get("un"), item.get("entryId")
    if not un or not pkg:
        return [issue(REVIEW, "DECLARATION_INCOMPLETE", "Obtain the verified UN number and package entry ID.")]
    findings = []
    operator_cx = flight.get("operator") == "CX"
    if flight["kind"] == "PAX" and (un in {"UN3480", "UN3090", "UN3551"} or item.get("cargoAircraftOnly") is True):
        findings.append(issue(BLOCKED, "CARGO_AIRCRAFT_ONLY",
                              f"{un} is cargo-aircraft-only in this assessment.", IATA_BATTERIES if un in {"UN3480", "UN3090", "UN3551"} else LEG_RECORD))
    if un == "UN3090" and operator_cx:
        findings.append(issue(BLOCKED, "CX07_UN3090_PROHIBITED", "CX prohibits standalone lithium-metal batteries in the checked scope.", CX_POLICY))
    if un == "UN3480" and operator_cx and item.get("cxPriorApprovalVerified") is not True:
        findings.append(issue(REVIEW, "CX_UN3480_PRIOR_APPROVAL_REQUIRED",
                              "Obtain the applicable Cathay prior approval for this UN3480 shipment.", CX_POLICY))
    if un in {"UN3480", "UN3551"}:
        charge = item.get("stateOfChargePct")
        if type(charge) not in (int, float) or not isfinite(charge) or not 0 <= charge <= 100:
            findings.append(issue(REVIEW, "BATTERY_CHARGE_UNVERIFIED", "Confirm the declared battery state of charge.", IATA_BATTERIES))
        elif charge > 30:
            findings.append(issue(REVIEW, "BATTERY_CHARGE_EXCEPTION_REQUIRED",
                                  "Charge exceeds the standard allowance. Send any applicable authority approval to a DG specialist.", IATA_BATTERIES))
    if un in {"UN3480", "UN3481", "UN3090", "UN3091", "UN3551", "UN3552"}:
        if item.get("condition") != "verified_undamaged":
            findings.append(issue(REVIEW, "BATTERY_CONDITION_REVIEW", "DG acceptance must verify battery condition and applicable special provisions."))
        if operator_cx and item.get("class3InSameOuterPackaging") is True:
            findings.append(issue(BLOCKED, "BATTERY_CLASS3_SAME_OUTER_PACKAGE",
                                  "The battery entry and Class 3 material share an outer package or overpack in this checked case.", CX_POLICY))
    if operator_cx and item.get("liquid") is True:
        if not item.get("packingGroup") or not item.get("packaging"):
            findings.append(issue(REVIEW, "LIQUID_PACKAGING_PROFILE_MISSING", "Confirm packing group applicability and the packaging configuration."))
        elif item["packingGroup"] in {"I", "II", "III"} and item["packaging"] == "combination":
            if item.get("fullAbsorbencyVerified") is False:
                findings.append(issue(BLOCKED, "CX02_LIQUID_ABSORBENCY", "Packaging evidence shows insufficient absorbent for the liquid contents.", CX_POLICY))
            elif item.get("fullAbsorbencyVerified") is not True:
                findings.append(issue(REVIEW, "CX02_LIQUID_PACKAGING_EVIDENCE", "Verify sufficient absorbent for the full liquid contents.", CX_POLICY))
    evidence = approvals.get(pkg, {})
    current = evidence.get("policyVersion") == POLICY_VERSION and evidence.get("un") == un
    if current and evidence.get("decision") == "denied" and evidence.get("reference"):
        findings.append(issue(BLOCKED, "LEG_ACCEPTANCE_DENIED", "The leg acceptance record prohibits this package configuration."))
    elif not current or evidence.get("decision") != "accepted" or not evidence.get("reference"):
        findings.append(issue(REVIEW, "LEG_ACCEPTANCE_NOT_VERIFIED",
                              "Obtain a current acceptance record for this entry on the operating leg."))
    else:
        quantity, count, limit = item.get("netPerPackage"), item.get("packageCount"), evidence.get("maxNetPerPackage")
        if (not positive(quantity) or type(count) is not int or count < 1 or not positive(limit)
                or item.get("unit") not in (("kg",) if un == "UN1845" else ("kg", "L"))
                or item["unit"] != evidence.get("unit")):
            findings.append(issue(REVIEW, "PACKAGE_QUANTITY_UNVERIFIED", "Confirm net quantity per package and the unit in its acceptance record."))
        elif quantity > limit:
            findings.append(issue(BLOCKED, "PACKAGE_LIMIT_EXCEEDED", "Declared net quantity per package exceeds the accepted limit for this leg."))
        else:
            findings.append(issue(READY, "LEG_ACCEPTANCE_VERIFIED",
                                  f"Package record {evidence['reference']} matches this leg and quantity."))
    return findings


def dry_ice_kg(shipment):
    return sum(item["netPerPackage"] * item["packageCount"]
               for item in shipment.get("regulatedItems", [])
               if (item.get("un") == "UN1845" and item.get("unit") == "kg" and positive(item.get("netPerPackage"))
                   and type(item.get("packageCount")) is int and item["packageCount"] > 0))
