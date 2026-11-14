"""Capacity forecast: usable cargo capacity as a fraction of nominal, as P10 / P50 / P90.
Trained on SYNTHETIC history generated below. It demonstrates the method, not real accuracy."""
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import QuantileRegressor

FEATURES = ["isPax", "paxLoadFactor", "payloadRestriction", "extraFuel", "hoursSinceReopen", "timeOfDay"]
LABELS = {"isPax": "aircraft kind", "paxLoadFactor": "passenger load (bags in the belly)",
          "payloadRestriction": "weather payload restriction", "extraFuel": "extra fuel carried",
          "hoursSinceReopen": "hours since the airport reopened", "timeOfDay": "time of day"}
NEUTRAL = {"isPax": None, "paxLoadFactor": 0.80, "payloadRestriction": 0, "extraFuel": 0, "hoursSinceReopen": 48, "timeOfDay": 12}
QS = [0.1, 0.5, 0.9]


def synth(n=5000, seed=36):
    """Assumptions (all invented): freighters use about 93% of nominal, passenger bellies about 88%.
    Each 10 points of passenger load above 80% removes about 6% (bags). A weather payload restriction removes 10%.
    Extra fuel removes 5%. The first hours after reopening remove up to 8% and add noise."""
    r = np.random.default_rng(seed)
    pax = r.integers(0, 2, n)
    lf = np.where(pax == 1, r.uniform(0.6, 1.0, n), 0.0)
    restr = r.binomial(1, 0.15, n)
    fuel = r.binomial(1, 0.3, n)
    hrs = r.uniform(0, 72, n)
    tod = r.uniform(0, 24, n)
    base = np.where(pax == 1, 0.88, 0.93)
    y = (base - 0.6 * np.clip(lf - 0.8, 0, None) * pax - 0.10 * restr - 0.05 * fuel - 0.08 * np.exp(-hrs / 12)
         + r.normal(0, 0.035 + 0.05 * np.clip(lf - 0.8, 0, None) * pax + 0.03 * np.exp(-hrs / 12), n))
    X = np.c_[pax, lf, restr, fuel, hrs, tod]
    return X, np.clip(y, 0.35, 1.05)


def pinball(y, p, q):
    d = y - p
    return float(np.mean(np.maximum(q * d, (q - 1) * d)))


def train():
    X, y = synth()
    cut = int(len(y) * 0.8)
    Xtr, ytr, Xte, yte = X[:cut], y[:cut], X[cut:], y[cut:]
    models, metrics = {}, {}
    for q in QS:
        m = GradientBoostingRegressor(loss="quantile", alpha=q, n_estimators=200, max_depth=3, learning_rate=0.06,
                                      subsample=0.8, random_state=36).fit(Xtr, ytr)
        lin = QuantileRegressor(quantile=q, alpha=0.0, solver="highs").fit(Xtr[:1500], ytr[:1500])
        models[q] = m
        metrics[f"pinball_P{int(q*100)}_gbm"] = round(pinball(yte, m.predict(Xte), q), 5)
        metrics[f"pinball_P{int(q*100)}_linear"] = round(pinball(yte, lin.predict(Xte), q), 5)
    lo, hi = models[0.1].predict(Xte), models[0.9].predict(Xte)
    metrics["coverage_P10_P90"] = round(float(np.mean((yte >= lo) & (yte <= hi))), 3)
    card = dict(name="Usable cargo capacity forecast", dataSource="Synthetic history generated from documented assumptions",
                trainingRows=cut, heldOutRows=len(y) - cut, features=FEATURES,
                method="Gradient boosted quantile regression (scikit learn), with linear quantile regression as reference",
                metrics=metrics,
                limits="Trained on simulated data. It shows the method. Real accuracy needs the airline's own flight history.")
    return models, card


def exact_shapley(model, x, bg):
    """Exact interventional Shapley values by enumerating every feature subset (6 features, 64 subsets)."""
    from itertools import combinations
    from math import factorial
    n = x.shape[1]
    val = {}
    for r in range(n + 1):
        for sub in combinations(range(n), r):
            z = bg.copy()
            z[:, list(sub)] = x[0, list(sub)]
            val[sub] = float(model.predict(z).mean())
    phi = np.zeros(n)
    for i in range(n):
        rest = [k for k in range(n) if k != i]
        for r in range(n):
            for sub in combinations(rest, r):
                w = factorial(r) * factorial(n - r - 1) / factorial(n)
                phi[i] += w * (val[tuple(sorted(sub + (i,)))] - val[sub])
    return phi, val[()]


def make_explainer(models):
    """SHAP for the median model. TreeExplainer when it supports the model, otherwise exact enumeration."""
    X, _ = synth()
    bg = X[:100]
    try:
        import shap
        ex = shap.TreeExplainer(models[0.5], data=bg, feature_perturbation="interventional")
        ex.shap_values(bg[:1])
        return dict(kind="SHAP TreeExplainer (interventional)", ex=ex, bg=bg)
    except Exception:
        return dict(kind="Exact Shapley values (full enumeration, interventional)", ex=None, bg=bg)


def predict(models, flight, explainer=None):
    f = flight["features"]
    x = np.array([[f[k] for k in FEATURES]], float)
    q = sorted(float(models[k].predict(x)[0]) for k in QS)
    out = dict(p10=round(q[0], 3), p50=round(q[1], 3), p90=round(q[2], 3), drivers=[])
    if explainer:
        if explainer["ex"] is not None:
            phi = np.array(explainer["ex"].shap_values(x))[0]
            base = float(np.ravel(explainer["ex"].expected_value)[0])
        else:
            phi, base = exact_shapley(models[0.5], x, explainer["bg"])
        nom = flight["nominalKg"]
        out["shapBaseKg"] = round(base * nom)
        out["drivers"] = sorted([dict(feature=k, label=LABELS[k], value=f[k], effect=round(float(p), 4), effectKg=round(float(p) * nom))
                                 for k, p in zip(FEATURES, phi) if abs(p) > 0.002], key=lambda d: -abs(d["effect"]))
    return out


def sample(fc, n, rng):
    """Draw usable fractions from a piecewise linear distribution through the three quantiles."""
    p10, p50, p90 = fc["p10"], fc["p50"], fc["p90"]
    xs = [0.0, 0.1, 0.5, 0.9, 1.0]
    ys = [p10 - 0.6 * (p50 - p10), p10, p50, p90, p90 + 0.6 * (p90 - p50)]
    return np.interp(rng.uniform(0, 1, n), xs, ys)
