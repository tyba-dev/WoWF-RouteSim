# WoWF-RouteSim

Leveling route simulator and route builder for **World of Warcraft: Forever**, built for groups (trio, AoE) as well as solo.

It plays a route step by step and prices every second: walking on the planner's walking grid (trams, boats), flights, quest-giver talks, kills and pulls at real spawn positions, respawn waits, kills on the way, dungeons, and Forever's quest XP. Every time component is kept as a counter so routes can be re-priced under other settings instantly, and the settings can be fitted to recorded play.

- `engine.js`: the simulator (runs inside the planner's world context).
- `planner.js`: loads the [Forever Route Planner](https://github.com/tyba-dev/wowf-qrp)'s engine and data in Node (no browser).
- `index.js`: `open()` gives `{run(route, opts), setParams(params)}`.
- `tools/prep.js`: builds `data/extra.json` from Polestar's forever-db and recorded objective spots, and CMaNGOS respawn times.

## Group rules
- Kill credit is shared by the group.
- A quest needing **one** item: the group shares it. Several of the same item (e.g. 8 bear rumps): every player needs their own set.

## Data and credits
See [NOTICE.md](NOTICE.md). Licence: GPL-3.0-or-later.
