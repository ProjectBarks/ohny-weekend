# Open Doors Route

Route planner for OHNY Weekend (Oct 17–18, 2026): curated day plans, an optimizer, real walk + subway/bus times, saved weekends and share links.

- Live: https://projectbarks.github.io/ohny-weekend/
- `data.js`: 131 events (Sat/Sun, Brooklyn/Manhattan/Queens, not sold out) from ohny.org with rankings
- `transit.js`: travel times built by `build/transit.py` from MTA weekend GTFS (download the feeds into `build/gtfs/` to rebuild)
- `build/check.py`: verifies every preset in `presets.js` fits opening hours
