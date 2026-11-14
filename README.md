# On Call 36

**The planes had a plan. Now the cargo does too.**

A recovery engine for cargo disruption, built as a working prototype for Cathay Hackathon 2026 (Student Track, Cargo) by team Betsy Gusty. When a flight is delayed or cancelled it works out which shipments can no longer complete their journey, then allocates them automatically to the first available flights. Usable cargo capacity on those flights is uncertain, so a machine learning model forecasts it, and an optimiser weighs two costs per shipment: leaving cargo behind when it would have fit (underbooking) and loading cargo that then gets bumped at the aircraft (overbooking). Every decision carries a plain reason. Operations staff supervise: they review batches, hold them, test overrides and handle the exceptions the engine cannot place.

The name comes from September 2025, when Super Typhoon Ragasa suspended Hong Kong airport for about 36 hours.

**Flights are the real Cathay Pacific (CX) schedule from OAG; everything else is simulated, and every screen says so.** Shipments, the delay, costs and the share of each flight open to recovery cargo are invented. The forecast models are trained on synthetic data. Costs are a unitless cost index, never money. No language model is used; reasons are templates. The demo itself makes no external call; the only live reads are the optional trigger sources on Monitor (HKO open data from the browser, OAG flight status through the local service). It sits on top of the airline's existing systems and refers only to "the cargo management system".

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. This works offline from a fresh clone: no keys, no environment files, no backend. The OAG schedule is committed as a small derived file (`model/data/oag_flights.json`), so nothing calls OAG at demo time. The app reads the committed model results in `model/out/` and shows an **Offline snapshot** badge.

For **live re optimisation**, start the local model service in a second terminal (needs Python 3 with numpy, scipy, scikit-learn and threadpoolctl; shap is optional). It trains the forecast and the neural model at start up, about 30 seconds:

```bash
pip install -r model/requirements.txt
npm run model:serve
```

The badge turns to **Live re optimisation**. If the service stops mid demo, the app falls back to the snapshot.

To also read **today's OAG flight status** on Monitor, start the service with the key in its environment. The key stays in the Python process; the browser only sees the result.

```bash
OAG_PRIMARY_KEY=... npm run model:serve
```

```bash
npm test             # app tests (Vitest)
npm run build        # type check and production build
npm run model:run    # re run the model, rewrite model/out/*.json (about 60 s)
npm run model:test   # the model's own checks on its outputs
OAG_PRIMARY_KEY=... python3 model/oag.py   # refresh the OAG schedule; the key comes from your environment and is never written to disk
npm run screenshots  # re capture docs/screens/ (needs the dev server and a local Chrome)
```

The UI is in English by default. The **中文** button switches every label and every model reason to Traditional Chinese. Model sentences are translated with fixed patterns in `src/model/text.ts`, not a language model.

## The demo path

0. **Disruption alert.** On opening, a dialog announces the event: `CX 360` delayed 9h, 30 shipments affected, 3 need a person, 1 will arrive late, and when normal is forecast. Acknowledge it; a banner stays at the top of every page with links to the exceptions. Changes that create a new exception or a late shipment, blocked overrides and held batches raise a toast. **Reset demo** brings the alert back.
0b. **Where the disruption comes from** (Monitor). Three tabs. **Simulated event** is the timeline that drives the demo: Typhoon Signal No. 8 at T+36h, closure, reopening at T+72h, then the delay notice for `CX 360`. **HKO weather** reads the Hong Kong Observatory warning summary and nine day forecast live and says whether a warning in force would open an incident (Signal No. 3 or higher, red or black rainstorm, thunderstorm). **OAG flight status** reads today's CX departures from Hong Kong on our three lanes and flags any 60 minutes or more late. Live data never changes the demo plan. A live HKO warning that would open an incident also raises a toast.
1. **Monitor** (`/`). Now is T+72h, the airport has just reopened. `CX 360` to Shanghai is delayed 9h. The ripple shows the three groups of cargo it touches: cargo on `CX 360`, cargo out of Shanghai on the same aircraft's return `CX 381`, and three connections in Hong Kong to `CX 2090` that now break. **Back to normal** shows the Monte Carlo forecast of when the closure backlog is cleared, and what one extra freighter a night would change.
2. **Recovery** (`/recovery`). The board is already allocated: 26 of 30 affected shipments placed automatically, one placed late (consumer electronics, its connection broke), three for a person (medical isotopes, lithium metal cells, paint with incomplete packaging evidence).
3. **Cherries** (`/shipment/160-77203615`). First leg `CX 178` from Melbourne on time, second leg `CX 360` delayed 9h, would miss the promise by 5.2h, moved to `CX 380` and arrives 2.2h inside it. Garments made the room.
4. **Garments** (`/shipment/160-77204982`). General cargo moved automatically to the freighter `CX 2058`, still 16.8h inside its promise. The forwarder is informed, not asked.
5. **Lithium batteries** (`/shipment/160-77209090`): the regulatory screen blocks every passenger leg and clears the freighter, with findings and sources.
6. **With and without**: the button on Recovery, including which part of the model does the work.
7. **Forwarder view** for the cherries (`/forwarder/160-77203615`): the notification the forwarder receives, with the consignee message. Forwarders are informed, not asked; no reply is needed. Recovery counts how many have been notified.

Live moments for the judges, on the Recovery page:

* **Capacity**: on a flight column press −20%. With the service running the model re forecasts, re screens and re optimises in about 3.5 to 6 seconds; the change list shows what moved, the three deltas, and the solver line.
* **Delay**: +3h or +6h on a column.
* **Override**: drag a shipment onto another flight, or open it and pick a flight. A rule that blocks it is shown with its regulatory finding and source, for example lithium batteries (UN3480) on a passenger flight.
* **What if I override?**: five pre computed cases with before and after and the three deltas. Works offline.
* **Why** on a flight column: the SHAP waterfall of its capacity forecast.

Offline, the controls play back the pre computed cases in `model/out/overrides.json` and `whatifs.json`; other controls say they need the live service.

## The model in plain words

The model lives in `model/` (Python) and is the single source of truth; see `model/README.md`. The app does not re implement it. It merges three pieces of team work.

0. **Real schedule.** `model/oag.py` pulls CX flight instances from the OAG Flight Info API: Hong Kong to Shanghai, Tokyo and Los Angeles, Shanghai to Hong Kong and Melbourne to Hong Kong, 15 to 30 November 2026. Each scenario role is played by a real flight with its real number, times, aircraft and cargo tonnage. An assumed share of that tonnage is open to recovery cargo (90% on passenger flights, 20% on freighters); the rest is committed to bookings outside the scenario.
1. **Detect and propagate.** `CX 360` is delayed 9h; the same aircraft returns as `CX 381`, so the delay carries forward and connections to `CX 2090` break.
2. **Forecast, machine learning.** Gradient boosted quantile regression predicts each flight's usable cargo capacity as P10, P50 and P90. SHAP explains each median in kg.
3. **Regulatory screen.** Every shipment is checked against every leg: lithium batteries, liquids and packaging evidence, dry ice against a shared budget, leg acceptance records. Each pair is eligible for planning, needs dangerous goods review, or blocked, with findings and their source. Only eligible legs reach the optimiser.
4. **Time sensitivity, deep learning.** Two neural hazard models trained on synthetic shipment histories estimate the chance of quality loss and of a customer's downstream disruption by arrival time. That risk is a cost in the optimiser.
5. **Two costs per shipment.** Underbooking: waiting, lateness, promise breach, spoilage, learned risk. Overbooking: re handling, time out of the cool room, a service penalty. The critical ratio is overbooking cost over the sum: planned if the chance it fits is above it.
6. **Optimise.** A two stage stochastic mixed integer program per lane with HiGHS, 40 capacity scenarios, whole shipment offloads, and hard rules never traded off.
7. **Compare.** Scored on 1,000 fresh capacity scenarios with a replay that rebooks offloaded cargo, against two reference rules and two ablations.
8. **Back to normal, Monte Carlo** (`model/backlog.py`). Every departure inside the closure is cancelled and the cargo it would have carried becomes the lane backlog. 1,000 trials each draw usable capacity per flight from the forecast model, normal demand, and extra cancellations after reopening, then drain each lane in departure order over the real schedule to 30 November. Result: about 894 tonnes stuck from 32 cancelled departures; back to normal by Friday 27 November at the median (P10 to P90: Thursday 26 to Monday 30). Tokyo clears first (Friday 20), Shanghai next (Saturday 21), Los Angeles last. One hypothetical extra 747-8F to Los Angeles each night for four nights brings normal forward by about 2.6 days.

| Policy (1,000 scenarios, 60 shipments) | Expected cost index | Promises kept | Avg hours late, PRS and PR1 |
|---|---|---|---|
| Backlog first | 12,819 | 54 | see app |
| Original bookings first | 16,435 | 51 | see app |
| On Call 36 | 8,659 | 56 | see app |

Ablations, scored the same way: planning on the median instead of 40 scenarios costs 8,682; removing the neural risk costs 8,677. On this scenario both parts lower the expected cost, by small amounts. The reference rules are simple comparisons, not a description of how any airline works today; where a reference rule does better on a metric, the panel shows it.

Forecast hold out metrics (pinball loss on capacity as a share of nominal): P10 0.0074 against 0.0080 for the linear reference, P50 0.0163 against 0.0176, P90 0.0075 against 0.0077. 78% of held out flights fall between P10 and P90. Time sensitivity Brier scores are in the model card.

## Why this goes beyond the classic newsvendor model

The newsvendor sets one quantity for one product against one demand distribution with one cost ratio. Here every shipment has its own two costs, several flights in sequence compete for the same cargo, hard operating rules restrict what can go where, and the capacity distribution is forecast per flight from that flight's features.

## What is simulated, and what real data would replace it

| Part | In this build | Real data it would need |
|---|---|---|
| Shipments (60) | Invented AWBs with a valid mod 7 check digit, commodities, forwarders and promises | Bookings and air waybills from the cargo management system |
| Flights | Real CX schedule from OAG (numbers, times, aircraft, cargo tonnage). The delay and the share open to recovery cargo are invented | Live status and load control figures from operations |
| Capacity forecast | Trained on synthetic flights | Load sheets, passenger load forecasts, payload restrictions, fuel plans, booking and show up history |
| Costs | Illustrative weights on a unitless index | Service commitments, commercial priorities and handling costs set by operations |
| Dangerous goods declarations and leg acceptance | Invented package counts, quantities and acceptance records | Declarations and acceptance records from dangerous goods acceptance |
| Time sensitivity training data | Synthetic shipment histories | Handling, temperature and delivery timestamps, quality and customer disruption reports |
| Service tiers | `PRS` to `GEN` are an illustrative model, not any carrier's products | The airline's product catalogue |

No airline logo, brand asset, internal document or internal system name is used. Flight numbers are real public schedule data from OAG, a change the team chose over the brief's simulated `CX 9xxx` numbers.

## Known limits

* Weight only, apart from temperature controlled positions and main deck versus lower deck. No volume, ULD contour, weight and balance or tie down.
* A bumped shipment's cost is approximated by its next feasible flight; it does not consume capacity there in the model.
* One decision leg per shipment out of Hong Kong. Upstream legs are fixed.
* Offline playback moves shipments from the pre computed change lists and rescales capacity. It does not re run the forecast for a delayed flight; the live service does.
* The regulatory rules are an illustrative subset written from public guidance (IATA battery guidance and the operator's published variations). They must be confirmed by qualified dangerous goods acceptance before any real use. Only the outbound recovery leg is screened.
* Live re solves take about 3.5 to 6 seconds, longer than the 3 seconds the brief asked for, because the Shanghai lane uses its 5 second solver limit.
* Known model issue, reported to the model owners: the published `overbookingCost` excludes the waiting term, while the bump order is sorted by the optimiser's full bump cost. On some flights the published numbers are therefore not in ascending order. The app test marks this as a known issue rather than hiding it.
* SHAP contributions sum to within 0.4% of the median forecast; the waterfall shows any residual of 5 kg or more as its own bar.
* OAG: the free tier returns at most 10 flights per request; a few busy days on the Tokyo lane return exactly 10, so some flights may be missing there. That would make the back to normal forecast slower, not faster. Only derived schedule fields are committed; check the OAG licence before publishing the repository. OAG keys must stay in the environment; the keys shared in chat during the hackathon should be regenerated.
* Trigger sources: the disruption that drives the demo is simulated. HKO and OAG are read live only to show what would trigger an incident on a real day. The HKO impact rules are a rule of thumb, not airport procedure. The OAG status parser (`model/status.py`) follows OAG's documented `Content=Status` option but has not yet been checked against a live status response; the free tier may return schedule without status, and the card says so.
* The back to normal forecast uses lane level tonnage, not individual shipments, and assumes normal demand returns at its usual level from reopening.
* Demo state (holds, the last what if, language) is kept in this browser only.

## Layout

```
model/            oag.py, scenario.py, forecast.py, regulatory.py, regulatory_demo.py, sensitivity.py, optimise.py, backlog.py, run.py, server.py, test_model.py, README.md
model/data/       oag_flights.json (derived OAG schedule)
model/out/        scenario.json, shipments.json, compare.json, overrides.json, whatifs.json, model_card.json, summary.json, backlog.json
src/model/        types, data loading, plan helpers and offline playback, live service client, display text (+ tests)
src/screens/      Monitor.tsx, Recovery.tsx, Shipment.tsx, Forwarder.tsx
src/components/   shell, capacity band, SHAP waterfall, live panel, what if panel, with and without, charts
src/state/        demo state: live or offline, the plan on screen, holds, log
src/i18n/         English and Traditional Chinese labels
docs/screens/     screenshots of the demo path, live and offline, English and Chinese
```

Stack: Vite, React, TypeScript, Vitest, plain CSS with design tokens. Fonts Outfit and Figtree, bundled. Model: Python, scikit-learn (gradient boosting and neural networks), SciPy (HiGHS), SHAP.

Visual design: a modern operations dashboard in the jade green the team chose, rather than the plainer website style in the brief. Service tiers use one jade ramp from PRS (darkest) to GEN (lightest); status colours always carry a text label.
