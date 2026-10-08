# Open Doors Route — Design Language

Authored by Fable (design director), 2026-10-08. This is the binding visual authority for the site. Project deviations are listed at the end.

## 1. Concept

Modern NYC is not a motif; it is a *method*. The city's best-designed objects — Unimark's 1970 Graphics Standards Manual, the 1972 Vignelli diagram, WalkNYC's pedestrian maps, Pentagram's civic identities — share one idea: the information **is** the aesthetic. Black sign, white Standard-grotesk type, one colored bullet, a modular grid, and nothing that does not carry meaning. This product borrows exactly two elements from that system — the black station sign and the colored line bullet — and makes everything else neutral so that the transit colors on the map are the only hues with meaning. **The header stays a black sign.** It is the one legitimately modern, functional NYC object (it tells you where you are), and it earns its place by *working*: see Signature 2. Everything else is grey, white and ink, set with the discipline of a timetable.

## 2. Color

| Token | Light | Dark |
|---|---|---|
| canvas | #F2F2F0 | #121212 |
| surface | #FFFFFF | #1A1A1A |
| surface-raised | #FFFFFF + shadow | #222222 + shadow |
| ink | #141414 | #F2F2F0 |
| text-secondary | #6B6B68 | #9A9A96 |
| hairline | #DEDEDA | #2E2E2C |
| focus | #141414, 2px ring, 2px offset | #F2F2F0, same |
| day-sat | #0039A6 (same both modes) | |
| day-sun | #00933C (same both modes) | |
| warning / late | #B42318 text on #FEF3F2 | #F97066 on #2A1512 |
| success | ink-on-surface toast with a check glyph, no hue | |

**Rules.** Day colors appear only inside a round bullet: the header toggle, the share card, the saved-weekends list. Never as text, backgrounds, borders or on the map. Warning appears only on time text ("Closes 4:00 — you arrive 4:10") and the Late tag; never on the map. Success has no hue.

**Retire #B933AD and #FCCC0A as semantic tokens.** On the map they already mean the 7 and N/Q/R/W; any other use teaches the user a lie. Picks and recommendations are encoded by *weight and shape*, not hue: picks = ink-filled marker / filled bookmark glyph; recommendations = ink ring / "Recommended" outline chip; everything else = secondary. MTA line colors are permitted in exactly three places: map network and ride lines, inline line bullets, and the colored segments of the strip-map rail. Nowhere else.

## 3. Typography

Keep **Schibsted Grotesk** (UI) and **Newsreader** (descriptions only, ≥15px, never in chrome). Load Schibsted 400/500/600 and Newsreader 400/400i.

| Role | Face | Size/Line | Weight | Tracking |
|---|---|---|---|---|
| App title (sign) | Schibsted | 17/20 | 600 | 0 |
| Section heading | Schibsted | 15/20 | 600 | 0 |
| Stop name | Schibsted | 17/22 | 600 | −0.01em |
| Time | Schibsted | 15/20, tabular | 500 | 0 |
| Body / description | Newsreader | 16/24 | 400 | 0 |
| Metadata (legs, addresses) | Schibsted | 13/18 | 400 | 0 |
| Labels / tabs / chips | Schibsted | 12/16 | 500 | +0.01em |
| Stat numerals | Schibsted | 28/32, tabular | 500 | −0.02em; unit 12/16 secondary |
| Map labels / tooltips | Schibsted | 12/14; station labels 11/14 | 500 / 400 | 0 |

**Case:** sentence case everywhere. All-caps is allowed only for the 3-letter day in the header ("SAT") and letters inside line bullets. **Numerals:** `font-variant-numeric: tabular-nums` on every time, count and stat. Times are 12-hour, "10:30"; the "am/pm" suffix (11px, secondary, lowercase) appears only on the day's first time and when crossing noon. Durations are "4 min", "1 h 10". **Stations** are set exactly as the MTA writes them — "135 St", "Euclid Av", "Jay St-MetroTech" — never expanded. Line bullets inline: 16px circle, 11px 700 letter, white on line color (black on #FCCC0A). Direction legs read: `C toward Euclid Av · 9 stops · 18 min`.

## 4. Layout & structure

- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 64. Gutter 16 phone / 24 laptop.
- **Grid:** laptop ≥1024: 420px itinerary column + fluid map, max 1440. Phone: single column, map full-bleed.
- **Radii:** 0 header; 6 cards, buttons, popups, map cards; 4 chips, tooltips; 999 bullets and stop markers only. Nothing above 8.
- **Borders vs shadows:** hairline 1px borders for everything in flow. Shadows only on things floating over the map: `0 1px 2px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.12)` (dark: alphas .4/.5).
- **Strip-map rail:** 32px column, 3px line centered. Stop node = 22px circle, surface fill, 3px ink ring, 11px 700 numeral; the next stop is ink-filled with surface numeral; visited stops ring in secondary. The rail segment between stops *is* the leg: walking = 3px dotted secondary (`dasharray 0 7`, round caps); train = 3px solid in line color; transfer = 6px surface dot with 2px ink ring on the rail. Leg text sits right of the rail in metadata type, 8px below the stop block.
- **Plan picker:** six cards (five plans + "Build one for me"), horizontal scroll on phone, 3×2 on laptop. Each: name (stop-name style), a 4px-tall mini-rail of colored segments proportional to minutes (walk = secondary), stats line "6 stops · 5.2 mi · 11:00–6:30". Selected = 2px ink border; others hairline. No images.
- **Chips:** 28px tall, 4px radius, hairline, 12px label; active = ink fill, surface text.
- **Buttons:** 40px (48 on phone), 6px radius, 14px 500. Primary ink/surface. Secondary surface + hairline + ink text. Text button ink, underline on hover.
- **Bottom tab bar:** 56px + safe-area, surface, hairline top, no blur. 22px icons at 1.5px stroke, 11px labels. Active = ink, icon filled; inactive = secondary.
- **Map cards (phone):** width 100%−32, 120px tall, 16px above tab bar, raised shadow. Left: 22px numbered node; right: stop name, time, one-line next leg.
- **Popups:** 12px padding, 6px radius, 8px tip, raised shadow. **Tooltips:** 11/14 500, surface + hairline, 4px radius, no arrow.

## 5. Map

- **Basemap:** quiet gray canvas without labels, with a labels-only layer as a pane *above* the route layers so street names never hide under a ride line.
- **Network:** 2px (z<13) / 3px (z≥13), official line colors at 45% (light) / 55% (dark). No casing. Shared trunks drawn once.
- **Ride line:** 6px line color at 100% over a 9px casing in canvas. Real track geometry.
- **Walking:** 3px ink, `dashArray "0 8"`, round caps.
- **Stop markers:** 24px ink circle, 12px 700 surface numeral, 2px surface ring. Selected: 30px.
- **Stations:** draw only boarding, alighting and transfer: 8px surface circle, 2px ring in line color (ink for transfers), label 11px 500 ink with 2px canvas halo. Intermediate stations are not drawn.
- **Other events:** 6px, secondary at 70%, 1px surface ring. Hover 8px ink. Picks not on route: 9px ink ring, surface fill. Selected: 10px ink fill + label.
- **Other-day route:** 3px ink at 25%, `dashArray "6 4"`, no stops, no casing; tap offers "Switch to Sunday".
- **You:** 10px ink dot, 2px surface ring, 24px halo of ink at 15%. No pulse.

## 6. Signature moments

1. **One encoding, two views.** The itinerary rail and the map use identical grammar — line-colored rides, dotted walks, numbered nodes. The rail is a strip map; the map is the rail unfolded.
2. **The sign is live.** On phones, while following a route, the black header changes from the app title to the next stop, exactly like a station sign: `3 · The Brooklyn Navy Yard · 12:40` with the day bullet at right. Scrolling back to the top restores the title.

**Never:** (1) a hue outside MTA line colors for anything that is not a day bullet or a warning; (2) all-caps or letterspaced display text; (3) a radius above 8px or a pill on anything but bullets; (4) a shadow on an in-flow element or any blur/glass; (5) a line color on an element that is not that line — no purple picks, no yellow recommendations, no colored section headers.

## 7. Motion

- **Stop card swipe / map follow:** card translates 240ms `cubic-bezier(0.2, 0, 0, 1)`; map `panTo` 400ms, no zoom change.
- **Day toggle:** itinerary and route crossfade 160ms ease-out; nothing slides.

Everything else is instant or a 120ms opacity. `prefers-reduced-motion` sets all to 0ms.

## Project deviations and owner feedback

- **Basemap:** CARTO now requires an API key, so the site uses Esri World Light/Dark Gray Canvas Base with the matching Reference (labels) layer in a pane above the routes. Same intent as §5.
- **Owner rejected** decorative subway-mosaic tiles as kitsch (2026-10-08). No costume NYC: no tiles, taxi yellow, skylines, MetroCards, marquee lights, neon, gradients, glass.
- "You" location dot is out of scope (the site has no geolocation).
- **Tabular numerals (2026-10-08, implementation):** Schibsted Grotesk's `tnum` also sets the colon and period to figure width, so times read "10 : 00" and distances "15 . 1". Tabular figures are kept on punctuation-free numerals (stats, stop nodes, ranks); times and distances use the default figures. The rail's time column is right-aligned, so times still line up.
- **Plan picker names on the laptop 3×2 grid** are 15/20 (section-heading size) instead of 17/22: each card is about 118px wide in the 420px column, and 17px breaks most plan names onto four lines. Phones keep 17/22.
- **Picks vs recommendations off the route (§5 vs §2):** §5 gives picks "9px ink ring, surface fill", which is the §2 encoding for recommendations. The map follows §2 so one encoding holds everywhere: picks = 9px ink fill, recommendations = 9px ink ring on surface.
- **Station labels** on the route show at zoom ≥14 and always on a focused leg; at city zoom they would collide with each other and the stop markers. The station circles always show.
- **Schibsted 700 is loaded (2026-10-08, round 2):** §3 loads 400/500/600 but specifies 700 for bullet letters, stop-node numerals and map-marker numerals. Without the 700 file the browser synthesizes bold and smears 11–12px numerals. 700 is loaded and used only for those glyphs.
- **Frozen data copy is normalized at render time:** data.js is not edited, so app.js lowercases "2 PM" to "2 pm" in descriptions and caveats, and sets two all-caps ship names in sentence case (Mary A. Whalen, Lilac). Acronyms (CCNY, NYPL, MADE) stay as written.
- **Rank is metadata, not a tag:** the route and popups show "Ranked #N" in the metadata line; tier words ("Strong", "Fine") appear only in the All events side column, where they are a sort key.
- **Line-bullet letters (2026-10-08, round 3; revised round 4):** §3 says white on line color, black only on #FCCC0A. The data ships its own hexes (B/D/F/M #EB6800, G #799534, L/S #7C858C, buses from GTFS), so letter color is chosen by luminance, not a hex list: black when relative luminance is above 0.22 (white under about 3.8:1). That puts black on orange (3.2:1 white), G (3.4:1), L/S (3.8:1), yellow and light bus colors such as B103 #FAA61A (bus tags follow the same rule). Red 1/2/3 and green 4/5/6 keep white at 4.0:1, which passes the 3:1 floor for 700-weight glyphs inside a graphic. In dark mode every line bullet carries a 1px 18% white outline so dark lines (A/C/E, J/Z) keep their edge on #1A1A1A.
- **Day-bullet numerals are 19px (round 3):** white on #00933C is 4.0:1, and §2 fixes the color, so the header numerals are sized as AA large text (≥18.67px bold) in a 32px (30px phone) bullet. The 22px and 16px bullets are aria-hidden and sit beside the day's name.
- **Form-field outline token (round 3):** inputs and selects use `--control` (#8A8A86 light, #737370 dark, about 3.5:1) instead of the hairline, for WCAG 1.4.11. Buttons, chips and cards keep hairlines; their labels identify them.
- **Dwell and leg are two parts of the rail (round 7, supersedes the round-4 note below):** on phones a stop description runs 200–400px, and a ride drawn beside it said "riding" while you read about the stop. The rail now draws a 1px `--control` stem beside the stop body (time at the stop: no movement, so no track weight, the same grammar as the wait hairline) and the leg's walks, rides and transfers only beside the leg text, ending at the next node. Everything between two nodes is still the stop's time plus its leg.
- **Rail connector removed (round 4):** the round-3 neutral connector beside each stop body is gone. The leg's track now runs from 3px under one node to the next node, split by minutes, so everything between two nodes is the leg, as on the map. Time to spare before a stop opens is a 1px `--control` hairline at the end of the track (no movement, so no track weight).
- **Rail walks are ink, rides are 5px (round 4):** §4 gives the rail walk as dotted secondary; §5 draws walks as ink dots at an 8px pitch. The rail follows §5 (ink, 3px dots, 8px pitch) so one encoding holds in both views. Rides on the rail are 5px against the 3px walk, mirroring the map's 6px ride over a 3px walk. The 4px plan-picker mini-rail keeps secondary walks.
- **Transfer glyph (round 4):** the map now draws a transfer station as §5 says (surface circle, 2px ink ring, 10px), which is the same glyph as the rail's transfer ring. The rail draws a transfer only where the map merges the two stations (alight and board within 0.25 km); a change across a longer walk is a dotted walk between two rides, as on the map.
- **Estimated legs (round 4):** a leg without step data is a dashed ink line at 50% (8 on, 6 off) on both the rail and the map.
- **Selected vs next (round 4):** only the next stop's node is ink-filled. A selected stop takes the map's selection grammar, a surface gap and an ink outer ring. Legs out of visited stops fade to 35%.
- **Dark ride casing (round 3):** in dark mode the 9px ride casing is #3A3A38 instead of canvas, so dark line colors (#0039A6, J/Z brown) get a lifted edge on the dark basemap. A focused leg dims the network pane to 35%.
- **Map halo and casing are map tokens (round 5):** "canvas" in §5's station-label halo means the map's land, not the app canvas. `--map-halo` is #ECECEA light and #2C2C2E dark, and the selected-event label uses the same halo. The ride casing is `--ride-casing` (canvas in light, #3A3A38 in dark).
- **Dark basemap is darkened (round 5):** Esri's dark land (#4C4C4E) sits far above the #121212 UI, so in dark mode only the base tile pane gets `brightness(.62) contrast(1.08)`. The labels pane is left unfiltered.
- **Whole zoom levels (round 5):** the map snaps to integer zooms (zoomSnap 1), so the raster tiles and their labels always draw 1:1, with no seams or resampled names. Fits are slightly looser as a result.
- **Street names at walking zoom (round 5):** the keyless Esri Gray Reference layer has few or no street labels at z13–16, so §5's "street names never hide" rule mostly protects place names. At z≥14 that pane drops to 70% (75% dark) so the route leads. Walks have no street geometry and are framed at z14 at most as a schematic connection. The rail's "Walking directions in Google Maps" link gives the real path.
- **Leg totals lead (round 5):** the rail and the map card put the leg's total, door to door, first ("38 min · [C] toward Euclid Av · 9 stops"). The §3 form, with ride minutes last, is used only in the direction rows, so the two numbers never share a slot.
- **Closed picks (round 5):** a pick or recommendation that is closed on the selected day keeps its shape, drawn in secondary at full strength. If it is on the other day's route it is not drawn at all, because the dashed line stands for it.
- **Live sign shows one day bullet (round 7):** as §6.2 says, the live sign keeps only the current day's bullet, with no underline. Tapping it returns to the top (plan) or the whole route (map), where the title and both days come back. Long stop names take a second 15/18 line in the 56px sign rather than an ellipsis.
- **Map card on a focused or single-ride leg names the boarding station (round 7):** "38 min · [C] at 135 St", not the headsign, so the wayfinding fact survives truncation and the card reads "To 3" as the action. The rail keeps the full §3 form. Focused-leg station labels try right, left, above and below, and are never dropped.
- **Fits take the next whole zoom when they nearly fit (round 7):** with zoomSnap 1, a fit whose fractional zoom is within 0.2 of the next level takes it, accepting a few pixels of padding overrun.
- **Dimmed stop markers dim by color (round 7):** map-halo fill with a secondary numeral, opaque, so lines never show through.
- **In-list text actions are underlined at rest (round 8):** §4 says text buttons underline on hover, but phones have no hover. Add to Sat, Stop 5 · Sat, Open / Link / Delete, Edit, Undo and Clear carry a 1px hairline-colored underline at rest that turns ink on hover, the same grammar as the Nearby names. Hover rules apply only on hover-capable pointers, so nothing sticks after a tap.
- **Pressed states (round 8):** the native tap highlight is off, so controls answer a press themselves: bordered buttons and chips take the canvas fill, solid ones a lighter ink, text actions drop to 60% opacity. Instant in, 120ms opacity out, nothing moves or resizes.
- **Shared-route notice is in flow (round 8):** the banner sits at the top of the panel as a hairline card with no shadow (§4: shadows only over the map) and stays until dismissed, instead of floating over the panes for 9 s.
- **Fits take the next whole zoom only when the markers still clear the edge (round 8, amends round 7):** the rounded-up zoom is rejected when the route plus a 20px marker margin would overrun the map, so no stop marker is cut by the viewport edge. Some laptop fits are a level looser as a result.
- **Map follow and native card snap (round 9):** the stop card moves with the browser's native scroll-snap, whose duration and curve the browser sets, in place of §7's 240ms translate. The map follows when the snap settles (`scrollend`), with a 400ms pan at the current zoom, and does not move if the stop is already in the visible map. Only "Show on map" from a list zooms to street level. Phone cards are 48px narrower than the viewport, so 16px of the next card shows. Day switches and tab changes reframe the map instantly, and only the panes crossfade (160ms, starting from 35% opacity so no frame is blank). Selection states (map marker, rail node, plan card, day label) change instantly, and the selected marker is drawn at 30px, not scaled.
- **Laptop fits use the whole map (round 10, amends rounds 7–8):** on laptops the next whole zoom is tried whatever its fraction. It is taken when the route fits the map less a 20px marker margin and no stop marker lands under the legend or the zoom buttons. Where that needs it, the route may slide off centre by up to a tenth of the map. The laptop legend wraps to a compact block (336px max) in the corner so it blocks less of the map. Phones keep the round-7/8 rule.
- **Phone map key (round 10):** the phone key lists Route, Your picks, Recommended and Others. The dashed other-day line drops out of the phone key, since tapping it offers the switch.
