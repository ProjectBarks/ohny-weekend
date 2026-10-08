"""Replays the site's timing rules (standard pace, walk preference on, subway+bus) over presets.js."""
import json, math, re, sys, itertools, os
H = os.path.dirname(os.path.abspath(__file__)) + "/.."
ld = lambda f, k: json.loads(open(f"{H}/{f}").read().split("=", 1)[1].strip().rstrip(";"))
EV = ld("data.js", "OHNY"); BY = {e["slug"]: e for e in EV}
T = ld("transit.js", "TRANSIT"); TIX = {s: i for i, s in enumerate(T["order"])}
P = ld("presets.js", "PRESETS") if False else None
def km(a, b):
    R=6371; la1,la2=map(math.radians,(a["lat"],b["lat"])); dl=math.radians(b["lng"]-a["lng"])
    h=math.sin((la2-la1)/2)**2+math.cos(la1)*math.cos(la2)*math.sin(dl/2)**2; return 2*R*math.asin(math.sqrt(h))
def leg(a, b, day, mode="bus"):
    direct = km(a, b)*1000*1.25/78
    if direct <= 22: return direct+1, "walk"
    m = T[f"{day}-{mode}"]["m"].get(f"{TIX[a['slug']]},{TIX[b['slug']]}")
    if m is None: return 10+km(a,b)*1.3*2.7, "est"
    s = T[f"{day}-{mode}"]["s"].get(f"{TIX[a['slug']]},{TIX[b['slug']]}")
    if s and direct <= min(30, m+8): return direct+1, "walk"
    return (m+4 if s else m+1), ("transit" if s else "walk")
def slot(e, day, arrive, first):
    ln = e["dur"] + (15 if e.get("lines") else 0); best=None
    for w in e["win"].get(day, []):
        if w.get("fixed"):
            if arrive > w["o"]: continue
            st, en = w["o"], w["c"]
        else:
            st = max(arrive, w["o"])
            if st + min(ln, 30) > w["c"]: continue
            en = min(st+ln, w["c"])
        if en > 19*60+50: continue
        if not best or st < best[0]: best=(st, en, 0 if first else st-arrive)
    return best
hm = lambda m: f"{int(m)//60}:{int(m)%60:02d}"
def run(day, slugs, verbose=True):
    t=9*60+45; last=None; ok=True; out=[]; walk=0
    for s in slugs:
        e=BY[s]; l,how=leg(last,e,day) if last else (0,"")
        sl=slot(e,day,t+l,last is None)
        if not sl:
            ok=False; out.append(f"  !! {s} arrive {hm(t+l)} windows {e['win'].get(day)}"); t=t+l+e['dur']; last=e; continue
        if how=="walk": walk+=l
        out.append(f"  {hm(sl[0])}-{hm(sl[1])} {s:28} leg {l:4.0f} {how:7} wait {sl[2]:3.0f}")
        t=sl[1]; last=e
    if verbose: print("\n".join(out))
    return ok
if __name__ == "__main__":
    src = open(f"{H}/presets.js").read()
    for m in re.finditer(r'id: "([^"]+)", day: "(\w+)".*?stops: \[([^\]]+)\]', src, re.S):
        stops = re.findall(r'"([^"]+)"', m.group(3))
        print(m.group(1)); ok = run(m.group(2), stops); print("  OK" if ok else "  ** FAILS **")
