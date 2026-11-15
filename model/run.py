"""Run everything and write the JSON files the app reads. Usage: python run.py [--force AWB=FLIGHT ...]

Pipeline: scenario and delay ripple -> capacity forecast with SHAP -> regulatory screen per shipment and leg
-> neural time sensitivity risk -> two stage stochastic optimiser per lane -> replay on fresh capacity draws
-> reasons, alternatives, what ifs. compute() is also what server.py calls for live re optimisation."""
import json, os, sys
import numpy as np
import scenario as sc, forecast as fc
import sensitivity
import backlog
from optimise import Problem, TIER_ORDER
from regulatory import POLICY_VERSION, READY

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
N_PLAN, N_EVAL = 40, 1000


def hrs(x):
    return f"{x:.1f}".rstrip("0").rstrip(".") + "h"


def clean(reason):
    return reason.strip().rstrip(".")


def explain(pb, s, f_id, fit):
    F = pb.F
    if f_id is None:
        if pb.elig[s["awb"]]:
            return dict(status="Needs a person", reason="Every eligible flight is needed for cargo that is costlier to delay.")
        why = sorted({clean(pb.ineligibility[s["awb"], f["id"]]) for f in F.values() if f["dest"] == s["dest"]} - {""})
        return dict(status="Needs a person", reason="No flight in the horizon passes every check: " + "; ".join(why) + ".")
    f = F[f_id]
    margin = s["promise"] - f["arr"]
    inside = f"arrives {hrs(margin)} inside its promise" if margin >= 0 else f"arrives {hrs(-margin)} after its promise"
    cu, co = pb.cu(s, f), pb.co(s, f)
    pure = co - cu
    costs = dict(underbookingCost=round(cu), overbookingCost=round(pure), criticalRatio=round(pure / max(cu + pure, 1e-9), 2))
    if s["booked"] == f_id:
        if f["status"] != "On time" and margin >= 0:
            return dict(status="No action needed", reason=f"Stays on {f_id}. {f['status']}, still {inside}.", **costs)
        if f["status"] == "On time" and margin >= 0:
            return dict(status="No action needed", reason=f"Stays on {f_id} as booked, {inside}.", **costs)
    parts = [f"Placed on {f_id}, {inside}."]
    if s["booked"] and s["booked"] != f_id:
        b = F[s["booked"]]
        if s["kind"] == "BAU":
            parts = [f"Moved from {b['id']} to {f_id} to make room for cargo that is costlier to delay. Still {inside}."]
        elif b["dest"] == s["dest"] and b["arr"] > s["promise"]:
            parts = [f"Moved from {b['id']} ({b['status'].lower()}) to {f_id}. On {b['id']} it would miss its promise by {hrs(b['arr'] - s['promise'])}. Now {inside}."]
        else:
            parts = [f"Missed {b['id']} because the inbound flight is late. Placed on {f_id}, {inside}."]
    if fit < 0.995:
        parts.append(f"{round(fit * 100)}% chance it fits. It is low cost to bump and to delay, so it carries the risk if capacity comes in short.")
    if s.get("shelf"):
        parts.append(f"Perishable: {hrs(s['shelf'] - f['arr'])} of shelf life left on arrival.")
    status = "Placed automatically" if margin >= 0 else "Placed, promise missed"
    if margin < 0:
        parts.append("This is the earliest flight that passes every check. The forwarder is told now, with the new arrival time.")
    return dict(status=status, reason=" ".join(parts), **costs)


_CACHE = {}


def trained():
    """Capacity forecast and its SHAP explainer, trained once per process."""
    if "models" not in _CACHE:
        models, card = fc.train()
        ex = fc.make_explainer(models)
        card["explanation"] = dict(forecast=ex["kind"] + ". Each driver is its contribution to the median forecast, in kg.",
                                   decisions="Regulatory screen per shipment and leg, underbooking and overbooking cost, critical ratio, learned time sensitivity risk, the rule that blocks each alternative, and counterfactual re solves.")
        _CACHE.update(models=models, card=card, ex=ex)
    return _CACHE["models"], _CACHE["card"], _CACHE["ex"]


def risk_curves(ships):
    """Neural hazard survival curves per shipment. They depend on the shipment, not the flight, so they are trained once."""
    if "curves" not in _CACHE:
        curves, card = sensitivity.train_curves(ships, sc.NOW)
        _CACHE.update(curves=curves, risk_card=card)
    return _CACHE["curves"], _CACHE["risk_card"]


def assignment_risks(ships, fl):
    curves, card = risk_curves(ships)
    risks, risk_cost = {}, {}
    for s in ships:
        for f in fl.values():
            if f["dest"] != s["dest"]:
                continue
            pair = s["awb"], f["id"]
            risks[pair] = sensitivity.flight_risk(curves.get(s["awb"], {}), f["arr"] - sc.NOW)
            past_shelf = s.get("shelf") is not None and f["arr"] > s["shelf"]
            risk_cost[pair] = sensitivity.learned_cost(risks[pair], past_shelf)
    return risks, risk_cost, card


def build_problem(cap_scale=None, delays=None, n_eval=N_EVAL):
    """Scenario, capacity forecast and samples, time risk and the screened Problem. Shared by compute() and mcp_server.py."""
    cap_scale = cap_scale or {}
    fl = sc.flights(delays)
    ret = sc.ripple(fl)
    ships = sc.shipments(fl, ret)
    models, card, ex = trained()
    card = dict(card)
    rng_plan, rng_eval = np.random.default_rng(1), np.random.default_rng(2)
    caps_plan, caps_eval, p50 = {}, {}, {}
    for f in fl.values():
        k = float(cap_scale.get(f["id"], 1.0))
        f["forecast"] = fc.predict(models, f, ex)
        f["capacityScale"] = k
        f["forecastKg"] = {q: round(f["forecast"][q] * f["nominalKg"] * k) for q in ("p10", "p50", "p90")}
        caps_plan[f["id"]] = fc.sample(f["forecast"], N_PLAN, rng_plan) * f["nominalKg"] * k
        caps_eval[f["id"]] = fc.sample(f["forecast"], n_eval, rng_eval) * f["nominalKg"] * k
        p50[f["id"]] = f["forecastKg"]["p50"]
    risks, risk_cost, card["timeSensitivity"] = assignment_risks(ships, fl)
    card["regulatoryEligibility"] = dict(policyVersion=POLICY_VERSION, approvalScope="Simulated recovery legs",
                                          inputs="Verified declaration attributes and simulated per-package leg acceptance")
    pb = Problem(ships, fl, risks, risk_cost)
    return dict(pb=pb, fl=fl, ret=ret, ships=ships, caps_plan=caps_plan, caps_eval=caps_eval, p50=p50, card=card,
                risks=risks, risk_cost=risk_cost)


def compute(forced=None, cap_scale=None, delays=None, n_eval=N_EVAL, with_compare=True):
    """Build the scenario, forecast, screen, optimise and explain. All arguments are optional what if inputs:
    forced {awb: flight}, cap_scale {flight: factor on usable capacity}, delays {flight: hours}."""
    forced, cap_scale = forced or {}, cap_scale or {}
    B = build_problem(cap_scale, delays, n_eval)
    pb, fl, ret, ships, card = B["pb"], B["fl"], B["ret"], B["ships"], B["card"]
    caps_plan, caps_eval, p50, risks, risk_cost = B["caps_plan"], B["caps_eval"], B["p50"], B["risks"], B["risk_cost"]
    for a, fid in forced.items():
        if a not in pb.by or fid not in fl:
            return dict(feasible=False, reason="Unknown shipment or flight.")
        why = pb.ineligibility[a, fid]
        if why:
            return dict(feasible=False, reason=f"Not allowed: {clean(why)}.", regulatory=pb.regulatory.get((a, fid)))
    sol = pb.solve(caps_plan, forced)
    if sol is None:
        return dict(feasible=False, reason="No plan satisfies every rule with this override.")
    plan = sol["plan"]
    metrics, uplift = pb.evaluate_with_uplift(plan, caps_eval)
    rows = []
    for s in ships:
        e = explain(pb, s, plan[s["awb"]], sol["fit"].get(s["awb"], 1.0))
        alts = []
        for f in pb.order:
            if f["dest"] != s["dest"]:
                continue
            why = pb.ineligibility[s["awb"], f["id"]]
            alts.append(dict(flight=f["id"], eligible=why is None, reason=clean(why) if why else "",
                             costIndex=None if why else round(pb.c[(s["awb"], f["id"])]), arr=f["arr"],
                             chosen=plan[s["awb"]] == f["id"], regulatory=pb.regulatory[s["awb"], f["id"]],
                             learnedRiskCost=round(risk_cost.get((s["awb"], f["id"]), 0), 1),
                             risk={k: round(v, 4) for k, v in risks.get((s["awb"], f["id"]), {}).items()}))
        rows.append({**s, "assigned": plan[s["awb"]], "fitProbability": round(sol["fit"].get(s["awb"], 0.0), 3),
                     "uplift": round(uplift[s["awb"]], 3), **e, "alternatives": alts,
                     "timeSensitivity": sensitivity.describe(pb, s["awb"])})
    for f in fl.values():
        on = sorted([s for s in ships if plan[s["awb"]] == f["id"]], key=lambda s: pb.co(s, f))
        kg = sum(s["kg"] for s in on)
        f["plannedKg"] = kg
        f["plannedDryIceKg"] = sum(pb.dry_ice[s["awb"]] for s in on)
        f["plannedVsMedian"] = round(kg / max(f["forecastKg"]["p50"], 1), 3)
        f["bumpOrder"] = [s["awb"] for s in on]
        f["mixKgByTier"] = {t: sum(s["kg"] for s in on if s["tier"] == t) for t in TIER_ORDER}
        down = [x for x in f["forecast"]["drivers"] if x["effectKg"] < 0][:2]
        f["reason"] = (f"Planned to {round(f['plannedVsMedian'] * 100)}% of the median forecast. "
                       + ("Forecast is lowered most by " + " and ".join(f"{x['label']} ({x['effectKg']:,} kg)" for x in down) + ". " if down else "")
                       + ("First to come off if space is short: " + ", ".join(s["commodity"] for s in on[:2]) + "." if on else ""))
    by = lambda pred: [s["awb"] for s in ships if pred(s)]
    delayed = [f for f in fl.values() if f["status"] != "On time"]
    T = sc.TRIGGER
    rip = dict(trigger=dict(flight=T, status=fl[T]["status"], cause=fl[T]["cause"]),
               delayedFlights=[f["id"] for f in delayed],
               chain=[dict(label="On the delayed flight to Shanghai", flight=T,
                           shipments=len(by(lambda s: s["booked"] == T)),
                           needReplan=len(by(lambda s: s["booked"] == T and plan[s["awb"]] != T))),
                      dict(label="Out of Shanghai on the same aircraft", flight=ret["id"], status=ret["status"], cause=ret["cause"],
                           shipments=14, needReplan=len(by(lambda s: s["origin"] == "PVG"))),
                      dict(label="Onward connections in Hong Kong that break", flight=sc.R("CX9301"),
                           shipments=len(by(lambda s: s["origin"] == "PVG")), needReplan=len(by(lambda s: s["origin"] == "PVG")))])
    counts = {k: sum(1 for r in rows if r["status"] == k) for k in ("Placed automatically", "Placed, promise missed", "No action needed", "Needs a person")}
    regulatory_counts = {}
    for r in rows:
        if r["assigned"]:
            st = pb.regulatory[r["awb"], r["assigned"]]["status"]
            regulatory_counts[st] = regulatory_counts.get(st, 0) + 1
    out = dict(feasible=True,
               scenario=dict(now=sc.NOW, closure=[36, 72], minTransferHours=sc.MIN_TRANSFER, flights=list(fl.values()),
                             returnFlight=ret, ripple=rip, simulated=True),
               shipments=rows, summary=dict(shipments=len(rows), **counts, objective=round(sol["objective"]),
                                            solverStatus=sol["solverStatus"], regulatoryStatusOfAssigned=regulatory_counts),
               solver=sol["stats"], modelCard=card, evaluation=metrics)
    if with_compare:
        comp = [dict(policy="Backlog first", note="Recover delayed cargo first, in waiting order, fill to the median forecast",
                     **pb.evaluate(pb.greedy(p50, "RECOVERY"), caps_eval)),
                dict(policy="Original bookings first", note="Keep every existing booking, then fit delayed cargo into what is left",
                     **pb.evaluate(pb.greedy(p50, "BAU"), caps_eval)),
                dict(policy="On Call 36", note="Forecast, two costs per shipment, learned time risk, regulatory screen, optimised across flights", **metrics)]
        median = pb.solve({f: np.array([kg]) for f, kg in p50.items()})
        if median is not None:
            comp.append(dict(policy="Median-capacity optimiser", note="Same optimiser with one fixed capacity forecast instead of 40 scenarios",
                             **pb.evaluate(median["plan"], caps_eval)))
        rules_only = Problem(ships, fl).solve(caps_plan)
        if rules_only is not None:
            comp.append(dict(policy="Without neural risk", note="Same optimiser with the learned time sensitivity cost removed, scored the same way",
                             **pb.evaluate(rules_only["plan"], caps_eval)))
        out["compare"] = comp
    return out


def diff(base, new):
    """What changed between two results: shipments that moved and the change in the headline numbers."""
    b = {s["awb"]: s for s in base["shipments"]}
    changed = [dict(awb=s["awb"], commodity=s["commodity"], tier=s["tier"], was=b[s["awb"]]["assigned"], now=s["assigned"],
                    statusNow=s["status"], reason=s["reason"]) for s in new["shipments"] if b[s["awb"]]["assigned"] != s["assigned"]]
    e0, e1 = base["evaluation"], new["evaluation"]
    return dict(changed=changed, costIndexChange=e1["expectedCostIndex"] - e0["expectedCostIndex"],
                promisesKeptChange=round(e1["promisesKept"] - e0["promisesKept"], 1),
                perishableChange=round(e1["perishableInShelfLife"] - e0["perishableInShelfLife"], 1),
                downstreamMissesChange=round(e1.get("downstreamDeadlineMisses", 0) - e0.get("downstreamDeadlineMisses", 0), 2))


def main():
    os.makedirs(OUT, exist_ok=True)
    forced = dict(a.split("=", 1) for a in sys.argv[2:]) if len(sys.argv) > 2 and sys.argv[1] == "--force" else {}
    base = compute()
    res = compute(forced=forced, with_compare=False) if forced else base
    if not res["feasible"]:
        print(res["reason"]); return
    if forced:
        print(json.dumps(diff(base, res), indent=1)); return
    hero = {s["hero"]: s for s in base["shipments"] if s["hero"]}
    overrides = []
    for label, key, fid in [("Keep the garments on the first flight", "garments", sc.R("CX9102")),
                            ("Leave the cherries on the delayed flight", "cherries", sc.R("CX9101")),
                            ("Put the lithium batteries on the first flight", "dg", sc.R("CX9102")),
                            ("Send the vaccines on the later passenger flight", "pharma", sc.R("CX9106")),
                            ("Hold the lobster for the freighter", "lobster", sc.R("CX9104"))]:
        alt = compute(forced={hero[key]["awb"]: fid}, with_compare=False)
        overrides.append(dict(label=label, awb=hero[key]["awb"], flight=fid, feasible=alt["feasible"],
                              **(diff(base, alt) if alt["feasible"] else dict(reason=alt["reason"], regulatory=alt.get("regulatory")))))
    whatifs = []
    a, frt, t = sc.R("CX9102"), sc.R("CX9104"), sc.TRIGGER
    for label, kw in [(f"Capacity on {a} comes in 20% lower", dict(cap_scale={a: 0.8})),
                      (f"{frt} freighter is delayed 6 more hours", dict(delays={t: 9, frt: 6})),
                      (f"{t} delay grows from 9h to 14h", dict(delays={t: 14}))]:
        alt = compute(with_compare=False, **kw)
        whatifs.append(dict(label=label, inputs={k: v for k, v in kw.items()}, solver=alt["solver"], **diff(base, alt)))
    dump = lambda name, obj: json.dump(obj, open(os.path.join(OUT, name), "w"), indent=1, default=float)
    dump("scenario.json", base["scenario"]); dump("shipments.json", base["shipments"]); dump("compare.json", base["compare"])
    dump("overrides.json", overrides); dump("whatifs.json", whatifs); dump("model_card.json", base["modelCard"])
    dump("summary.json", {**base["summary"], "solver": base["solver"]})
    models, _, _ = trained()
    clearance = backlog.forecast(models)
    dump("backlog.json", clearance)
    print("backlog clear P50 T+%s" % clearance["overall"]["p50"])
    print(json.dumps(base["summary"]), "|", json.dumps(base["solver"]))


if __name__ == "__main__":
    main()
