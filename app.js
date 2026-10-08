(() => {
  const EV = window.OHNY;
  const BY = Object.fromEntries(EV.map(e => [e.slug, e]));
  const DAYS = { sat: "Saturday", sun: "Sunday" };
  const DAY_START = 9 * 60 + 45;
  const DAY_END = 19 * 60 + 40;
  const PACE = {
    relaxed: { dur: 1.2, max: 5 },
    standard: { dur: 1.0, max: 8 },
    packed: { dur: 0.85, max: 10 },
  };
  // Near-duplicates: once one is on a route, the other is worth much less.
  const TWINS = [
    ["610-loft-26", "620-loft-26"],
    ["navy-yard-26", "navy-yard-creative-26"],
    ["kingsland-wildflowers-26", "noo-arts-26"],
    ["sunset-park-open-studios-26", "spos-26"],
  ];
  const twinOf = {};
  TWINS.forEach(g => g.forEach(s => (twinOf[s] = g.filter(x => x !== s))));

  // ---------- state ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("odr:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("odr:" + k, JSON.stringify(v)); } catch {} },
  };
  const state = {
    day: store.get("day", "sat"),
    mix: store.get("mix", 60),
    mode: ["bus", "subway", "car"].includes(store.get("mode")) ? store.get("mode") : "bus",
    walky: store.get("walky", true),
    pace: store.get("pace", "standard"),
    pins: new Set(store.get("pins", [])),
    skips: new Set(store.get("skips", []).flatMap(k => (k.includes("|") ? [k] : ["sat|" + k, "sun|" + k]))),
    plan: { sat: [], sun: [] },
    choice: store.get("choice", { sat: "sat-uptown", sun: "sun-green" }),
    pinDay: store.get("pinDay", {}),
  };
  const save = () => {
    store.set("day", state.day); store.set("mix", state.mix); store.set("mode", state.mode);
    store.set("pace", state.pace); store.set("walky", state.walky); store.set("pins", [...state.pins]); store.set("skips", [...state.skips]); store.set("choice", state.choice); store.set("pinDay", state.pinDay);
  };

  // ---------- helpers ----------
  const fmt = m => {
    m = Math.round(m);
    const h = Math.floor(m / 60), mi = Math.round(m % 60);
    const ap = h >= 12 ? "PM" : "AM";
    const hh = ((h + 11) % 12) + 1;
    return `${hh}:${String(mi).padStart(2, "0")} ${ap}`;
  };
  const fmtShort = m => fmt(m).replace(":00", "").replace(" AM", "a").replace(" PM", "p");
  const dur = m => (m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`.replace(" 0 min", ""));
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const km = (a, b) => {
    const R = 6371, toR = x => (x * Math.PI) / 180;
    const dLa = toR(b.lat - a.lat), dLo = toR(b.lng - a.lng);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  // Real walk + subway (+ bus) times from MTA weekend schedules (see build/transit.py).
  const T = window.TRANSIT || null;
  const TIX = T ? Object.fromEntries(T.order.map((s, i) => [s, i])) : {};
  const BUFFER = 4; // minutes of slack on every transit leg: finding the entrance, a missed train
  const walkMin = (a, b) => (km(a, b) * 1000 * 1.25) / 78;
  function leg(a, b, day, mode = state.mode) {
    const direct = walkMin(a, b);
    const walkCap = state.walky ? 22 : 12;
    if (direct <= walkCap) return { min: direct + 1, how: "walk", steps: [["w", Math.round(direct)]] };
    if (mode === "car") return { min: 8 + km(a, b) * 1.3 * 2.1, how: "drive", steps: null };
    const M = T && T[`${day}-${mode}`];
    const i = TIX[a.slug], j = TIX[b.slug];
    const m = M && M.m[`${i},${j}`];
    if (m == null) return { min: 10 + km(a, b) * 1.3 * 2.7, how: "transit", steps: null };
    const raw = M.s[`${i},${j}`];
    const steps = raw ? raw.map(x => (x[0] === "w" ? x : [x[0], x[1], x[2], x[3], T.names[x[4]], T.names[x[5]], x[6], x[7], x[8]])) : [["w", m]];
    const walking = steps.every(x => x[0] === "w");
    // With "prefer walking", take a walk that costs at most 8 extra minutes over transit.
    if (!walking && state.walky && direct <= Math.min(30, m + 8)) return { min: direct + 1, how: "walk", steps: [["w", Math.round(direct)]] };
    return { min: walking ? m + 1 : m + BUFFER, how: walking ? "walk" : "transit", steps };
  }
  const gmaps = (a, b, how) =>
    `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${how === "walk" ? "walking" : how === "drive" ? "driving" : "transit"}`;
  const hoursOn = (e, day) => (e.win[day] || []).map(w => (w.fixed ? `${fmtShort(w.o)} tour` : `${fmtShort(w.o)}–${fmtShort(w.c)}`)).join(", ");

  function value(e) {
    const m = state.mix / 100;
    const base = e.score;
    const mine = e.pick ? 10.5 : e.rec ? base * 0.85 : base * 0.35;
    let v = (1 - m) * base + m * mine;
    if (state.pins.has(e.slug)) v += 100;
    return v;
  }

  const skipped = s => state.skips.has("sat|" + s) || state.skips.has("sun|" + s);

  // ---------- route solver: beam search over orderings with time windows ----------
  function slot(e, day, arrive, first) {
    const pace = PACE[state.pace];
    const len = e.dur * pace.dur + (e.lines ? 15 : 0); // time in line where the listing warns of one
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

  const ns_len = s => s.seq.length + 1;
  function solve(day, blocked) {
    const pace = PACE[state.pace];
    const cands = EV.filter(e => e.win[day] && !state.skips.has(day + "|" + e.slug) && !blocked.has(e.slug));
    const W = 280;
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
          const travel = s.travel + l.min, wait = s.wait + sl.wait;
          const val = s.val + v;
          const obj = val - travel / 12 - wait / 35 - 1.5 * ns_len(s);
          const ns = {
            seq: [...s.seq, e.slug], t: sl.end, last: e, val, travel, wait, obj,
            starts: [...s.starts, sl.start], ends: [...s.ends, sl.end], legs: [...s.legs, l],
          };
          const key = [...ns.seq].sort().join("|") + ">" + e.slug;
          const prev = next.get(key);
          if (!prev || prev.obj < obj) next.set(key, ns);
        }
      }
      if (!next.size) break;
      beam = [...next.values()].sort((a, b) => b.obj - a.obj).slice(0, W);
      if (beam[0].obj > best.obj) best = beam[0];
    }
    return best;
  }

  const PRESETS = window.PRESETS || [];
  const PBY = Object.fromEntries(PRESETS.map(p => [p.id, p]));

  // Times for a fixed, curated order. Late arrivals are flagged instead of dropped.
  function evalOrder(day, slugs) {
    const pace = PACE[state.pace];
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
        sl = { start, end: start + e.dur * pace.dur, wait: 0 };
        r.warn[s] = w ? `You'd arrive about ${fmt(arrive)}, and it closes at ${fmt(w.c)}${w.fixed ? " (tour starts " + fmt(w.o) + ")" : ""}.` : `Not open ${DAYS[day]}.`;
      }
      r.seq.push(s); r.starts.push(sl.start); r.ends.push(sl.end); r.legs.push(l);
      r.travel += l.min; r.wait += sl.wait; t = sl.end; last = e;
    }
    return r;
  }

  function solveWeekend() {
    const out = {}; const used = new Set();
    const custom = [];
    for (const d of ["sat", "sun"]) {
      const p = PBY[state.choice[d]];
      if (p && p.day === d) {
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
        out[d] = evalOrder(d, seq);
        out[d].seq.forEach(s => used.add(s));
      } else custom.push(d);
    }
    const run = order => {
      const o = {}; const u = new Set(used); let total = 0;
      for (const d of order) { const r = solve(d, u); r.seq.forEach(s => u.add(s)); o[d] = r; total += r.obj; }
      return { o, total };
    };
    if (custom.length) {
      const a = run(custom), b = custom.length > 1 ? run([...custom].reverse()) : a;
      Object.assign(out, (a.total >= b.total ? a : b).o);
    }
    state.plan = out;
  }

  // ---------- map ----------
  const map = L.map("map", { zoomControl: true, attributionControl: true }).setView([40.72, -73.95], 11);
  const dark = matchMedia("(prefers-color-scheme: dark)");
  let tiles;
  const setTiles = () => {
    if (tiles) return;
    tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, className: "basemap",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
  };
  setTiles();
  dark.addEventListener?.("change", () => render());

  const css = n => getComputedStyle(document.body).getPropertyValue(n).trim();
  const dotLayer = L.layerGroup().addTo(map);
  const routeLayer = L.layerGroup().addTo(map);
  const markers = {};

  // Small offsets so venues that share a building stay clickable.
  const seen = {};
  EV.forEach(e => {
    const k = e.lat.toFixed(4) + "," + e.lng.toFixed(4);
    const n = (seen[k] = (seen[k] || 0) + 1) - 1;
    e.mlat = e.lat + (n ? Math.sin(n * 2.1) * 0.0006 : 0);
    e.mlng = e.lng + (n ? Math.cos(n * 2.1) * 0.0008 : 0);
  });

  function popupHtml(e) {
    const day = state.day;
    const onRoute = state.plan[day]?.seq.includes(e.slug);
    const other = day === "sat" ? "sun" : "sat";
    const onOther = state.plan[other]?.seq.includes(e.slug);
    const hrs = ["sat", "sun"].filter(d => e.win[d]).map(d => `${DAYS[d]} ${hoursOn(e, d)}`).join("<br>") || "Friday only";
    const tags = [e.pick ? '<span class="tag pick">Your pick</span>' : "", e.rec ? '<span class="tag rec">My recommendation</span>' : "", e.ticketed ? '<span class="tag tix">Ticketed</span>' : ""].join("");
    let act;
    if (onRoute) act = `<button data-act="skip" data-slug="${e.slug}">Remove from route</button>`;
    else if (onOther) act = `<span>On your ${DAYS[other]} route</span>`;
    else if (e.win[day]) act = `<button data-act="pin" data-slug="${e.slug}">Add to ${DAYS[day]}</button>`;
    else act = `<span>Not open ${DAYS[day]}</span>`;
    return `<div class="pp"><h4>${esc(e.name)}</h4>
      <div class="meta">#${e.rank} of 131, ${esc(e.tier)}. ${esc(e.hood)}, ${esc(e.boro)}</div>
      ${tags ? `<div class="tags">${tags}</div>` : ""}
      <div class="hrs">${hrs}</div>
      <p>${esc(e.why)}</p>
      ${e.caveat ? `<div class="caveat">${esc(e.caveat)}</div>` : ""}
      <div class="acts">${act}<a href="${e.url}" target="_blank" rel="noopener">OHNY listing</a></div></div>`;
  }

  function drawDots() {
    dotLayer.clearLayers();
    const day = state.day;
    const onAny = new Set([...(state.plan.sat?.seq || []), ...(state.plan.sun?.seq || [])]);
    const tierR = { "Must-do": 7, Strong: 6, Good: 5, Fine: 4, Skip: 3.5 };
    EV.forEach(e => {
      if (onAny.has(e.slug)) return;
      const open = !!e.win[day];
      const col = e.pick ? css("--pick") : e.rec ? css("--rec") : css("--muted");
      const m = L.circleMarker([e.mlat, e.mlng], {
        radius: tierR[e.tier] + (e.pick ? 1 : 0),
        color: e.pick ? col : e.rec ? css("--ink") : col,
        weight: e.pick ? 3 : e.rec ? 1.5 : 1,
        fillColor: e.pick ? css("--paper") : col,
        fillOpacity: open ? (e.pick || e.rec ? 1 : 0.55) : 0.15,
        opacity: open ? 1 : 0.3,
      }).bindPopup(() => popupHtml(e), { maxWidth: 320 });
      m.bindTooltip(`#${e.rank} ${e.name}`, { direction: "top", offset: [0, -4] });
      m.addTo(dotLayer);
      markers[e.slug] = m;
    });
  }

  function drawRoute() {
    routeLayer.clearLayers();
    const day = state.day, other = day === "sat" ? "sun" : "sat";
    const color = css(day === "sat" ? "--sat" : "--sun");
    const ocolor = css(other === "sat" ? "--sat" : "--sun");
    const o = state.plan[other];
    if (o && o.seq.length) {
      const pts = o.seq.map(s => [BY[s].mlat, BY[s].mlng]);
      L.polyline(pts, { color: ocolor, weight: 3, opacity: 0.35, dashArray: "6 8" }).addTo(routeLayer);
      o.seq.forEach((s, i) => {
        const e = BY[s];
        const mk = L.marker([e.mlat, e.mlng], {
          icon: L.divIcon({ className: "", html: `<div class="num-icon other-day" style="border-color:${ocolor}">${i + 1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
          zIndexOffset: 100,
        }).bindPopup(() => popupHtml(e), { maxWidth: 320 }).addTo(routeLayer);
        markers[s] = mk;
      });
    }
    const p = state.plan[day];
    if (!p || !p.seq.length) return;
    const pts = p.seq.map(s => [BY[s].mlat, BY[s].mlng]);
    L.polyline(pts, { color: css("--paper"), weight: 11, opacity: 0.95 }).addTo(routeLayer);
    L.polyline(pts, { color, weight: 6, opacity: 1 }).addTo(routeLayer);
    p.seq.forEach((s, i) => {
      const e = BY[s];
      const mk = L.marker([e.mlat, e.mlng], {
        icon: L.divIcon({ className: "", html: `<div class="num-icon">${i + 1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
        zIndexOffset: 1000,
      }).bindPopup(() => popupHtml(e), { maxWidth: 320 }).addTo(routeLayer);
      mk.bindTooltip(`${fmt(p.starts[i])} ${e.name}`, { direction: "top", offset: [0, -14] });
      markers[s] = mk;
    });
  }

  let fitted = {};
  function fitDay() {
    const p = state.plan[state.day];
    if (!p || !p.seq.length) return;
    const b = L.latLngBounds(p.seq.map(s => [BY[s].mlat, BY[s].mlng]));
    map.fitBounds(b.pad(0.25), { maxZoom: 14 });
  }

  // ---------- panel ----------
  const $ = id => document.getElementById(id);

  function nearby(e, day, used) {
    return EV.filter(o => o.slug !== e.slug && o.win[day] && !used.has(o.slug) && !state.skips.has(day + "|" + o.slug) && km(e, o) < 1.2)
      .sort((a, b) => value(b) - value(a))
      .slice(0, 3);
  }

  function renderLine() {
    const day = state.day, p = state.plan[day];
    const used = new Set([...(state.plan.sat?.seq || []), ...(state.plan.sun?.seq || [])]);
    if (!p || !p.seq.length) {
      $("line").innerHTML = `<p class="empty">Nothing fits ${DAYS[day]} with these settings. Try a faster pace or clear your skips.</p>`;
      return;
    }
    let h = "";
    p.seq.forEach((s, i) => {
      const e = BY[s];
      if (i > 0) {
        const l = p.legs[i], a = BY[p.seq[i - 1]];
        const arrive = p.ends[i - 1] + l.min;
        const wait = p.starts[i] - arrive;
        const verb = l.how === "walk" ? "walk" : l.how === "drive" ? "drive" : l.steps && l.steps.some(x => x[0] === "r" && x[1] === "b") ? "by transit" : "by subway";
        h += `<div class="leg"><div></div><div class="rail"></div><div class="txt">
          <div class="leg-head"><strong>${Math.round(l.min)} min</strong> ${verb}
            <a href="${gmaps(a, e, l.how)}" target="_blank" rel="noopener">Open in Google Maps</a></div>
          ${l.steps && l.how !== "walk" ? `<ol class="steps">${stepsHtml(l.steps)}</ol>` : ""}
          ${wait > 8 ? `<div class="wait">Then ${Math.round(wait)} min until it opens</div>` : ""}</div></div>`;
      }
      const tags = [
        e.pick ? '<span class="tag pick">Your pick</span>' : "",
        e.rec ? '<span class="tag rec">My recommendation</span>' : "",
        `<span class="tag">#${e.rank} ${esc(e.tier)}</span>`,
        e.ticketed ? '<span class="tag tix">Ticketed, book ahead</span>' : "",
        state.pins.has(s) ? '<span class="tag">Pinned</span>' : "",
      ].join("");
      const nb = nearby(e, day, used);
      const tix = (e.win[day] || []).find(w => w.fixed && w.o === p.starts[i]);
      h += `<article class="stop ${i === p.seq.length - 1 ? "last" : ""}">
        <div class="time">${fmt(p.starts[i]).replace(" ", "&nbsp;")}<small>until ${fmtShort(p.ends[i])}</small></div>
        <div class="rail"><div class="dot">${i + 1}</div></div>
        <div class="body">
          <h3 data-fly="${s}">${esc(e.name)}</h3>
          <div class="where">${esc(e.hood)}, ${esc(e.boro)}. Open ${hoursOn(e, day)}</div>
          <div class="tags">${tags}</div>
          <p class="why">${esc(e.why)}</p>
          ${p.warn && p.warn[s] ? `<div class="late">Timing problem: ${esc(p.warn[s])} Skip it or pick another plan.</div>` : ""}
          ${e.caveat ? `<div class="caveat">${esc(e.caveat)}</div>` : ""}
          <div class="acts">
            <button data-act="skip" data-slug="${s}">Skip this</button>
            ${state.pins.has(s) ? `<button data-act="unpin" data-slug="${s}">Unpin</button>` : `<button data-act="pin" data-slug="${s}">Pin it</button>`}
            ${tix ? `<a href="${tix.url}" target="_blank" rel="noopener">Get tickets</a>` : ""}
            <a href="${e.url}" target="_blank" rel="noopener">OHNY listing</a>
          </div>
          ${nb.length ? `<div class="near"><div class="near-h">Also within a short walk</div>${nb.map(o => `
            <div class="near-item"><span class="nm">${esc(o.name)}${o.pick ? ' <span class="mark-pick">your pick</span>' : ""}</span>
            <span class="rk">#${o.rank}, ${hoursOn(o, day)}</span>
            <button data-act="pin" data-slug="${o.slug}" aria-label="Add ${esc(o.name)}">Add</button></div>`).join("")}</div>` : ""}
        </div></article>`;
    });
    $("line").innerHTML = h;
  }

  const bullet = x => x[1] === "s"
    ? `<span class="sb" style="--c:#${x[3] || "808183"};color:${(x[3] || "").toUpperCase() === "F6BC26" ? "#111" : "#fff"}">${esc(x[2].replace(/X$/, ""))}</span>`
    : `<span class="bb" style="--c:#${x[3] || "006CB7"}">${esc(x[2])}</span>`;
  const title = t => t.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/\bAv\b/g, "Av");
  function stepsHtml(steps) {
    return steps.map(x => x[0] === "w"
      ? `<li class="st-walk">Walk ${x[1]} min</li>`
      : `<li>${bullet(x)} <span>${esc(x[1] === "b" ? title(x[4]) : x[4])} to ${esc(x[1] === "b" ? title(x[5]) : x[5])}, ${x[6]} stop${x[6] === 1 ? "" : "s"}, ${x[7]} min${x[8] >= 6 ? ` <em>(runs about every ${x[8] * 2} min)</em>` : ""}</span></li>`).join("");
  }
  const stepsText = steps => (steps || []).map(x => x[0] === "w" ? `walk ${x[1]} min` : `${x[2]}${x[1] === "s" ? " train" : " bus"} ${x[1] === "b" ? title(x[4]) : x[4]} to ${x[1] === "b" ? title(x[5]) : x[5]} (${x[6]} stops)`).join(", then ");

  function renderSummary() {
    const day = state.day, p = state.plan[day];
    ["sat", "sun"].forEach(d => {
      const q = state.plan[d];
      $("meta-" + d).textContent = q && q.seq.length ? `${q.seq.length} stops, ${fmtShort(q.starts[0])} to ${fmtShort(q.ends[q.ends.length - 1])}` : "No stops";
    });
    if (!p || !p.seq.length) { $("summary").innerHTML = ""; return; }
    const picks = p.seq.filter(s => BY[s].pick).length;
    const top = p.seq.filter(s => BY[s].rank <= 30).length;
    const inside = p.ends.reduce((a, e, i) => a + (e - p.starts[i]), 0);
    $("summary").innerHTML = `
      <div><b>${p.seq.length}</b>stops</div>
      <div><b>${dur(inside)}</b>inside</div>
      <div><b>${dur(p.travel)}</b>getting there</div>
      <div><b>${picks}</b>of your picks</div>
      <div><b>${top}</b>from my top 30</div>`;
  }

  function renderLeftover() {
    const used = new Set([...(state.plan.sat?.seq || []), ...(state.plan.sun?.seq || [])]);
    const left = EV.filter(e => (e.pick || e.rec) && !used.has(e.slug));
    if (!left.length) { $("leftover").innerHTML = `<h2>Everything made it</h2><p class="note">All your picks and my recommendations are on a route.</p>`; return; }
    const reason = e => {
      if (skipped(e.slug)) return "You skipped it.";
      const days = ["sat", "sun"].filter(d => e.win[d]);
      const when = days.map(d => `${DAYS[d]} ${hoursOn(e, d)}`).join("; ");
      return `Open ${when}.`;
    };
    const order = arr => arr.sort((a, b) => (b.pick - a.pick) || a.rank - b.rank);
    const swaps = e => {
      if (state.choice.sat !== "custom" || state.choice.sun !== "custom") return "";
      if (skipped(e.slug) || !(e.win.sat || e.win.sun)) return "";
      const saved = state.plan;
      state.pins.add(e.slug); solveWeekend(); const alt = state.plan; state.pins.delete(e.slug); state.plan = saved;
      const altSet = new Set([...(alt.sat?.seq || []), ...(alt.sun?.seq || [])]);
      if (!altSet.has(e.slug)) return " It can't fit any route with these settings.";
      const lost = [...used].filter(s => !altSet.has(s)).map(s => BY[s].name);
      const day = alt.sat?.seq.includes(e.slug) ? "Saturday" : "Sunday";
      return lost.length ? ` Pinning it puts it on ${day} and drops ${lost.join(", ")}.` : ` Pinning it fits on ${day} without dropping anything.`;
    };
    $("leftover").innerHTML = `<h2>Didn't make the cut</h2>
      <p class="note">${state.choice.sat === "custom" && state.choice.sun === "custom" ? "Pin any of these and the route rebuilds around it." : "Pin any of these to slot it into the current plan at the point that costs the least travel."}</p>
      ${order(left).map(e => `<div class="lo"><span><strong data-fly="${e.slug}" style="cursor:pointer">${esc(e.name)}</strong>
        ${e.pick ? '<span class="mark-pick">your pick</span>' : '<span class="mark-rec">my rec</span>'}</span>
        ${skipped(e.slug) ? `<button data-act="unskip" data-slug="${e.slug}">Restore</button>` : `<button data-act="pin" data-slug="${e.slug}">Pin it</button>`}
        <span class="why2">#${e.rank}. ${esc(reason(e))}${e.pick ? esc(swaps(e)) : ""}</span></div>`).join("")}`;
  }

  function renderCatalog() {
    const q = $("q").value.trim().toLowerCase();
    const openOnly = $("openonly").checked;
    const day = state.day;
    const onDay = new Set(state.plan[day]?.seq || []);
    const rows = EV.filter(e => (!openOnly || e.win[day]) && (!q || (e.name + " " + e.hood + " " + e.boro).toLowerCase().includes(q)));
    $("catalog").innerHTML = rows.map(e => `<li class="cat ${onDay.has(e.slug) ? "on-route" : ""}">
      <span class="n">${e.rank}</span>
      <span class="nm" data-fly="${e.slug}">${esc(e.name)} ${e.pick ? '<span class="mark-pick">your pick</span>' : ""}${e.rec ? '<span class="mark-rec">my rec</span>' : ""}
        <small>${esc(e.hood)}, ${esc(e.boro)}. ${["sat", "sun"].filter(d => e.win[d]).map(d => `${DAYS[d].slice(0, 3)} ${hoursOn(e, d)}`).join("; ") || "Friday only"}</small></span>
      <span class="tier tier-${e.tier}">${esc(e.tier)}</span></li>`).join("") || `<li class="empty">No events match "${esc(q)}".</li>`;
  }

  function renderPlans() {
    const day = state.day;
    const list = PRESETS.filter(p => p.day === day);
    const cur = state.choice[day];
    const card = p => {
      const picks = p.stops.filter(s => BY[s].pick).length;
      const top = p.stops.filter(s => BY[s].rank <= 30).length;
      const r = evalOrder(day, p.stops);
      const bad = Object.keys(r.warn).length;
      const walkMins = r.legs.reduce((a, l) => a + (l.how === "walk" ? l.min : (l.steps || []).filter(x => x[0] === "w").reduce((b, x) => b + x[1], 0)), 0);
      const check = bad
        ? `<span class="chk-bad">${bad} stop${bad > 1 ? "s" : ""} won't fit with these settings</span>`
        : `<span class="chk-ok">Fits, ${fmtShort(r.starts[0])} to ${fmtShort(r.ends[r.ends.length - 1])}. ${dur(r.travel)} between stops, ${dur(walkMins)} of it walking</span>`;
      return `<button type="button" class="plan ${cur === p.id ? "on" : ""}" data-plan="${p.id}" aria-pressed="${cur === p.id}">
        <span class="plan-name">${esc(p.name)}</span>
        <span class="plan-meta">${p.stops.length} stops, ${picks} of your picks, ${top} from my top 30</span>
        ${check}
        <span class="plan-blurb">${esc(p.blurb)}</span></button>`;
    };
    $("plans").innerHTML = `<h2>${DAYS[day]} plans</h2><div class="plan-list">${list.map(card).join("")}
      <button type="button" class="plan ${cur === "custom" ? "on" : ""}" data-plan="custom" aria-pressed="${cur === "custom"}">
        <span class="plan-name">Build my own</span>
        <span class="plan-meta">Optimizer picks stops and order</span>
        <span class="plan-blurb">Balances your picks against my rankings, opening hours and travel time. Use the settings below to steer it.</span></button></div>`;
    $("mix-ctl").hidden = cur !== "custom";
  }

  function render() {
    document.body.classList.toggle("is-sun", state.day === "sun");
    ["sat", "sun"].forEach(d => $("tab-" + d).setAttribute("aria-selected", String(state.day === d)));
    $("mix").value = state.mix; $("mode").value = state.mode; $("pace").value = state.pace; $("walky").checked = state.walky;
    const m = state.mix;
    $("mix-read").textContent = m <= 20 ? "Mostly my rankings" : m >= 80 ? "Mostly your picks" : "A blend of both";
    renderPlans(); renderSummary(); renderLine(); renderLeftover(); renderCatalog();
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
    if (o.pc) state.pace = o.pc;
    if (o.x != null) state.mix = o.x;
    state.pins = new Set((o.p || []).map(([s]) => long(s)).filter(s => BY[s]));
    state.pinDay = Object.fromEntries((o.p || []).filter(([s, d]) => BY[long(s)] && d).map(([s, d]) => [long(s), d]));
    state.skips = new Set((o.s || []).map(long).flatMap(k => (k.includes("|") ? [k] : ["sat|" + k, "sun|" + k])).filter(k => BY[k.split("|").pop()]));
  }
  const shareUrl = () => `${location.origin}${location.pathname}#r=${encodeState()}`;

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2400);
  }
  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); toast(done); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast(done); } catch { toast("Copy failed. Select the text and copy it yourself."); }
      ta.remove();
    }
  }
  function itineraryText() {
    const lines = ["OHNY Weekend, Oct 17-18, 2026", ""];
    for (const d of ["sat", "sun"]) {
      const p = state.plan[d];
      const name = PBY[state.choice[d]]?.name || "Custom route";
      lines.push(`${DAYS[d].toUpperCase()}: ${name}`);
      if (!p || !p.seq.length) { lines.push("  Nothing planned", ""); continue; }
      p.seq.forEach((s, i) => {
        const e = BY[s];
        if (i > 0) {
          const l = p.legs[i];
          lines.push(`     ↓ ${Math.round(l.min)} min: ${l.how === "walk" ? "walk" : stepsText(l.steps) || "transit"}`);
        }
        lines.push(`  ${fmt(p.starts[i])}  ${e.name}${e.ticketed ? " (ticketed)" : ""}`);
        lines.push(`           ${e.addr ? e.addr + ", " : ""}${e.hood}, ${e.boro}. Open ${hoursOn(e, d)}`);
      });
      lines.push("");
    }
    lines.push("Open the interactive version: " + shareUrl());
    return lines.join("\n");
  }

  const savedList = () => store.get("saved", []);
  function renderSaved() {
    const list = savedList();
    $("saved-list").innerHTML = list.length ? list.map((r, i) => `<li>
        <span class="sv-name">${esc(r.name)}</span>
        <span class="sv-meta">${esc(r.summary || "")}</span>
        <span class="sv-acts"><button data-sv="load" data-i="${i}">Open</button><button data-sv="link" data-i="${i}">Copy link</button><button data-sv="del" data-i="${i}">Delete</button></span>
      </li>`).join("") : `<li class="sv-empty">Nothing saved yet. Name this weekend and save it to keep a copy you can come back to.</li>`;
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
      if (a === "pin") { state.pins.add(s); state.skips.delete("sat|" + s); state.skips.delete("sun|" + s); state.pinDay[s] = BY[s].win[state.day] ? state.day : (state.day === "sat" ? "sun" : "sat"); }
      if (a === "unpin") { state.pins.delete(s); delete state.pinDay[s]; }
      if (a === "skip") { state.skips.add(state.day + "|" + s); state.pins.delete(s); }
      if (a === "unskip") { state.skips.delete("sat|" + s); state.skips.delete("sun|" + s); }
      map.closePopup();
      recompute(false);
      return;
    }
    const pl = ev.target.closest("[data-plan]");
    if (pl) { state.choice[state.day] = pl.dataset.plan; recompute(true); return; }
    const f = ev.target.closest("[data-fly]");
    if (f) {
      const e = BY[f.dataset.fly];
      map.flyTo([e.mlat, e.mlng], Math.max(map.getZoom(), 14), { duration: 0.6 });
      setTimeout(() => markers[e.slug]?.openPopup(), 650);
      if (matchMedia("(max-width: 860px)").matches) document.querySelector(".mapwrap").scrollIntoView({ behavior: "smooth" });
    }
  });
  document.querySelectorAll(".day").forEach(t => t.addEventListener("click", () => { state.day = t.dataset.day; save(); render(); fitDay(); }));
  let mixT;
  $("mix").addEventListener("input", e => { state.mix = +e.target.value; clearTimeout(mixT); mixT = setTimeout(() => recompute(false), 120); });
  $("mode").addEventListener("change", e => { state.mode = e.target.value; recompute(false); });
  $("pace").addEventListener("change", e => { state.pace = e.target.value; recompute(false); });
  $("walky").addEventListener("change", e => { state.walky = e.target.checked; recompute(false); });
  $("reset").addEventListener("click", () => { state.pins.clear(); state.skips.clear(); state.pinDay = {}; recompute(true); });
  $("q").addEventListener("input", renderCatalog);
  $("openonly").addEventListener("change", renderCatalog);

  $("share-link").addEventListener("click", () => copy(shareUrl(), "Link copied. Anyone who opens it sees these exact routes."));
  $("share-text").addEventListener("click", () => copy(itineraryText(), "Itinerary copied. Paste it into a text or note."));
  $("save-btn").addEventListener("click", saveCurrent);
  $("save-name").addEventListener("keydown", e => { if (e.key === "Enter") saveCurrent(); });
  $("saved-list").addEventListener("click", ev => {
    const b = ev.target.closest("[data-sv]"); if (!b) return;
    const r = savedList()[+b.dataset.i]; if (!r) return;
    if (b.dataset.sv === "load") { applyCode(r.code); recompute(true); toast(`Opened "${r.name}"`); }
    if (b.dataset.sv === "link") copy(`${location.origin}${location.pathname}#r=${r.code}`, `Link to "${r.name}" copied`);
    if (b.dataset.sv === "del") { store.set("saved", savedList().filter((_, i) => i !== +b.dataset.i)); renderSaved(); toast(`Deleted "${r.name}"`); }
  });
  $("banner-close").addEventListener("click", () => ($("banner").hidden = true));

  // A shared link replaces this browser's current routes, then is saved like any other change.
  if (location.hash.startsWith("#r=")) {
    try {
      applyCode(location.hash.slice(3));
      $("banner").hidden = false;
      const list = savedList();
      if (!list.some(r => r.code === location.hash.slice(3))) {
        list.unshift({ name: `Shared route (opened ${new Date().toLocaleDateString()})`, code: location.hash.slice(3), summary: "Opened from a link" });
        store.set("saved", list.slice(0, 30));
      }
    } catch { toast("That share link is damaged, so your own routes are shown instead."); }
    history.replaceState(null, "", location.pathname);
  }
  renderSaved();
  recompute(true);
})();
