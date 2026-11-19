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

## The model (engine.js)

| Part | How it is priced | Settings (defaults) |
|---|---|---|
| Walking | planner's walking grid (trams, boats, HC-blocked zones), mounted from 40 | `detour` 1.0, `mountLevel` 40 |
| Talking | each accept, hand-in, flight path | `talk` 6 s |
| Flights | planner's flight network, else 30 yd/s; + overhead | `flySpeed` 30, `flyOver` 20 s |
| Objectives | a hunting ground: candidate centres are players' recorded spots and the densest spawns; widened until it holds enough spawns; the cheapest by walk there + sweep + respawn waits | `groundR` 250, `groundMax` 900, `groundFill` 0.6 |
| Killing | nearest-neighbour walk through the ground's real spawns; pulls of up to `pullSize`; each kill `perMob` (× `eliteMul` for elites); each pull `pullBase` + `pullRest` | `pullSize` 6, `perMob` 2 s, `pullBase` 4 s, `pullRest` 6 s, `eliteMul` 3.5 |
| Respawns | each spawn returns after its CMaNGOS respawn time (capped) | `respawn` 300 s, `respawnMax` 600 s |
| Drops | Polestar drop chances; hunt the mobs within `dropKeep` of the best chance | `dropDefault` 0.35, `dropKeep` 0.5 |
| Group items | 1 of an item: shared; several: per player | `party` 3 |
| Pooled credit | a kill also counts for other open quests' kill objectives and drops on that mob | |
| Kills on the way | mobs whose aggro radius (20 yd ± level gap) reaches the path, below mount level | `aggro` 20, `wayKills` 1 |
| Quest XP | Forever's recorded XP; full to 5 levels over the quest, 80 % at 6, 60 % at 7, 50 % from 8 | |
| Dungeons | fixed run time and XP from the route | |
| Tents | one per hour in the last `hours` of play from `minL`; rested doubles kill XP | route's `char.rested` |
| Level-ups | vendor/repair overhead | `levelUp` 20 s |

Every second lands in a counter (`walkSec`, `killSec`, `pullSec`, `restSec`, `waitSec`, `flySec`, `talks`, ...), so a route can be re-priced under other settings and the settings fitted to recorded play.

## Builder (builder.js)

Greedy insertion of quests, quest-hub bundles, spawn-grid packs and dungeons (a forced chain and required dungeons), flights re-planned as it grows, then large-neighbourhood search. Candidates are timed by the engine resumed from the snapshot before the first changed step.

```sh
node tools/build.js options.json out-route.json
```
