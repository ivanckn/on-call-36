"""Read-only MCP tools on the On Call 36 model, so a language model host (for example Claude Desktop) can ask the
model questions and explain the answers in plain words. Ported from the teammate's version to the merged model
(real CX flight numbers from OAG, shared build_problem() with run.py).

Run:  python mcp_server.py                              (stdio, for a desktop MCP host)
      python mcp_server.py --transport streamable-http  (http://127.0.0.1:8000/mcp)
The first call trains the forecast and solves the base plan, about 30 seconds."""
from functools import lru_cache
from typing import Annotated
import argparse

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import Field

import run
from regulatory import POLICY_VERSION, READY
from sensitivity import IMPACT, describe, rank_retention

mcp = FastMCP("On Call 36", instructions=(
    "All shipments, the disruption and the costs are simulated; flight times are the real CX schedule from OAG. "
    "Cost indices are unitless, never money. A proposed assignment is subject to controller and load-control approval. "
    "Report the solver status, and use only tool results for numerical claims."
), json_response=True, stateless_http=True)
READ_ONLY = ToolAnnotations(readOnlyHint=True)


@lru_cache(maxsize=1)
def scenario():
    B = run.build_problem()
    pb = B["pb"]
    base = pb.solve(B["caps_plan"])
    if base is None:
        raise RuntimeError("No baseline plan within the solve limit.")
    metrics, uplift = pb.evaluate_with_uplift(base["plan"], B["caps_eval"])
    return pb, B["caps_plan"], B["caps_eval"], base, metrics, uplift


def describe_changes(pb, old, new):
    return [dict(awb=a, commodity=pb.by[a]["commodity"], tier=pb.by[a]["tier"], was=old[a], now=new[a])
            for a in old if old[a] != new[a]]


@mcp.tool(annotations=READ_ONLY)
def get_recovery_snapshot(destination: str = "") -> dict:
    """List proposed assignments and flight IDs for a destination such as PVG, NRT, or LAX."""
    pb, _, _, base, metrics, uplift = scenario()
    dest = destination.upper()
    flights = [dict(id=f["id"], destination=f["dest"], kind=f["kind"], aircraft=f.get("aircraftType"), status=f["status"],
                    departure=f["dep"], arrival=f["arr"], forecastKg=f["forecastKg"], coldPositions=f["coolPositions"])
               for f in pb.order if not dest or f["dest"] == dest]
    shipments = [dict(awb=s["awb"], commodity=s["commodity"], tier=s["tier"], booked=s["booked"], proposed=base["plan"][s["awb"]],
                      promise=s["promise"], cohort=s["kind"], handling=s["shc"], kg=s["kg"], simulatedUplift=round(uplift[s["awb"]], 3))
                 for s in pb.S if not dest or s["dest"] == dest]
    return dict(simulated=True, replayScenarios=run.N_EVAL, timeUnits="hours since T0", decisionStatus="Proposed for approval",
                solverStatus=base["solverStatus"], solverGap=base["solverGap"], systemMetrics=metrics, flights=flights, shipments=shipments)


@mcp.tool(annotations=READ_ONLY)
def test_booking_override(awb: str, flight: str) -> dict:
    """Force one booking and re-solve. A what-if: the rule that blocks it, or what else moves and the change in the headline numbers."""
    base = run.compute(with_compare=False, n_eval=300)
    alt = run.compute(forced={awb: flight}, with_compare=False, n_eval=300)
    if not alt["feasible"]:
        return dict(simulated=True, awb=awb, flight=flight, allowed=False, reason=alt["reason"], regulatory=alt.get("regulatory"))
    return dict(simulated=True, awb=awb, flight=flight, allowed=True, **run.diff(base, alt))


@mcp.tool(annotations=READ_ONLY)
def check_regulatory_eligibility(awb: str, flight: str = "", with_awbs: list[str] | None = None) -> dict:
    """Check an AWB against recovery legs and optionally screen a specified group together for the dry ice budget."""
    pb, _, _, base, _, _ = scenario()
    group = list(dict.fromkeys([awb, *(with_awbs or [])]))
    if any(a not in pb.by for a in group) or (flight and flight not in pb.F):
        return dict(simulated=True, error="Unknown AWB or flight ID.")
    legs = []
    for f in pb.order:
        fid = f["id"]
        if (flight and flight != fid) or (awb, fid) not in pb.regulatory:
            continue
        other_ice = sum(pb.dry_ice[a] for a, proposed in base["plan"].items() if proposed == fid and a != awb)
        together_ice = sum(pb.dry_ice[a] for a in group)
        legs.append(dict(flight=fid, aircraftKind=f["kind"], screen=pb.regulatory[awb, fid], planningExclusion=pb.ineligibility[awb, fid],
                         remainingDryIceKg=f["dryIceCapacityKg"] - other_ice,
                         fitsBaselineDryIceBudget=other_ice + pb.dry_ice[awb] <= f["dryIceCapacityKg"],
                         groupScreen=dict(dryIceKg=together_ice, capacityKg=f["dryIceCapacityKg"], fitsDryIceBudget=together_ice <= f["dryIceCapacityKg"],
                                          excludedAWBs=[a for a in group if pb.regulatory.get((a, fid), {}).get("status") != READY])))
    return dict(simulated=True, policyVersion=POLICY_VERSION, awb=awb, commodity=pb.by[awb]["commodity"],
                shipmentDryIceKg=pb.dry_ice[awb], proposed=base["plan"][awb], legs=legs)


@mcp.tool(annotations=READ_ONLY)
def compare_time_sensitivity(awb_ids: list[str], earlier_flight: str | None = None, later_flight: str | None = None) -> dict:
    """Compare quality loss and downstream disruption risk by arrival time, and optionally rank which AWB to defer."""
    pb, _, _, _, _, _ = scenario()
    known = [a for a in awb_ids if a in pb.by]
    result = dict(simulated=True, timeUnits="hours since T0", impactPoints=IMPACT, shipments=[describe(pb, a) for a in known],
                  unknownAWBs=[a for a in awb_ids if a not in pb.by])
    if earlier_flight is None and later_flight is None:
        return result
    if earlier_flight not in pb.F or later_flight not in pb.F:
        return {**result, "rankingError": "Supply two known flight IDs to rank deferrals."}
    try:
        result["ranking"] = rank_retention(pb, known, earlier_flight, later_flight)
    except ValueError as err:
        result["rankingError"] = str(err)
    return result


@mcp.tool(annotations=READ_ONLY)
def stress_test_capacity(flight: str, loss_kg: Annotated[int, Field(ge=0, le=30_000)]) -> dict:
    """Take capacity off one flight, then compare keeping the current plan with re-planning that lane."""
    pb, caps_plan, caps_eval, base, _, _ = scenario()
    if flight not in pb.F:
        return dict(simulated=True, error="Unknown flight ID.")
    stressed_plan = {**caps_plan, flight: (caps_plan[flight] - loss_kg).clip(min=0)}
    stressed_eval = {**caps_eval, flight: (caps_eval[flight] - loss_kg).clip(min=0)}
    alt = pb.solve(stressed_plan, reference=base, destination=pb.F[flight]["dest"])
    if alt is None:
        return dict(simulated=True, error="The solver returned no feasible plan within the time limit.")
    return dict(simulated=True, flight=flight, lossKg=loss_kg, replayScenarios=run.N_EVAL, replannedDestination=pb.F[flight]["dest"],
                keepCurrentPlan=pb.evaluate(base["plan"], stressed_eval), reoptimisedPlan=pb.evaluate(alt["plan"], stressed_eval),
                changed=describe_changes(pb, base["plan"], alt["plan"]), solverStatus=alt["solverStatus"], solverGap=alt["solverGap"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--transport", choices=["stdio", "streamable-http"], default="stdio")
    args = parser.parse_args()
    scenario()
    mcp.run(transport=args.transport)
