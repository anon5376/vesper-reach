# Vesper Reach progress

## Current milestone
Done. All 11 milestones are in the playable build and checked.

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
- `window.__debug` for teleport, items, state, seed, and reads.
- `npm run verify-data` and `npm run smoke` both pass. README.md explains how to run, the controls, and the contracts.

## Open bugs
None recorded from the last smoke pass. Console errors were zero.

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
- Worlds are about 18–30 units across, on orbits that start near 96, so the belt and the bell stay inside the first world. The kite skims a crust at 12 units and sheds speed aimed into the ground.
- Land sets the kite down when it is slow and within 34 of the surface. From farther out, within 220, the same key glides toward that world and then sets down. Pressing it again cancels the glide.
- The space camera stays outside a world when the kite skims it. On foot the camera sits behind a suited surveyor. Escape leaves the shipyard, the chart, and the camp palette before it pauses the walk.

## Final report

Vesper Reach is a Vite + Three.js survey game. Assets are procedural. `npm run build` writes a relative `dist/` that a static server can host.

### What was built
Title and contract select, five difficulty contracts including Charter sliders and One Margin save deletion, space flight in a seeded galaxy of 100 systems, landing, chunked biome terrain, on-foot movement with a jetpack, survival meters and weather, mining, crafting, a tech folio, a snap-grid shipyard whose mass changes handling, camps with a power grid, refiner, storage, and paired bells, creatures and a scanner folio, foot and space combat with Ash Kites and Margin Wasps, station trade, a galaxy chart, and lantern-drive warp. Controls rebind, a gamepad map exists, and both flight schemes plus flight assist are wired. Saves are versioned JSON in three drawers, with export and import.

### Verification evidence
- `npm run verify-data` passed: 18 raw resources, 12 refined materials, 70 recipes, 8 biomes, 100 deterministic systems, starter kite valid with thrust-to-weight above 1, all five contracts, arcade throttle, 6DOF strafe, assist-off drift, walk and jetpack, mining, smelting, hull and foundation crafting, shipyard placement and blueprint, mass increase, solar/lamp power, refiner output, teleporter hop, save round-trip and slot reload, grave and respawn, permadeath drawer deletion, scan and codex, pirate movement and ship fire, overmine drone, foot blaster, dock, buy and sell, tech unlock, warp fuel spend, heavier hull lowers top speed, hazard pressure, gamepad axis and assist button, rebind.
- A follow-up Node pass: shield 45 fell to 35 under fire, station repair returned ok, a ration raised hunger from 40 to 68, a frozen effect applied, and an exported log imported into drawer 2 with the same seed and cargo.
- `npm run smoke` passed with zero page errors and zero console errors. For Survey, Hard Vacuum, Lantern Draft, Charter, and One Margin it ran title, new game, fly, land, terrain, mine, craft, ship part (mass 35.4 to 38.4), base piece, powered camp, launch, warp to system 5, save, reload, and a matching signature. Charter stored hazard rate 0.33. One Margin deleted drawer 3 on death. The galaxy chart drew 100 pips. Gamepad button 10 toggled flight assist. 6DOF strafe and assist-off drift were asserted.
- Screenshots from that run (title, mode select, space, surface, shipyard, camp, galaxy chart, station, inventory) are colored scenes. A 64×36 sample of the surface shot had 127 color bins and 1597 of 2304 bright pixels. Space, the shipyard, and the bell interior were likewise not empty.
- A later graphics pass painted planet maps, atmosphere rims, a gradient sky, fresnel water, mottled terrain, fan-shaped plants, and a sculpted kite. High-quality surface work after that pass measured 1.35 ms.
- Frame work over 10 seconds, reset at the start of each sample, headless Chromium with SwiftShader, 1280×720:
  - medium, render distance 4: space 0.69 ms (231 frames), surface 0.88 ms (227 frames)
  - high, render distance 5: space 0.65 ms (240 frames), surface 0.94 ms (218 frames)
  - smoke’s low preset: space 0.70 ms (239 frames), surface 0.94 ms (260 frames)
  Work stays under 16.7 ms. The headless browser delivered about 22–26 animation frames per second, so the gap between frames was longer than 16.7 ms even though each frame’s update and render was under 1 ms.

### Known limitations
- The descent is a short fade, not a flight down onto a round planet.
- Shelters in the wild are pits and stone arches, not carved caves.
- A camp shares one power grid. There is no per-wire network.
- Creatures are spawned again after a reload. The folio remembers what you scanned.
- Audio is a Web Audio graph with separate master, effect, ambient, and interface buses. It starts on the first gesture, so the headless smoke pass does not assert sound.
- The shipyard, camp palette, and folio screens share the new painted worlds. The interface itself is still a paper desk over the scene.
- A played session (keyboard and mouse, Survey contract) reached full thrust near 40, glided onto a world, walked, mined, opened the folio and the bench, raised a camp ghost, opened the shipyard with V, and lifted off again. Console errors were zero. `npm run verify-data` passed again after the larger worlds, the glide, and the shoulder camera.
- A later picture pass adds bloom and a grade, a cream kite with swept wings and an engine wake, terrain grain and slope light, cloud banks, a suited surveyor, and a hangar deck in the shipyard. Headless frame work after that pass stayed near 9 ms.
