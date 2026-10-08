"""Subway network layer for the map: line geometry by route (MTA colors) and stations with the routes serving them."""
import csv, io, json, zipfile, collections, os, sys
from transit import rdp, rows, active_services
HERE = os.path.dirname(os.path.abspath(__file__))
z = zipfile.ZipFile(os.path.join(HERE, "gtfs", "gtfs_subway.zip"))
act = active_services(z, "20261017") | active_services(z, "20261018")
routes = {r["route_id"]: (r["route_short_name"], r["route_color"] or "808183", r.get("route_text_color") or "FFFFFF") for r in rows(z, "routes.txt")}
trip_route, shape_route = {}, {}
for r in rows(z, "trips.txt"):
    if r["service_id"] in act:
        trip_route[r["trip_id"]] = r["route_id"]
        if r["shape_id"]:
            shape_route[r["shape_id"]] = r["route_id"]
pts = collections.defaultdict(list)
for r in rows(z, "shapes.txt"):
    if r["shape_id"] in shape_route:
        pts[r["shape_id"]].append((int(r["shape_pt_sequence"]), float(r["shape_pt_lat"]), float(r["shape_pt_lon"])))
lines, seen = [], set()
for sid, p in pts.items():
    g = [(a, b) for _, a, b in sorted(p)]
    g = rdp(g, 0.00004)
    key = (shape_route[sid], tuple((round(a, 3), round(b, 3)) for a, b in g))
    if key in seen:
        continue
    seen.add(key)
    name, color, _ = routes[shape_route[sid]]
    lines.append({"r": name, "c": color, "g": [[round(a, 5), round(b, 5)] for a, b in g]})
stops = {r["stop_id"]: r for r in rows(z, "stops.txt")}
serve = collections.defaultdict(set)
for r in rows(z, "stop_times.txt"):
    rid = trip_route.get(r["trip_id"])
    if rid:
        st = stops[r["stop_id"]]
        serve[st["parent_station"] or st["stop_id"]].add(routes[rid][0])
order = "1234567ACEBDFMGJZLNQRWS"
stations = []
for pid, rs in serve.items():
    st = stops[pid]
    stations.append({"n": st["stop_name"], "p": [round(float(st["stop_lat"]), 5), round(float(st["stop_lon"]), 5)],
                     "r": sorted(rs, key=lambda x: (order.find(x[0]) if x[0] in order else 99, x))})
colors = {v[0]: v[1] for v in routes.values()}
with open(os.path.join(HERE, "..", "subway.js"), "w") as f:
    f.write("window.SUBWAY=" + json.dumps({"lines": lines, "stations": stations, "colors": colors}, separators=(",", ":")) + ";\n")
print(len(lines), "lines,", len(stations), "stations", file=sys.stderr)
