"""Recovery allocation: two stage stochastic mixed integer program, plus reference policies and evaluation.
Stage 1 (now): put each shipment on one flight, or hold it for a person.
Stage 2 (per capacity scenario): choose whole shipments to offload and pay a proxy cost.
Sequential replay books offloaded cargo into actual remaining space on later flights.
Costs are a unitless index. They are illustrative weights, not money."""
import time
import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds
from scipy.sparse import lil_matrix
from regulatory import READY, check, dry_ice_kg

WAIT = {"PRS": 2.0, "PR1": 1.5, "PR2": 1.0, "PR3": 0.5, "GEN": 0.2}      # per hour waiting for departure
LATE = {"PRS": 40, "PR1": 25, "PR2": 12, "PR3": 6, "GEN": 3}             # per hour past the promise
BREACH = {"PRS": 400, "PR1": 300, "PR2": 120, "PR3": 60, "GEN": 30}      # once, if the promise is missed
SERVICE = {"PRS": 150, "PR1": 100, "PR2": 40, "PR3": 20, "GEN": 8}       # being bumped at the aircraft
SPOIL, REBOOK, REHANDLE, OUT_OF_COOL = 3000, 15, 25, 60
TIER_ORDER = ["PRS", "PR1", "PR2", "PR3", "GEN"]
HORIZON_PENALTY_HOURS = 48


def ineligible(s, f, regulatory=None):
    if f["dest"] != s["dest"]:
        return "different destination"
    if f["dep"] < s["ready"]:
        return "cargo cannot be ready in time (minimum transfer 3h)"
    regulatory = check(s, f) if regulatory is None else regulatory
    if regulatory["status"] != READY:
        return "; ".join(item["message"] for item in regulatory["findings"] if item["status"] == regulatory["status"])
    if s["mainDeck"] and f["kind"] == "PAX":
        return "main deck unit only fits a freighter"
    if s["cool"] and f["coolPositions"] == 0:
        return "no temperature controlled position"
    if s.get("latestDep") and f["dep"] > s["latestDep"]:
        return "would exceed the allowed time in the cool room" if s["cool"] else "departs after its latest allowed departure time"
    return None


def cost(s, f):
    late = max(0.0, f["arr"] - s["promise"])
    c = WAIT[s["tier"]] * (f["dep"] - s["ready"]) + LATE[s["tier"]] * late + (BREACH[s["tier"]] if late > 0 else 0)
    if s.get("shelf") and f["arr"] > s["shelf"]:
        c += SPOIL
    if s["kind"] == "BAU" and s["booked"] != f["id"]:
        c += REBOOK
    return c


def hold_cost(s):
    return 2000 + 3 * BREACH[s["tier"]] + (SPOIL if s.get("shelf") else 0)


class Problem:
    def __init__(self, ships, fl, impacts=None, risk_cost=None):
        self.S, self.F = ships, fl
        self.order = sorted(fl.values(), key=lambda f: f["dep"])
        self.regulatory = {(s["awb"], f["id"]): check(s, f) for s in ships for f in self.order if s["dest"] == f["dest"]}
        self.ineligibility = {(s["awb"], f["id"]): ineligible(s, f, self.regulatory.get((s["awb"], f["id"])))
                              for s in ships for f in self.order}
        self.elig = {s["awb"]: [f for f in self.order if self.ineligibility[s["awb"], f["id"]] is None] for s in ships}
        self.impacts = impacts or {}
        self.risk_cost = risk_cost or {}
        self.c = {(s["awb"], f["id"]): cost(s, f) + self.risk_cost.get((s["awb"], f["id"]), 0)
                  for s in ships for f in self.elig[s["awb"]]}
        self.by = {s["awb"]: s for s in ships}
        self.dry_ice = {s["awb"]: dry_ice_kg(s) for s in ships}
        self.bump_fee = {s["awb"]: REHANDLE + (OUT_OF_COOL if s["cool"] else 0) + SERVICE[s["tier"]] for s in ships}
        self.bump_cost = {(a, f): self.bump_fee[a] + self.cu(self.by[a], self.F[f]) for a, f in self.c}

    def next_after(self, s, f):
        later = [g for g in self.elig[s["awb"]] if g["dep"] > f["dep"]]
        return later[0] if later else None

    def cu(self, s, f):
        """Underbooking cost: extra cost of leaving this shipment for its next feasible flight."""
        n = self.next_after(s, f)
        return max(0.0, (self.c[(s["awb"], n["id"])] if n else hold_cost(s)) - self.c[(s["awb"], f["id"])])

    def co(self, s, f):
        """Overbooking cost: planned on the flight, then bumped at the aircraft."""
        return self.bump_cost[(s["awb"], f["id"])]

    def solve(self, caps, forced=None, reference=None, destination=None):
        """Solve independent direct lanes, optionally reopening only one lane."""
        forced = forced or {}
        if any((a, f) not in self.c for a, f in forced.items()):
            return None
        if destination and reference is None:
            raise ValueError("A single-lane replan requires the previous proposal.")
        lanes = sorted({s["dest"] for s in self.S}) if destination is None else [destination]
        plan = {} if reference is None else reference["plan"].copy()
        fit = {} if reference is None else dict(reference.get("fit", {}))
        results = []
        for lane in lanes:
            flights = {f: info for f, info in self.F.items() if info["dest"] == lane}
            shipments = [s for s in self.S if s["dest"] == lane]
            if not flights:
                plan.update(dict.fromkeys(s["awb"] for s in shipments))
                results.append(dict(objective=sum(map(hold_cost, shipments)), solverGap=0, solverStatus="optimal_within_tolerance", stats=None))
                continue
            lane_problem = Problem(shipments, flights, self.impacts, self.risk_cost)
            lane_caps = {f: caps[f] for f in flights}
            result = lane_problem.solve_lane(lane_caps, {a: f for a, f in forced.items() if f in flights})
            if result is None:
                return None
            plan.update(result["plan"])
            fit.update(result["fit"])
            results.append(result)
        status = "feasible_incumbent" if any(r["solverStatus"] == "feasible_incumbent" for r in results) else "optimal_within_tolerance"
        lane_stats = [r["stats"] for r in results if r.get("stats")]
        gap = max((r["solverGap"] for r in results if r["solverGap"] is not None), default=0.0)
        stats = dict(method="Two stage stochastic mixed integer program (HiGHS via SciPy), solved per lane",
                     lanes=len(lane_stats), scenarios=lane_stats[0]["scenarios"] if lane_stats else 0,
                     binaryVariables=sum(x["binaryVariables"] for x in lane_stats),
                     continuousVariables=0, constraints=sum(x["constraints"] for x in lane_stats),
                     solveSeconds=round(sum(x["solveSeconds"] for x in lane_stats), 2), optimalityGap=float(gap or 0.0))
        return dict(plan=plan, fit=fit, objective=sum(r["objective"] for r in results), solverStatus=status,
                    solverGap=gap, stats=stats)

    def solve_lane(self, caps, forced):
        """caps: {flight id: array of scenario capacities in kg}. forced: {awb: flight id}."""
        P = [(s["awb"], f["id"]) for s in self.S for f in self.elig[s["awb"]]]
        nP, n, nS = len(P), len(self.S), len(next(iter(caps.values())))
        N = nP + n + nP * nS
        obj = np.zeros(N)
        for p, (a, f) in enumerate(P):
            obj[p] = self.c[(a, f)]
            obj[nP + n + p * nS: nP + n + (p + 1) * nS] = self.co(self.by[a], self.F[f]) / nS
        for i, s in enumerate(self.S):
            obj[nP + i] = hold_cost(s)
        rows = n + nP * nS + len(self.F) * nS + 2 * len(self.F)
        A = lil_matrix((rows, N))
        lo, hi = np.full(rows, -np.inf), np.zeros(rows)
        idx = {a: i for i, a in enumerate(s["awb"] for s in self.S)}
        for p, (a, f) in enumerate(P):
            A[idx[a], p] = 1
        for i in range(n):
            A[i, nP + i] = 1
            lo[i] = hi[i] = 1
        r = n
        for p in range(nP):
            for k in range(nS):
                A[r, nP + n + p * nS + k] = 1
                A[r, p] = -1
                r += 1
        fids = list(self.F)
        for f in fids:
            ps = [p for p, (a, g) in enumerate(P) if g == f]
            for k in range(nS):
                for p in ps:
                    w = self.by[P[p][0]]["kg"]
                    A[r, p] = w
                    A[r, nP + n + p * nS + k] = -w
                hi[r] = caps[f][k]
                r += 1
        for f in fids:
            for p, (a, g) in enumerate(P):
                if g == f and self.by[a]["cool"]:
                    A[r, p] = 1
            hi[r] = self.F[f]["coolPositions"]
            r += 1
        for f in fids:
            for p, (a, g) in enumerate(P):
                if g == f and self.dry_ice[a]:
                    A[r, p] = self.dry_ice[a]
            hi[r] = self.F[f].get("dryIceCapacityKg") or 0
            r += 1
        lb, ub = np.zeros(N), np.ones(N)
        for a, f in forced.items():
            if (a, f) not in P:
                return None
            lb[P.index((a, f))] = 1
        integ = np.ones(N)
        t0 = time.time()
        res = milp(obj, constraints=LinearConstraint(A.tocsr(), lo, hi), integrality=integ, bounds=Bounds(lb, ub),
                   options=dict(time_limit=5, mip_rel_gap=0.002))
        if res.x is None:
            return None
        plan = {s["awb"]: None for s in self.S}
        for p, (a, f) in enumerate(P):
            if res.x[p] > 0.5:
                plan[a] = f
        fit = {}
        for p, (a, f) in enumerate(P):
            if plan.get(a) == f:
                fit[a] = float(1 - np.mean(res.x[nP + n + p * nS: nP + n + (p + 1) * nS]))
        stats = dict(scenarios=nS, binaryVariables=N, constraints=rows, solveSeconds=round(time.time() - t0, 2))
        return dict(plan=plan, fit=fit, objective=float(res.fun), stats=stats,
                    solverStatus="optimal_within_tolerance" if res.status == 0 else "feasible_incumbent",
                    solverGap=getattr(res, "mip_gap", None))

    # ---------- reference policies ----------
    def greedy(self, p50, first):
        """first='RECOVERY': backlog first. first='BAU': keep original bookings first. Fill each flight to the median forecast."""
        plan = {s["awb"]: None for s in self.S}
        for f in self.order:
            cands = [s for s in self.S if plan[s["awb"]] is None and f in self.elig[s["awb"]]]
            if first == "BAU":
                cands = [s for s in cands if s["kind"] == "RECOVERY" or self.F[s["booked"]]["dep"] <= f["dep"]]
                cands.sort(key=lambda s: (0 if s["booked"] == f["id"] and s["kind"] == "BAU" else 1 if s["kind"] == "BAU" else 2, s["ready"]))
            else:
                cands = [s for s in cands if s["kind"] == "RECOVERY" or self.F[s["booked"]]["dep"] <= f["dep"]]
                cands.sort(key=lambda s: (0 if s["kind"] == "RECOVERY" else 1, s["ready"]))
            load, cool, ice = 0, 0, 0
            for s in cands:
                awb_ice = self.dry_ice[s["awb"]]
                if (load + s["kg"] <= p50[f["id"]] and (not s["cool"] or cool < f["coolPositions"])
                        and ice + awb_ice <= (f.get("dryIceCapacityKg") or 0)):
                    plan[s["awb"]] = f["id"]
                    load += s["kg"]
                    cool += int(s["cool"])
                    ice += awb_ice
        return plan

    # ---------- evaluation ----------
    def replay(self, plan, capacity, manifests=None):
        """Simulate whole-AWB uplift with per-flight capacity and onward rebooking."""
        if manifests is None:
            manifests = {f: [] for f in self.F}
            for a, f in plan.items():
                if f is not None:
                    manifests[f].append(a)
            for f, manifest in manifests.items():
                manifest.sort(key=lambda a: (-self.bump_cost[(a, f)], a))
        pending, bumped = set(), set()
        flown, loads = dict.fromkeys(plan), {}
        total_cost, empty_kg = 0.0, 0.0
        for f in self.order:
            fid = f["id"]
            kg_left, cool_left = capacity[fid], f["coolPositions"]
            ice_capacity = f.get("dryIceCapacityKg") or 0
            ice_left = ice_capacity
            waiting = sorted(
                (a for a in pending if (a, fid) in self.c and self.F[plan[a]]["dep"] < f["dep"]),
                key=lambda a: (-self.bump_cost[(a, fid)], a),
            )
            for a in manifests[fid] + waiting:
                s = self.by[a]
                if s["kg"] <= kg_left and int(s["cool"]) <= cool_left and self.dry_ice[a] <= ice_left:
                    kg_left -= s["kg"]
                    cool_left -= int(s["cool"])
                    ice_left -= self.dry_ice[a]
                    flown[a] = fid
                    total_cost += self.c[(a, fid)]
                    pending.discard(a)
                elif plan[a] == fid:
                    bumped.add(a)
                    total_cost += self.bump_fee[a]
                    pending.add(a)
            loads[fid] = {"kg": float(capacity[fid] - kg_left), "coldPositions": f["coolPositions"] - cool_left,
                          "dryIceKg": ice_capacity - ice_left}
            if f["dep"] <= 84:
                empty_kg += kg_left
        total_cost += sum(hold_cost(self.by[a]) for a, f in flown.items() if f is None)
        return dict(flown=flown, loads=loads, bumped=bumped, cost=total_cost, emptyKg=empty_kg)

    def evaluate(self, plan, caps):
        return self.evaluate_with_uplift(plan, caps)[0]

    def evaluate_with_uplift(self, plan, caps):
        nS = len(next(iter(caps.values())))
        tot = dict(kept=0.0, perishOK=0.0, bumped=0.0, emptyKg=0.0, delayTop=0.0,
                   unflown=0.0, backlogFlown=0.0, bauKept=0.0, learnedCost=0.0, downstreamMissed=0)
        first_flight_hits = dict.fromkeys(plan, 0)
        manifests = {f: [] for f in self.F}
        for a, f in plan.items():
            if f is not None:
                manifests[f].append(a)
        for f, manifest in manifests.items():
            manifest.sort(key=lambda a: (-self.bump_cost[(a, f)], a))
        top = [s for s in self.S if s["tier"] in ("PRS", "PR1")]
        perish = [s for s in self.S if s.get("shelf")]
        costs = []
        for k in range(nS):
            result = self.replay(plan, {f: values[k] for f, values in caps.items()}, manifests)
            actual = result["flown"]
            arr = {a: self.F[f]["arr"] if f is not None else None for a, f in actual.items()}
            for a, f in actual.items():
                first_flight_hits[a] += int(f is not None and f == plan[a])
            costs.append(result["cost"])
            tot["bumped"] += len(result["bumped"])
            tot["emptyKg"] += result["emptyKg"]
            tot["unflown"] += sum(f is None for f in actual.values())
            tot["backlogFlown"] += sum(s["kind"] == "RECOVERY" and actual[s["awb"]] is not None for s in self.S)
            tot["bauKept"] += sum(s["kind"] == "BAU" and s["booked"] is not None and actual[s["awb"]] == s["booked"] for s in self.S)
            tot["learnedCost"] += sum(self.risk_cost.get((a, f), 0) for a, f in actual.items())
            tot["downstreamMissed"] += sum(
                s.get("downstreamDeadline") is not None
                and (arr[s["awb"]] is None or arr[s["awb"]] > s["downstreamDeadline"])
                for s in self.S
            )
            tot["kept"] += sum(1 for s in self.S if arr[s["awb"]] is not None and arr[s["awb"]] <= s["promise"])
            tot["perishOK"] += sum(1 for s in perish if arr[s["awb"]] is not None and arr[s["awb"]] <= s["shelf"])
            if top:
                tot["delayTop"] += np.mean([
                    max(0.0, arr[s["awb"]] - s["promise"]) if arr[s["awb"]] is not None else HORIZON_PENALTY_HOURS
                    for s in top
                ])
        metrics = dict(expectedCostIndex=round(float(np.mean(costs))), promisesKept=round(tot["kept"] / nS, 1), shipments=len(self.S),
                    perishableInShelfLife=round(tot["perishOK"] / nS, 1), perishableTotal=len(perish),
                    bumpedAtAircraft=round(tot["bumped"] / nS, 2), emptyKgOnFirstFlightsOut=round(tot["emptyKg"] / nS),
                    avgHoursLatePRSandPR1=round(tot["delayTop"] / nS, 2), unplaced=sum(v is None for v in plan.values()),
                    p95CostIndex=round(float(np.percentile(costs, 95))), unflownByHorizon=round(tot["unflown"] / nS, 2),
                    recoveryShipmentsFlown=round(tot["backlogFlown"] / nS, 2), originalBAUBookingsFlown=round(tot["bauKept"] / nS, 2),
                    expectedLearnedCostIndex=round(tot["learnedCost"] / nS, 1),
                    downstreamDeadlineMisses=round(tot["downstreamMissed"] / nS, 2))
        return metrics, {a: hits / nS for a, hits in first_flight_hits.items()}
