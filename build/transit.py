"""Build walk + subway (+ bus) travel times between all OHNY venues for Sat Oct 17 and Sun Oct 18, 2026.

Frequency-based model from MTA static GTFS: for each stop pattern running 10:00-18:00 on that date,
riding time = median scheduled time between stops, boarding wait = half the headway (capped).
Output: ../transit.js  (window.TRANSIT = {variant: {minutes: [[...]], steps: {...}}})
"""
import csv, io, json, math, heapq, statistics, sys, zipfile, datetime, collections, os

HERE = os.path.dirname(os.path.abspath(__file__))
G = os.path.join(HERE, "gtfs")
DATES = {"sat": "20261017", "sun": "20261018"}
WIN = (10 * 3600, 18 * 3600)
WALK_M_PER_MIN = 78.0        # ~4.7 km/h
DETOUR = 1.25                # street grid vs straight line
ACCESS_M = 1100              # max walk from a venue to a stop
XFER_M = 300                 # max walk between stops for a transfer
DIRECT_WALK_MAX = 40.0       # minutes; longer walks are still allowed but transit usually wins
WAIT_CAP = {"subway": 10.0, "bus": 15.0}

FEEDS = {"subway": ["gtfs_subway.zip"], "bus": ["gtfs_b.zip", "gtfs_q.zip", "gtfs_m.zip", "gtfs_busco.zip"]}


def rows(z, name):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, "utf-8-sig"))


def hav(a, b):
    R = 6371000
    la1, la2 = math.radians(a[0]), math.radians(b[0])
    dl = math.radians(b[1] - a[1])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def secs(t):
    h, m, s = t.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def active_services(z, date):
    d = datetime.datetime.strptime(date, "%Y%m%d")
    dow = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][d.weekday()]
    act = set()
    for r in rows(z, "calendar.txt"):
        if r[dow] == "1" and r["start_date"] <= date <= r["end_date"]:
            act.add(r["service_id"])
    if "calendar_dates.txt" in z.namelist():
        for r in rows(z, "calendar_dates.txt"):
            if r["date"] == date:
                (act.add if r["exception_type"] == "1" else act.discard)(r["service_id"])
    return act


def load_feed(path, kind, date, prefix):
    z = zipfile.ZipFile(path)
    act = active_services(z, date)
    routes = {r["route_id"]: (r["route_short_name"] or r["route_id"], r.get("route_color") or "") for r in rows(z, "routes.txt")}
    trips, tdir = {}, {}
    for r in rows(z, "trips.txt"):
        if r["service_id"] in act:
            trips[r["trip_id"]] = r["route_id"]
            tdir[r["trip_id"]] = r.get("direction_id", "")
    st = collections.defaultdict(list)
    for r in rows(z, "stop_times.txt"):
        if r["trip_id"] in trips:
            st[r["trip_id"]].append((int(r["stop_sequence"]), r["stop_id"], secs(r["departure_time"] or r["arrival_time"])))
    stops = {}
    for r in rows(z, "stops.txt"):
        stops[prefix + r["stop_id"]] = (float(r["stop_lat"]), float(r["stop_lon"]), r["stop_name"], prefix + r["parent_station"] if r.get("parent_station") else None)
    patterns = collections.defaultdict(list)  # (route, stops tuple) -> list of time arrays
    deps = collections.Counter()               # (route, direction, stop) -> departures in window
    for tid, lst in st.items():
        lst.sort()
        for _, s_, t in lst:
            if WIN[0] <= t <= WIN[1]:
                deps[(trips[tid], tdir[tid], prefix + s_)] += 1
        t0 = lst[0][2]
        if not (WIN[0] - 3600 <= t0 <= WIN[1]):
            continue
        key = (trips[tid], tdir[tid], tuple(prefix + s for _, s, _ in lst))
        patterns[key].append([t for _, _, t in lst])
    pats = []
    span = (WIN[1] - WIN[0]) / 60.0
    for (rid, did, seq), times in patterns.items():
        hops = [statistics.median(t[i + 1] - t[i] for t in times) / 60.0 for i in range(len(seq) - 1)]
        waits = [min(span / max(deps[(rid, did, s_)], 1) / 2, WAIT_CAP[kind]) for s_ in seq]
        name, color = routes.get(rid, (rid, ""))
        pats.append({"kind": kind, "route": name, "color": color, "seq": seq, "hops": hops, "waits": waits})
    return stops, pats


def build(venues, day, with_bus):
    date = DATES[day]
    stops, pats = {}, []
    for kind, files in FEEDS.items():
        if kind == "bus" and not with_bus:
            continue
        for i, f in enumerate(files):
            s, p = load_feed(os.path.join(G, f), kind, date, f"{kind[0]}{i}:")
            stops.update(s); pats.extend(p)
    used = set(s for p in pats for s in p["seq"])
    stops = {k: v for k, v in stops.items() if k in used}
    print(f"  {day} bus={with_bus}: {len(pats)} patterns, {len(stops)} stops", file=sys.stderr)

    # node ids: stops 'S:<id>', pattern positions ('P', pi, idx), venues ('V', i)
    adj = collections.defaultdict(list)
    def edge(a, b, w, info):
        adj[a].append((b, w, info))
    for pi, p in enumerate(pats):
        for k, s in enumerate(p["seq"]):
            edge(("S", s), ("P", pi, k), p["waits"][k], ("board", pi, k))
            edge(("P", pi, k), ("S", s), 0.0, ("alight", pi, k))
            if k < len(p["seq"]) - 1:
                edge(("P", pi, k), ("P", pi, k + 1), max(p["hops"][k], 0.5), ("ride", pi, k))
    # spatial grid for proximity queries
    cell = 0.01
    grid = collections.defaultdict(list)
    for sid, (la, lo, *_r) in stops.items():
        grid[(int(la / cell), int(lo / cell))].append(sid)
    def near(pt, radius):
        ci, cj = int(pt[0] / cell), int(pt[1] / cell)
        out = []
        for di in (-1, 0, 1):
            for dj in (-2, -1, 0, 1, 2):
                for sid in grid[(ci + di, cj + dj)]:
                    d = hav(pt, stops[sid][:2])
                    if d <= radius:
                        out.append((sid, d))
        return out
    for sid, (la, lo, *_r) in stops.items():
        for oid, d in near((la, lo), XFER_M):
            if oid != sid:
                edge(("S", sid), ("S", oid), 2.0 + d * DETOUR / WALK_M_PER_MIN, ("xfer", oid))
    for i, v in enumerate(venues):
        for sid, d in near((v["lat"], v["lng"]), ACCESS_M):
            w = d * DETOUR / WALK_M_PER_MIN
            edge(("V", i), ("S", sid), w, ("walk", sid))
            edge(("S", sid), ("V", i), w, ("walk", i))
    n = len(venues)
    minutes = [[None] * n for _ in range(n)]
    steps = {}
    for i in range(n):
        dist = {("V", i): 0.0}
        prev = {}
        pq = [(0.0, ("V", i))]
        seen = set()
        remaining = n - 1
        while pq and remaining:
            d, u = heapq.heappop(pq)
            if u in seen:
                continue
            seen.add(u)
            if u[0] == "V" and u[1] != i:
                remaining -= 1
                continue  # never route through another venue
            if d > 150:
                break
            for vtx, w, info in adj[u]:
                nd = d + w
                if nd < dist.get(vtx, 1e18):
                    dist[vtx] = nd; prev[vtx] = (u, info, w)
                    heapq.heappush(pq, (nd, vtx))
        for j in range(n):
            if j == i:
                continue
            direct = hav((venues[i]["lat"], venues[i]["lng"]), (venues[j]["lat"], venues[j]["lng"])) * DETOUR / WALK_M_PER_MIN
            t = dist.get(("V", j))
            if t is None or direct <= t + 4 or direct <= 12:  # prefer walking when it's close to as fast
                if direct <= max(DIRECT_WALK_MAX, (t or 1e9)):
                    minutes[i][j] = round(direct, 1)
                    steps[f"{i},{j}"] = [["w", round(direct)]]
                    continue
            if t is None:
                minutes[i][j] = None
                continue
            # rebuild path
            path = []
            node = ("V", j)
            while node != ("V", i):
                u, info, w = prev[node]
                path.append((info, w, u, node))
                node = u
            path.reverse()
            segs = []
            walk = 0.0
            ride = None
            for info, w, u, vtx in path:
                kind = info[0]
                if kind in ("walk", "xfer"):
                    walk += w
                elif kind == "board":
                    if walk:
                        segs.append(["w", round(walk)]); walk = 0.0
                    p = pats[info[1]]
                    ride = {"pi": info[1], "from": p["seq"][info[2]], "n": 0, "t": 0.0, "wait": w}
                elif kind == "ride":
                    ride["n"] += 1; ride["t"] += w
                elif kind == "alight":
                    p = pats[ride["pi"]]
                    to = p["seq"][info[2]]
                    segs.append(["r", p["kind"][0], p["route"], p["color"], stops[ride["from"]][2], stops[to][2], ride["n"], round(ride["t"]), round(ride["wait"])])
                    ride = None
            if walk:
                segs.append(["w", round(walk)])
            minutes[i][j] = round(t, 1)
            steps[f"{i},{j}"] = segs
        if i % 20 == 0:
            print(f"    {i}/{n}", file=sys.stderr)
    return {"minutes": minutes, "steps": steps}


def main():
    raw = open(os.path.join(HERE, "..", "data.js")).read()
    venues = json.loads(raw[raw.index("=") + 1:].rstrip().rstrip(";"))
    out = {"order": [v["slug"] for v in venues], "names": []}
    names = {}
    def nid(n):
        if n not in names:
            names[n] = len(out["names"]); out["names"].append(n)
        return names[n]
    for day in ("sat", "sun"):
        openv = [day in v["win"] for v in venues]
        for with_bus in (False, True):
            r = build(venues, day, with_bus)
            mins, steps = {}, {}
            for i in range(len(venues)):
                for j in range(len(venues)):
                    if i == j or not (openv[i] and openv[j]) or r["minutes"][i][j] is None:
                        continue
                    k = f"{i},{j}"
                    mins[k] = round(r["minutes"][i][j])
                    st = r["steps"][k]
                    if any(x[0] == "r" for x in st):
                        steps[k] = [x if x[0] == "w" else [x[0], x[1], x[2], x[3], nid(x[4]), nid(x[5]), x[6], x[7], x[8]] for x in st]
            out[f"{day}-{'bus' if with_bus else 'subway'}"] = {"m": mins, "s": steps}
    with open(os.path.join(HERE, "..", "transit.js"), "w") as f:
        f.write("window.TRANSIT=" + json.dumps(out, separators=(",", ":")) + ";\n")
    print("wrote transit.js", file=sys.stderr)


if __name__ == "__main__":
    main()
