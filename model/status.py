"""Live trigger source: today's CX departures from Hong Kong with OAG flight status.

The key comes from the environment (OAG_PRIMARY_KEY) and stays on this machine; the browser only sees the result.
Usage:  OAG_PRIMARY_KEY=... python status.py [YYYY-MM-DD]
The server exposes the same data at GET /status/oag. Results are cached for 3 minutes to respect the free tier limits.
The statusDetails layout is read defensively: OAG documents Content=Status but the parser has not yet been checked
against a live status response, so anything it cannot read is reported as "no status" instead of a guess."""
import datetime as dt, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

BASE = "https://api.oag.com/flight-instances/"
LANES = ("PVG", "NRT", "LAX")
INCIDENT_MINUTES = 60  # a departure this late raises an incident
_CACHE = {}


def _utc(v, date=None):
    """Parse an OAG time: {"utc": "..."} or a string, with an optional separate date."""
    if isinstance(v, dict):
        v = v.get("utc") or v.get("UTC")
    if isinstance(v, dict):  # {"date": ..., "time": ...}
        date, v = v.get("date"), v.get("time")
    if not isinstance(v, str) or not v:
        return None
    s = v.strip().replace("Z", "")
    if "T" not in s and date:
        s = f"{date}T{s}"
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"):
        try:
            return dt.datetime.strptime(s[:19] if fmt.endswith("%S") else s[:16], fmt)
        except ValueError:
            pass
    return None


def _minutes(variation):
    """'PT1H25M', '-PT5M', '01:25' or a number of minutes."""
    if isinstance(variation, (int, float)):
        return float(variation)
    if not isinstance(variation, str):
        return None
    m = re.fullmatch(r"(-)?PT(?:(\d+)H)?(?:(\d+)M)?", variation.strip())
    if m and (m.group(2) or m.group(3)):
        return (-1 if m.group(1) else 1) * (int(m.group(2) or 0) * 60 + int(m.group(3) or 0))
    m = re.fullmatch(r"(-)?(\d{1,2}):(\d{2})", variation.strip())
    if m:
        return (-1 if m.group(1) else 1) * (int(m.group(2)) * 60 + int(m.group(3)))
    return None


def parse(r):
    """One OAG flight instance to the fields the trigger needs."""
    dep, arr = r.get("departure", {}), r.get("arrival", {})
    sched = _utc(dep.get("time"), (dep.get("date") or {}).get("utc"))
    out = dict(flight=f"CX{r.get('flightNumber')}", origin=dep.get("airport", {}).get("iata"), dest=arr.get("airport", {}).get("iata"),
               schedLocal=f"{(dep.get('date') or {}).get('local', '')} {(dep.get('time') or {}).get('local', '')}".strip(),
               schedUtc=sched.isoformat() if sched else None, aircraft=(r.get("aircraftType") or {}).get("iata"),
               freighter=(r.get("serviceType") or {}).get("iata") in ("F", "H"),
               hasStatus=False, state=None, latestUtc=None, latestKind=None, delayMinutes=None)
    sd = r.get("statusDetails")
    if isinstance(sd, list):
        sd = sd[0] if sd else None
    if not isinstance(sd, dict):
        return out
    out["hasStatus"] = True
    out["state"] = sd.get("state")
    d = sd.get("departure") or {}
    for kind, block in (("actual", d.get("actualTime")), ("estimated", d.get("estimatedTime"))):
        if not isinstance(block, dict):
            continue
        for point in ("outGate", "offGround"):
            t = _utc(block.get(point))
            if t:
                out["latestUtc"], out["latestKind"] = t.isoformat(), kind
                if sched:
                    out["delayMinutes"] = round((t - sched).total_seconds() / 60)
                break
            v = _minutes(block.get(point + "Variation"))
            if v is not None and out["delayMinutes"] is None:
                out["delayMinutes"], out["latestKind"] = round(v), kind
        if out["latestUtc"]:
            break
    return out


def summarise(rows, date, source):
    flights = sorted((parse(r) for r in rows), key=lambda f: f["schedUtc"] or "")
    late = [f for f in flights if (f["delayMinutes"] or 0) >= INCIDENT_MINUTES]
    return dict(ok=True, date=date, source=source, fetchedAt=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                incidentMinutes=INCIDENT_MINUTES, flights=flights, withStatus=sum(f["hasStatus"] for f in flights),
                incidents=[f["flight"] for f in late])


def _get(key, params, pages=3):
    rows, url = [], BASE + "?" + urllib.parse.urlencode(params)
    for _ in range(pages):
        req = urllib.request.Request(url, headers={"Subscription-Key": key, "Cache-Control": "no-cache"})
        with urllib.request.urlopen(req, timeout=20) as r:
            body = json.load(r)
        rows += body.get("data", [])
        nxt = (body.get("paging") or {}).get("next") or ""
        if not nxt:
            break
        url = nxt if nxt.startswith("http") else BASE + nxt.lstrip("/")
        time.sleep(1.2)
    return rows


def today(date=None):
    date = date or dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat()
    hit = _CACHE.get(date)
    if hit and time.time() - hit[0] < 180:
        return hit[1]
    key = os.environ.get("OAG_PRIMARY_KEY") or os.environ.get("OAG_SUBSCRIPTION_KEY")
    if not key:
        return dict(ok=False, date=date, reason="missingKey")
    rows = []
    try:
        for lane in LANES:
            rows += _get(key, dict(DepartureDateTime=date, DepartureAirport="HKG", ArrivalAirport=lane, CarrierCode="CX",
                                   CodeType="IATA", version="v2", Limit=10, Content="Status"))
            time.sleep(1.2)
    except urllib.error.HTTPError as e:
        return dict(ok=False, date=date, reason="rateLimited" if e.code == 429 else f"http{e.code}")
    except (urllib.error.URLError, TimeoutError):
        return dict(ok=False, date=date, reason="unreachable")
    res = summarise(rows, date, "OAG Flight Info API, Content=Status")
    _CACHE[date] = (time.time(), res)
    return res


if __name__ == "__main__":
    print(json.dumps(today(sys.argv[1] if len(sys.argv) > 1 else None), indent=1))
