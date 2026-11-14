"""Experimental time-to-impact model learned from simulated shipment histories."""
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

STEP = 3
HORIZON = 72
END = np.arange(STEP, HORIZON + STEP, STEP)
CENTRE = END - STEP / 2
OUTCOMES = ("qualityLoss", "downstreamDisruption")
# Distinct business impacts in the simulator. Contractual lateness is priced separately.
IMPACT = {"qualityLoss": 450, "downstreamDisruption": 320}

FEATURES = ["perishable", "liveAnimal", "pharma", "temperatureControlled", "hoursInHandling",
            "temperatureExcursionHours", "hoursToKnownLimit", "hoursFromDecision",
            "hoursFromKnownLimit"]


def shipment_inputs(shipment, now, outcome):
    flags = set(shipment["shc"])
    if outcome == "qualityLoss":
        if not ({"COL", "PER", "AVI", "PIL"} & flags or shipment.get("shelf") is not None):
            return None
        limit = shipment.get("shelf")
    else:
        limit = shipment.get("downstreamDeadline")
        if limit is None:
            return None
    # Eligibility depends on delivery data, including hard limits, elsewhere.
    slack = HORIZON if limit is None else np.clip(limit - now, -HORIZON, HORIZON)
    return np.array(["PER" in flags, "AVI" in flags, "PIL" in flags, "COL" in flags,
                     shipment.get("handlingAgeHours", 0), shipment.get("temperatureExcursionHours", 0), slack], dtype=float)


def period_features(inputs):
    n = len(inputs)
    hours = np.broadcast_to(CENTRE, (n, len(END)))
    fixed = np.broadcast_to(inputs[:, None, :], (n, len(END), inputs.shape[-1]))
    return np.concatenate([fixed, hours[:, :, None], (hours - fixed[:, :, -1])[:, :, None]], axis=-1)


def simulated_history(outcome, n, seed):
    """Generate first-event times and administrative censoring for independent AWBs."""
    rng = np.random.default_rng(seed)
    kind = rng.integers(0, 4, size=n)
    per, live, pharma = kind == 0, kind == 1, kind == 2
    cold = (per | pharma | (kind == 3)) & (rng.random(n) < .8)
    age = rng.uniform(0, 48, n)
    excursion = rng.choice([0, .5, 1, 2, 4, 6], n, p=[.56, .16, .1, .08, .06, .04]) * cold
    limit = rng.uniform(1, 72, n)
    if outcome == "qualityLoss":
        limit[rng.random(n) < .18] = HORIZON
        severity = np.maximum(0, CENTRE - limit[:, None])
        cumulative_age = age[:, None] + CENTRE
        logits = (-5.9 + 1.1 * live[:, None] + .35 * per[:, None]
                  + .55 * cold[:, None] * excursion[:, None]
                  + .025 * cumulative_age + .15 * np.minimum(20, severity)
                  + .07 * np.maximum(0, cumulative_age - 22) * live[:, None]
                  + .06 * severity * pharma[:, None] * excursion[:, None])
    else:
        hours_from_limit = CENTRE - limit[:, None]
        logits = -6.5 + .045 * CENTRE + 3.4 * (hours_from_limit >= 0) + .13 * np.maximum(0, hours_from_limit)
        # General cargo is included in this head's training population.
        general = rng.random(n) < .8
        per &= ~general
        live &= ~general
        pharma &= ~general
        cold &= ~general
        excursion *= cold
    x = np.column_stack([per, live, pharma, cold, age, excursion, limit])
    events = rng.random(logits.shape) < 1 / (1 + np.exp(-logits))
    first_event = np.where(events.any(axis=1), events.argmax(axis=1), len(END))
    censor = np.where(rng.random(n) < .23, rng.integers(2, len(END), n), len(END))
    return x, first_event, censor


def fit_examples(history):
    inputs, event, censor = history
    bins = np.arange(len(END))[None, :]
    observed = (bins <= event[:, None]) & (bins < censor[:, None])
    return period_features(inputs)[observed], (bins == event[:, None])[observed]


def log_survival(model, inputs):
    x = period_features(inputs).reshape(-1, len(FEATURES))
    hazards = model.predict_proba(x)[:, 1].reshape(len(inputs), len(END))
    return np.c_[np.zeros(len(inputs)), np.log1p(-np.minimum(hazards, 1 - 1e-9)).cumsum(axis=1)]


def train_curves(shipments, now):
    """Fit neural conditional hazards and precompute each covered shipment's survival curve."""
    curves = {s["awb"]: {} for s in shipments}
    card = {"name": "Shipment time sensitivity", "dataSource": "Synthetic histories and outcomes",
            "architecture": "Two discrete-time neural hazard models, each with 48, 24 and 12 ReLU units",
            "trainingHistoriesPerOutcome": 2200, "heldOutHistoriesPerOutcome": 900, "intervalHours": STEP,
            "horizonHours": HORIZON, "features": FEATURES, "outcomes": {}, "impactPoints": IMPACT,
            "limits": "Held-out Brier scores use complete simulator outcomes. Training uses censored histories. Hold out real disruptions for calibration."}
    with threadpool_limits(limits=1):
        for i, outcome in enumerate(OUTCOMES):
            x, y = fit_examples(simulated_history(outcome, 2200, 413 + i))
            neural = make_pipeline(StandardScaler(), MLPClassifier(
                hidden_layer_sizes=(48, 24, 12), max_iter=75, learning_rate_init=.002,
                random_state=36, tol=2e-4, n_iter_no_change=7))
            linear = make_pipeline(StandardScaler(), LogisticRegression())
            neural.fit(x, y)
            linear.fit(x, y)
            features, events, _ = simulated_history(outcome, 900, 903 + i)
            scores = {}
            for label, model in [("neural", neural), ("logistic", linear)]:
                risks = 1 - np.exp(log_survival(model, features))
                for hours in (12, 24, 48):
                    k = hours // STEP
                    scores[f"{label}Brier{hours}h"] = round(float(
                        brier_score_loss(events < k, risks[:, k])), 4)
            card["outcomes"][outcome] = scores
            covered = [(s["awb"], shipment_inputs(s, now, outcome)) for s in shipments]
            covered = [(awb, values) for awb, values in covered if values is not None]
            if covered:
                predictions = log_survival(neural, np.stack([values for _, values in covered]))
                for (awb, _), curve in zip(covered, predictions):
                    curves[awb][outcome] = curve
    return curves, card


def flight_risk(curves, hours):
    axis = np.r_[0, END]
    return {name: float(-np.expm1(np.interp(hours, axis, curve))) for name, curve in curves.items()}


def assignment_risks(shipments, flights, now):
    curves, card = train_curves(shipments, now)
    risks, risk_cost = {}, {}
    for shipment in shipments:
        awb = shipment["awb"]
        for flight in flights.values():
            if flight["dest"] != shipment["dest"]:
                continue
            pair = awb, flight["id"]
            risks[pair] = flight_risk(curves[awb], flight["arr"] - now)
            past_shelf = shipment.get("shelf") is not None and flight["arr"] > shipment["shelf"]
            risk_cost[pair] = learned_cost(risks[pair], past_shelf)
    return risks, risk_cost, card


def learned_cost(risks, physical_limit_already_priced=False):
    return sum(IMPACT[name] * p for name, p in risks.items()
               if name != "qualityLoss" or not physical_limit_already_priced)


def describe(pb, awb):
    shipment = pb.by[awb]
    options = pb.elig[awb]
    baseline = min(options, key=lambda f: f["arr"], default=None)
    baseline_impacts = pb.impacts.get((awb, baseline["id"]), {}) if baseline else {}
    rows = []
    for f in sorted(options, key=lambda f: f["arr"]):
        impacts = pb.impacts.get((awb, f["id"]), {})
        risks = {k: round(p, 4) for k, p in impacts.items()}
        increases = {k: round((p - baseline_impacts[k]) * 100, 2) for k, p in impacts.items()}
        rows.append(dict(flight=f["id"], arrival=f["arr"], risk=risks, increaseVsEarliestPercentagePoints=increases,
                         learnedRiskCostIndex=round(learned_cost(impacts), 2),
                         riskChargeInObjective=round(pb.risk_cost.get((awb, f["id"]), 0), 2),
                         learnedCostIncreaseVsEarliest=round(sum(IMPACT[k] * (p - baseline_impacts[k])
                                                                for k, p in impacts.items()), 2),
                         totalAssignmentCostIndex=round(pb.c[(awb, f["id"])], 2)))
    return dict(awb=awb, commodity=shipment["commodity"], deliveryPromise=shipment["promise"],
                downstreamDeadline=shipment.get("downstreamDeadline"), excludedFlights=[
                    dict(flight=f["id"], reason=pb.ineligibility[(awb, f["id"])])
                    for f in pb.order if f["dest"] == shipment["dest"] and pb.ineligibility[(awb, f["id"])]
                ], earliestArrivalFlight=baseline["id"] if baseline else None, flightOptions=rows)


def rank_retention(pb, awb_ids, earlier_flight, later_flight):
    early, late = pb.F[earlier_flight], pb.F[later_flight]
    if early["dest"] != late["dest"] or early["arr"] >= late["arr"]:
        raise ValueError("Supply flights on the same lane in increasing arrival order.")
    rows, protected, excluded = [], [], []
    for awb in dict.fromkeys(awb_ids):
        shipment = pb.by[awb]
        earlier, later = (awb, earlier_flight), (awb, later_flight)
        item = dict(awb=awb, commodity=shipment["commodity"], cohort=shipment["kind"])
        if pb.ineligibility[earlier]:
            excluded.append({**item, "reason": pb.ineligibility[earlier]})
        elif pb.ineligibility[later]:
            protected.append({**item, "reason": pb.ineligibility[later]})
        else:
            modeled = pb.impacts.get(earlier, {})
            later_risks = pb.impacts.get(later, {})
            rows.append({**item,
                         "riskIncreasePercentagePoints": {k: round((later_risks[k] - p) * 100, 2)
                                                          for k, p in modeled.items()},
                         "learnedCostIncrease": round(learned_cost(later_risks) - learned_cost(modeled), 2),
                         "riskChargeChangeInObjective": round(pb.risk_cost.get(later, 0) - pb.risk_cost.get(earlier, 0), 2),
                         "totalCostIncrease": round(pb.c[later] - pb.c[earlier], 2)})
    return dict(earlierFlight=earlier_flight, laterFlight=later_flight, extraArrivalHours=late["arr"] - early["arr"],
                ranked=sorted(rows, key=lambda row: -row["totalCostIncrease"]),
                ineligibleForLaterFlight=protected, ineligibleForEarlierFlight=excluded)
