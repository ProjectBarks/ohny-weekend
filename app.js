(() => {
  const EV = window.OHNY;
  const BY = Object.fromEntries(EV.map(e => [e.slug, e]));
  const DAYS = { sat: "Saturday", sun: "Sunday" };
  const OTHER = { sat: "sun", sun: "sat" };
  const DAY_START = 9 * 60 + 45;
  const DAY_END = 19 * 60 + 40;
  const PACE = {
    relaxed: { dur: 1.2, max: 5, label: "Relaxed pace" },
    standard: { dur: 1.0, max: 8, label: "Standard pace" },
    packed: { dur: 0.85, max: 10, label: "Packed pace" },
  };
  const MODE_SHORT = { bus: "Subway and bus", subway: "Subway only", car: "Car or rideshare" };
  // Near-duplicates: once one is on a route, the other is worth much less.
  const TWINS = [
    ["610-loft-26", "620-loft-26"],
    ["navy-yard-26", "navy-yard-creative-26"],
    ["kingsland-wildflowers-26", "noo-arts-26"],
    ["sunset-park-open-studios-26", "spos-26"],
  ];
  const twinOf = {};
  TWINS.forEach(g => g.forEach(s => (twinOf[s] = g.filter(x => x !== s))));
  const PRESETS = window.PRESETS || [];
  const PBY = Object.fromEntries(PRESETS.map(p => [p.id, p]));
  const $ = id => document.getElementById(id);
  const mobile = () => matchMedia("(max-width: 899px)").matches;

  // ---------- state ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("odr:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("odr:" + k, JSON.stringify(v)); } catch {} },
  };
  const state = {
    day: store.get("day", "sat"),
    view: "plan",
    mix: store.get("mix", 60),
    mode: ["bus", "subway", "car"].includes(store.get("mode")) ? store.get("mode") : "bus",
    walky: store.get("walky", true),
    pace: PACE[store.get("pace")] ? store.get("pace") : "standard",
    pins: new Set(store.get("pins", [])),
    skips: new Set(store.get("skips", []).flatMap(k => (k.includes("|") ? [k] : ["sat|" + k, "sun|" + k]))),
    choice: store.get("choice", { sat: "sat-uptown", sun: "sun-green" }),
    pinDay: store.get("pinDay", {}),
    filters: new Set(["open"]),
    plan: {},
    sel: null,
  };
  const save = () => {
    store.set("day", state.day); store.set("mix", state.mix); store.set("mode", state.mode);
    store.set("pace", state.pace); store.set("walky", state.walky); store.set("pins", [...state.pins]);
    store.set("skips", [...state.skips]); store.set("choice", state.choice); store.set("pinDay", state.pinDay);
  };
  const skipped = s => state.skips.has("sat|" + s) || state.skips.has("sun|" + s);

  // ---------- formatting ----------
  const fmt = m => {
    m = Math.round(m);
    const h = Math.floor(m / 60), mi = m % 60;
    return `${((h + 11) % 12) + 1}:${String(mi).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  };
  // Timetable times: "10:30", 12-hour; the am/pm suffix only on the day's first time and when a run crosses noon.
  const hm = m => { m = Math.round(m); const h = Math.floor(m / 60); return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")}`; };
  const ap = m => (Math.round(m) >= 12 * 60 ? "pm" : "am");
  const tH = (m, show) => `${hm(m)}${show ? `<span class="ap">${ap(m)}</span>` : ""}`;
  const apFlags = list => list.map((m, i) => i === 0 || ap(m) !== ap(list[i - 1]));
  // Hour ranges never break inside themselves; the suffix is the timetable's small secondary am/pm.
  const rangeText = (o, c) => (ap(o) === ap(c) ? `${hm(o)}–${hm(c)} ${ap(c)}` : `${hm(o)} ${ap(o)}–${hm(c)} ${ap(c)}`);
  const range = (o, c) => `<span class="nw">${ap(o) === ap(c) ? `${hm(o)}–${hm(c)}` : `${hm(o)}<span class="ap">${ap(o)}</span>&thinsp;–&thinsp;${hm(c)}`}<span class="ap">${ap(c)}</span></span>`;
  const fmtShort = m => `<span class="nw">${hm(m)}<span class="ap">${ap(m)}</span></span>`;
  const dur = m => { m = Math.round(m); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ""}`; };
  const spoken = m => { m = Math.round(m); const h = Math.floor(m / 60), n = m % 60; return [h && `${h} hour${h === 1 ? "" : "s"}`, (n || !h) && `${n} minute${n === 1 ? "" : "s"}`].filter(Boolean).join(" "); };
  const statDur = m => { m = Math.round(m); return m < 60 ? `${m}<span class="u">min</span>` : `${Math.floor(m / 60)}<span class="u">h</span>${m % 60 ? String(m % 60).padStart(2, "0") : ""}`; };
  // Data is frozen, so its copy is normalized at render time: lowercase am/pm, sentence-case names.
  const ampm = s => String(s ?? "").replace(/(\d)\s?([AaPp])\.?[Mm]\.?(?![A-Za-z])/g, (_, d, x) => `${d} ${x.toLowerCase()}m`);
  const NAME_FIX = { "Historic Tanker Ship MARY A. WHALEN": "Historic tanker ship Mary A. Whalen", "U.S. Coast Guard Cutter LILAC": "U.S. Coast Guard cutter Lilac" };
  const nm = e => NAME_FIX[e.name] || e.name;
  // preset blurbs carry the same frozen all-caps ship names
  const fixCopy = s => String(s ?? "").replace(/\bMARY A\. WHALEN\b/g, "Mary A. Whalen").replace(/\bLILAC\b/g, "Lilac");
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const title = t => (t === t.toUpperCase() ? t.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : t);
  const km = (a, b) => {
    const R = 6371, toR = x => (x * Math.PI) / 180;
    const dLa = toR(b.lat - a.lat), dLo = toR(b.lng - a.lng);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const hoursOn = (e, day) => (e.win[day] || []).map(w => (w.fixed ? `${fmtShort(w.o)} tour` : range(w.o, w.c))).join(", ");
  const hoursText = (e, day) => (e.win[day] || []).map(w => (w.fixed ? `${hm(w.o)} ${ap(w.o)} tour` : rangeText(w.o, w.c))).join(", ");
  const WALK_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4" r="1.6"/><path d="M10.5 21l1.8-6 2.7 2.7V21M8 12l2.5-3.5 3 .5 2 3 2.5 1M12.3 9l-1.3 6"/></svg>`;
  const MARK_SVG = `<svg class="mk" viewBox="0 0 12 14" aria-hidden="true"><path d="M2 1h8v12L6 10 2 13z"/></svg>`;
  const CHECK_SVG = `<svg class="ok" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3 3 7-7"/></svg>`;
  const SUB = (window.SUBWAY && window.SUBWAY.colors) || {};
  // Letter color by luminance of the color the data actually ships: black where white falls under ~3.8:1
  // (orange #EB6800, G #799534, L/S #7C858C, yellow, light buses); red 1/2/3 and green 4/5/6 keep white. See DESIGN.md.
  const lum = h => { const c = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const darkOn = h => /^[0-9a-f]{6}$/i.test(h) && lum(h) > 0.22;
  // Station names as the MTA writes them never break at their hyphen ("Jamaica Center-Parsons/Archer").
  const stn = t => esc(t).replace(/(\S*-\S*)/g, '<span class="nw">$1</span>');
  const nearPt = (p, q) => !!(p && q) && km({ lat: p[0], lng: p[1] }, { lat: q[0], lng: q[1] }) < 0.25;
  function bullet(route, color, kind = "s", small = false) {
    if (kind === "b") { const bc = color ? String(color).replace("#", "") : ""; return `<span class="bb${bc && darkOn(bc) ? " dark" : ""}"${bc ? ` style="--c:#${bc}"` : ""}>${esc(route)}</span>`; }
    const express = /X$/.test(route) && route.length > 1;
    const name = express ? route.slice(0, -1) : route;
    const c = (color || SUB[route] || SUB[name] || "808183").replace("#", "");
    const dark = darkOn(c);
    return `<span class="sb${dark ? " dark" : ""}${express ? " x" : ""}${small ? " sm" : ""}" style="--c:#${c}" role="img" aria-label="${esc(name)} train"><span aria-hidden="true">${esc(name)}</span></span>`;
  }

  // ---------- travel times (see build/transit.py) ----------
  const T = window.TRANSIT || null;
  const TIX = T ? Object.fromEntries(T.order.map((s, i) => [s, i])) : {};
  const BUFFER = 4; // minutes of slack on every transit leg
  const walkMin = (a, b) => (km(a, b) * 1000 * 1.25) / 78;
  function decode(raw) {
    return raw.map(x => x[0] === "w" ? { type: "walk", min: x[1] } : {
      type: "ride", kind: x[1], route: x[2], color: x[3], from: T.names[x[4]], to: T.names[x[5]],
      n: x[6], min: x[7], wait: x[8], head: T.names[x[9]], geo: T.geo[x[10]],
    });
  }
  function leg(a, b, day, mode = state.mode) {
    const direct = walkMin(a, b);
    const walkCap = state.walky ? 22 : 12;
    const walk = { min: direct + 1, how: "walk", steps: [{ type: "walk", min: Math.round(direct) }] };
    if (direct <= walkCap) return walk;
    if (mode === "car") return { min: 8 + km(a, b) * 1.3 * 2.1, how: "drive", steps: null };
    const M = T && T[`${day}-${mode}`];
    const key = `${TIX[a.slug]},${TIX[b.slug]}`;
    const m = M && M.m[key];
    if (m == null) return { min: 10 + km(a, b) * 1.3 * 2.7, how: "transit", steps: null };
    const raw = M.s[key];
    if (!raw) return { min: m + 1, how: "walk", steps: [{ type: "walk", min: m }] };
    if (state.walky && direct <= Math.min(30, m + 8)) return walk;
    return { min: m + BUFFER, how: "transit", steps: decode(raw) };
  }
  const gmaps = (a, b, how) =>
    `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${how === "walk" ? "walking" : how === "drive" ? "driving" : "transit"}`;

  // ---------- planning ----------
  function value(e) {
    const m = state.mix / 100;
    const base = e.score;
    const mine = e.pick ? 10.5 : e.rec ? base * 0.85 : base * 0.35;
    let v = (1 - m) * base + m * mine;
    if (state.pins.has(e.slug)) v += 100;
    return v;
  }
  function slot(e, day, arrive, first) {
    const len = e.dur * PACE[state.pace].dur + (e.lines ? 15 : 0); // time in line where the listing warns of one
    let best = null;
    for (const w of e.win[day] || []) {
      let start, end;
      if (w.fixed) {
        if (arrive > w.o) continue;
        start = w.o; end = w.c;
      } else {
        start = Math.max(arrive, w.o);
        if (start + Math.min(len, 30) > w.c) continue;
        end = Math.min(start + len, w.c);
      }
      if (end > DAY_END + 10) continue;
      const wait = first ? 0 : start - arrive;
      if (!best || start < best.start) best = { start, end, wait, w };
    }
    return best;
  }
  // Beam search over orderings, respecting opening hours.
  function solve(day, blocked) {
    const pace = PACE[state.pace];
    const cands = EV.filter(e => e.win[day] && !state.skips.has(day + "|" + e.slug) && !blocked.has(e.slug));
    let beam = [{ seq: [], t: DAY_START, last: null, val: 0, travel: 0, wait: 0, obj: 0, starts: [], ends: [], legs: [] }];
    let best = beam[0];
    for (let step = 0; step < pace.max; step++) {
      const next = new Map();
      for (const s of beam) {
        for (const e of cands) {
          if (s.seq.includes(e.slug)) continue;
          const l = s.last ? leg(s.last, e, day) : { min: 0, how: null };
          const sl = slot(e, day, s.t + l.min, !s.last);
          if (!sl) continue;
          let v = value(e);
          if (twinOf[e.slug] && twinOf[e.slug].some(t => s.seq.includes(t))) v *= 0.2;
          const travel = s.travel + l.min, wait = s.wait + sl.wait, val = s.val + v;
          const obj = val - travel / 12 - wait / 35 - 1.5 * (s.seq.length + 1);
          const ns = { seq: [...s.seq, e.slug], t: sl.end, last: e, val, travel, wait, obj, starts: [...s.starts, sl.start], ends: [...s.ends, sl.end], legs: [...s.legs, l], warn: {} };
          const key = [...ns.seq].sort().join("|") + ">" + e.slug;
          const prev = next.get(key);
          if (!prev || prev.obj < obj) next.set(key, ns);
        }
      }
      if (!next.size) break;
      beam = [...next.values()].sort((a, b) => b.obj - a.obj).slice(0, 280);
      if (beam[0].obj > best.obj) best = beam[0];
    }
    best.warn = best.warn || {};
    return best;
  }
  // Times for a fixed, curated order. Late arrivals are flagged instead of dropped.
  function evalOrder(day, slugs) {
    const r = { seq: [], starts: [], ends: [], legs: [], travel: 0, wait: 0, warn: {}, obj: 0 };
    let t = DAY_START, last = null;
    for (const s of slugs) {
      if (state.skips.has(day + "|" + s)) continue;
      const e = BY[s];
      const l = last ? leg(last, e, day) : { min: 0, how: null };
      const arrive = t + l.min;
      let sl = slot(e, day, arrive, !last);
      if (!sl) {
        const w = (e.win[day] || [])[0];
        const start = Math.max(arrive, w ? w.o : arrive);
        sl = { start, end: start + e.dur * PACE[state.pace].dur, wait: 0 };
        r.warn[s] = w ? `${w.fixed ? `Starts ${hm(w.o)}` : `Closes ${hm(w.c)}`} — you arrive ${hm(arrive)}.` : `Not open ${DAYS[day]}.`;
      }
      r.seq.push(s); r.starts.push(sl.start); r.ends.push(sl.end); r.legs.push(l);
      r.travel += l.min; r.wait += sl.wait; t = sl.end; last = e;
    }
    return r;
  }
  function presetRoute(p, d) {
    const extra = [...state.pins].filter(s => BY[s].win[d] && !p.stops.includes(s) && state.pinDay[s] === d);
    let seq = [...p.stops];
    for (const x of extra) {
      let best = null;
      for (let i = 0; i <= seq.length; i++) {
        const trial = [...seq.slice(0, i), x, ...seq.slice(i)];
        const r = evalOrder(d, trial);
        const cost = Object.keys(r.warn).length * 1000 + r.travel + r.wait / 3;
        if (!best || cost < best.cost) best = { cost, trial };
      }
      seq = best.trial;
    }
    return evalOrder(d, seq);
  }
  function solveWeekend() {
    const out = {}, used = new Set(), custom = [];
    for (const d of ["sat", "sun"]) {
      const p = PBY[state.choice[d]];
      if (p && p.day === d) { out[d] = presetRoute(p, d); out[d].seq.forEach(s => used.add(s)); }
      else custom.push(d);
    }
    const run = order => {
      const o = {}, u = new Set(used); let total = 0;
      for (const d of order) { const r = solve(d, u); r.seq.forEach(s => u.add(s)); o[d] = r; total += r.obj; }
      return { o, total };
    };
    if (custom.length) {
      const a = run(custom), b = custom.length > 1 ? run([...custom].reverse()) : a;
      Object.assign(out, (a.total >= b.total ? a : b).o);
    }
    state.plan = out;
  }
  const onRoute = (slug, d) => !!state.plan[d]?.seq.includes(slug);
  const walkOf = r => r.legs.reduce((a, l) => a + (l.how === "walk" ? l.min : (l.steps || []).filter(x => x.type === "walk").reduce((b, x) => b + x.min, 0)), 0);

  // ---------- map ----------
  const map = L.map("map", { zoomControl: true, attributionControl: true, zoomSnap: 1, zoomDelta: 1, zoomAnimation: !still(), fadeAnimation: !still(), markerZoomAnimation: !still(), inertia: !still() }).setView([40.72, -73.95], 11);
  // Reduced motion reaches Leaflet's JS animations too: popup auto-pan and keyboard pans jump instead of gliding.
  const panBy0 = map.panBy;
  map.panBy = function (o, opt) { return panBy0.call(this, o, still() ? { ...opt, animate: false } : opt); };
  try { matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => { map.options.inertia = !still(); }); } catch {}
  // Whole zoom levels only: the raster basemap and its labels draw 1:1, with no tile seams or resampled names.
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  // Pane order: network, then your route, then events, then the place labels (so neither a ride line nor an event dot covers a name), then the stations you use.
  map.createPane("subway").style.zIndex = 350;
  map.createPane("route").style.zIndex = 410;
  map.createPane("focus").style.zIndex = 420; // a focused leg sits over the dimmed route
  map.createPane("focusStations").style.zIndex = 465;
  map.createPane("labels").style.zIndex = 445;
  map.getPane("labels").style.pointerEvents = "none";
  map.createPane("events").style.zIndex = 440;
  map.createPane("stations").style.zIndex = 460;
  const esri = (name, pane) => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${name}/MapServer/tile/{z}/{y}/{x}`, {
    maxNativeZoom: 16, maxZoom: 19, pane, keepBuffer: 1,
    // a failed tile counts as loaded, so the previous zoom level is pruned instead of ghosting under the new one
    errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
    // a phone gets the short credit, so it reads whole instead of ending in an ellipsis
    attribution: mobile() ? "&copy; Esri, HERE, Garmin, &copy; OSM · MTA" : "Basemap &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors. Subway data: MTA",
  });
  const isDark = () => document.documentElement.dataset.theme === "dark" || (document.documentElement.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  let base = [], baseDark = null;
  function setBase() {
    const d = isDark();
    if (d === baseDark) return;
    baseDark = d; base.forEach(l => l.remove());
    base = [esri(d ? "World_Dark_Gray_Base" : "World_Light_Gray_Base", "tilePane"), esri(d ? "World_Dark_Gray_Reference" : "World_Light_Gray_Reference", "labels")];
    base.forEach(l => l.addTo(map));
    styleNet();
  }
  map.on("zoomend", () => base[1]?.redraw());
  const css = n => getComputedStyle(document.body).getPropertyValue(n).trim();

  // The whole subway network, quiet, in MTA colors. Shared trunks of one color are drawn once.
  const netLayer = L.layerGroup().addTo(map);
  const netLines = [];
  if (window.SUBWAY) {
    const seenSeg = new Set();
    const key = p => p[0].toFixed(4) + "," + p[1].toFixed(4);
    for (const l of window.SUBWAY.lines) {
      let run = [];
      const flush = () => { if (run.length > 1) netLines.push(L.polyline(run, { pane: "subway", color: "#" + l.c, weight: 2, opacity: 0.45, interactive: false, lineCap: "round", lineJoin: "round" }).addTo(netLayer)); run = []; };
      for (let i = 1; i < l.g.length; i++) {
        const ka = key(l.g[i - 1]), kb = key(l.g[i]);
        const k = l.c + "|" + (ka < kb ? ka + "|" + kb : kb + "|" + ka);
        if (seenSeg.has(k)) { flush(); continue; }
        seenSeg.add(k);
        if (!run.length) run.push(l.g[i - 1]);
        run.push(l.g[i]);
      }
      flush();
    }
  }
  function styleNet() {
    const w = map.getZoom() >= 13 ? 3 : 2, o = isDark() ? 0.55 : 0.45;
    netLines.forEach(p => p.setStyle({ weight: w, opacity: o }));
    map.getContainer().classList.toggle("near-z", map.getZoom() >= 14);
  }
  map.on("zoomend", styleNet);
  setBase();
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { setBase(); render(); });
  new MutationObserver(() => { setBase(); render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const dotLayer = L.layerGroup().addTo(map);
  // Off-route events paint at §5 sizes but hit-test generously, so a finger finds a 6px dot.
  const evR = L.canvas({ pane: "events", tolerance: mobile() ? 16 : 4 });
  const routeLayer = L.layerGroup().addTo(map);
  const focusLayer = L.layerGroup().addTo(map);
  let markers = {}, legBounds = [], selDot = null;

  // Small offsets so venues that share a building stay clickable.
  const seen = {};
  EV.forEach(e => {
    const k = e.lat.toFixed(4) + "," + e.lng.toFixed(4);
    const n = (seen[k] = (seen[k] || 0) + 1) - 1;
    e.mlat = e.lat + (n ? Math.sin(n * 2.1) * 0.0006 : 0);
    e.mlng = e.lng + (n ? Math.cos(n * 2.1) * 0.0008 : 0);
  });

  function popupHtml(e) {
    const d = state.day, o = OTHER[d];
    const hrs = ["sat", "sun"].filter(x => e.win[x]).map(x => `${DAYS[x]} ${hoursOn(e, x)}`).join("<br>") || "Friday only";
    let act;
    if (onRoute(e.slug, d)) act = `<a class="pri" href="https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}&travelmode=transit" target="_blank" rel="noopener">Directions</a>`;
    else if (onRoute(e.slug, o)) act = `<button data-act="go-day" data-day="${o}">On your ${DAYS[o]} route</button>`;
    else if (e.win[d]) act = `<button class="pri" data-act="pin" data-slug="${e.slug}">Add to ${DAYS[d]}</button>`;
    else if (e.win[o]) act = `<button class="pri" data-act="pin" data-slug="${e.slug}" data-day="${o}">Add to ${DAYS[o]}</button>`;
    else act = "";
    return `<div class="pp"><h4>${esc(nm(e))}</h4>
      <div class="meta">${esc(e.hood)}, ${esc(e.boro)} · <span class="nw">Ranked #${e.rank} of ${EV.length}</span></div>
      ${tagsHtml(e, true)}
      <div class="hrs">${hrs}</div>
      <p>${esc(ampm(e.why))}</p>
      ${e.caveat ? `<div class="caveat">${esc(ampm(e.caveat))}</div>` : ""}
      <div class="acts">${act}<a href="${e.url}" target="_blank" rel="noopener">OHNY listing</a></div>
      ${onRoute(e.slug, d) ? `<button type="button" class="linkbtn pp-rm" data-act="skip" data-slug="${e.slug}">Remove from ${DAYS[d]}</button>` : ""}</div>`;
  }

  // Events off today's route: picks ink-filled, recommendations an ink ring, everything else small and secondary.
  function dotStyle(e, sel) {
    const open = !!e.win[state.day], ink = css("--ink"), surf = css("--surface");
    if (sel) return { radius: 5, color: surf, weight: 1.5, fillColor: ink, fillOpacity: 1, opacity: 1 };
    // A pick or recommendation closed today keeps its shape in secondary, at full strength (no ghosts, no holes).
    const c = open ? ink : css("--text-2");
    if (e.pick) return { radius: 4.5, color: surf, weight: 1.5, fillColor: c, fillOpacity: 1, opacity: 1 };
    if (e.rec) return { radius: 4.5, color: c, weight: open ? 2 : 1.5, fillColor: surf, fillOpacity: open ? 1 : 0, opacity: 1 };
    return { radius: 3, color: surf, weight: 1, fillColor: css("--text-2"), fillOpacity: open ? 0.7 : 0.22, opacity: open ? 1 : 0.3 };
  }
  function drawDots() {
    dotLayer.clearLayers(); selDot = null;
    const d = state.day;
    EV.forEach(e => {
      if (onRoute(e.slug, d)) return;
      // the other day's stops, closed today, are carried by its dashed line (DESIGN §5: no stops)
      if (!e.win[d] && onRoute(e.slug, OTHER[d])) return;
      const m = L.circleMarker([e.mlat, e.mlng], { pane: "events", renderer: evR, ...dotStyle(e) })
        .bindPopup(() => popupHtml(e), popOpts());
      if (!mobile()) {
        m.bindTooltip(`#${e.rank} ${esc(nm(e))}`, { direction: "top", offset: [0, -6], className: "tip" });
        m.on("mouseover", () => { if (selDot !== m) m.setStyle(e.pick || e.rec ? { radius: 5 } : { radius: 4, fillColor: css("--ink"), fillOpacity: 1 }); });
        m.on("mouseout", () => { if (selDot !== m) m.setStyle(dotStyle(e)); });
      }
      m.on("click", () => selectStop(e.slug, { pan: false }));
      m.slug = e.slug;
      m.addTo(dotLayer);
      markers[e.slug] = m;
    });
  }

  function vIcon(n, cls = "", anchor = [15, 15]) {
    return L.divIcon({ className: "", html: `<div class="vmark ${cls}">${n}</div>`, iconSize: [30, 30], iconAnchor: anchor, popupAnchor: [15 - anchor[0], -anchor[1] - 2] });
  }
  // Route markers: earlier stops sit above later ones and the selected stop above all.
  // When two consecutive stops land on top of each other at this zoom, the later one steps aside along the leg.
  const Z_SEL = 3000, zFor = i => 1000 + (40 - i) * 10;
  let routeMk = [];
  function spreadMarkers() {
    for (let i = 0; i < routeMk.length; i++) {
      const m = routeMk[i];
      let anchor = [15, 15];
      if (i > 0) {
        const a = map.latLngToContainerPoint(routeMk[i - 1].getLatLng()), b = map.latLngToContainerPoint(m.getLatLng());
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d < 26) {
          const ux = d > 0.5 ? dx / d : 0.7071, uy = d > 0.5 ? dy / d : 0.7071, push = 26 - d;
          anchor = [Math.round(15 - ux * push), Math.round(15 - uy * push)];
        }
      }
      if (String(m._anchor) !== String(anchor)) { m._anchor = anchor; m.setIcon(vIcon(m._n, (state.sel === m._slug ? "sel" : "") + (m._dim ? " dim" : ""), anchor)); labelMk(m); }
    }
  }
  map.on("zoomend", spreadMarkers);
  const lineHex = s => "#" + (s.color || SUB[s.route] || "808183").replace("#", "");
  // One leg on the map, in the rail's grammar: dotted ink walks, rides on the real track in line color over a canvas casing,
  // and only the stations you use (board, get off, change).
  function drawLeg(a, b, l, layer, labels, pane = "route", stnPane = "stations") {
    const ink = css("--ink");
    const walk = pts => L.polyline(pts, { pane, color: ink, weight: 3, opacity: 1, dashArray: "0 8", lineCap: "round", interactive: false }).addTo(layer);
    const all = [[a.mlat, a.mlng]];
    if (l.how !== "transit" || !l.steps) {
      if (l.how === "drive" || l.how === "transit") L.polyline([[a.mlat, a.mlng], [b.mlat, b.mlng]], { pane, color: ink, weight: 3, opacity: 0.5, dashArray: "8 6", interactive: false }).addTo(layer);
      else walk([[a.mlat, a.mlng], [b.mlat, b.mlng]]);
      all.push([b.mlat, b.mlng]);
      return all;
    }
    const rides = l.steps.filter(s => s.type === "ride");
    let cur = [a.mlat, a.mlng];
    const stops = [];
    rides.forEach((s, k) => {
      const g = s.geo;
      walk([cur, g[0]]);
      L.polyline(g, { pane, color: css("--ride-casing"), weight: 9, opacity: 1, lineJoin: "round", lineCap: "round", interactive: false }).addTo(layer);
      L.polyline(g, { pane, color: lineHex(s), weight: 6, opacity: 1, lineJoin: "round", lineCap: "round", interactive: false }).addTo(layer);
      const nm = n => esc(s.kind === "b" ? title(n) : n);
      const prev = stops[stops.length - 1];
      const near = (p, q) => km({ lat: p[0], lng: p[1] }, { lat: q[0], lng: q[1] }) < 0.25;
      if (k > 0 && prev && near(prev.pt, g[0])) { prev.xfer = true; prev.tip += `<span class="tr">${bullet(s.route, s.color, s.kind, true)} Change to the ${esc(s.route)} at ${nm(s.from)}</span>`; }
      else stops.push({ pt: g[0], name: nm(s.from), color: lineHex(s), tip: `<span class="tr">${bullet(s.route, s.color, s.kind, true)} Board at ${nm(s.from)}</span>` });
      stops.push({ pt: g[g.length - 1], name: nm(s.to), color: lineHex(s), tip: `<span class="tr">${bullet(s.route, s.color, s.kind, true)} Get off at ${nm(s.to)}</span>` });
      all.push(...g);
      cur = g[g.length - 1];
    });
    for (const st of stops) {
      L.marker(st.pt, { pane: stnPane, keyboard: false, icon: L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14],
        html: `<div class="stn${st.xfer ? " xfer" : ""}${labels ? " on" : ""}" style="--c:${st.xfer ? ink : st.color}"><i></i><span>${st.name}</span></div>` }) })
        .bindTooltip(st.tip, { className: "tip", direction: "top", offset: [0, -8] })
        .addTo(layer);
    }
    walk([cur, [b.mlat, b.mlng]]);
    all.push([b.mlat, b.mlng]);
    return all;
  }

  // setIcon replaces the element, so the accessible name is re-applied after every icon change.
  const labelMk = m => m.getElement()?.setAttribute("aria-label", m._label || "");
  function drawRoute() {
    routeLayer.clearLayers(); clearFocus(); legBounds = []; routeMk = [];
    const d = state.day, o = OTHER[d];
    const op = state.plan[o];
    // The other day: a faint dashed ink line, no stops; tapping it offers to switch days.
    if (op && op.seq.length) {
      const pts = op.seq.map(s => [BY[s].mlat, BY[s].mlng]);
      L.polyline(pts, { pane: "route", color: css("--ink"), weight: 3, opacity: 0.25, dashArray: "6 4", interactive: false }).addTo(routeLayer);
      // The tap target lives on the events canvas (which covers the map), under the dots, so a dot on the line still wins.
      const hit = L.polyline(pts, { pane: "events", renderer: evR, color: "#000", weight: mobile() ? 8 : 14, opacity: 0, fill: false })
        .bindPopup(`<div class="pp"><h4>Your ${DAYS[o]} route</h4><div class="meta">${op.seq.length} stops · ${hm(op.starts[0])}–${hm(op.ends[op.ends.length - 1])}</div>
          <div class="acts"><button class="pri" data-act="go-day" data-day="${o}">Switch to ${DAYS[o]}</button></div></div>`, { maxWidth: 260 })
        .addTo(routeLayer);
      hit.bringToBack();
    }
    const p = state.plan[d];
    if (!p || !p.seq.length) return;
    p.seq.forEach((s, i) => {
      if (i > 0) legBounds[i] = drawLeg(BY[p.seq[i - 1]], BY[s], p.legs[i], routeLayer, false);
    });
    p.seq.forEach((s, i) => {
      const e = BY[s];
      const mk = L.marker([e.mlat, e.mlng], { icon: vIcon(i + 1, state.sel === s ? "sel" : ""), zIndexOffset: state.sel === s ? Z_SEL : zFor(i), keyboard: true })
        .bindPopup(() => popupHtml(e), popOpts())
        .on("click", () => selectStop(s, { pan: false, scrollCard: true }))
        .addTo(routeLayer);
      if (!mobile()) mk.bindTooltip(`${hm(p.starts[i])} · ${esc(nm(e))}`, { direction: "top", offset: [0, -16], className: "tip" });
      markers[s] = mk; mk._n = i + 1; mk._slug = s; mk._z = zFor(i); mk._anchor = [15, 15];
      mk._label = `Stop ${i + 1}, ${nm(e)}, ${hm(p.starts[i])} ${ap(p.starts[i])}`; labelMk(mk);
      routeMk.push(mk);
    });
    spreadMarkers();
  }

  // Phone padding is measured: the map key sits under the sign, the stop cards and tab bar over the bottom.
  const keyBottom = () => { const k = $("map-key"); return k && k.offsetHeight ? k.offsetTop + k.offsetHeight + 16 : 64; };
  const CARDS_H = 56 + 16 + 120 + 16 + 24;
  const popOpts = () => mobile()
    ? { maxWidth: 360, autoPanPaddingTopLeft: [16, keyBottom()], autoPanPaddingBottomRight: [16, 56 + 24] }
    : { maxWidth: 300, autoPanPaddingTopLeft: [20, 80], autoPanPaddingBottomRight: [20, 40] };
  const keyH = () => ($("map-key")?.offsetHeight || 44);
  const fitTop = () => { const f = $("map-fit"); return Math.max(keyBottom(), f && !f.hidden && f.offsetHeight ? f.offsetTop + f.offsetHeight + 12 : 0); };
  const fitPad = () => mobile() ? { paddingTopLeft: [32, fitTop()], paddingBottomRight: [32, CARDS_H] } : { paddingTopLeft: [48, 48], paddingBottomRight: [48, 24 + keyH()] };
  // Like fitBounds, but when the bounds miss the next whole zoom by under a fifth of a level, take it:
  // a few pixels of padding overrun beats a route one level too far out.
  function fitSnug(b, pad, maxZoom, animate, pts = null) {
    let tl = L.point(pad.paddingTopLeft), br = L.point(pad.paddingBottomRight), shift = L.point(0, 0);
    map.options.zoomSnap = 0;
    let z = map.getBoundsZoom(b, false, tl.add(br));
    map.options.zoomSnap = 1;
    const zf = z;
    // Phones take the next zoom only when it nearly fits. Laptops try it whenever it may fit: the clearance test
    // below decides, so a common 1280-1440 laptop does not open a whole level too far out.
    z = Math.min(maxZoom, (!mobile() || z - Math.floor(z) >= 0.8) ? Math.ceil(z) : Math.floor(z));
    // the rounded-up zoom is taken only while every marker still clears the viewport edge (selected radius 15 + 5)
    if (z > Math.floor(zf)) {
      const s = map.project(b.getNorthEast(), z).subtract(map.project(b.getSouthWest(), z)), ms = map.getSize();
      if (mobile()) {
        if (Math.abs(s.x) > ms.x - 2 * 20 || Math.abs(s.y) > ms.y - tl.y - br.y + 24) z = Math.floor(zf);
      } else {
        // laptop: the route may use the whole map less a 20px marker margin, as long as no stop marker lands under
        // the legend or the zoom buttons (lines may pass under them; they float over the map). Where the route has room
        // to spare it may slide off centre, the smallest step that clears them.
        const ctl = L.point(20, 20), cbr = L.point(Math.max(20, br.x - 28), 20);
        const slx = ms.x - ctl.x - cbr.x - Math.abs(s.x), sly = ms.y - ctl.y - cbr.y - Math.abs(s.y);
        let ok = slx >= 0 && sly >= 0;
        if (ok && pts) {
          const c = map.project(b.getSouthWest(), z).add(map.project(b.getNorthEast(), z)).divideBy(2);
          const mid = L.point(ctl.x + (ms.x - ctl.x - cbr.x) / 2, ctl.y + (ms.y - ctl.y - cbr.y) / 2), mr = map.getContainer().getBoundingClientRect();
          const obs = [$("map-key"), map.getContainer().querySelector(".leaflet-control-zoom")].filter(el => el && el.offsetWidth)
            .map(el => { const q = el.getBoundingClientRect(); return [q.left - mr.left - 20, q.top - mr.top - 20, q.right - mr.left + 20, q.bottom - mr.top + 20]; });
          const rel = pts.map(ll => map.project(ll, z).subtract(c).add(mid));
          const clear = (dx, dy) => rel.every(q => !obs.some(([l, t, rr, bb]) => q.x + dx > l && q.x + dx < rr && q.y + dy > t && q.y + dy < bb));
          const steps = (sl, cap) => { const out = [0]; for (let v = 8; v <= Math.min(sl / 2, cap); v += 8) out.push(v, -v); return out; };
          const cand = steps(slx, ms.x * 0.1).flatMap(dx => steps(sly, ms.y * 0.1).map(dy => [dx, dy])).sort((a, b2) => Math.hypot(...a) - Math.hypot(...b2));
          const hit = cand.find(([dx, dy]) => clear(dx, dy));
          ok = !!hit;
          if (hit) shift = L.point(hit[0], hit[1]);
        }
        if (!ok) { z = Math.floor(zf); shift = L.point(0, 0); }
        else { tl = ctl; br = cbr; }
      }
    }
    const off = br.subtract(tl).divideBy(2).subtract(shift);
    const sw = map.project(b.getSouthWest(), z), ne = map.project(b.getNorthEast(), z);
    map.setView(map.unproject(sw.add(ne).divideBy(2).add(off), z), z, { animate });
    return z;
  }
  let firstFit = true, userMoved = false;
  // once the person pans or zooms, a late resize or font load no longer reframes the map under them
  ["wheel", "pointerdown", "keydown"].forEach(t => map.getContainer().addEventListener(t, () => (userMoved = true), { passive: true }));
  // A day switch or a tab change reframes instantly (§7: nothing slides); only "Whole route" animates.
  function fitDay({ animate = !firstFit && !still() } = {}) {
    const p = state.plan[state.day];
    if (!p || !p.seq.length) return;
    if (!map.getSize().x) return; // hidden map (phone plan view): fit when it is shown
    const pts = [...p.seq.map(s => [BY[s].mlat, BY[s].mlng]), ...legBounds.filter(Boolean).flat()];
    const b = L.latLngBounds(pts), pad = fitPad();
    fitZ = fitSnug(b, pad, 14, animate && !still(), p.seq.map(s => L.latLng(BY[s].mlat, BY[s].mlng)));
    firstFit = false; userMoved = false;
    syncFit();
  }
  // "Whole route" shows while a leg is focused or the map sits well inside the day's fit
  let fitZ = 99;
  function syncFit() {
    const on = !!focused || map.getZoom() > fitZ + 1;
    $("map-fit").hidden = !on || !(state.plan[state.day]?.seq.length);
    document.querySelectorAll("#cards .cleg[data-cleg]").forEach(c => c.setAttribute("aria-pressed", String(+c.dataset.cleg === focused)));
  }
  map.on("zoomend", () => syncFit());
  // The rail shares the map's leg focus: the focused leg stays at full strength, the rest steps back (desktop also opens its directions).
  let focused = 0;
  function clearFocus() {
    focusLayer.clearLayers();
    map.getContainer().classList.remove("leg-focus");
    document.body.classList.remove("leg-on");
    routeMk.forEach(m => { m._dim = false; m.getElement()?.querySelector(".vmark")?.classList.remove("dim"); });
    const ln = $("line");
    ln.classList.remove("leg-focus");
    ln.querySelectorAll(".stop.focused").forEach(x => x.classList.remove("focused"));
    if (focused && !mobile()) ln.querySelectorAll(".legd[open]").forEach(d => (d.open = false));
    focused = 0;
    syncFit();
  }
  // A focused leg is drawn over the dimmed route; on phones the card and the sign move to the stop it leaves from.
  function focusLeg(i) {
    const p = state.plan[state.day];
    if (!p || !legBounds[i]) return;
    map.closePopup(); // an old popup would sit under the sign and keep the cards hidden
    focusLayer.clearLayers();
    drawLeg(BY[p.seq[i - 1]], BY[p.seq[i]], p.legs[i], focusLayer, true, "focus", "focusStations");
    map.getContainer().classList.add("leg-focus");
    document.body.classList.add("leg-on");
    // stops outside the focused leg step back with the rest of the route
    routeMk.forEach((m, k) => { m._dim = k !== i - 1 && k !== i; m.getElement()?.querySelector(".vmark")?.classList.toggle("dim", m._dim); });
    focused = i;
    syncFit();
    const ln = $("line"), btn = ln.querySelector(`.leg-btn[data-leg="${i}"]`), li = btn?.closest(".stop");
    ln.classList.add("leg-focus");
    ln.querySelectorAll(".stop.focused").forEach(x => x !== li && x.classList.remove("focused"));
    li?.classList.add("focused");
    if (!mobile() && li) {
      ln.querySelectorAll(".legd[open]").forEach(d => d.closest(".stop") !== li && (d.open = false));
      const d = li.querySelector(".legd");
      if (d && !d.open) d.open = true;
      btn.scrollIntoView({ block: "nearest" });
    }
    const go = () => {
      const fb = $("map-fit"), fTop = fb && !fb.hidden && fb.offsetHeight ? fb.offsetTop + fb.offsetHeight + 16 : 72;
      const pad = mobile() ? { paddingTopLeft: [16, fTop], paddingBottomRight: [16, CARDS_H] } : fitPad();
      if (!mobile()) pad.paddingBottomRight = [pad.paddingBottomRight[0] + 96, pad.paddingBottomRight[1]];
      // a walk has no street geometry, so it is framed as a schematic connection over a quieter grid
      fitSnug(L.latLngBounds(legBounds[i]), pad, p.legs[i].how === "walk" ? 14 : 15, !still(), [p.seq[i - 1], p.seq[i]].map(s => L.latLng(BY[s].mlat, BY[s].mlng)));
      map.once("moveend", flipLabels);
      if (mobile()) selectStop(p.seq[i - 1], { pan: false, scrollCard: "jump" });
    };
    if (mobile() && state.view !== "map") { setView("map", { fit: false }); setTimeout(() => { map.invalidateSize(); go(); }, 60); }
    else go();
  }
  // A station label that would run off the edge, or into a stop marker or an earlier label, sits on the left of its circle;
  // if it still collides it is dropped (its tooltip keeps the name).
  function flipLabels() {
    const m = map.getContainer().getBoundingClientRect();
    const marks = [...document.querySelectorAll(".leaflet-marker-pane .vmark:not(.dim)")].map(x => x.getBoundingClientRect());
    const pane = el => getComputedStyle(el.closest(".leaflet-pane")).opacity > 0.5;
    // the focused ride is an obstacle too: a boarding or alighting name never lies on its own line
    const ride = [];
    focusLayer.eachLayer(l => { if (l.getLatLngs && (l.options.weight || 0) >= 6) l.getLatLngs().flat(2).forEach(ll => { const q = map.latLngToContainerPoint(ll); ride.push({ left: m.left + q.x - 4, right: m.left + q.x + 4, top: m.top + q.y - 4, bottom: m.top + q.y + 4 }); }); });
    const over = (r, k) => r.left < k.right + 2 && r.right > k.left - 2 && r.top < k.bottom + 2 && r.bottom > k.top - 2;
    const hits = (r, focusStn) => r.width && (r.left < m.left + 8 || r.right > m.right - 8 || marks.some(k => over(r, k)) || (focusStn && ride.some(k => over(r, k))));
    document.querySelectorAll(".leaflet-focusStations-pane .stn, .leaflet-stations-pane .stn").forEach(el => {
      const span = el.querySelector("span");
      el.classList.remove("flip", "up", "down", "hid");
      if (!span || !span.offsetWidth) return;
      const focusStn = !!el.closest(".leaflet-focusStations-pane");
      if (hits(span.getBoundingClientRect(), focusStn)) {
        const tries = focusStn ? ["flip", "up", "down"] : ["flip"];
        let ok = false;
        for (const c of tries) { el.classList.add(c); if (!hits(span.getBoundingClientRect(), focusStn)) { ok = true; break; } el.classList.remove(c); }
        // nowhere off the line: lying on the ride beats running off the map
        if (!ok && focusStn && hits(span.getBoundingClientRect(), false)) for (const c of tries) { el.classList.add(c); if (!hits(span.getBoundingClientRect(), false)) { ok = true; break; } el.classList.remove(c); }
        // where you board or get off is the leg's main fact: it keeps its name even over the dimmed route
        if (!ok && !focusStn) { el.classList.add("hid"); return; }
      }
      if (pane(el)) marks.push(span.getBoundingClientRect());
    });
  }
  map.on("zoomend moveend", flipLabels);
  map.on("click", clearFocus);
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") clearFocus(); });
  // Popups never stack on the stop cards: the cards step aside while one is open.
  // One floating surface at a time: the hover tooltip of the popup's owner closes, and a keyboard opener hands focus to the popup.
  let popOpener = null;
  map.on("popupopen", ev => {
    document.body.classList.add("popup-open");
    const src = ev.popup._source;
    if (src && focused && !routeMk.includes(src)) clearFocus();
    if (src && !src.getTooltip?.()?.options.permanent) src.closeTooltip?.();
    const el = ev.popup.getElement();
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", el.querySelector("h4")?.textContent || "Details");
    if (document.activeElement?.classList.contains("leaflet-marker-icon")) {
      popOpener = document.activeElement;
      el.querySelector(".acts button, .acts a")?.focus({ preventScroll: true });
    }
  });
  map.on("popupclose", ev => {
    document.body.classList.remove("popup-open");
    if (selDot && ev.popup._source === selDot) clearSelDot();
    popOpener?.focus({ preventScroll: true }); popOpener = null;
  });
  function clearSelDot() {
    const se = BY[selDot.slug];
    selDot.setStyle(dotStyle(se)); selDot.unbindTooltip();
    if (!mobile()) selDot.bindTooltip(`#${se.rank} ${esc(nm(se))}`, { direction: "top", offset: [0, -6], className: "tip" });
    selDot = null;
  }
  // pan: true opens a stop from a list (zooms to street level when far out); "follow" is the card swipe:
  // §7 map follow, a 400ms pan at the current zoom, and no move at all while the stop is already in view.
  function selectStop(slug, { pan = true, scrollCard = false, popup = false } = {}) {
    state.sel = slug;
    document.querySelectorAll(".vmark.sel").forEach(x => x.classList.remove("sel"));
    routeMk.forEach(m => m.setZIndexOffset(m._slug === slug ? Z_SEL : m._z));
    markers[slug]?.getElement?.()?.querySelector(".vmark")?.classList.add("sel");
    if (selDot) clearSelDot();
    const mk = markers[slug];
    if (mk && mk.setStyle && mk.slug) {
      selDot = mk; mk.setStyle(dotStyle(BY[slug], true)); mk.bringToFront();
      mk.unbindTooltip(); mk.bindTooltip(esc(nm(BY[slug])), { permanent: true, direction: "right", offset: [8, 0], className: "tip lbl" });
      const r = mk.getTooltip()?.getElement()?.getBoundingClientRect(), mr = map.getContainer().getBoundingClientRect();
      if (r && r.width && r.right > mr.right - 8) { mk.unbindTooltip(); mk.bindTooltip(esc(nm(BY[slug])), { permanent: true, direction: "left", offset: [-8, 0], className: "tip lbl" }); }
    }
    document.querySelectorAll(".card").forEach(c => { const on = c.dataset.stop === slug, h = c.querySelector(".card-hit"); c.classList.toggle("sel", on); on ? h.setAttribute("aria-current", "true") : h.removeAttribute("aria-current"); });
    if (scrollCard) { const c = document.querySelector(`.card[data-stop="${slug}"]`); if (c) $("cards").scrollTo({ left: c.offsetLeft - 16, behavior: still() || scrollCard === "jump" ? "auto" : "smooth" }); }
    const e = BY[slug];
    if (pan === "follow" && e) {
      const pt = map.latLngToContainerPoint([e.mlat, e.mlng]), sz = map.getSize();
      const inView = pt.x >= 32 && pt.x <= sz.x - 32 && pt.y >= keyBottom() && pt.y <= sz.y - CARDS_H;
      if (!inView) map.panTo([e.mlat, e.mlng], { animate: !still(), duration: 0.4, easeLinearity: 0.5 });
    } else if (pan && e) {
      if (map.getZoom() >= 13) map.panTo([e.mlat, e.mlng], { animate: !still(), duration: 0.4 });
      else map.setView([e.mlat, e.mlng], 14, { animate: !still() });
    }
    if (popup) setTimeout(() => markers[slug]?.openPopup(), pan && !still() ? 450 : 0);
    document.querySelectorAll("#line .stop").forEach(li => li.classList.toggle("cur", li.dataset.stop === slug));
    syncSign();
  }
  function showOnMap(slug) {
    if (mobile()) { setView("map", { fit: false }); setTimeout(() => { map.invalidateSize(); selectStop(slug, { scrollCard: true, popup: !onRoute(slug, state.day) }); }, 80); }
    else selectStop(slug, { popup: true });
  }

  // ---------- panel ----------
  function tagsHtml(e, compact) {
    const t = [
      e.pick ? `<span class="tag pick">${MARK_SVG}Your pick</span>` : "",
      e.rec ? '<span class="tag rec">Recommended</span>' : "",
      e.ticketed ? '<span class="tag">Ticketed</span>' : "",
      !compact && state.pins.has(e.slug) ? '<span class="tag pin">Pinned</span>' : "",
    ].join("");
    return `<div class="tags">${t}</div>`;
  }
  // The leg's total (walk, wait and ride) always leads: "38 min · [C] toward Euclid Av · 9 stops", "7 min walk".
  // Ride minutes appear only in the direction rows ("[C] toward Euclid Av · 9 stops · 13 min", DESIGN §3), so the two never share a slot.
  // The bullet and the first word of its direction never break apart, and no line starts with a separator.
  // lead: the map card's short form drops the stop count and walk destination (the next card names the stop).
  function legSummary(l, to, lead = false) {
    const t = `<strong>${dur(l.min)}</strong>`;
    if (l.how === "walk") return `${t} walk${to && !lead ? ` to ${esc(to)}` : ""}`;
    if (!l.steps) return `${t} ${l.how === "drive" ? "by car" : "by transit, estimated"}`;
    const rides = l.steps.filter(s => s.type === "ride");
    if (rides.length === 1) {
      const s = rides[0], head = title(s.head || "").split(" ");
      const chain = `<span class="chain"><span class="nw">${bullet(s.route, s.color, s.kind)}toward ${stn(head[0])}</span>${head.length > 1 ? " " + stn(head.slice(1).join(" ")) : ""}</span>`;
      if (lead) return `${t}&nbsp;· <span class="chain">${bullet(s.route, s.color, s.kind)}at ${stn(s.kind === "b" ? title(s.from) : s.from)}</span>`;
      return `${t}&nbsp;· ${chain}&nbsp;· ${s.n}&nbsp;stop${s.n === 1 ? "" : "s"}`;
    }
    const chain = `<span class="chain">${rides.map(s => bullet(s.route, s.color, s.kind)).join('<span class="then">then</span>')}</span>`;
    return `${t}&nbsp;· ${chain}`;
  }
  function stepsHtml(l, a, b) {
    if (!l.steps || l.how !== "transit") return "";
    const rows = l.steps.map((s, k) => {
      if (s.type === "walk") {
        const nxt = l.steps[k + 1];
        const to = nxt && nxt.type === "ride" ? (nxt.kind === "b" ? title(nxt.from) + " stop" : nxt.from) : nm(b);
        return `<li class="walkrow"><span class="ic">${WALK_SVG}</span><span>Walk <span class="nw">${dur(s.min)}</span> to ${stn(to)}</span></li>`;
      }
      const from = s.kind === "b" ? title(s.from) : s.from, to = s.kind === "b" ? title(s.to) : s.to;
      return `<li>${bullet(s.route, s.color, s.kind)}<span><span class="dir">toward ${stn(title(s.head || ""))} · ${s.n}&nbsp;stop${s.n === 1 ? "" : "s"}&nbsp;· <span class="nw">${dur(s.min)}</span></span>
        <span class="sub">${stn(from)} to ${stn(to)}${s.wait >= 5 ? ` · every ${s.wait * 2} min` : ""}</span></span></li>`;
    }).join("");
    return `<ol class="steps">${rows}</ol>`;
  }
  // A leg as rail segments, proportional to minutes: dotted walks, solid line-colored rides, a transfer ring where you change
  // within one station complex (the same 0.25 km test the map uses to merge alight and board stations), and a hairline
  // for the time to spare before the next stop opens.
  function segs(l) {
    if (!l) return [];
    if (l.how === "walk") return [{ min: l.min, k: "walk" }];
    if (!l.steps) return [{ min: l.min, k: "est" }];
    return l.steps.map(s => (s.type === "walk" ? { min: Math.max(1, s.min), k: "walk" } : { min: Math.max(1, s.min), k: "ride", c: lineHex(s), geo: s.geo }));
  }
  function trackHtml(l, wait = 0) {
    const g = segs(l);
    let lastRide = null;
    const h = g.map((x, k) => {
      const nextRide = x.k === "ride" ? x : x.k === "walk" && g[k + 1]?.k === "ride" ? g[k + 1] : null;
      const xfer = !!lastRide && g[k - 1] === lastRide && !!nextRide && nearPt(lastRide.geo?.[lastRide.geo.length - 1], nextRide.geo?.[0]);
      if (x.k === "ride") lastRide = x;
      return `${xfer ? '<b class="xfer"></b>' : ""}<i class="seg ${x.k}" style="flex-grow:${x.min}${x.c ? `;--c:${x.c}` : ""}"></i>`;
    }).join("");
    return h + (wait > 8 ? `<i class="seg wait" style="flex-grow:${Math.round(wait)}"></i>` : "");
  }
  const pathKm = g => g.reduce((t, p, i) => (i ? t + km({ lat: g[i - 1][0], lng: g[i - 1][1] }, { lat: p[0], lng: p[1] }) : 0), 0);
  const legKm = (a, b, l) => (l.how === "walk" ? km(a, b) * 1.25 : !l.steps ? km(a, b) * 1.3 : l.steps.reduce((t, s) => t + (s.type === "walk" ? s.min * 0.078 : pathKm(s.geo)), 0));
  const routeMi = r => r.seq.reduce((t, s, i) => (i ? t + legKm(BY[r.seq[i - 1]], BY[s], r.legs[i]) : 0), 0) / 1.609;
  // On the weekend itself, the clock decides which stop is next; visited stops go quiet.
  const EVENT_DATE = { sat: "2026-10-17", sun: "2026-10-18" };
  function progress(p, d) {
    const n = new Date();
    const iso = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    if (iso !== EVENT_DATE[d]) return -1;
    const t = n.getHours() * 60 + n.getMinutes();
    const i = p.ends.findIndex(x => x > t);
    return i < 0 ? p.seq.length : i;
  }

  function nearby(e, d, used) {
    return EV.filter(o => o.slug !== e.slug && o.win[d] && !used.has(o.slug) && !state.skips.has(d + "|" + o.slug) && km(e, o) < 1.2)
      .sort((x, y) => x.rank - y.rank).slice(0, 3);
  }

  function renderLine() {
    const d = state.day, p = state.plan[d];
    const used = new Set([...(state.plan.sat?.seq || []), ...(state.plan.sun?.seq || [])]);
    if (!p || !p.seq.length) {
      $("line").innerHTML = `<li class="empty">Nothing fits ${DAYS[d]} with these settings. Try a different plan, a faster pace, or restore something you skipped.</li>`;
      return;
    }
    const flags = apFlags(p.starts), nx = progress(p, d);
    let h = "";
    p.seq.forEach((s, i) => {
      const e = BY[s], last = i === p.seq.length - 1, l = p.legs[i + 1], nxt = BY[p.seq[i + 1]];
      const wait = l ? p.starts[i + 1] - (p.ends[i] + l.min) : 0;
      const nb = nearby(e, d, used);
      const tix = (e.win[d] || []).find(w => w.fixed && w.o === p.starts[i]);
      const late = p.warn && p.warn[s];
      const cls = ["stop", last ? "last" : "", nx === i ? "next" : "", nx > i ? "past" : "", state.sel === s ? "cur" : "", late ? "is-late" : ""].filter(Boolean).join(" ");
      h += `<li class="${cls}" data-stop="${s}">
        <div class="time">${tH(p.starts[i], flags[i])}<small>to ${tH(p.ends[i], ap(p.ends[i]) !== ap(p.starts[i]))}</small></div>
        <div class="rail"><span class="node">${i + 1}</span></div>
        <div class="stop-body">
          <h3 class="stop-name"><button class="namebtn" data-focus="${s}">${esc(nm(e))}</button></h3>
          <div class="where">${esc(e.hood)}, ${esc(e.boro)}</div><div class="where"><span class="nw">Open&nbsp;${hoursOn(e, d)}</span>${e.lines ? '&nbsp;· <span class="nw">Line expected</span>' : ""}&nbsp;· <span class="nw">Ranked #${e.rank}</span></div>
          ${tagsHtml(e)}
          ${late ? `<div class="late"><span class="late-tag">Late</span><span><span class="late-t">${esc(late)}</span> Skip it or choose another plan.</span></div>` : ""}
          <p class="why">${esc(ampm(e.why))}</p>
          ${e.caveat ? `<div class="caveat">${esc(ampm(e.caveat))}</div>` : ""}
          <details class="more"><summary>Skip, pin or add nearby</summary>
            <div class="acts">
              <button data-act="skip" data-slug="${s}">Skip this</button>
              ${state.pins.has(s) ? `<button data-act="unpin" data-slug="${s}">Unpin</button>` : `<button data-act="pin" data-slug="${s}">Pin it</button>`}
              ${tix ? `<a href="${tix.url}" target="_blank" rel="noopener">Get tickets</a>` : ""}
              <a href="${e.url}" target="_blank" rel="noopener">OHNY listing</a>
            </div>
            ${nb.length ? `<div class="near"><div class="near-h">Within a short walk, open ${DAYS[d]}</div>${nb.map(o => `
              <div class="near-item"><button class="nm" data-focus="${o.slug}" aria-label="Show ${esc(nm(o))} on the map">${esc(nm(o))}</button><span class="rk">#${o.rank} · ${hoursOn(o, d)}</span>
              <button class="add" data-act="pin" data-slug="${o.slug}" aria-label="Add ${esc(nm(o))}">Add</button></div>`).join("")}</div>` : ""}
          </details>
        </div>
        ${last ? "" : `<div class="rail rail-leg" aria-hidden="true"><span class="track">${trackHtml(l, wait)}</span></div>
          <div class="leg">
            <details class="legd">
              <summary class="leg-btn" data-leg="${i + 1}">${legSummary(l)} <span class="see">Directions</span></summary>
              ${stepsHtml(l, e, nxt)}
              <button type="button" class="linkbtn map-btn" data-legmap="${i + 1}">Show this trip on the map</button>
              <a class="gm" href="${gmaps(e, nxt, l.how)}" target="_blank" rel="noopener">${l.how === "walk" ? "Walking directions in Google Maps" : "Check live times in Google Maps"}</a>
            </details>
            ${wait > 8 ? `<div class="leg-wait">${dur(wait)} to spare before it opens</div>` : ""}
          </div>`}</li>`;
    });
    $("line").innerHTML = h;
  }

  function renderCards() {
    const d = state.day, p = state.plan[d];
    if (!p || !p.seq.length) { $("cards").innerHTML = ""; return; }
    const flags = apFlags(p.starts);
    $("cards").innerHTML = p.seq.map((s, i) => {
      const e = BY[s], nl = p.legs[i + 1];
      const when = ap(p.starts[i]) === ap(p.ends[i]) ? `${hm(p.starts[i])}–${hm(p.ends[i])} ${ap(p.ends[i])}` : `${hm(p.starts[i])} ${ap(p.starts[i])}–${hm(p.ends[i])} ${ap(p.ends[i])}`;
      const w = (e.win[d] || []).find(x => !x.fixed && x.o <= p.starts[i] && x.c >= p.ends[i]);
      const sub = `${esc(e.hood)}${w ? ` · open until ${ap(w.c) === ap(p.ends[i]) ? hm(w.c) : tH(w.c, true)}` : ""}`;
      const end = p.ends[p.ends.length - 1];
      return `<div class="card${state.sel === s ? " sel" : ""}" role="group" data-stop="${s}" aria-label="Stop ${i + 1} of ${p.seq.length}">
        <button type="button" class="card-hit" data-card="${s}"${state.sel === s ? ' aria-current="true"' : ""} aria-label="Stop ${i + 1}: ${esc(nm(e))}, ${when}, ${esc(e.hood)}${w ? `, open until ${hm(w.c)} ${ap(w.c)}` : ""}"></button>
        <span class="cn" aria-hidden="true">${i + 1}</span>
        <span class="cnm" aria-hidden="true">${esc(nm(e))}</span>
        <span class="ct" aria-hidden="true">${ap(p.starts[i]) === ap(p.ends[i]) ? `${hm(p.starts[i])}–${tH(p.ends[i], flags[i])}` : `${tH(p.starts[i], true)}&thinsp;–&thinsp;${tH(p.ends[i], true)}`}</span>
        <span class="csub" aria-hidden="true">${sub}</span>
        ${nl ? `<button type="button" class="cleg" data-cleg="${i + 1}" aria-pressed="${focused === i + 1}"><span class="cnx">To ${i + 2}</span>&nbsp;· ${legSummary(nl, nm(BY[p.seq[i + 1]]), true)}<span class="sr">, on the map</span></button>` : `<span class="cleg">Last stop · route ends ${hm(end)} ${ap(end)}</span>`}
      </div>`;
    }).join("");
  }

  function renderSummary() {
    ["sat", "sun"].forEach(d => {
      const q = state.plan[d];
      $("meta-" + d).textContent = q && q.seq.length ? `${q.seq.length} stops · ${hm(q.starts[0])}–${hm(q.ends[q.ends.length - 1])}` : "No stops";
    });
    $("share-days").innerHTML = ["sat", "sun"].map(d => {
      const q = state.plan[d], n = q?.seq.length || 0;
      return `<li><span class="bullet sm b-${d}" aria-hidden="true">${d === "sat" ? 17 : 18}</span><span><strong>${DAYS[d]}</strong> · ${esc(PBY[state.choice[d]]?.name || "Built for me")} · ${n} stop${n === 1 ? "" : "s"}</span></li>`;
    }).join("");
    $("key-other").innerHTML = `${DAYS[OTHER[state.day]]}<span class="k-long"> route</span>`;
    document.querySelector(".map-key .k-rt").textContent = mobile() ? "Route" : "Your route";
    $("share-link").textContent = mobile() && navigator.share ? "Share link" : "Copy share link";
    const p = state.plan[state.day];
    if (!p || !p.seq.length) { $("summary").innerHTML = ""; return; }
    const picks = p.seq.filter(s => BY[s].pick).length;
    $("summary").innerHTML = `
      <div><b>${p.seq.length}</b><span>stops</span></div>
      <div role="group" aria-label="${spoken(p.travel)} of travel"><b aria-hidden="true">${statDur(p.travel)}</b><span aria-hidden="true">travel</span></div>
      <div role="group" aria-label="${spoken(walkOf(p))} of it walking"><b aria-hidden="true">${statDur(walkOf(p))}</b><span aria-hidden="true">of it walking</span></div>
      <div><b>${picks}</b><span>your picks</span></div>`;
  }

  function renderPlans() {
    const d = state.day, cur = state.choice[d];
    $("plans-title").textContent = `${DAYS[d]} plans`;
    $("route-title").textContent = `${DAYS[d]} route`;
    // adjacent walks (or rides on the same line) read as one run, so the dots keep one rhythm
    const merge = g => g.reduce((o, x) => { const t = o[o.length - 1]; if (t && t.k === x.k && t.c === x.c) t.min += x.min; else o.push({ ...x }); return o; }, []);
    const card = (id, name, r, note) => {
      let rail = "", stats = note || "", warn = "";
      if (r && r.seq.length) {
        rail = `<span class="mrail" aria-hidden="true">${r.legs.slice(1).map(l => `<span class="ml" style="flex-grow:${l.min}">${merge(segs(l)).map(x => `<i class="${x.k}" style="flex-grow:${x.min}${x.c ? `;background:${x.c}` : ""}"></i>`).join("")}</span>`).join("")}</span>`;
        const mi = routeMi(r);
        stats = `${r.seq.length}&nbsp;stops · <span class="nw">${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi</span><span class="brk"> · </span><span class="nw">${hm(r.starts[0])}–${hm(r.ends[r.ends.length - 1])}</span>`;
        const bad = Object.keys(r.warn || {}).length;
        if (bad) warn = `<span class="plan-warn"><span class="late-tag">Late</span>${bad} stop${bad > 1 ? "s" : ""} won't fit</span>`;
      }
      return `<button type="button" class="plan" role="radio" aria-checked="${cur === id}" tabindex="${cur === id ? 0 : -1}" data-plan="${id}">
        <span class="plan-name">${esc(name).replace(/\S+-\S+/g, w => `<span class="nw">${w}</span>`)}</span>${rail}<span class="plan-meta">${stats}</span>${warn}</button>`;
    };
    const list = PRESETS.filter(p => p.day === d).map(p => card(p.id, p.name, cur === p.id ? state.plan[d] : presetRoute(p, d)));
    list.push(card("custom", "Build one for me", cur === "custom" ? state.plan[d] : null, "Picks the stops and the order for you"));
    const strip = $("plan-strip");
    strip.innerHTML = list.join("");
    // on phones the chosen plan is always in view, so the blurb and route below describe a card you can see
    const sel = strip.querySelector('.plan[aria-checked="true"]');
    if (sel && mobile()) {
      const sr = strip.getBoundingClientRect(), cr = sel.getBoundingClientRect();
      if (sr.width && (cr.left < sr.left || cr.right > sr.right)) strip.scrollLeft += cr.left - sr.left - 16;
    }
    $("plan-blurb").textContent = fixCopy(PBY[cur]?.blurb) || "Balances your picks against my rankings, opening hours and travel time. Pin anything to force it in, and use Route settings to steer it.";
    $("mix-ctl").hidden = cur !== "custom";
    // only what is off the default gets a word: walking short hops is the default
    $("set-sum").textContent = `${MODE_SHORT[state.mode]} · ${PACE[state.pace].label.toLowerCase()}${!state.walky && state.mode !== "car" ? " · fewer walks" : ""}`;
    const m = state.mix;
    $("mix-read").textContent = m <= 20 ? "Mostly my rankings" : m >= 80 ? "Mostly your picks" : "A blend";
    $("mix").setAttribute("aria-valuetext", $("mix-read").textContent);
  }

  function renderLeftover() {
    const used = new Set([...(state.plan.sat?.seq || []), ...(state.plan.sun?.seq || [])]);
    const left = EV.filter(e => (e.pick || e.rec) && !used.has(e.slug)).sort((a, b) => (b.pick - a.pick) || a.rank - b.rank);
    if (!left.length) { $("leftover").innerHTML = `<h2>Everything made it</h2><p class="note">All your picks and mine are on a route.</p>`; return; }
    $("leftover").innerHTML = `<h2>Not on either day</h2>
      <p class="note">Your picks and mine that this weekend leaves out. Adding one slots it in where it costs the least travel.</p>
      ${left.map(e => {
        const d = e.win[state.day] ? state.day : e.win[OTHER[state.day]] ? OTHER[state.day] : null;
        const btn = skipped(e.slug) ? `<button class="add" data-act="unskip" data-slug="${e.slug}" aria-label="Restore ${esc(nm(e))}">Restore</button>`
          : d ? `<button class="add" data-act="pin" data-slug="${e.slug}" data-day="${d}" aria-label="Add to ${DAYS[d].slice(0, 3)}, ${esc(nm(e))}">Add to ${DAYS[d].slice(0, 3)}</button>` : "";
        const hrs = ["sat", "sun"].filter(x => e.win[x]).map(x => `${DAYS[x].slice(0, 3)}&nbsp;${hoursOn(e, x)}`).join("; ");
        return `<div class="lo"><span class="nm">${e.pick ? MARK_SVG : '<i class="ring" aria-hidden="true"></i>'}<button class="namebtn" data-focus="${e.slug}">${esc(nm(e))}</button></span>${btn}
          <span class="sub">${e.pick ? "Your pick" : "Recommended"} · #${e.rank} · ${hrs}${skipped(e.slug) ? " · You skipped it" : ""}</span></div>`;
      }).join("")}`;
  }

  function renderCatalog() {
    const q = $("q").value.trim().toLowerCase();
    const d = state.day, f = state.filters;
    $("f-day").textContent = DAYS[d].slice(0, 3);
    const route = state.plan[d]?.seq || [];
    const rows = EV.filter(e => {
      if (f.has("open") && !e.win[d]) return false;
      if (f.has("pick") && !e.pick) return false;
      if (f.has("rec") && !e.rec) return false;
      if (f.has("top") && e.rank > 30) return false;
      if (f.has("near") && !route.some(s => s !== e.slug && km(BY[s], e) < 1.2)) return false;
      return !q || `${e.name} ${nm(e)} ${e.hood} ${e.boro}`.toLowerCase().includes(q);
    });
    $("explore-title").textContent = `${DAYS[d]} events`;
    // in rank order the tier heads its block; search results keep a quiet per-row tier
    const ranked = !q && rows.every((e, k) => !k || rows[k - 1].rank <= e.rank);
    $("count").textContent = `${rows.length} of ${EV.length}${ranked && rows.length ? " · by rank" : ""}`;
    // the visible count updates at once; the announcement waits for typing to settle
    clearTimeout(renderCatalog.t);
    renderCatalog.t = setTimeout(() => ($("count-live").textContent = `${rows.length} of ${EV.length} events shown`), 400);
    // a stop on a route is a way to that stop, as Add is a way onto the route
    const goto = (slug, dd, n) => `<button type="button" class="add on-route" data-goto="${slug}" data-day="${dd}">Stop ${n} · ${DAYS[dd].slice(0, 3)}<span class="sr">, show on ${DAYS[dd]}'s route</span></button>`;
    let tierNow = null;
    $("catalog").innerHTML = rows.map(e => {
      let side;
      if (onRoute(e.slug, d)) side = goto(e.slug, d, route.indexOf(e.slug) + 1);
      else if (onRoute(e.slug, OTHER[d])) side = goto(e.slug, OTHER[d], state.plan[OTHER[d]].seq.indexOf(e.slug) + 1);
      else if (e.win[d]) side = `<button class="add" data-act="pin" data-slug="${e.slug}" aria-label="Add to ${DAYS[d].slice(0, 3)}, ${esc(nm(e))}">Add to ${DAYS[d].slice(0, 3)}</button>`;
      else side = "";
      const hrs = ["sat", "sun"].filter(x => e.win[x]).map(x => `${DAYS[x].slice(0, 3)}&nbsp;${hoursOn(e, x)}`).join("; ") || "Friday only";
      const head = ranked && e.tier !== tierNow ? `<li class="cat-tier"><h3>${esc(e.tier)}</h3></li>` : "";
      tierNow = e.tier;
      return `${head}<li class="cat"><span class="n">${e.rank}</span>
        <div class="nm"><button class="namebtn" data-focus="${e.slug}">${esc(nm(e))}</button>
          <div class="sub">${esc(e.hood)}, ${esc(e.boro)}</div><div class="sub">${hrs}</div>
          ${e.pick || e.rec ? `<div class="tags">${e.pick ? `<span class="tag pick">${MARK_SVG}Your pick</span>` : ""}${e.rec ? '<span class="tag rec">Recommended</span>' : ""}</div>` : ""}</div>
        <div class="side">${ranked ? "" : `<span class="tier">${esc(e.tier)}</span>`}${side}</div></li>`;
    }).join("") || `<li class="empty"><p>No events match${q ? ` “${esc($("q").value.trim())}”` : " these filters"}${f.has("open") ? ` on ${DAYS[d]}` : ""}.</p>
      <button type="button" class="linkbtn" data-clear>Clear search and filters</button></li>`;
  }

  // Signature: on phones the black sign becomes a station sign for the stop you're on.
  function syncSign() {
    const p = state.plan[state.day];
    let i = -1;
    if (mobile() && p && p.seq.length) {
      if (state.view === "map" && state.sel) i = p.seq.indexOf(state.sel);
      else if (state.view === "plan" && $("panel").scrollTop > 8) {
        // a station sign for the stop you have scrolled into: it goes live once that stop's name has passed under it
        const top = $("panel").getBoundingClientRect().top + 4;
        document.querySelectorAll("#line .stop").forEach((li, k) => { const h = li.querySelector(".stop-name"); if (h && h.getBoundingClientRect().bottom <= top) i = k; });
      }
    }
    const live = i >= 0;
    if (live) {
      const s = p.seq[i];
      const txt = `<span class="sn">${i + 1}</span><span class="sm">${esc(nm(BY[s]))}</span><span class="st">${fmtShort(p.starts[i])}</span>`;
      if ($("sign-now").dataset.k !== s) { $("sign-now").innerHTML = txt; $("sign-now").dataset.k = s; }
    } else $("sign-now").dataset.k = "";
    document.body.classList.toggle("sign-live", live);
  }
  let signRaf = 0;
  $("panel").addEventListener("scroll", () => { cancelAnimationFrame(signRaf); signRaf = requestAnimationFrame(syncSign); }, { passive: true });
  // §7 day toggle: a 160ms crossfade. Starting at .35 rather than 0 avoids a blank frame between the two days.
  const fadeIn = els => { if (still()) return; els.forEach(el => el?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 160, easing: "ease-out" })); };
  // One day switch for the header toggle, "Switch to Sunday" and "Stop 5 · Sun": same reframe, same fade.
  function switchDay(d, { fade = true } = {}) {
    state.day = d; state.sel = null; map.closePopup(); save(); render(); fitDay({ animate: false });
    if (state.view !== "map") $("panel").scrollTop = 0;
    if (fade) fadeIn([$("line"), $("summary"), $("plan-strip"), $("cards"), ...["route", "markerPane", "stations", "events"].map(n => map.getPane(n))]);
  }

  function setView(v, { fit = true } = {}) {
    if (!mobile() && v === "map") v = "plan";
    state.view = v;
    document.body.classList.remove("view-plan", "view-map", "view-explore", "view-saved");
    document.body.classList.add("view-" + v);
    document.querySelectorAll(".tabs [data-view]").forEach(b => { const on = b.dataset.view === v || (v === "map" && b.dataset.view === "plan"); b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    document.querySelectorAll(".bottom-nav [data-view]").forEach(b => (b.dataset.view === v ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    if (v === "map") {
      setTimeout(() => {
        map.invalidateSize();
        if (fit && !state.sel) {
          fitDay({ animate: false });
          const p = state.plan[state.day];
          if (mobile() && p && p.seq.length) { const nx = progress(p, state.day); selectStop(p.seq[nx >= 0 && nx < p.seq.length ? nx : 0], { pan: false, scrollCard: "jump" }); }
        }
      }, 30);
    }
    // phones show one view at a time with a tab bar, not a tab list: the panes are regions there
    document.querySelectorAll(".pane").forEach(x => x.setAttribute("role", mobile() ? "region" : "tabpanel"));
    if (v !== "map") $("panel").scrollTop = 0;
    syncSign();
  }

  function render() {
    ["sat", "sun"].forEach(d => { $("tab-" + d).setAttribute("aria-selected", String(state.day === d)); $("tab-" + d).tabIndex = state.day === d ? 0 : -1; });
    $("mode").value = state.mode; $("pace").value = state.pace; $("walky").checked = state.walky; $("mix").value = state.mix;
    renderPlans(); renderSummary(); renderLine(); renderCards(); renderLeftover(); renderCatalog();
    markers = {};
    drawDots(); drawRoute();
    syncSign(); syncFit();
  }
  function recompute(refit) {
    solveWeekend(); save(); render();
    if (refit) fitDay();
  }

  // ---------- save and share ----------
  const b64 = str => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64 = str => decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/"))));
  const short = s => s.replace(/-26$/, "");
  const long = s => s + "-26";
  function encodeState() {
    return b64(JSON.stringify({
      c: state.choice, m: state.mode, w: state.walky ? 1 : 0, pc: state.pace, x: state.mix,
      p: [...state.pins].map(s => [short(s), state.pinDay[s] || ""]), s: [...state.skips].map(short),
    }));
  }
  function applyCode(code) {
    const o = JSON.parse(unb64(code));
    if (o.c) state.choice = { sat: o.c.sat || "sat-uptown", sun: o.c.sun || "sun-green" };
    if (o.m) state.mode = o.m;
    if (o.w != null) state.walky = !!o.w;
    if (o.pc && PACE[o.pc]) state.pace = o.pc;
    if (o.x != null) state.mix = o.x;
    state.pins = new Set((o.p || []).map(([s]) => long(s)).filter(s => BY[s]));
    state.pinDay = Object.fromEntries((o.p || []).filter(([s, d]) => BY[long(s)] && d).map(([s, d]) => [long(s), d]));
    state.skips = new Set((o.s || []).map(long).flatMap(k => (k.includes("|") ? [k] : ["sat|" + k, "sun|" + k])).filter(k => BY[k.split("|").pop()]));
  }
  const shareUrl = (code = encodeState()) => `${location.origin}${location.pathname}#r=${code}`;
  function toast(msg, ok = true, undo = null, { focus = false } = {}) {
    const t = $("toast"), a = $("announce");
    t.innerHTML = `${ok ? CHECK_SVG : ""}<span>${esc(msg)}</span>${undo ? '<button type="button" class="undo">Undo</button>' : ""}`; t.hidden = false;
    // the live region is always in the tree, so the first message is heard too
    a.textContent = ""; setTimeout(() => (a.textContent = msg + (undo ? ". Undo available." : "")), 50);
    if (undo) {
      const back = document.activeElement;
      t.querySelector(".undo").addEventListener("click", () => { t.hidden = true; undo(); });
      // a keyboard Delete or Remove puts focus on Undo, so the one recovery is reachable before the timer ends
      if (focus) { t.querySelector(".undo").focus({ preventScroll: true }); t.addEventListener("keydown", e => { if (e.key === "Escape") { t.hidden = true; back?.isConnected && back.focus({ preventScroll: true }); } }, { once: true }); }
    }
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), undo ? 6000 : 2600);
    // a toast under the pointer or holding focus stays until it is left (WCAG 2.2.1)
    t.onmouseenter = t.onfocusin = () => clearTimeout(toast.t);
    t.onmouseleave = t.onfocusout = () => { clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3000); };
  }
  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); toast(done); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      try { document.execCommand("copy"); toast(done); } catch { toast("Couldn't copy. Long-press to copy instead.", false); }
      ta.remove();
    }
  }
  async function shareLink() {
    const url = shareUrl();
    if (mobile() && navigator.share) {
      try { await navigator.share({ title: "Our OHNY Weekend route", url }); return; } catch (err) { if (err && err.name === "AbortError") return; }
    }
    copy(url, "Link copied. Anyone who opens it sees these exact routes.");
  }
  function stepsText(l) {
    if (l.how === "walk") return `walk ${Math.round(l.min - 1)} min`;
    if (!l.steps) return l.how === "drive" ? "drive" : "transit";
    return l.steps.map(s => s.type === "walk" ? `walk ${s.min} min` : `${s.route} ${s.kind === "b" ? "bus" : "train"} from ${s.kind === "b" ? title(s.from) : s.from} to ${s.kind === "b" ? title(s.to) : s.to} (toward ${title(s.head || "")}, ${s.n} stops)`).join(", then ");
  }
  function itineraryText() {
    const lines = ["OHNY Weekend, Oct 17–18, 2026", ""];
    for (const d of ["sat", "sun"]) {
      const p = state.plan[d];
      lines.push(`${DAYS[d].toUpperCase()}: ${PBY[state.choice[d]]?.name || "Custom route"}`);
      if (!p || !p.seq.length) { lines.push("  Nothing planned", ""); continue; }
      p.seq.forEach((s, i) => {
        const e = BY[s];
        if (i > 0) lines.push(`    ↓ ${dur(p.legs[i].min)}: ${stepsText(p.legs[i])}`);
        lines.push(`  ${fmt(p.starts[i])}  ${nm(e)}${e.ticketed ? " (ticketed)" : ""}`);
        lines.push(`      ${e.addr ? e.addr + ", " : ""}${e.hood}, ${e.boro}. Open ${hoursText(e, d)}`);
      });
      lines.push("");
    }
    lines.push("Map and directions: " + shareUrl());
    return lines.join("\n");
  }
  const savedList = () => store.get("saved", []);
  function renderSaved() {
    const list = savedList();
    const meta = t => {
      const m = /Saturday (\d+) stops, Sunday (\d+) stops/.exec(t || "");
      return m ? `<span class="nw"><span class="bullet xs b-sat" aria-hidden="true">17</span>Saturday · ${m[1]} stops</span> <span class="nw"><span class="bullet xs b-sun" aria-hidden="true">18</span>Sunday · ${m[2]} stops</span>` : esc(t || "");
    };
    $("saved-list").innerHTML = list.length ? list.map((r, i) => `<li>
        <span class="sv-name">${esc(r.name)}</span>
        <span class="sv-meta">${meta(r.summary)}</span>
        <span class="sv-acts"><button type="button" data-sv="load" data-i="${i}" aria-label="Open ${esc(r.name)}">Open</button><button type="button" data-sv="link" data-i="${i}" aria-label="Copy link to ${esc(r.name)}">Link</button><button type="button" class="del" data-sv="del" data-i="${i}" aria-label="Delete ${esc(r.name)}">Delete</button></span>
      </li>`).join("") : `<li class="sv-empty">Nothing saved yet. Your current routes already save in this browser; name a version here to keep it.</li>`;
    // the auto-save note is the empty state's second sentence, so it only shows under a list
    document.querySelector(".save-card .fine").hidden = !list.length;
  }
  function saveCurrent() {
    const name = $("save-name").value.trim() || `${PBY[state.choice.sat]?.name || "Custom"} + ${PBY[state.choice.sun]?.name || "Custom"}`;
    const n = d => state.plan[d]?.seq.length || 0;
    const existed = savedList().some(r => r.name === name);
    const list = savedList().filter(r => r.name !== name);
    list.unshift({ name, code: encodeState(), summary: `Saturday ${n("sat")} stops, Sunday ${n("sun")} stops` });
    store.set("saved", list.slice(0, 30));
    $("save-name").value = "";
    renderSaved(); toast(`${existed ? "Replaced" : "Saved"} “${name}”`);
  }

  // ---------- events ----------
  document.addEventListener("click", ev => {
    const clr = ev.target.closest("[data-clear]");
    if (clr) {
      // the way out of an empty result: no search, the default filter, focus back in the field
      $("q").value = ""; state.filters = new Set(["open"]);
      document.querySelectorAll(".chip[data-f]").forEach(c => { const on = state.filters.has(c.dataset.f); c.classList.toggle("on", on); c.setAttribute("aria-pressed", String(on)); });
      renderCatalog(); $("q").focus();
      return;
    }
    const g = ev.target.closest("[data-goto]");
    if (g) {
      // "Stop 5 · Sat" opens that stop in the rail (and on the map on a laptop)
      const s = g.dataset.goto, dd = g.dataset.day;
      if (dd && dd !== state.day) switchDay(dd);
      setView("plan");
      selectStop(s, { pan: !mobile() });
      const li = document.querySelector(`#line .stop[data-stop="${s}"]`);
      if (li) { li.scrollIntoView({ block: "start" }); li.querySelector(".namebtn")?.focus({ preventScroll: true }); }
      return;
    }
    const b = ev.target.closest("[data-act]");
    if (b) {
      const s = b.dataset.slug, a = b.dataset.act;
      // a list re-renders under the button: keep the keyboard in the same row afterwards
      const box = b.closest("#catalog, #leftover, #line"), boxId = box?.id;
      if (a === "go-day") { switchDay(b.dataset.day); return; }
      if (a === "pin") {
        const d = b.dataset.day || (BY[s].win[state.day] ? state.day : OTHER[state.day]);
        state.pins.add(s); state.skips.delete("sat|" + s); state.skips.delete("sun|" + s); state.pinDay[s] = d;
        if (state.choice[d] === "custom" || PBY[state.choice[d]]) toast(`Added ${nm(BY[s])} to ${DAYS[d]}`);
      }
      if (a === "unpin") { state.pins.delete(s); delete state.pinDay[s]; }
      if (a === "skip") {
        const k = state.day + "|" + s, pinned = state.pins.has(s), pd = state.pinDay[s];
        state.skips.add(k); state.pins.delete(s);
        toast(`Removed ${nm(BY[s])} from ${DAYS[state.day]}`, true, () => { state.skips.delete(k); if (pinned) { state.pins.add(s); if (pd) state.pinDay[s] = pd; } recompute(false); }, { focus: ev.detail === 0 });
      }
      if (a === "unskip") { state.skips.delete("sat|" + s); state.skips.delete("sun|" + s); }
      map.closePopup();
      recompute(false);
      if (boxId && s && (document.activeElement === document.body || !document.activeElement?.isConnected)) {
        const c = $(boxId);
        (c.querySelector(`[data-goto="${s}"]`) || c.querySelector(`[data-focus="${s}"]`) || (boxId === "line" && c.querySelector(".stop.cur .namebtn")))?.focus({ preventScroll: true });
      }
      return;
    }
    const pl = ev.target.closest("[data-plan]");
    if (pl) {
      state.choice[state.day] = pl.dataset.plan; state.sel = null;
      recompute(true);
      document.querySelector(`.plan[data-plan="${pl.dataset.plan}"]`)?.scrollIntoView({ behavior: still() ? "auto" : "smooth", inline: "nearest", block: "nearest" });
      return;
    }
    const f = ev.target.closest("[data-focus]");
    if (f) { showOnMap(f.dataset.focus); return; }
    const cl = ev.target.closest("[data-cleg]");
    if (cl) { if (focused === +cl.dataset.cleg) { clearFocus(); fitDay(); } else focusLeg(+cl.dataset.cleg); return; }
    const c = ev.target.closest("[data-card]");
    if (c) { selectStop(c.dataset.card, { scrollCard: true, pan: "follow" }); return; }
    const v = ev.target.closest("[data-view]");
    if (v) { setView(v.dataset.view); return; }
    const chip = ev.target.closest("[data-f]");
    if (chip) {
      const k = chip.dataset.f;
      state.filters.has(k) ? state.filters.delete(k) : state.filters.add(k);
      chip.classList.toggle("on", state.filters.has(k)); chip.setAttribute("aria-pressed", String(state.filters.has(k)));
      renderCatalog();
    }
  });
  // Opening a leg's directions also shows it on the map (desktop), so the steps and the lines read together.
  $("line").addEventListener("toggle", ev => {
    const d = ev.target;
    if (!d.classList?.contains("legd")) return;
    const i = +d.querySelector("[data-leg]").dataset.leg;
    // one leg's directions at a time, as the map shows one leg at a time
    if (d.open) $("line").querySelectorAll(".legd[open]").forEach(o => o !== d && (o.open = false));
    if (d.open && !mobile() && focused !== i) focusLeg(i);
    if (!d.open && !mobile() && focused === i) clearFocus();
  }, true);
  $("line").addEventListener("click", ev => { const b = ev.target.closest(".map-btn"); if (b) focusLeg(+b.dataset.legmap); });
  document.querySelectorAll(".day").forEach(t => t.addEventListener("click", () => {
    if (document.body.classList.contains("sign-live") && t.dataset.day === state.day) {
      if (state.view === "map") { state.sel = null; clearFocus(); map.closePopup(); selectStop("", { pan: false }); state.sel = null; document.body.classList.remove("sign-live"); fitDay(); }
      else $("panel").scrollTo({ top: 0, behavior: still() ? "auto" : "smooth" });
      return;
    }
    switchDay(t.dataset.day);
  }));
  let mixT;
  $("mix").addEventListener("input", e => { state.mix = +e.target.value; clearTimeout(mixT); mixT = setTimeout(() => recompute(false), 150); });
  $("mode").addEventListener("change", e => { state.mode = e.target.value; recompute(false); });
  $("pace").addEventListener("change", e => { state.pace = e.target.value; recompute(false); });
  $("walky").addEventListener("change", e => { state.walky = e.target.checked; recompute(false); });
  $("reset").addEventListener("click", () => { state.pins.clear(); state.skips.clear(); state.pinDay = {}; recompute(true); toast("Pins and skips cleared"); });
  $("q").addEventListener("input", renderCatalog);
  $("share-link").addEventListener("click", shareLink);
  $("share-text").addEventListener("click", () => copy(itineraryText(), "Itinerary copied. Paste it into a text or a note."));
  $("save-btn").addEventListener("click", saveCurrent);
  $("save-name").addEventListener("keydown", e => { if (e.key === "Enter") saveCurrent(); });
  $("saved-list").addEventListener("click", ev => {
    const b = ev.target.closest("[data-sv]"); if (!b) return;
    const r = savedList()[+b.dataset.i]; if (!r) return;
    if (b.dataset.sv === "load") { applyCode(r.code); recompute(true); setView("plan"); toast(`Opened “${r.name}”`); }
    if (b.dataset.sv === "link") copy(shareUrl(r.code), `Link to “${r.name}” copied`);
    if (b.dataset.sv === "del") {
      // a saved weekend is worth more than a stop: Delete is undoable, like Remove
      const i = +b.dataset.i, all = savedList(), gone = all[i];
      store.set("saved", all.filter((_, j) => j !== i)); renderSaved();
      const left = document.querySelectorAll("#saved-list [data-sv=load]");
      (left[Math.min(i, left.length - 1)] || $("save-name")).focus({ preventScroll: true });
      toast(`Deleted “${r.name}”`, true, () => {
        const l = savedList(); l.splice(Math.min(i, l.length), 0, gone); store.set("saved", l.slice(0, 30)); renderSaved();
        document.querySelectorAll("#saved-list [data-sv=load]")[i]?.focus({ preventScroll: true });
      }, { focus: ev.detail === 0 });
    }
  });
  $("map-fit").addEventListener("click", () => { clearFocus(); fitDay(); });
  $("banner-close").addEventListener("click", () => { $("banner").hidden = true; $("panel").focus({ preventScroll: true }); });
  // Arrow keys, Home and End move through the radio and tab groups, as their ARIA roles promise.
  function rove(group, sel) {
    group.addEventListener("keydown", e => {
      const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key] ?? (e.key === "Home" ? "h" : e.key === "End" ? "e" : 0);
      if (!k) return;
      const b = [...group.querySelectorAll(sel)].filter(x => x.offsetParent), i = b.indexOf(document.activeElement);
      if (i < 0) return;
      // the laptop plan picker is a 3x2 grid: up and down move by a row, clamped
      const cols = group.id === "plan-strip" && !mobile() ? getComputedStyle(group).gridTemplateColumns.split(" ").length : 1;
      const vert = e.key === "ArrowDown" || e.key === "ArrowUp";
      const n = k === "h" ? 0 : k === "e" ? b.length - 1 : vert && cols > 1 ? Math.min(b.length - 1, Math.max(0, i + k * cols)) : (i + k + b.length) % b.length;
      e.preventDefault(); b[n].click();
      ([...group.querySelectorAll(sel)].filter(x => x.offsetParent)[n] || b[n]).focus();
    });
  }
  rove($("plan-strip"), ".plan"); rove(document.querySelector(".days"), ".day"); rove(document.querySelector(".tabs"), "[data-view]");

  // Map cards on phones: the card you swipe to becomes the selected stop.
  // scrollend picks the card at once, so the map follow starts as the card settles; the 140ms debounce
  // is only the fallback for browsers without scrollend.
  let cardT;
  const pickCard = () => {
    clearTimeout(cardT);
    {
      const box = $("cards").getBoundingClientRect();
      let best = null, bd = 1e9;
      document.querySelectorAll(".card").forEach(c => { const r = c.getBoundingClientRect(); const dd = Math.abs(r.left - box.left - 16); if (dd < bd) { bd = dd; best = c; } });
      if (best && best.dataset.stop !== state.sel) {
        // a focused leg follows the swipe: the new card's onward leg takes the focus
        const p = state.plan[state.day], k = p ? p.seq.indexOf(best.dataset.stop) : -1;
        if (focused && k >= 0 && k + 1 < p.seq.length) focusLeg(k + 1);
        else { clearFocus(); selectStop(best.dataset.stop, { pan: "follow" }); }
      }
    }
  };
  const hasScrollEnd = "onscrollend" in window;
  $("cards").addEventListener("scroll", () => { if (hasScrollEnd) return; clearTimeout(cardT); cardT = setTimeout(pickCard, 140); }, { passive: true });
  $("cards").addEventListener("scrollend", pickCard, { passive: true });

  let wasMobile = mobile();
  addEventListener("resize", () => {
    if (mobile() !== wasMobile) { wasMobile = mobile(); setView(wasMobile ? state.view : state.view === "map" ? "plan" : state.view); render(); }
    map.invalidateSize();
    // the window settled at a new size (or the first fit ran before it did): an untouched overview is fitted again
    clearTimeout(refitT); refitT = setTimeout(refitIfUntouched, 150);
  });
  let refitT;
  function refitIfUntouched() { if (!userMoved && !focused && !state.sel && map.getSize().x) fitDay({ animate: false }); }
  document.fonts?.ready.then(() => { map.invalidateSize(); refitIfUntouched(); });

  // A shared link replaces this browser's routes, and is kept under Saved weekends.
  if (location.hash.startsWith("#r=")) {
    const code = location.hash.slice(3);
    try {
      applyCode(code);
      // in flow at the top of the panel, so it stays until dismissed rather than jumping the layout away
      $("banner").hidden = false;
      const list = savedList();
      if (!list.some(r => r.code === code)) {
        list.unshift({ name: `Shared route, opened ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`, code, summary: "Opened from a link" });
        store.set("saved", list.slice(0, 30));
      }
    } catch { toast("That share link is damaged, so your own routes are shown instead.", false); }
    history.replaceState(null, "", location.pathname);
  }
  // Test hooks for screenshots: ?theme=dark|light&day=sat|sun&view=plan|map|explore|saved&plan=<id>
  const qp = new URLSearchParams(location.search);
  if (qp.get("theme")) document.documentElement.dataset.theme = qp.get("theme");
  if (DAYS[qp.get("day")]) state.day = qp.get("day");
  if (qp.get("plan") && PBY[qp.get("plan")]) state.choice[PBY[qp.get("plan")].day] = qp.get("plan");
  renderSaved();
  setView("plan");
  recompute(true);
  if (qp.get("view")) setView(qp.get("view"));
  // On the weekend itself, open the plan at the next stop once per session, not at the top of the essay.
  try {
    const n = $("line").querySelector(".stop.next");
    if (n && state.view === "plan" && !sessionStorage.getItem("odr-next")) { n.scrollIntoView({ block: "start" }); sessionStorage.setItem("odr-next", "1"); }
  } catch {}
  if (qp.get("leg")) setTimeout(() => focusLeg(+qp.get("leg")), 300);
})();
