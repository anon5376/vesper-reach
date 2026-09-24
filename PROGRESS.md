# Vesper Reach progress

## Current milestone
11 — audio, visual polish, performance, settings, smoke, definition of done. Milestones 1–10 are implemented in the playable build and covered by `npm run verify-data`. Browser smoke, screenshots, and the performance sample are the remaining proof.

## Completed
- Event bus, state machine (TITLE, MODE_SELECT, SPACE, SURFACE, STATION, SHIP_EDITOR, BASE_BUILD, GALAXY_MAP, PAUSED, DEAD), seeded RNG and simplex noise.
- Rebindable keyboard and mouse actions, gamepad polling with deadzone, arcade and 6DOF flight, flight assist, hold and set throttle.
- Five contracts as one parameter object: Survey, Hard Vacuum, Lantern Draft, One Margin, Charter.
- 100 seeded systems, planets, moons, belts, stations. Chunked heightmap, biomes, day and night, weather.
- On-foot walk, sprint, crouch, jump, jetpack. Survival meters, shelter, food and water, status effects, graves, permadeath slot deletion.
- Mining, inventory, crafting, refiner jobs, tech folios.
- Snap-grid ship editor, validation, blueprints, derived-stat flight, part damage and repair.
- Base pieces, shared camp power grid, storage, refiner, teleporter.
- Creatures, flora, scanner, discoveries. Foot and space combat, Ash Kites, Margin Wasps.
- Station trade, galaxy chart, lantern-drive warp. Procedural Web Audio buses. Settings menu.
- `window.__debug` for teleport, items, state, seed, and reads. `npm run verify-data` passes.

## Open bugs
- Browser smoke and screenshot inspection have not been recorded yet.
- Frame-work average over 10 seconds in space and on a surface is not recorded yet.

## Assumptions
- Each camp is one shared power grid. Solar veils produce only while the sun is up.
- Space-to-surface is a paper fade of about 0.85s, switching halfway. Planets in space are spheres; the surface is a heightmap, not a seamless planet mesh.
- Caves are height pits plus a box arch. Standing in a pit counts as shelter.
- Scarce yield still drops one item per swing. The swing itself is slower.
- A positive crafting cost always spends at least one of each input.
- The landing pair of creatures is tame and grazing so the survey does not open in a fight.
- Creative still needs a valid kite (cockpit, power, thrust, connected hull) to leave a world. Resources, fuel, and credits are free.
- Blueprints live on the save. Station offers are generated into that save’s markets.
- Older scaffold modules still call each other directly. New cross-system signals use the bus (`notify`, `sfx`, `repair-ship`).
- Arcade A/D rolls. 6DOF A/D strafes. Flight assist is X. Craft does not open in space, because C is strafe-down there.
- In the shipyard, arrows move the cursor. Scan cycles parts. The tool wheel cycles category.
- Warp spends `14 * fuelCost` and needs a lantern drive. Folding to the system you are already flying is refused.
- A space grave is recovered by interacting within 14 units. One Margin deletes the drawer and returns to the title. No grave.
- Respawn prefers a Margin Bell, then the parked kite, then open space.
- Margin Wasps wake when mining heat passes `16 / aggression`. Ash Kites arrive after a timer scaled by aggression.
- Creature runtime is rebuilt on load. Veins, harvests, loot, removals, the codex, markets, camps, graves, and blueprints are saved.
- `flags.capturing` hides the helm overlay for screenshots and is stripped on save.
- Frame cost is update plus render work, not the gap between animation frames. Headless animation frames can be throttled.

## Next action
Run `npm run smoke`, inspect screenshots, fix anything black, empty, or loud in the console, then write the final report.
