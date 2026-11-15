"""Monte Carlo forecast of the time to clear the backlog and restore normal service, by lane.

The schedule is real (OAG, data/oag_flights.json). Load factors, extra cancellations and the clearance threshold
are illustrative assumptions, listed in ASSUMPTIONS below and written into out/backlog.json.

Each trial:
  1. Every flight that departs Hong Kong inside the closure is cancelled (passenger T+36 to T+72, freighters to T+80).
     The cargo it would have carried (its cargo tonnage times a sampled normal load factor) becomes the lane backlog.
  2. Every flight after reopening has usable capacity drawn from the capacity forecast model (a share of its cargo
     tonnage) and carries its own normal demand (tonnage times a sampled load factor). What is left is spare capacity.
  3. A flight can still be cancelled after reopening with a small probability; its demand joins the backlog.
  4. Flights depart in time order; each one's spare capacity drains its lane backlog. The lane is back to normal when
     the backlog falls below a small share of its starting size. Overall normal is when every lane is.
"""
import numpy as np
import scenario as sc
import forecast as fc

LANES = ["PVG", "NRT", "LAX"]
ASSUMPTIONS = dict(
    trials=1000, seed=36,
    closurePassenger=[36, 72], closureFreighter=[36, 80],
    normalLoadFactor={"PAX": [0.70, 30], "FRT": [0.82, 40]},   # normal cargo demand as a share of usable capacity: mean, Beta concentration
    normalUsableShare={"PAX": 0.80, "FRT": 0.95},              # usable share of tonnage on a normal day, for the cancelled flights
    extraCancelProbability={"first24h": 0.04, "after": 0.01},
    normalWhenBacklogBelowShare=0.02,
    passengerLoadFactorForForecast=0.88,
)


NORMAL_USABLE = ASSUMPTIONS["normalUsableShare"]


def oag_flights():
    rows = []
    for o in sc.OAG["flights"]:
        if o["origin"] != "HKG" or o["dest"] not in LANES or o.get("codeshare") and False:
            continue
        kind = "PAX" if o["serviceType"] in ("J", "S", "Q") else "FRT"
        tonnes = o["cargoTonnage"] or sc.TONNES_FALLBACK.get(o["aircraftIata"], 20.0 if kind == "PAX" else 110.0)
        dep = sc.hours(o["depUtc"])
        rows.append(dict(id=o["flight"], dest=o["dest"], dep=dep, kind=kind, tonnes=float(tonnes), local=o["depLocal"]))
    return sorted(rows, key=lambda r: r["dep"])


def features(f):
    since = f["dep"] - sc.NOW
    return dict(isPax=int(f["kind"] == "PAX"),
                paxLoadFactor=ASSUMPTIONS["passengerLoadFactorForForecast"] if f["kind"] == "PAX" else 0.0,
                payloadRestriction=0, extraFuel=int(f["dest"] == "LAX"),
                hoursSinceReopen=since if 0 <= since <= 48 else -1, timeOfDay=int((6 + f["dep"]) % 24))


def beta(rng, mean, conc, n=None):
    return rng.beta(mean * conc, (1 - mean) * conc, n)


def run(models, trials=None, seed=None):
    A = ASSUMPTIONS
    trials, seed = trials or A["trials"], A["seed"] if seed is None else seed
    rng = np.random.default_rng(seed)
    flights = sorted(oag_flights(), key=lambda r: r["dep"])
    pc, fc_ = A["closurePassenger"], A["closureFreighter"]
    cancelled = [f for f in flights if (f["kind"] == "PAX" and pc[0] <= f["dep"] < pc[1]) or (f["kind"] == "FRT" and fc_[0] <= f["dep"] < fc_[1])]
    after = [f for f in flights if f not in cancelled and f["dep"] >= sc.NOW]
    end = max(f["dep"] for f in flights)
    fracs = {id(f): fc.sample(fc.predict(models, dict(features=features(f), nominalKg=f["tonnes"] * 1000)), trials, rng) for f in after}
    grid = np.arange(sc.NOW, end + 0.001, 2.0)
    clear = {lane: np.full(trials, np.inf) for lane in LANES}
    start = {lane: np.zeros(trials) for lane in LANES}
    curve = np.zeros((trials, len(grid)))
    for k in range(trials):
        backlog = {lane: 0.0 for lane in LANES}
        for f in cancelled:
            usable_normal = f["tonnes"] * NORMAL_USABLE[f["kind"]]
            backlog[f["dest"]] += usable_normal * beta(rng, *A["normalLoadFactor"][f["kind"]])
        for lane in LANES:
            start[lane][k] = backlog[lane]
        threshold = {lane: max(1.0, backlog[lane] * A["normalWhenBacklogBelowShare"]) for lane in LANES}
        gi = 0
        for f in after:
            while gi < len(grid) and grid[gi] < f["dep"]:
                curve[k, gi] = sum(backlog.values())
                gi += 1
            usable = f["tonnes"] * fracs[id(f)][k]
            demand = usable * beta(rng, *A["normalLoadFactor"][f["kind"]])
            p_cancel = A["extraCancelProbability"]["first24h" if f["dep"] < sc.NOW + 24 else "after"]
            if rng.random() < p_cancel:
                backlog[f["dest"]] += demand
                continue
            spare = max(0.0, usable - demand)
            lane = f["dest"]
            backlog[lane] = max(0.0, backlog[lane] - spare)
            if backlog[lane] <= threshold[lane] and clear[lane][k] == np.inf:
                clear[lane][k] = f["dep"]
        while gi < len(grid):
            curve[k, gi] = sum(backlog.values())
            gi += 1
    overall = np.max(np.vstack([clear[l] for l in LANES]), axis=0)

    def summary(x):
        done = np.isfinite(x)
        q = lambda p: (float(np.percentile(np.where(done, x, end + 1), p)) if done.mean() * 100 >= p else None)
        days = []
        for d in range(int(np.ceil((sc.NOW + 18) / 24)), int(end // 24) + 2):  # local midnight = T + 24d - 6
            t = 24 * d - 6
            if sc.NOW < t <= end + 24:
                days.append(dict(t=t, probability=round(float(np.mean(x <= t)), 3)))
        return dict(p10=q(10), p50=q(50), p90=q(90), mean=float(np.mean(x[done])) if done.any() else None,
                    clearedWithinSchedule=round(float(done.mean()), 3), byMidnight=days)

    lanes = []
    for lane in LANES:
        lane_cancel = [f for f in cancelled if f["dest"] == lane]
        lanes.append(dict(lane=lane, cancelledFlights=len(lane_cancel), cancelledTonnage=round(sum(f["tonnes"] for f in lane_cancel), 1),
                          flightsAfterReopening=sum(1 for f in after if f["dest"] == lane),
                          initialBacklogTonnes={p: round(float(np.percentile(start[lane], q)), 1) for p, q in (("p10", 10), ("p50", 50), ("p90", 90))},
                          clearHours=summary(clear[lane])))
    fan = dict(t=[float(t) for t in grid], p10=[round(float(v), 1) for v in np.percentile(curve, 10, axis=0)],
               p50=[round(float(v), 1) for v in np.percentile(curve, 50, axis=0)], p90=[round(float(v), 1) for v in np.percentile(curve, 90, axis=0)])
    return dict(method="Monte Carlo simulation over the real OAG schedule", source="OAG Flight Info API schedule, CX departures from Hong Kong",
                assumptions=A, scheduleEnd=end, cancelled=[dict(flight=f["id"], dest=f["dest"], dep=f["dep"], kind=f["kind"], tonnes=f["tonnes"]) for f in cancelled],
                lanes=lanes, overall=summary(overall), fan=fan)


def forecast(models):
    """Back to normal forecast over the real schedule."""
    return run(models)


if __name__ == "__main__":
    import json
    models, _ = fc.train()
    out = forecast(models)
    print(json.dumps(dict(overall=out["overall"], lanes=[(l["lane"], l["cancelledFlights"], l["initialBacklogTonnes"], l["clearHours"]["p10"], l["clearHours"]["p50"], l["clearHours"]["p90"], l["clearHours"]["clearedWithinSchedule"]) for l in out["lanes"]]), indent=1))
