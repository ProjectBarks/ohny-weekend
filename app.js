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
  const MODE_LABEL = { bus: "Subway, bus and walking", subway: "Subway and walking", car: "Car or rideshare" };
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
  const fmtShort = m => fmt(m).replace(":00", "").replace(" AM", "a").replace(" PM", "p");
  const dur = m => { m = Math.round(m); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`; };
  const durS = m => { m = Math.round(m); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`; };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const title = t => (t === t.toUpperCase() ? t.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : t);
  const km = (a, b) => {
    const R = 6371, toR = x => (x * Math.PI) / 180;
    const dLa = toR(b.lat - a.lat), dLo = toR(b.lng - a.lng);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const hoursOn = (e, day) => (e.win[day] || []).map(w => (w.fixed ? `${fmtShort(w.o)} tour` : `${fmtShort(w.o)}–${fmtShort(w.c)}`)).join(", ");
  const WALK_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4" r="1.6"/><path d="M10.5 21l1.8-6 2.7 2.7V21M8 12l2.5-3.5 3 .5 2 3 2.5 1M12.3 9l-1.3 6"/></svg>`;
  const walkI = m => `<span class="walk-i">${WALK_SVG}${m != null ? Math.round(m) : ""}</span>`;
  const SUB = (window.SUBWAY && window.SUBWAY.colors) || {};
  function bullet(route, color, kind = "s", small = false) {
    if (kind === "b") return `<span class="bb">${esc(route)}</span>`;
    const express = /X$/.test(route) && route.length > 1;
    const name = express ? route.slice(0, -1) : route;
    const c = (color || SUB[route] || SUB[name] || "808183").replace("#", "");
    const dark = ["FCCC0A", "F6BC26"].includes(c.toUpperCase());
    return `<span class="sb${dark ? " dark" : ""}${express ? " x" : ""}${small ? " sm" : ""}" style="--c:#${c}" aria-label="${esc(name)} train"><span>${esc(name)}</span></span>`;
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
        r.warn[s] = w ? `You'd get here about ${fmt(arrive)}, and it ${w.fixed ? `starts at ${fmt(w.o)}` : `closes at ${fmt(w.c)}`}.` : `Not open ${DAYS[day]}.`;
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
  const map = L.map("map", { zoomControl: true, attributionControl: true, zoomSnap: 0.25 }).setView([40.72, -73.95], 11);
  map.createPane("subway").style.zIndex = 350;
  map.createPane("events").style.zIndex = 420;
  map.createPane("route").style.zIndex = 450;
  map.createPane("stations").style.zIndex = 620;
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, className: "basemap",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors. Subway data: MTA',
  }).addTo(map);
  const css = n => getComputedStyle(document.body).getPropertyValue(n).trim();

  // The whole subway network, faint, in MTA colors.
  const netLayer = L.layerGroup().addTo(map);
  const stnLayer = L.layerGroup();
  if (window.SUBWAY) {
    for (const l of window.SUBWAY.lines) L.polyline(l.g, { pane: "subway", color: "#" + l.c, weight: 2.4, opacity: 0.5, interactive: false }).addTo(netLayer);
    for (const s of window.SUBWAY.stations) {
      L.circleMarker(s.p, { pane: "subway", radius: 2.6, color: "#000", weight: 1.2, fillColor: "#fff", fillOpacity: 1 })
        .bindTooltip(`${esc(s.n)} ${s.r.map(r => bullet(r, null, "s", true)).join("")}`, { className: "stn", direction: "top", offset: [0, -4] })
        .addTo(stnLayer);
    }
  }
  const syncStations = () => { if (map.getZoom() >= 13) stnLayer.addTo(map); else stnLayer.remove(); };
  map.on("zoomend", syncStations);

  const dotLayer = L.layerGroup().addTo(map);
  const routeLayer = L.layerGroup().addTo(map);
  const focusLayer = L.layerGroup().addTo(map);
  let markers = {}, legBounds = [];

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
    if (onRoute(e.slug, d)) act = `<button data-act="skip" data-slug="${e.slug}">Remove from ${DAYS[d]}</button>`;
    else if (onRoute(e.slug, o)) act = `<button data-act="go-day" data-day="${o}">On your ${DAYS[o]} route</button>`;
    else if (e.win[d]) act = `<button data-act="pin" data-slug="${e.slug}">Add to ${DAYS[d]}</button>`;
    else if (e.win[o]) act = `<button data-act="pin" data-slug="${e.slug}" data-day="${o}">Add to ${DAYS[o]}</button>`;
    else act = "";
    return `<div class="pp"><h4>${esc(e.name)}</h4>
      <div class="meta">#${e.rank} of 131 in my ranking. ${esc(e.hood)}, ${esc(e.boro)}</div>
      ${tagsHtml(e, true)}
      <div class="hrs">${hrs}</div>
      <p>${esc(e.why)}</p>
      ${e.caveat ? `<div class="caveat">${esc(e.caveat)}</div>` : ""}
      <div class="acts">${act}<a href="${e.url}" target="_blank" rel="noopener">OHNY listing</a></div></div>`;
  }

  function drawDots() {
    dotLayer.clearLayers();
    const d = state.day;
    const onAny = new Set([...(state.plan.sat?.seq || []), ...(state.plan.sun?.seq || [])]);
    const tierR = { "Must-do": 6.5, Strong: 5.5, Good: 5, Fine: 4.2, Lower: 3.6 };
    EV.forEach(e => {
      if (onAny.has(e.slug)) return;
      const open = !!e.win[d];
      const fill = e.pick ? css("--pick") : e.rec ? css("--rec") : css("--shuttle");
      const m = L.circleMarker([e.mlat, e.mlng], {
        pane: "events", radius: tierR[e.tier] + (e.pick || e.rec ? 1 : 0),
        color: e.rec ? "#000" : "#fff", weight: e.rec || e.pick ? 1.5 : 1,
        fillColor: fill, fillOpacity: open ? (e.pick || e.rec ? 1 : 0.7) : 0.2, opacity: open ? 1 : 0.3,
      }).bindPopup(() => popupHtml(e), { maxWidth: 300, autoPanPaddingTopLeft: [20, 80], autoPanPaddingBottomRight: [20, 180] });
      if (!mobile()) m.bindTooltip(`#${e.rank} ${esc(e.name)}`, { direction: "top", offset: [0, -4] });
      m.addTo(dotLayer);
      markers[e.slug] = m;
    });
  }

  function vIcon(n, cls = "", color) {
    return L.divIcon({ className: "", html: `<div class="vmark ${cls}" ${color ? `style="border-color:${color}"` : ""}>${n}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
  }
  // One leg on the map: dotted walks, rides drawn along the real track in line colors, and the stations you use.
  function drawLeg(a, b, l, layer, labels) {
    const ink = css("--ink"), dayc = css("--day");
    const dotted = pts => {
      L.polyline(pts, { pane: "route", color: "#fff", weight: 9, opacity: 0.9, dashArray: "0.1 11", lineCap: "round" }).addTo(layer);
      L.polyline(pts, { pane: "route", color: dayc, weight: 6, opacity: 1, dashArray: "0.1 11", lineCap: "round" }).addTo(layer);
    };
    const all = [[a.mlat, a.mlng]];
    if (l.how !== "transit" || !l.steps) {
      if (l.how === "drive") L.polyline([[a.mlat, a.mlng], [b.mlat, b.mlng]], { pane: "route", color: ink, weight: 3, opacity: 0.6, dashArray: "8 8" }).addTo(layer);
      else dotted([[a.mlat, a.mlng], [b.mlat, b.mlng]]);
      all.push([b.mlat, b.mlng]);
      return all;
    }
    let cur = [a.mlat, a.mlng];
    for (const s of l.steps) {
      if (s.type !== "ride") continue;
      const g = s.geo;
      dotted([cur, g[0]]);
      L.polyline(g, { pane: "route", color: "#fff", weight: 10, opacity: 0.95 }).addTo(layer);
      L.polyline(g, { pane: "route", color: "#" + (s.color || SUB[s.route] || "808183"), weight: 6, opacity: 1 }).addTo(layer);
      const tip = (verb, name) => `${bullet(s.route, s.color, s.kind, true)} ${verb} ${esc(s.kind === "b" ? title(name) : name)}`;
      for (const [pt, verb, name] of [[g[0], "Board at", s.from], [g[g.length - 1], "Get off at", s.to]]) {
        L.marker(pt, { pane: "stations", icon: L.divIcon({ className: "", html: `<div class="smark"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) })
          .bindTooltip(tip(verb, name), { className: "stn", direction: "auto", offset: [0, 0], permanent: labels })
          .addTo(layer);
      }
      all.push(...g);
      cur = g[g.length - 1];
    }
    dotted([cur, [b.mlat, b.mlng]]);
    all.push([b.mlat, b.mlng]);
    return all;
  }

  function drawRoute() {
    routeLayer.clearLayers(); focusLayer.clearLayers(); legBounds = [];
    const d = state.day, o = OTHER[d];
    const op = state.plan[o];
    if (op && op.seq.length) {
      const pts = op.seq.map(s => [BY[s].mlat, BY[s].mlng]);
      L.polyline(pts, { pane: "route", color: css(o === "sat" ? "--sat" : "--sun"), weight: 2.5, opacity: 0.35, dashArray: "4 8" }).addTo(routeLayer);
      op.seq.forEach((s, i) => {
        const e = BY[s];
        markers[s] = L.marker([e.mlat, e.mlng], { icon: vIcon(i + 1, "other", css(o === "sat" ? "--sat" : "--sun")), zIndexOffset: 100 })
          .bindPopup(() => popupHtml(e), { maxWidth: 300 }).addTo(routeLayer);
      });
    }
    const p = state.plan[d];
    if (!p || !p.seq.length) return;
    p.seq.forEach((s, i) => {
      if (i > 0) legBounds[i] = drawLeg(BY[p.seq[i - 1]], BY[s], p.legs[i], routeLayer, false);
    });
    p.seq.forEach((s, i) => {
      const e = BY[s];
      const mk = L.marker([e.mlat, e.mlng], { icon: vIcon(i + 1), zIndexOffset: 1000, keyboard: true, title: e.name })
        .bindPopup(() => popupHtml(e), { maxWidth: 300, autoPanPaddingTopLeft: [20, 80], autoPanPaddingBottomRight: [20, 190] })
        .on("click", () => selectStop(s, { pan: false, scrollCard: true }))
        .addTo(routeLayer);
      if (!mobile()) mk.bindTooltip(`${fmt(p.starts[i])} ${esc(e.name)}`, { direction: "top", offset: [0, -16] });
      markers[s] = mk;
    });
  }

  const fitPad = () => mobile() ? { paddingTopLeft: [30, 60], paddingBottomRight: [30, 190] } : { padding: [50, 50] };
  function fitDay() {
    const p = state.plan[state.day];
    if (!p || !p.seq.length) return;
    const pts = [...p.seq.map(s => [BY[s].mlat, BY[s].mlng]), ...legBounds.filter(Boolean).flat()];
    map.fitBounds(L.latLngBounds(pts), { ...fitPad(), maxZoom: 14 });
  }
  function focusLeg(i) {
    const p = state.plan[state.day];
    if (!p || !legBounds[i]) return;
    focusLayer.clearLayers();
    drawLeg(BY[p.seq[i - 1]], BY[p.seq[i]], p.legs[i], focusLayer, true);
    const go = () => map.fitBounds(L.latLngBounds(legBounds[i]), { ...fitPad(), maxZoom: 15 });
    if (mobile() && state.view !== "map") { setView("map", { fit: false }); setTimeout(() => { map.invalidateSize(); go(); }, 60); }
    else go();
  }
  function selectStop(slug, { pan = true, scrollCard = false, popup = false } = {}) {
    state.sel = slug;
    document.querySelectorAll(".vmark.sel").forEach(x => x.classList.remove("sel"));
    markers[slug]?.getElement?.()?.querySelector(".vmark")?.classList.add("sel");
    document.querySelectorAll(".card").forEach(c => c.classList.toggle("sel", c.dataset.card === slug));
    if (scrollCard) document.querySelector(`.card[data-card="${slug}"]`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    const e = BY[slug];
    if (pan && e) map.flyTo([e.mlat, e.mlng], Math.max(map.getZoom(), 14), { duration: 0.5 });
    if (popup) setTimeout(() => markers[slug]?.openPopup(), pan ? 550 : 0);
  }
  function showOnMap(slug) {
    if (mobile()) { setView("map", { fit: false }); setTimeout(() => { map.invalidateSize(); selectStop(slug, { scrollCard: true, popup: !onRoute(slug, state.day) }); }, 80); }
    else selectStop(slug, { popup: true });
  }

  // ---------- panel ----------
  function tagsHtml(e, compact) {
    const t = [
      e.pick ? '<span class="tag pick">Your pick</span>' : "",
      e.rec ? '<span class="tag rec">My pick for you</span>' : "",
      `<span class="tag">#${e.rank} ${esc(e.tier)}</span>`,
      e.ticketed ? '<span class="tag tix">Ticketed</span>' : "",
      !compact && state.pins.has(e.slug) ? '<span class="tag pin">Pinned</span>' : "",
    ].join("");
    return `<div class="tags">${t}</div>`;
  }
  function legSummary(l) {
    if (l.how === "walk") return `${walkI(l.min - 1)} <span>walk</span>`;
    if (!l.steps) return l.how === "drive" ? "<span>drive</span>" : "<span>transit</span>";
    return l.steps.map(s => s.type === "walk" ? walkI(s.min) : bullet(s.route, s.color, s.kind)).join('<span class="arrow">›</span>');
  }
  function stepsHtml(l, a, b) {
    if (!l.steps || l.how !== "transit") return "";
    const rows = l.steps.map((s, k) => {
      if (s.type === "walk") {
        const nxt = l.steps[k + 1];
        const to = nxt && nxt.type === "ride" ? (nxt.kind === "b" ? title(nxt.from) + " stop" : nxt.from) : b.name;
        return `<li class="walkrow">${walkI()}<span>Walk ${s.min} min to ${esc(to)}</span></li>`;
      }
      const from = s.kind === "b" ? title(s.from) : s.from, to = s.kind === "b" ? title(s.to) : s.to;
      return `<li>${bullet(s.route, s.color, s.kind)}<span><strong>${esc(from)}</strong> to <strong>${esc(to)}</strong>
        <span class="sub"><br>${s.kind === "b" ? "Bus" : "Train"} toward ${esc(title(s.head || ""))}. ${s.n} stop${s.n === 1 ? "" : "s"}, ${s.min} min${s.wait >= 5 ? `, comes about every ${s.wait * 2} min` : ""}</span></span></li>`;
    }).join("");
    return `<ol class="steps">${rows}</ol>`;
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
    let h = "";
    p.seq.forEach((s, i) => {
      const e = BY[s];
      if (i > 0) {
        const l = p.legs[i], a = BY[p.seq[i - 1]];
        const arrive = p.ends[i - 1] + l.min, wait = p.starts[i] - arrive;
        h += `<li class="leg"><div></div><div class="rail"></div><div class="leg-body">
          <details class="legd"${l.how === "transit" ? "" : ""}>
            <summary class="leg-btn" data-leg="${i}"><strong>${dur(l.min)}</strong> ${legSummary(l)} ${l.how === "transit" ? '<span class="see">Directions</span>' : ""}</summary>
            ${stepsHtml(l, a, e)}
            <a class="gm" href="${gmaps(a, e, l.how)}" target="_blank" rel="noopener">Check live times in Google Maps</a>
          </details>
          ${wait > 8 ? `<div class="wait">${dur(wait)} to spare before it opens</div>` : ""}
        </div></li>`;
      }
      const nb = nearby(e, d, used);
      const tix = (e.win[d] || []).find(w => w.fixed && w.o === p.starts[i]);
      h += `<li class="stop ${i === p.seq.length - 1 ? "last" : ""}" data-stop="${s}">
        <div class="time">${fmt(p.starts[i]).replace(/ (AM|PM)/, '<span class="ap">$1</span>')}<small>to ${fmtShort(p.ends[i])}</small></div>
        <div class="rail"><div class="dot">${i + 1}</div></div>
        <div class="stop-body">
          <h3 class="stop-name"><button data-focus="${s}">${esc(e.name)}</button></h3>
          <div class="where">${esc(e.hood)}, ${esc(e.boro)}. Open ${hoursOn(e, d)}${e.lines ? ". Line expected" : ""}</div>
          ${tagsHtml(e)}
          ${p.warn && p.warn[s] ? `<div class="late">${esc(p.warn[s])} Skip it or choose another plan.</div>` : ""}
          <p class="why">${esc(e.why)}</p>
          ${e.caveat ? `<div class="caveat">${esc(e.caveat)}</div>` : ""}
          <details class="more"><summary>Skip, pin or add something nearby</summary>
            <div class="acts">
              <button data-act="skip" data-slug="${s}">Skip this</button>
              ${state.pins.has(s) ? `<button data-act="unpin" data-slug="${s}">Unpin</button>` : `<button data-act="pin" data-slug="${s}">Pin it</button>`}
              ${tix ? `<a href="${tix.url}" target="_blank" rel="noopener">Get tickets</a>` : ""}
              <a href="${e.url}" target="_blank" rel="noopener">OHNY listing</a>
            </div>
            ${nb.length ? `<div class="near"><div class="near-h">Within a short walk, open ${DAYS[d]}</div>${nb.map(o => `
              <div class="near-item"><span class="nm">${esc(o.name)}</span><span class="rk">#${o.rank}, ${hoursOn(o, d)}</span>
              <button data-act="pin" data-slug="${o.slug}" aria-label="Add ${esc(o.name)}">Add</button></div>`).join("")}</div>` : ""}
          </details>
        </div></li>`;
    });
    $("line").innerHTML = h;
  }

  function renderCards() {
    const d = state.day, p = state.plan[d];
    if (!p || !p.seq.length) { $("cards").innerHTML = ""; return; }
    $("cards").innerHTML = p.seq.map((s, i) => {
      const e = BY[s], nl = p.legs[i + 1];
      return `<button class="card" data-card="${s}">
        <span class="cn">${i + 1}</span>
        <span class="ct">${fmt(p.starts[i])} to ${fmtShort(p.ends[i])}</span>
        <span class="cnm">${esc(e.name)}</span>
        <span class="cleg">${nl ? `Next: ${dur(nl.min)} ${legSummary(nl)}` : "Last stop"}</span>
      </button>`;
    }).join("");
  }

  function renderSummary() {
    ["sat", "sun"].forEach(d => {
      const q = state.plan[d];
      $("meta-" + d).textContent = q && q.seq.length ? `${q.seq.length} stops, ${fmtShort(q.starts[0])}–${fmtShort(q.ends[q.ends.length - 1])}` : "No stops";
    });
    const p = state.plan[state.day];
    if (!p || !p.seq.length) { $("summary").innerHTML = ""; return; }
    const picks = p.seq.filter(s => BY[s].pick).length;
    $("summary").innerHTML = `
      <div><b>${p.seq.length}</b>stops</div>
      <div><b>${durS(p.travel)}</b>getting around</div>
      <div><b>${durS(walkOf(p))}</b>walking</div>
      <div><b>${picks}</b>your picks</div>`;
  }

  function renderPlans() {
    const d = state.day, cur = state.choice[d];
    $("plans-title").textContent = `${DAYS[d]} plans`;
    const card = (id, name, meta, r) => {
      let fit = "";
      if (r) {
        const bad = Object.keys(r.warn || {}).length;
        fit = bad ? `<span class="plan-fit bad">${bad} stop${bad > 1 ? "s" : ""} won't fit</span>`
          : r.seq.length ? `<span class="plan-fit">Works, ${fmtShort(r.starts[0])} to ${fmtShort(r.ends[r.ends.length - 1])}</span>` : "";
      }
      return `<button type="button" class="plan" role="radio" aria-checked="${cur === id}" data-plan="${id}">
        <span class="plan-name">${esc(name)}</span><span class="plan-meta">${meta}</span>${fit}</button>`;
    };
    const list = PRESETS.filter(p => p.day === d).map(p => {
      const r = cur === p.id ? state.plan[d] : presetRoute(p, d);
      const picks = p.stops.filter(s => BY[s].pick).length;
      return card(p.id, p.name, `${p.stops.length} stops, ${picks} of your picks`, r);
    });
    list.push(card("custom", "Build my own", "The optimizer picks stops and order", cur === "custom" ? state.plan[d] : null));
    $("plan-strip").innerHTML = list.join("");
    $("plan-blurb").textContent = PBY[cur]?.blurb || "Balances your picks against my rankings, opening hours and travel time. Pin anything to force it in, and use Route settings to steer it.";
    $("mix-ctl").hidden = cur !== "custom";
    $("set-sum").textContent = `${MODE_LABEL[state.mode]}, ${PACE[state.pace].label.toLowerCase()}${state.walky && state.mode !== "car" ? ", walking preferred" : ""}`;
    const m = state.mix;
    $("mix-read").textContent = m <= 20 ? "Mostly my rankings" : m >= 80 ? "Mostly your picks" : "A blend";
  }

  function renderLeftover() {
    const used = new Set([...(state.plan.sat?.seq || []), ...(state.plan.sun?.seq || [])]);
    const left = EV.filter(e => (e.pick || e.rec) && !used.has(e.slug)).sort((a, b) => (b.pick - a.pick) || a.rank - b.rank);
    if (!left.length) { $("leftover").innerHTML = `<h2>Everything made it</h2><p class="note">All your picks and mine are on a route.</p>`; return; }
    $("leftover").innerHTML = `<h2>Not on either day</h2>
      <p class="note">Your picks and mine that this weekend leaves out. Adding one slots it in where it costs the least travel.</p>
      ${left.map(e => {
        const d = e.win[state.day] ? state.day : e.win[OTHER[state.day]] ? OTHER[state.day] : null;
        const btn = skipped(e.slug) ? `<button data-act="unskip" data-slug="${e.slug}">Restore</button>`
          : d ? `<button data-act="pin" data-slug="${e.slug}" data-day="${d}">Add to ${DAYS[d].slice(0, 3)}</button>` : "";
        const hrs = ["sat", "sun"].filter(x => e.win[x]).map(x => `${DAYS[x].slice(0, 3)} ${hoursOn(e, x)}`).join("; ");
        return `<div class="lo"><span class="nm"><button data-focus="${e.slug}">${esc(e.name)}</button></span>${btn}
          <span class="sub">${e.pick ? "Your pick" : "My pick for you"}, #${e.rank}. ${hrs}${skipped(e.slug) ? ". You skipped it" : ""}</span></div>`;
      }).join("")}`;
  }

  function renderCatalog() {
    const q = $("q").value.trim().toLowerCase();
    const d = state.day, f = state.filters;
    $("f-day").textContent = DAYS[d];
    const route = state.plan[d]?.seq || [];
    const rows = EV.filter(e => {
      if (f.has("open") && !e.win[d]) return false;
      if (f.has("pick") && !e.pick) return false;
      if (f.has("rec") && !e.rec) return false;
      if (f.has("top") && e.rank > 30) return false;
      if (f.has("near") && !route.some(s => s !== e.slug && km(BY[s], e) < 1.2)) return false;
      return !q || `${e.name} ${e.hood} ${e.boro}`.toLowerCase().includes(q);
    });
    $("count").textContent = `${rows.length} of 131 events, ranked`;
    $("catalog").innerHTML = rows.map(e => {
      let side;
      if (onRoute(e.slug, d)) side = `<span class="on-route">On ${DAYS[d]}</span>`;
      else if (onRoute(e.slug, OTHER[d])) side = `<span class="on-route">On ${DAYS[OTHER[d]]}</span>`;
      else if (e.win[d]) side = `<button class="add" data-act="pin" data-slug="${e.slug}">Add</button>`;
      else side = "";
      const hrs = ["sat", "sun"].filter(x => e.win[x]).map(x => `${DAYS[x].slice(0, 3)} ${hoursOn(e, x)}`).join("; ") || "Friday only";
      return `<li class="cat"><span class="n">${e.rank}</span>
        <div class="nm"><button data-focus="${e.slug}">${esc(e.name)}</button>
          <div class="sub">${esc(e.hood)}, ${esc(e.boro)}. ${hrs}</div>
          ${e.pick || e.rec ? `<div class="tags">${e.pick ? '<span class="tag pick">Your pick</span>' : ""}${e.rec ? '<span class="tag rec">My pick for you</span>' : ""}</div>` : ""}</div>
        <div class="side"><span class="tier tier-${e.tier}">${esc(e.tier)}</span>${side}</div></li>`;
    }).join("") || `<li class="empty">No events match. Clear a filter or the search.</li>`;
  }

  function setView(v, { fit = true } = {}) {
    if (!mobile() && v === "map") v = "plan";
    state.view = v;
    document.body.classList.remove("view-plan", "view-map", "view-explore", "view-saved");
    document.body.classList.add("view-" + v);
    document.querySelectorAll(".tabs [data-view]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === v || (v === "map" && b.dataset.view === "plan"))));
    document.querySelectorAll(".bottom-nav [data-view]").forEach(b => (b.dataset.view === v ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    if (v === "map") { setTimeout(() => { map.invalidateSize(); if (fit && !state.sel) fitDay(); }, 30); }
    if (v !== "map") $("panel").scrollTop = 0;
  }

  function render() {
    document.body.classList.toggle("is-sun", state.day === "sun");
    ["sat", "sun"].forEach(d => $("tab-" + d).setAttribute("aria-selected", String(state.day === d)));
    $("mode").value = state.mode; $("pace").value = state.pace; $("walky").checked = state.walky; $("mix").value = state.mix;
    renderPlans(); renderSummary(); renderLine(); renderCards(); renderLeftover(); renderCatalog();
    markers = {};
    drawDots(); drawRoute();
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
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
  }
  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); toast(done); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      try { document.execCommand("copy"); toast(done); } catch { toast("Couldn't copy. Long-press to copy instead."); }
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
        lines.push(`  ${fmt(p.starts[i])}  ${e.name}${e.ticketed ? " (ticketed)" : ""}`);
        lines.push(`      ${e.addr ? e.addr + ", " : ""}${e.hood}, ${e.boro}. Open ${hoursOn(e, d)}`);
      });
      lines.push("");
    }
    lines.push("Map and directions: " + shareUrl());
    return lines.join("\n");
  }
  const savedList = () => store.get("saved", []);
  function renderSaved() {
    const list = savedList();
    $("saved-list").innerHTML = list.length ? list.map((r, i) => `<li>
        <span class="sv-name">${esc(r.name)}</span>
        <span class="sv-meta">${esc(r.summary || "")}</span>
        <span class="sv-acts"><button data-sv="load" data-i="${i}">Open</button><button data-sv="link" data-i="${i}">Link</button><button class="del" data-sv="del" data-i="${i}">Delete</button></span>
      </li>`).join("") : `<li class="sv-empty">Nothing saved yet. Name this weekend and save it to keep a version you can come back to.</li>`;
  }
  function saveCurrent() {
    const name = $("save-name").value.trim() || `${PBY[state.choice.sat]?.name || "Custom"} + ${PBY[state.choice.sun]?.name || "Custom"}`;
    const n = d => state.plan[d]?.seq.length || 0;
    const list = savedList().filter(r => r.name !== name);
    list.unshift({ name, code: encodeState(), summary: `Saturday ${n("sat")} stops, Sunday ${n("sun")} stops` });
    store.set("saved", list.slice(0, 30));
    $("save-name").value = "";
    renderSaved(); toast(`Saved "${name}"`);
  }

  // ---------- events ----------
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-act]");
    if (b) {
      const s = b.dataset.slug, a = b.dataset.act;
      if (a === "go-day") { state.day = b.dataset.day; map.closePopup(); save(); render(); fitDay(); return; }
      if (a === "pin") {
        const d = b.dataset.day || (BY[s].win[state.day] ? state.day : OTHER[state.day]);
        state.pins.add(s); state.skips.delete("sat|" + s); state.skips.delete("sun|" + s); state.pinDay[s] = d;
        if (state.choice[d] === "custom" || PBY[state.choice[d]]) toast(`Added ${BY[s].name} to ${DAYS[d]}`);
      }
      if (a === "unpin") { state.pins.delete(s); delete state.pinDay[s]; }
      if (a === "skip") { state.skips.add(state.day + "|" + s); state.pins.delete(s); toast(`Removed ${BY[s].name} from ${DAYS[state.day]}`); }
      if (a === "unskip") { state.skips.delete("sat|" + s); state.skips.delete("sun|" + s); }
      map.closePopup();
      recompute(false);
      return;
    }
    const pl = ev.target.closest("[data-plan]");
    if (pl) {
      state.choice[state.day] = pl.dataset.plan; state.sel = null;
      recompute(true);
      document.querySelector(`.plan[data-plan="${pl.dataset.plan}"]`)?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
      return;
    }
    const f = ev.target.closest("[data-focus]");
    if (f) { showOnMap(f.dataset.focus); return; }
    const c = ev.target.closest("[data-card]");
    if (c) { selectStop(c.dataset.card, { scrollCard: true }); return; }
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
    if (d.open && !mobile()) focusLeg(i);
    if (d.open && mobile() && !d.querySelector(".map-btn")) {
      const btn = document.createElement("button");
      btn.className = "linkbtn map-btn"; btn.type = "button"; btn.textContent = "Show this trip on the map";
      btn.style.marginTop = "8px"; btn.onclick = () => focusLeg(i);
      d.appendChild(btn);
    }
  }, true);
  document.querySelectorAll(".day").forEach(t => t.addEventListener("click", () => {
    state.day = t.dataset.day; state.sel = null; save(); render(); fitDay();
    if (state.view !== "map") $("panel").scrollTop = 0;
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
    if (b.dataset.sv === "load") { applyCode(r.code); recompute(true); setView("plan"); toast(`Opened "${r.name}"`); }
    if (b.dataset.sv === "link") copy(shareUrl(r.code), `Link to "${r.name}" copied`);
    if (b.dataset.sv === "del") { store.set("saved", savedList().filter((_, i) => i !== +b.dataset.i)); renderSaved(); toast(`Deleted "${r.name}"`); }
  });
  $("banner-close").addEventListener("click", () => ($("banner").hidden = true));

  // Map cards on phones: the card you swipe to becomes the selected stop.
  let cardT;
  const onCardsScroll = () => {
    clearTimeout(cardT);
    cardT = setTimeout(() => {
      const box = $("cards").getBoundingClientRect();
      let best = null, bd = 1e9;
      document.querySelectorAll(".card").forEach(c => { const r = c.getBoundingClientRect(); const dd = Math.abs(r.left - box.left - 16); if (dd < bd) { bd = dd; best = c; } });
      if (best && best.dataset.card !== state.sel) selectStop(best.dataset.card, { pan: true });
    }, 140);
  };
  $("cards").addEventListener("scroll", onCardsScroll, { passive: true });
  $("cards").addEventListener("scrollend", onCardsScroll, { passive: true });

  let wasMobile = mobile();
  addEventListener("resize", () => {
    if (mobile() !== wasMobile) { wasMobile = mobile(); setView(wasMobile ? state.view : state.view === "map" ? "plan" : state.view); render(); }
    map.invalidateSize();
  });

  // A shared link replaces this browser's routes, and is kept under Saved weekends.
  if (location.hash.startsWith("#r=")) {
    const code = location.hash.slice(3);
    try {
      applyCode(code);
      $("banner").hidden = false;
      setTimeout(() => ($("banner").hidden = true), 9000);
      const list = savedList();
      if (!list.some(r => r.code === code)) {
        list.unshift({ name: `Shared route, opened ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`, code, summary: "Opened from a link" });
        store.set("saved", list.slice(0, 30));
      }
    } catch { toast("That share link is damaged, so your own routes are shown instead."); }
    history.replaceState(null, "", location.pathname);
  }
  renderSaved();
  setView("plan");
  recompute(true);
  syncStations();
})();
