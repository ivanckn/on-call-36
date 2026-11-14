"""Invented package quantities, acceptance records, and leg capacities for the demo."""
from regulatory import POLICY_VERSION


def entry(un, quantity, unit, count, **details):
    return dict(entryId="PKG-A", un=un, netPerPackage=quantity, unit=unit,
                packageCount=count, **details)


STANDALONE_BATTERY = entry("UN3480", 5, "kg", 170, condition="verified_undamaged",
                           stateOfChargePct=25, cxPriorApprovalVerified=True)
EQUIPMENT_BATTERY = entry("UN3481", 1, "kg", 100, condition="verified_undamaged")
PAINT = entry("UN1263", 4, "L", 230, liquid=True, packingGroup="II",
              packaging="combination", fullAbsorbencyVerified=True)
DRY_ICE = entry("UN1845", 0.5, "kg", 20)


def declarations(shipment):
    commodity = shipment["commodity"]
    profiles = {
        "Lithium batteries": (STANDALONE_BATTERY, 5),
        "Consumer electronics": (EQUIPMENT_BATTERY, 2),
        "Paint (DG)": (PAINT, 5),
        "Cherries": (DRY_ICE, 2),
        "Chilled seafood": (DRY_ICE, 2),
        "Car batteries": (entry("UN2794", 8, "kg", 230, cargoAircraftOnly=True), 10),
        "Medical isotopes": (entry("UN2915", 1, "kg", 10, cargoAircraftOnly=True), 5),
        "Lithium metal cells": (entry("UN3090", 2, "kg", 20, condition="verified_undamaged"), 3),
        "Paint with incomplete packaging evidence": ({**PAINT, "packageCount": 25, "fullAbsorbencyVerified": None}, 5),
    }
    if commodity == "Bottled water":
        return dict(liquid=True, nonDgLiquidVerified=True)
    if commodity not in profiles:
        return {}
    item, limit = profiles[commodity]
    acceptance = {
        flight["id"]: {
            item["entryId"]: dict(policyVersion=POLICY_VERSION, un=item["un"],
                                  decision="accepted", maxNetPerPackage=limit,
                                  unit=item["unit"], reference=f"SIM-{shipment['awb']}-{flight['id']}")
        }
        for flight in shipment["flights"] if flight["dest"] == shipment["dest"]
        and (item["un"] not in {"UN1263", "UN2794", "UN2915"} or flight["kind"] == "FRT")
        and item["un"] != "UN3090"
    }
    return dict(liquid=item.get("liquid", False), regulatedItems=[item.copy()], dgLegAcceptance=acceptance)
