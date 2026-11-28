# Routing handoff (for a new chat: endgame guide)

Paste the prompt at the bottom into a new chat. Everything else here is reference for that chat.

## Repos
- **tyba-dev/WoWF-RouteSim** (this repo): the leveling simulator and route builder.
  - `engine.js` is the sim. `builder.js` is the route builder.
  - `tools/` holds `build.js`, `train.js`, `sidetrips.js`, `materialize.js`, `postpass.js` and `pipeline/*`.
  - Open it with `require('./index.js').open()`, which returns `{P, S, useRoute, run, setParams}`. `P.ctx` is the planner context: `Q(q)`, `DB`, `META`, `objectives`, `starterPts`, `finisherPts`, `zp2plane` and so on.
- **tyba-dev/WoWF-QRP**: the planner web app (`src/app.js`; build with `python3 build.py`). It's published as the artifact https://claude.ai/artifact/B6st41kWCYHv5R7X3fDB1R.
  - Routes live in that artifact's DB:
    - `routes/<id>` is the meta doc: `{id, name, rev, n, updatedAt, by}`.
    - `routes/<id>/parts/<k>` holds `{s: chunk}`, in 150k-char chunks.
  - Write with an ArtifactData batch using `file_path` and `if_version`.
  - `tools/pipeline/strip.js` writes the parts.

## Hard constraints
- RXP paid guides never go on GitHub, and never into WoWF-QRP. Users import their own. Strip RXP text (`src`, `rxt`, `guides`) before uploading a route.
- Never use Wowhead data. Use Questie-derived DB plus EXTRA (`data/extra.json`), `pxp.json` and `elite.json`.
- Don't decrypt RXP account-bound strings. RXPGuides_ForeverGroup is private.
- Don't overwrite routes `trio5` or `trxp` without asking.
- Commit and push repo changes (a stop hook checks this).
- The user wants short, summarised replies.

## Sim model (what is known to matter)
- **Group:** party of 5, with per-player drops (`splitDrops:0`) unless the quest needs 1 of 1.
- **Spawns:** static 2 min respawn (`staticResp:120`) and `layers:5` (4 layer swaps).
  - Minimum respawn (`minSpawn:0.25`) applies only after a camp is cleared on all layers. Splitting up happens only then.
- **Level limits:** quests at most +4 above the group (`questAbove`), elites at most +2 (`eliteAbove`). The sim reports breaking these as `over level` errors.
- **Pack clears:** one-time AoE pack clears are allowed (the user confirmed).
- **Not allowed:** grinding for its own sake and deathskips.
- **Tents/rested:** OFF. The user said ignore tents (`char.rested.on=false`).
- **Professions:** none. Set `char.prof=false`; the builder also uses `noProf:true`. Forever "Camping 101" quests bypass the planner filter, so ban anything with `x.sk`.
- **Rare starters:** ban quests started by a world drop (builder `rareStart:4`, i.e. a starter item with more than 4 droppers).
- **Movement:** the user said you must know every movement option before choosing where to go.
  - Mage portals: SW/IF from 40, Darnassus from 50. `portalNodes` are 352 SW, 1573 IF and 3838 Darn (`ex` 60).
  - Any boat; boats are inside `walkSecs`.
  - Flight paths once discovered; own capitals known from the start. Skyborne starts with SW, so set `char.fps=['352']`.
  - Hearth with a 1 h cooldown.
  - Binding walks to the innkeeper (fixed in `f3fcbef`).
- **Build params:** use auto travel (`autoFly`, `autoFp`, `autoHs`, `autoBind`, `autoPortal` = 1, `portalGain` 60).
  - After building, `materialize.js` writes those choices as real travel steps.
  - Then evaluate with auto travel 0 (`five/pwL5.json`-style params).
- **Dungeons:** `run` steps `{mode:'run', dg, loc, ...}` with in-run completes (`inRun`).
  - Level windows: see `W` in `tools/pipeline/check.js` (+2 upper tolerance allowed).
  - Forever custom dungeons: DALARAN, DROWNED, KROLDOK, ALCAZ. Their windows are guesses.
- **Class quests:** class-specific quests go in `train.js` (trainer visits and milestones) and `sidetrips.js` (one player leaves alone). They are not group steps.

## Pipeline that works
1. `tools/build.js cfg out`: greedy insertion plus forced runs.
   - Resume with `seed` = previous steps and `freeze` = their count. Pass a low `vks` list on resume, or it restarts from vk 4 and stalls.
2. Append the fixed-content block (for leveling, Hyjal at ≥ 56), then resume to the target.
3. Deep pass: `skipGrow:true` plus `prune`, `relocate`, `visits`, `runMove` and `lns`.
4. `train.js`, then `sidetrips.js`, then `materialize.js`.
5. `pipeline/fixerr.js`, `pipeline/prune.js`, `pipeline/check.js`.
6. Audit: `pipeline/audit.js` (professions, events, item starters, difficulty) and `pipeline/trav.js` (time per step type, continent changes).
- The staged script is `pipeline/chainB.sh` (stage 1 / 2 / O / 3).

## Lessons
- Background jobs are capped at 2 h and the container restarts sometimes. Split long builds into stages, and keep work in `/home/claude/work`, not the scratchpad.
- Use `set -o pipefail`. Never `rm five/m*.json`, because it also matches the `mat*.json` configs.
- `S.runRested` picks the tent window. Irrelevant now that tents are off.
- Talk/delivery quests far above level are fine. The level cap only matters for kill and collect objectives.

## Endgame guide: what's new
- The goal is all endgame dungeon quests plus pre-BiS collection, routed efficiently at level 60.
- The objective is no longer XP-to-target. Instead: minimise total time to finish a set of quest turn-ins and item drops.
- **New engine work:**
  - An objective "done set" instead of `tgt` level.
  - Drop chances per run for the pre-BiS items (from the DB, never Wowhead): expected runs = 1/p, and how many players need each item.
  - Lockouts and attunements.
- **Quest chains to cover:**
  - UBRS key (Seal of Ascension).
  - Onyxia attunement.
  - Scholo/Strat keys and quests, Dire Maul.
  - BRD and LBRS chains.
  - The Forever custom dungeons' endgame quests.
- **Routing:** many repeated runs per dungeon, so batch quests per dungeon visit. Hub travel (portals and hearth) dominates; reuse the engine's `move()` costs.

## Prompt for the new chat
> I'm building a WoW Forever endgame guide: all endgame dungeon quests plus pre-BiS collection for a 5-man group (skelf warrior, 2 skelf mages, skelf hunter, human paladin), routed efficiently. Read `docs/HANDOFF.md` in tyba-dev/WoWF-RouteSim first; it has the sim, the pipeline, the constraints and the lessons from the leveling route. Attach the repo, plan the engine changes (objective set instead of target level, drop chances, lockouts, attunements), then build it. Keep replies short.
