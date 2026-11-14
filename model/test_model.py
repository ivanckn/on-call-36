"""Sanity tests on the committed outputs. Run: python test_model.py"""
import json, os
from copy import deepcopy
from optimise import Problem
from regulatory import BLOCKED, READY, REVIEW, check, dry_ice_kg
import scenario as sc
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
S = json.load(open(f"{D}/shipments.json")); SC = json.load(open(f"{D}/scenario.json")); C = json.load(open(f"{D}/compare.json"))
F = {f["id"]: f for f in SC["flights"]}; H = {s["hero"]: s for s in S if s["hero"]}
for s in S:
    assert all(not a["chosen"] or a["regulatory"]["status"] == READY for a in s["alternatives"]), "a screened out leg was chosen"
    if s["assigned"]:
        f = F[s["assigned"]]
        assert check(s, f)["status"] == READY
        assert not (s["mainDeck"] and f["kind"] == "PAX"), "main deck unit on a passenger flight"
        assert f["dep"] >= s["ready"], "transfer time broken"
        assert f["dest"] == s["dest"]
        assert s["latestDep"] is None or f["dep"] <= s["latestDep"]
for f in F.values():
    assert sum(1 for s in S if s["assigned"] == f["id"] and s["cool"]) <= f["coolPositions"], "cool positions exceeded"
    assert sum(dry_ice_kg(s) for s in S if s["assigned"] == f["id"]) <= f["dryIceCapacityKg"]
ret = SC["returnFlight"]
assert ret["dep"] == max(ret["schedDep"], F[sc.TRIGGER]["arr"] + sc.TURNAROUND) and ret["dep"] > ret["schedDep"], "delay did not propagate to the return flight"
assert F[H["cherries"]["assigned"]]["arr"] <= H["cherries"]["promise"], "cherries miss their promise"
assert H["cherries"]["assigned"] != sc.R("CX9101")
assert H["garments"]["assigned"] != sc.R("CX9102") and F[H["garments"]["assigned"]]["arr"] <= H["garments"]["promise"], "garments"
assert H["isotopes"]["assigned"] is None and H["isotopes"]["status"] == "Needs a person"
assert H["electronics"]["status"] == "Placed, promise missed"
assert check(H["dg"], F[sc.R("CX9102")])["status"] == BLOCKED
assert check(H["dg"], F[sc.R("CX9104")])["status"] == READY
assert check(H["electronics"], F[sc.R("CX9305")])["status"] == READY
assert check(H["metal"], F[sc.R("CX9104")])["status"] == BLOCKED and H["metal"]["assigned"] is None
assert check(H["paint_review"], F[sc.R("CX9104")])["status"] == REVIEW and H["paint_review"]["assigned"] is None
assert check(H["water"], F[sc.R("CX9102")])["status"] == READY
assert check(dict(H["cherries"], liquid=True), F[sc.R("CX9102")])["status"] == REVIEW
value = deepcopy(H["dg"])
value["regulatedItems"][0]["stateOfChargePct"] = 31
assert check(value, F[sc.R("CX9104")])["status"] == REVIEW
value = deepcopy(H["dg"])
value["regulatedItems"][0]["cxPriorApprovalVerified"] = False
assert check(value, F[sc.R("CX9104")])["status"] == REVIEW
value = deepcopy(H["dg"])
value["dgLegAcceptance"][sc.R("CX9104")]["PKG-A"]["policyVersion"] = "STALE"
assert check(value, F[sc.R("CX9104")])["status"] == REVIEW
paint = deepcopy(next(s for s in S if s["commodity"] == "Paint (DG)"))
paint["regulatedItems"][0]["netPerPackage"] = 5.1
assert check(paint, F[sc.R("CX9104")])["status"] == BLOCKED

# Both AWBs pass a standalone check. Their combined dry ice exceeds the first leg budget.
cherries = H["cherries"]
seafood = next(s for s in S if s["commodity"] == "Chilled seafood")
ice_problem = Problem([cherries, seafood], {f["id"]: f for f in (F[sc.R("CX9102")], F[sc.R("CX9104")])})
assert all(check(s, F[sc.R("CX9102")])["status"] == READY for s in (cherries, seafood))
assert ice_problem.solve({sc.R("CX9102"): [20_000], sc.R("CX9104"): [20_000]},
                         {s["awb"]: sc.R("CX9102") for s in (cherries, seafood)}) is None
result = ice_problem.replay({cherries["awb"]: sc.R("CX9102"), seafood["awb"]: sc.R("CX9102")},
                           {sc.R("CX9102"): 20_000, sc.R("CX9104"): 20_000})
assert result["loads"][sc.R("CX9102")]["dryIceKg"] == 10
assert result["loads"][sc.R("CX9104")]["dryIceKg"] == 10
ours = [c for c in C if c["policy"] == "On Call 36"][0]
for reference in (c for c in C if c["policy"] in ("Backlog first", "Original bookings first")):
    assert ours["expectedCostIndex"] <= reference["expectedCostIndex"], "a greedy policy beat the optimiser"

# A delayed AWB may recover only if the later flight can accept it in full.
def flight(fid, departure, positions):
    return dict(id=fid, dep=departure, arr=departure + 1, dest="PVG", kind="FRT", coolPositions=positions)


a = dict(awb="a", tier="PR1", kg=8, dest="PVG", ready=0, promise=10, kind="RECOVERY",
         booked=None, cool=True, dg=False, mainDeck=False)
b = dict(a, awb="b", kg=5)
flights = {"early": flight("early", 1, 1), "late": flight("late", 3, 2)}
plan = {"a": "early", "b": "late"}
pb = Problem([a, b], flights)
assert pb.replay(plan, {"early": 7, "late": 12})["flown"] == {"a": None, "b": "late"}
assert pb.replay(plan, {"early": 7, "late": 13})["flown"] == {"a": "late", "b": "late"}
restricted = deepcopy(flights)
restricted["late"]["coolPositions"] = 1
assert Problem([a, b], restricted).replay(plan, {"early": 7, "late": 13})["flown"]["a"] is None

# A forced assignment can still be offloaded, but only as a whole AWB.
forced = pb.solve({"early": [7], "late": [13]}, {"a": "early"})
assert forced is not None and forced["plan"]["a"] == "early"
assert forced["objective"] >= pb.c[("a", "early")] + pb.bump_cost[("a", "early")] - 1e-8
for s in S:
    options = s["timeSensitivity"]["flightOptions"]
    for first, later in zip(options, options[1:]):
        assert all(0 <= p <= later["risk"][name] <= 1 for name, p in first["risk"].items())
semi = next(s for s in S if s["commodity"] == "Semiconductors")
early, later = [next(f for f in semi["timeSensitivity"]["flightOptions"] if f["flight"] == fid)
                for fid in (sc.R("CX9102"), sc.R("CX9101"))]
assert later["arrival"] < semi["promise"] and later["learnedRiskCostIndex"] > early["learnedRiskCostIndex"]
assert all(f["flight"] != sc.R("CX9106") for f in H["pharma"]["timeSensitivity"]["flightOptions"])
lower_tier = dict(b, tier="PR2")
control = Problem([a, lower_tier], flights)
charged = Problem([a, lower_tier], flights, risk_cost={("b", "late"): 111})
assert charged.c["b", "late"] == control.c["b", "late"] + 111
without_risk = control.solve({"early": [8], "late": [13]})
with_risk = charged.solve({"early": [8], "late": [13]})
assert without_risk is not None and without_risk["plan"]["a"] == "early"
assert with_risk is not None and with_risk["plan"]["b"] == "early"
# Live trigger source: OAG status parsing, on a fixture shaped on the OAG documentation.
import status
_r = {"flightNumber": 360, "departure": {"airport": {"iata": "HKG"}, "date": {"local": "2026-11-17", "utc": "2026-11-17"}, "time": {"local": "13:35", "utc": "05:35"}},
      "arrival": {"airport": {"iata": "PVG"}}, "serviceType": {"iata": "J"}, "aircraftType": {"iata": "333"},
      "statusDetails": [{"state": "Scheduled", "departure": {"estimatedTime": {"outGate": {"utc": "2026-11-17T14:35:00"}}}}]}
assert status.parse(_r)["delayMinutes"] == 540
assert status.parse({**_r, "statusDetails": [{"departure": {"actualTime": {"outGateVariation": "PT1H5M"}}}]})["delayMinutes"] == 65
assert status.parse({k: v for k, v in _r.items() if k != "statusDetails"})["hasStatus"] is False
assert status.summarise([_r], "2026-11-17", "fixture")["incidents"] == ["CX360"]
print("all checks passed:", len(S), "shipments,", len(F), "flights")
