# On Call 36 model

Flights are the real CX schedule from OAG. Everything else is simulated. Costs are a unitless index, not money. The capacity forecast and the time sensitivity model are trained on synthetic data and show the method, not real accuracy. No language model is used.

This folder merges three pieces of team work: the base recovery model (capacity forecast with SHAP, optimiser, live service), the deep learning time sensitivity model, and the regulatory eligibility screen.

## Run

```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # once
.venv/bin/python run.py          # writes out/*.json, about 60 seconds
.venv/bin/python test_model.py   # checks on the outputs and on the regulatory and replay logic
.venv/bin/python run.py --force 160-77204982=CX9102   # what if: force one booking and re solve
.venv/bin/python server.py       # live re optimisation on http://localhost:8036
```

## OAG schedule

`oag.py` calls the OAG Flight Info API (`flight-instances`, version 2) with the key from `OAG_PRIMARY_KEY` in your environment. It saves raw responses to `oag_raw/` (not committed) and a derived file `data/oag_flights.json` with flight number, route, local and UTC times, aircraft, service type and cargo tonnage. The free tier allows 10 rows per request and rate limits; the script pages, backs off on 429 and resumes from saved files.

## Pipeline

1. **Scenario and ripple** (`scenario.py`). Each scenario role is a real OAG flight (`ROLES`). CX360 Hong Kong to Shanghai is delayed 9h; the same aircraft returns as CX381, so the delay carries forward and three connections to CX2090 break. 60 shipments, recovery cargo and existing bookings. Capacity open to recovery cargo is the OAG cargo tonnage times an assumed share (90% passenger, 20% freighter). `flights(delays)` takes any delay for what ifs.
2. **Capacity forecast** (`forecast.py`). Gradient boosted quantile regression gives P10, P50 and P90 of usable cargo capacity per flight; linear quantile regression is the reference. SHAP (TreeExplainer, interventional; exact enumeration if shap is missing) explains each median forecast in kg.
3. **Regulatory screen** (`regulatory.py`, `regulatory_demo.py`). Every shipment is screened against every candidate leg and gets ELIGIBLE_FOR_PLANNING, NEEDS_DG_REVIEW or BLOCKED with findings and sources: lithium batteries (UN3480, UN3481, UN3090), liquids and packaging evidence, dry ice against a shared leg budget, and per package leg acceptance records. Only eligible legs reach the optimiser. Declarations and acceptance records are invented.
4. **Time sensitivity, deep learning** (`sensitivity.py`). Two discrete time neural hazard models (48, 24 and 12 ReLU units) trained on synthetic, right censored shipment histories estimate the chance of quality loss and of a customer's downstream disruption by each arrival time. That risk becomes a cost for each shipment and flight. It is trained once per process and cached.
5. **Optimise** (`optimise.py`). A two stage stochastic mixed integer program per lane, solved with HiGHS through SciPy over 40 capacity scenarios. Stage one assigns each shipment to one flight or a person; stage two offloads whole shipments when capacity is short. Hard rules: regulatory eligibility, main deck units on freighters, cool positions, dry ice budget, latest departure, 3h minimum transfer.
6. **Evaluate** on 1,000 fresh capacity draws with a sequential replay that rebooks offloaded cargo onto later flights. Two reference rules and two ablations are scored the same way.
7. **Back to normal** (`backlog.py`). A Monte Carlo simulation over the full OAG schedule to 30 November: closure cancellations become lane backlogs; each of 1,000 trials draws usable capacity from the forecast model, normal demand and extra cancellations, and drains each lane in departure order. Output: P10, P50 and P90 time back to normal per lane and overall, the chance of being clear by each midnight, a fan of backlog remaining over time, and a lever (one extra Los Angeles freighter a night for four nights). Written to `out/backlog.json`.
8. **Explain** (`run.py`). Reason sentence, both costs and the critical ratio, every alternative with its regulatory screen and learned risk, five override cases and three disruption what ifs.

## Results on the seeded scenario

| Policy | Expected cost index | Promises kept (of 60) |
|---|---|---|
| Backlog first | 12,819 | 54 |
| Original bookings first | 16,435 | 51 |
| On Call 36 | 8,659 | 56 |
| Median-capacity optimiser (ablation) | 8,682 | 56 |
| Without neural risk (ablation) | 8,677 | 56 |

Back to normal: about 894 tonnes stuck from 32 cancelled departures; median Friday 27 November (P10 to P90: 26 to 30 November); the extra freighter brings it forward about 2.6 days.

## Outputs

| File | Content |
|---|---|
| `scenario.json` | flights with forecast, SHAP drivers, planned load, dry ice, bump order and a reason; the return flight; the ripple chain |
| `shipments.json` | every shipment with `assigned`, `status`, `reason`, fit, both costs, critical ratio, `alternatives` (regulatory screen and learned risk per leg), `timeSensitivity` |
| `compare.json` | two reference rules, On Call 36 and two ablations |
| `overrides.json` | five pre computed overrides, with the regulatory finding when blocked |
| `whatifs.json` | three pre computed disruption changes |
| `model_card.json` | capacity model, time sensitivity model, regulatory policy version |
| `summary.json` | counts by status and solver statistics |
| `backlog.json` | Monte Carlo back to normal forecast, per lane and overall, with the lever |

## Known limits

* Shipments, weights, declarations, acceptance records, load factors and training data are invented. Flights are real OAG schedule data; their status in the demo is not.
* The regulatory rules are an illustrative subset written from public guidance. They must be confirmed by qualified dangerous goods acceptance and the operator's current rules before any real use. Only the outbound recovery leg is screened.
* Weight only, apart from cool positions, main deck units and dry ice.
* Live re solves take about 3.5 to 6 seconds because the Shanghai lane uses its 5 second solver limit; the plan is then within 0.2% of optimal.
* The published `overbookingCost` excludes the waiting term while the bump order is sorted by the optimiser's full bump cost, so on a few flights the published numbers are not in ascending order.

## Live trigger source

`status.py` reads today's CX departures from Hong Kong with OAG flight status (`Content=Status`), key from `OAG_PRIMARY_KEY`. The service exposes it at `GET /status/oag`; results are cached for 3 minutes. It only informs the Monitor card and never changes the plan.
