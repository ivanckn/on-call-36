"""Fetch real CX schedules from the OAG Flight Info API and write a small derived file the model uses.

Usage:  OAG_PRIMARY_KEY=... python oag.py          (key from your environment; never written to disk)
Writes: oag_raw/*.json         raw responses, not committed (OAG licence)
        data/oag_flights.json  derived fields only: flight, route, local and UTC times, aircraft, service type, cargo tonnage
The app and run.py work from the committed derived file, so nothing calls OAG at demo time."""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request

BASE = "https://api.oag.com/flight-instances/"
HERE = os.path.dirname(os.path.abspath(__file__))
DATES = ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]
ROUTES = [("HKG", "PVG"), ("HKG", "NRT"), ("HKG", "LAX"), ("PVG", "HKG"), ("MEL", "HKG")]
# Outbound lanes only, further ahead, for the backlog clearance forecast.
EXTRA_DATES = [f"2026-11-{d}" for d in range(22, 31)]
EXTRA_ROUTES = [("HKG", "PVG"), ("HKG", "NRT"), ("HKG", "LAX")]


def fetch(key, params):
    rows, url = [], BASE + "?" + urllib.parse.urlencode(params)
    while url:
        req = urllib.request.Request(url, headers={"Subscription-Key": key, "Cache-Control": "no-cache"})
        for attempt in range(8):
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    body = json.load(r)
                break
            except urllib.error.HTTPError as e:
                if e.code != 429 or attempt == 7:
                    raise
                wait = float(e.headers.get("Retry-After") or 0) or min(60, 4 * 2 ** attempt)
                print(f"  rate limited, waiting {wait:.0f}s", flush=True)
                time.sleep(wait)
        rows += body.get("data", [])
        nxt = body.get("paging", {}).get("next") or ""
        url = nxt if nxt.startswith("http") else (BASE + nxt.lstrip("/") if nxt else "")
        time.sleep(1.5)
    return rows


def derive(r):
    return dict(
        flight=f"{r['carrier']['iata']}{r['flightNumber']}{r.get('serviceSuffix') or ''}",
        origin=r["departure"]["airport"]["iata"], dest=r["arrival"]["airport"]["iata"],
        depLocal=f"{r['departure']['date']['local']}T{r['departure']['time']['local']}",
        depUtc=f"{r['departure']['date']['utc']}T{r['departure']['time']['utc']}",
        arrLocal=f"{r['arrival']['date']['local']}T{r['arrival']['time']['local']}",
        arrUtc=f"{r['arrival']['date']['utc']}T{r['arrival']['time']['utc']}",
        elapsedMinutes=r.get("elapsedTime"),
        aircraftIata=(r.get("aircraftType") or {}).get("iata"), aircraftIcao=(r.get("aircraftType") or {}).get("icao"),
        serviceType=(r.get("serviceType") or {}).get("iata"),
        cargoTonnage=r.get("cargoTonnage"),
        codeshare=bool((r.get("codeshare") or {}).get("marketingFlights")),
        flightType=r.get("flightType"),
    )


def main():
    key = os.environ.get("OAG_PRIMARY_KEY") or os.environ.get("OAG_SUBSCRIPTION_KEY")
    if not key:
        sys.exit("Set OAG_PRIMARY_KEY in your environment.")
    os.makedirs(os.path.join(HERE, "oag_raw"), exist_ok=True)
    os.makedirs(os.path.join(HERE, "data"), exist_ok=True)
    out = []
    jobs = [(d, o, a) for d in DATES for o, a in ROUTES] + [(d, o, a) for d in EXTRA_DATES for o, a in EXTRA_ROUTES]
    for d, o, a in jobs:
        if True:
            params = dict(DepartureDateTime=d, DepartureAirport=o, ArrivalAirport=a, CarrierCode="CX",
                          CodeType="IATA", version="v2", Limit=10)
            raw = os.path.join(HERE, "oag_raw", f"{d}_{o}_{a}.json")
            if os.path.exists(raw):
                rows = json.load(open(raw))
            else:
                rows = fetch(key, params)
                json.dump(rows, open(raw, "w"), indent=1)
            got = [derive(r) for r in rows if r.get("flightType", "Scheduled") == "Scheduled"]
            out += got
            print(d, o, a, len(rows), flush=True)
    seen, uniq = set(), []
    for f in sorted(out, key=lambda x: x["depUtc"]):
        k = (f["flight"], f["depUtc"])
        if k not in seen:
            seen.add(k)
            uniq.append(f)
    json.dump(dict(source="OAG Flight Info API, flight-instances v2", fetched=time.strftime("%Y-%m-%d"),
                   note="Derived schedule fields only. Raw responses are not committed.", flights=uniq),
              open(os.path.join(HERE, "data", "oag_flights.json"), "w"), indent=1)
    print("wrote", len(uniq), "flights")


if __name__ == "__main__":
    main()
