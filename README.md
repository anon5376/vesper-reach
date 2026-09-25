# Vesper Reach

A lantern survey across a paper margin of stars. Land where the sky is the wrong color, keep the suit kind, and bring the kite home if you can.

Everything you see and hear is drawn in code. There are no image, model, or sound files.

## Run

```bash
npm install
npm run dev
```

Open the address Vite prints (usually `http://127.0.0.1:5173`).

A static build:

```bash
npm run build
npm run preview
```

`dist/` can be served by any static host. Paths are relative.

Checks:

```bash
npm run verify-data
npm run smoke
```

`verify-data` runs the simulation in Node. `smoke` builds, serves `dist/`, and drives a headless browser through the survey loop.

## Contracts

Chosen when a survey starts, then stored in the log.

- **Survey** — balanced hazards, costs, and company.
- **Hard Vacuum** — scarce veins, hungry weather, meaner fauna and Ash Kites.
- **Lantern Draft** — unlimited pockets, no hazard drain, every folio open, fly on foot, instant building.
- **One Margin** — Hard Vacuum rules. The drawer burns when the suit fails. There is no grave.
- **Charter** — sliders and toggles for hazard, yield, damage, aggression, fuel, crafting, day length, and weather.

## Controls

Rebind them in Settings. The prompt shows the key you actually bound.

| Action | Default |
| --- | --- |
| Walk / throttle | W A S D |
| Look | Mouse (click the view to take the helm) |
| Jump / jet up | Space |
| Sprint / boost | Shift |
| Crouch / jet down | Ctrl |
| Jetpack | F |
| Interact | E |
| Mine or fire | Left mouse |
| Alternate fire | Right mouse |
| Scanner | R |
| Tool wheel | Hold Q, then A/D or the wheel |
| Quick slots | 1–5 |
| Inventory | I or Tab |
| Craft | C (on foot; in flight C is strafe down) |
| Tech folios | T |
| Discoveries | J |
| Star index | M |
| Build camp | B |
| Shipyard | V, at the kite or a bell |
| Launch or land | L |
| Target lock | Y |
| Flight assist | X |
| Throttle step | = and - |
| Pause | Esc |
| Menus | Arrows, Enter, Backspace |

Flight schemes live in Settings.

- **Arcade** — mouse yaws and pitches, A/D rolls, W/S sets or holds throttle.
- **6DOF** — mouse looks, A/D strafes, Space and C lift, Q/E roll.

Flight assist damps toward the throttle. With assist off the kite keeps its drift. Throttle can be a held key or a set level.

A gamepad uses the standard mapping: left stick moves, right stick looks, face buttons jump, crouch, interact, and scan, shoulders are the tool wheel and fire, and the view button toggles flight assist. The deadzone is in Settings.

## The log

Three drawers in the title screen. Settings can export a drawer as JSON and import one back. Logs are versioned. One Margin deletes its drawer on death.
