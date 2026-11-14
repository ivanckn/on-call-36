"""Scenario for On Call 36. Flights are real CX schedules from OAG (data/oag_flights.json, fetched by oag.py);
shipments, delays, costs and the capacity open to recovery cargo are invented for the demo.
Times are hours relative to T0 = Sat 14 Nov 2026 06:00 Hong Kong time (cancellations announced).
Airport closed T+36 to T+72. Now = T+72."""
import datetime as _dt
import json
import os
import random
from regulatory_demo import declarations

NOW = 72.0
MIN_TRANSFER = 3.0
TURNAROUND = 2.5
T0_UTC = _dt.datetime(2026, 11, 13, 22, 0)
OAG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "oag_flights.json")
OAG = json.load(open(OAG_FILE))
# Share of each flight's cargo tonnage open to this recovery desk; the rest is committed to other bookings
# outside the scenario. Illustrative assumption, not OAG data.
OPEN_SHARE = {"PAX": 0.9, "FRT": 0.2}
# Fallback tonnage where OAG gives none, by IATA aircraft code.
TONNES_FALLBACK = {"351": 20.0, "359": 20.0, "74N": 137.75, "74Y": 110.0, "": 110.0, None: 110.0}
DOWNSTREAM_DEADLINES = {"Semiconductors": NOW + 13, "Medical devices": NOW + 16, "Consumer electronics": NOW + 44}


def hours(utc_iso):
    return round((_dt.datetime.fromisoformat(utc_iso) - T0_UTC).total_seconds() / 3600, 2)


def oag(flight, local_date):
    """One OAG flight instance by flight number and local departure date."""
    for f in OAG["flights"]:
        if f["flight"] == flight and f["depLocal"].startswith(local_date):
            return f
    raise KeyError(f"{flight} on {local_date} is not in {OAG_FILE}")


# Each scenario role is played by one real flight. role: (flight, local date, cool positions, pax load factor, payload restriction, extra fuel)
ROLES = {
    "CX9101": ("CX360", "2026-11-17", 2, 0.95, 0, 0),   # Shanghai passenger flight that is delayed
    "CX9102": ("CX380", "2026-11-17", 2, 0.97, 0, 0),   # first passenger flight to Shanghai after it
    "CX9106": ("CX362", "2026-11-17", 2, 0.88, 0, 0),   # later passenger flight to Shanghai
    "CX9104": ("CX2058", "2026-11-17", 3, 0.0, 0, 1),   # Shanghai freighter
    "CX9108": ("CX50", "2026-11-18", 3, 0.0, 0, 0),     # next day Shanghai freighter
    "CX9201": ("CX450", "2026-11-17", 2, 0.98, 1, 0),   # Tokyo passenger
    "CX9203": ("CX500", "2026-11-17", 2, 0.90, 0, 0),   # Tokyo passenger
    "CX9205": ("CX6", "2026-11-18", 3, 0.0, 1, 1),      # Tokyo freighter
    "CX9301": ("CX2090", "2026-11-18", 3, 0.0, 0, 1),   # Los Angeles freighter the Shanghai connections were booked on
    "CX9303": ("CX884", "2026-11-18", 2, 0.93, 0, 1),   # Los Angeles passenger
    "CX9305": ("CX882", "2026-11-18", 2, 0.85, 0, 0),   # Los Angeles passenger, later
}
RETURN = ("CX381", "2026-11-17")   # the delayed aircraft's return from Shanghai
INBOUND_MEL = ("CX178", "2026-11-17")  # the cherries' first leg


def R(role):
    """Real flight id for a scenario role, for example R("CX9101") is "CX360"."""
    return ROLES[role][0]


TRIGGER = R("CX9101")


def flights(delays=None):
    """delays: {flight id: hours late}. The scenario trigger is the Shanghai flight delayed 9h."""
    delays = {TRIGGER: 9} if delays is None else delays
    out = {}
    for role, (fid, day, cool, lf, restr, fuel) in ROLES.items():
        o = oag(fid, day)
        kind = "PAX" if o["serviceType"] in ("J", "S", "Q") else "FRT"
        tonnes = o["cargoTonnage"] or TONNES_FALLBACK.get(o["aircraftIata"], 20.0 if kind == "PAX" else 110.0)
        sched, dur = hours(o["depUtc"]), round(hours(o["arrUtc"]) - hours(o["depUtc"]), 2)
        dep = sched
        status, cause = "On time", ""
        if delays.get(fid):
            dep, status, cause = sched + delays[fid], f"Delayed {delays[fid]:g}h", "Runway slots re sequenced after reopening"
        out[fid] = dict(id=fid, role=role, origin=o["origin"], dest=o["dest"], schedDep=sched, dep=dep, arr=round(dep + dur, 2),
                        kind=kind, operator="CX", aircraftType=o["aircraftIata"] or o["aircraftIcao"] or "",
                        oagCargoTonnes=tonnes, nominalKg=round(tonnes * 1000 * OPEN_SHARE[kind]), coolPositions=cool,
                        dryIceCapacityKg=15 if kind == "PAX" else 35, status=status, cause=cause, source="OAG schedule",
                        localDep=o["depLocal"],
                        features=dict(isPax=int(kind == "PAX"), paxLoadFactor=lf, payloadRestriction=restr,
                                      extraFuel=fuel, hoursSinceReopen=dep - NOW, timeOfDay=int((6 + dep) % 24)))
    return out


def ripple(fl):
    """Carry the trigger delay forward one rotation: the same aircraft returns from Shanghai."""
    o = oag(*RETURN)
    sched, dur = hours(o["depUtc"]), round(hours(o["arrUtc"]) - hours(o["depUtc"]), 2)
    dep = max(sched, fl[TRIGGER]["arr"] + TURNAROUND)
    late = dep - sched
    ret = dict(id=o["flight"], origin=o["origin"], dest=o["dest"], schedDep=sched, dep=round(dep, 2), arr=round(dep + dur, 2),
               schedArr=round(sched + dur, 2), status=f"Delayed {late:.0f}h" if late >= 0.5 else "On time",
               cause=f"Late inbound aircraft from {TRIGGER}" if late >= 0.5 else "", source="OAG schedule")
    return ret


def shipments(fl, ret):
    rnd = random.Random(36)
    S, serials = [], iter(range(7720361, 7729999, 137))

    def awb():
        s = next(serials)
        return f"160-{s}{s % 7}"

    def add(commodity, kg, tier, shc, dest, promise, kind, booked, ready, **kw):
        shipment = dict(awb=awb(), commodity=commodity, kg=kg, tier=tier, shc=shc, dest=dest, promise=promise,
                      kind=kind, booked=booked, ready=ready, cool=("COL" in shc), dg=("DGR" in shc),
                      mainDeck=kw.get("mainDeck", False), shelf=kw.get("shelf"), latestDep=kw.get("latestDep"),
                      handlingAgeHours=kw.get("handlingAgeHours", 0),
                      temperatureExcursionHours=kw.get("temperatureExcursionHours", 0),
                      downstreamDeadline=DOWNSTREAM_DEADLINES.get(commodity),
                      forwarder=kw.get("forwarder", rnd.choice(["Harbour Lane Logistics", "Pearl Delta Freight",
                                                                "Kowloon Bridge Forwarding", "Lantau Air Cargo Services",
                                                                "Victoria Peak Logistics"])),
                      origin=kw.get("origin", "HKG"), note=kw.get("note", ""), hero=kw.get("hero", ""))
        shipment.update(declarations({**shipment, "flights": fl.values()}))
        S.append(shipment)

    mel = oag(*INBOUND_MEL)
    mel_arr = hours(mel["arrUtc"])
    # Hero cases
    add("Cherries", 1200, "PRS", ["PER", "COL"], "PVG", 86, "RECOVERY", R("CX9101"), mel_arr + MIN_TRANSFER,
        shelf=90, origin="MEL", hero="cherries", handlingAgeHours=12, temperatureExcursionHours=1,
        note=f"First leg MEL to HKG arrived T+{mel_arr:g}h on time. Second leg {R('CX9101')} delayed 9h.")
    add("Garments", 1800, "GEN", [], "PVG", 110, "BAU", R("CX9102"), NOW, hero="garments")
    add("Live lobster", 600, "PRS", ["AVI"], "PVG", 85, "RECOVERY", None, NOW, shelf=88, hero="lobster", handlingAgeHours=27,
        note="Waiting in the Hong Kong terminal since the closure.")
    add("Vaccines", 900, "PR1", ["PIL", "COL"], "PVG", 88, "RECOVERY", None, NOW, latestDep=84, hero="pharma", handlingAgeHours=36,
        note="In a cool room position since the closure. Must depart by T+84h.")
    add("Lithium batteries", 1500, "PR2", ["DGR"], "PVG", 96, "RECOVERY", None, NOW, hero="dg")
    add("Machine tool", 2800, "PR2", [], "PVG", 104, "RECOVERY", None, NOW, mainDeck=True, hero="maindeck")
    # Cargo out of Shanghai on the return flight, connecting in Hong Kong to Los Angeles
    ready_conn = ret["arr"] + MIN_TRANSFER
    conn = fl[R("CX9301")]
    add("Consumer electronics", 1400, "PR1", [], "LAX", 114.5, "RECOVERY", R("CX9301"), ready_conn, origin="PVG",
        hero="electronics", note=f"Out of Shanghai on {ret['id']}, now arriving T+{ret['arr']:g}h. Misses {conn['id']} at T+{conn['dep']:g}h.")
    add("Auto parts", 1100, "PR3", [], "LAX", 124, "RECOVERY", R("CX9301"), ready_conn, origin="PVG",
        note=f"Out of Shanghai on {ret['id']}. Misses {conn['id']}.")
    add("Footwear", 950, "GEN", [], "LAX", 140, "RECOVERY", R("CX9301"), ready_conn, origin="PVG",
        note=f"Out of Shanghai on {ret['id']}. Misses {conn['id']}.")
    # Other cargo booked on the delayed flight
    add("Fashion samples", 700, "PR1", [], "PVG", 87, "RECOVERY", R("CX9101"), NOW,
        note=f"Booked on {R('CX9101')}. The 9h delay breaks the promise.")
    add("Fresh flowers", 500, "PR1", ["PER", "COL"], "PVG", 88.5, "RECOVERY", R("CX9101"), NOW, shelf=92,
        note=f"Booked on {R('CX9101')}. The 9h delay breaks the promise.")
    gen = [("Books", "GEN"), ("Toys", "GEN"), ("Homeware", "GEN"), ("Phone cases", "PR3"), ("Textiles", "GEN"),
           ("Printed matter", "GEN"), ("Spare parts", "PR2"), ("Cosmetics", "PR3"), ("Stationery", "GEN"),
           ("Sports goods", "PR3"), ("Furniture parts", "GEN"), ("Packaging", "GEN"), ("Tableware", "GEN"),
           ("Watches", "PR2"), ("Luggage", "GEN"), ("Kitchenware", "GEN")]
    for name, tier in gen[:10]:  # stay on the delayed flight, still inside promise
        add(name, rnd.choice([400, 500, 600, 700, 800]), tier, [], "PVG", rnd.choice([100, 108, 116, 124]),
            "BAU", R("CX9101"), NOW)
    # Business as usual cargo on the first Shanghai flight, CX9102 (already nearly full)
    for name, tier, kg in [("Medical devices", "PR1", 1300), ("Semiconductors", "PR1", 1100), ("Eyewear", "PR2", 900),
                           ("Apparel", "PR3", 1500), ("Accessories", "GEN", 1200), ("Catalogues", "GEN", 1000)]:
        promise = 94 if name == "Semiconductors" else {"PR1": 86, "PR2": 92, "PR3": 104, "GEN": 112}[tier]
        add(name, kg, tier, [], "PVG", promise, "BAU", R("CX9102"), NOW)
    # Freighter CX9104 business as usual
    for name, tier, kg in [("Industrial pumps", "PR2", 3200), ("Solar panels", "PR3", 4200), ("Paint (DG)", "PR3", 1800),
                           ("Machine parts", "GEN", 3600), ("Steel fittings", "GEN", 3000)]:
        add(name, kg, tier, ["DGR"] if "DG" in name else [], "PVG", 110, "BAU", R("CX9104"), NOW,
            mainDeck=(name in ("Industrial pumps", "Solar panels")))
    # Backlog from the closure waiting for Shanghai
    for name, tier, kg, pr in [("Chilled seafood", "PR1", 800, 89), ("E commerce parcels", "PR2", 1600, 92),
                               ("Phone components", "PR2", 1200, 94), ("Laptops", "PR1", 1000, 86),
                               ("Garment trims", "GEN", 1400, 118), ("Toys (backlog)", "GEN", 1700, 120),
                               ("Bicycle parts", "PR3", 1300, 106)]:
        add(name, kg, tier, ["PER", "COL"] if "seafood" in name else [], "PVG", pr, "RECOVERY", None, NOW,
            shelf=92 if "seafood" in name else None, note="Waiting in the Hong Kong terminal since the closure.")
    # Tokyo lane
    for name, tier, kg, pr, kind, bk in [("Tuna", "PRS", 700, 82, "RECOVERY", None), ("Orchids", "PR1", 400, 84, "RECOVERY", None),
                                         ("Camera lenses", "PR1", 900, 84, "BAU", R("CX9201")), ("Game consoles", "PR2", 2200, 92, "BAU", R("CX9201")),
                                         ("Magazines", "GEN", 1500, 112, "BAU", R("CX9201")), ("Snacks", "PR3", 1800, 100, "BAU", R("CX9201")),
                                         ("Ceramics", "GEN", 1600, 116, "BAU", R("CX9201")), ("Robot parts", "PR2", 2600, 96, "RECOVERY", None),
                                         ("Car batteries", "PR3", 3000, 110, "RECOVERY", None), ("Uniforms", "GEN", 1900, 120, "RECOVERY", None),
                                         ("Audio gear", "PR2", 1400, 96, "BAU", R("CX9203")), ("Tea", "GEN", 1200, 124, "BAU", R("CX9203"))]:
        shc = ["PER", "COL"] if name in ("Tuna", "Orchids") else (["DGR"] if name == "Car batteries" else [])
        add(name, kg, tier, shc, "NRT", pr, kind, bk, NOW, shelf=88 if name == "Tuna" else None)
    # Los Angeles lane business as usual
    for name, tier, kg in [("Servers", "PR1", 2400), ("Drones", "PR2", 1800), ("Sneakers", "PR3", 2600),
                           ("Board games", "GEN", 2200), ("Kitchen appliances", "GEN", 2800)]:
        add(name, kg, tier, [], "LAX", {"PR1": 118, "PR2": 128, "PR3": 140, "GEN": 160}[tier], "BAU", R("CX9301"), NOW)
    # One true exception: nothing in the horizon works
    first_frt = min(f["dep"] for f in fl.values() if f["dest"] == "PVG" and f["kind"] == "FRT")
    add("Medical isotopes", 300, "PR1", ["DGR"], "PVG", 86, "RECOVERY", None, NOW, latestDep=80, hero="isotopes",
        note=f"Short lived. Must depart by T+80h. Dangerous goods, so freighter only, and the first freighter leaves at T+{first_frt:g}h.")
    add("Bottled water", 250, "GEN", [], "PVG", 115, "BAU", R("CX9106"), NOW, hero="water")
    add("Lithium metal cells", 200, "PR2", ["DGR"], "PVG", 102, "RECOVERY", None, NOW, hero="metal")
    add("Paint with incomplete packaging evidence", 300, "PR2", ["DGR"], "PVG", 108, "RECOVERY", None, NOW,
        hero="paint_review")
    return S
