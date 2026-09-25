import { createBus } from '../src/core/events.js'
import { createMachine } from '../src/core/statemachine.js'
import { RNG, rngFrom } from '../src/rng/rng.js'
import { createNoise } from '../src/rng/noise.js'
import { generateGalaxy } from '../src/worldgen/galaxy.js'
import { heightAt, noiseFor } from '../src/worldgen/terrain.js'
import { ITEM_LIST } from '../src/data/items.js'
import { RECIPE_LIST } from '../src/data/recipes.js'
import { BIOMES } from '../src/data/biomes.js'
import { PARTS } from '../src/data/parts.js'
import { starterParts } from '../src/data/parts.js'
import { TECH } from '../src/data/tech.js'
import { validateShip, deriveStats } from '../src/ship/stats.js'
import { resolveParams, MODE_LIST } from '../src/modes/modes.js'
import { updateFlight } from '../src/physics/flight.js'
import { updateWalker } from '../src/physics/walker.js'
import { createSession } from '../src/core/session.js'
import { DEFAULT_SETTINGS } from '../src/data/bindings.js'
import { createInput } from '../src/input/input.js'
import { packState, unpackState, slotSummary } from '../src/save/save.js'
import { countItem } from '../src/inventory/inventory.js'
import { teleportToNext } from '../src/base/base.js'
import { fireFoot, fireShip, tickCombat } from '../src/combat/combat.js'
import { tickSurvival } from '../src/survival/survival.js'

const store = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  },
  addEventListener() {},
}
globalThis.document = { addEventListener() {}, pointerLockElement: null }

const failures = []
function check(name, cond, detail = '') {
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
  else console.log('ok', name)
}

function boot(modeId = 'normal', extra = {}) {
  const settings = structuredClone(DEFAULT_SETTINGS)
  const bus = createBus()
  const machine = createMachine('TITLE')
  const session = createSession(bus, machine, () => settings)
  session.newGame({ modeId, slot: extra.slot ?? 0, seed: extra.seed ?? 0x51a7e, custom: extra.custom || null })
  return { settings, bus, machine, session }
}

function flightInput({ ax = 0, ay = 0, down = {}, press = {} } = {}) {
  return {
    consumeLook: () => ({ x: 0, y: 0 }),
    moveAxes: () => ({ x: ax, y: ay }),
    isDown: (action) => !!down[action],
    pressed: (action) => !!press[action],
    consumeWheel: () => 0,
  }
}

const raw = ITEM_LIST.filter((item) => item.kind === 'raw')
const refined = ITEM_LIST.filter((item) => item.kind === 'refined')
const craftable = RECIPE_LIST.length
check('raw resources', raw.length >= 15, String(raw.length))
check('refined materials', refined.length >= 10, String(refined.length))
check('recipes', craftable >= 40, String(craftable))
check('biomes', Object.keys(BIOMES).length >= 8)
check('tech folios', TECH.length >= 8)
check('ship parts', Object.keys(PARTS).length >= 15)

const a = generateGalaxy(42)
const b = generateGalaxy(42)
check('galaxy size', a.systems.length === 100, String(a.systems.length))
check('galaxy deterministic', JSON.stringify(a.systems.map((s) => [s.name, s.planets.length, s.planets[0].biome])) === JSON.stringify(b.systems.map((s) => [s.name, s.planets.length, s.planets[0].biome])))
check('planet counts', a.systems.every((s) => s.planets.length >= 2 && s.planets.length <= 6))
check('stations and belts', a.systems.every((s) => s.station && s.belt))

const rng = new RNG(99)
const seq = [rng.next(), rng.next(), rng.next()]
const rng2 = new RNG(99)
check('prng', seq.every((n, i) => n === rng2.next()) && seq[0] !== seq[1])
const noise = createNoise(7)
check('noise', Math.abs(noise.noise2(1.2, 3.4)) <= 1 && noise.fbm2(2, 4) !== noise.fbm2(8, 9))
const terrain = noiseFor(42, 0, 0)
const h0 = heightAt(terrain, 0, 0, 'lush')
const h1 = heightAt(terrain, 40, 12, 'lush')
check('heightfield varies', h0 !== h1)

const starter = validateShip(starterParts())
check('starter valid', starter.ok, (starter.errors || []).join('; '))
const stats = deriveStats(starterParts())
check('starter twr', stats.twr > 1, String(stats.twr))

for (const mode of MODE_LIST) {
  const params = resolveParams(mode.id, mode.id === 'custom' ? { hazardRate: 0.2, resourceYield: 2, unlimited: false } : null)
  check(`mode ${mode.id}`, params && typeof params.hazardRate === 'number' && typeof params.fuelCost === 'number')
}
check('custom slider', resolveParams('custom', { hazardRate: 0.2 }).hazardRate === 0.2)
check('creative unlimited', resolveParams('creative').unlimited === true)
check('permadeath flag', resolveParams('permadeath').permadeath === true)
check('survival scarce', resolveParams('survival').scarce === true && resolveParams('survival').hazardRate > 1)

const { session, bus } = boot('normal', { seed: 77 })
const state = session.state
check('starts in space', state.location === 'space' && session.galaxy.systems.length === 100)

state.flight.scheme = 'arcade'
state.flight.assist = true
state.flight.throttleMode = 'set'
state.space.throttle = 0
const before = { ...state.space.position }
for (let i = 0; i < 80; i++) updateFlight(state, flightInput({ ay: -1 }), 0.05, session.galaxy)
check('arcade throttle', state.space.throttle > 0.4, String(state.space.throttle))
const moved = Math.hypot(state.space.position.x - before.x, state.space.position.y - before.y, state.space.position.z - before.z)
check('arcade flies', moved > 5, String(moved))

state.flight.scheme = '6dof'
state.space.velocity = { x: 0, y: 0, z: 0 }
state.space.throttle = 0
const lat0 = state.space.position.x
for (let i = 0; i < 40; i++) updateFlight(state, flightInput({ ax: 1 }), 0.05, session.galaxy)
check('6dof strafe', Math.abs(state.space.position.x - lat0) > 0.2 || Math.abs(state.space.velocity.x) + Math.abs(state.space.velocity.z) > 0.2)

state.flight.assist = false
state.flight.scheme = 'arcade'
state.space.throttle = 1
state.space.velocity = { x: 0, y: 0, z: 0 }
updateFlight(state, flightInput(), 0.2, session.galaxy)
const drift = Math.hypot(state.space.velocity.x, state.space.velocity.y, state.space.velocity.z)
state.space.throttle = 0
for (let i = 0; i < 20; i++) updateFlight(state, flightInput(), 0.05, session.galaxy)
const afterDrift = Math.hypot(state.space.velocity.x, state.space.velocity.y, state.space.velocity.z)
check('newtonian drift', drift > 0.5 && afterDrift > drift * 0.7, `${drift} -> ${afterDrift}`)

session.approach(0)
const land = session.requestLand()
check('request land', land.ok, land.error)
session.skipTransition()
check('landed', state.location === 'surface' && state.planetIndex === 0, state.location)

const noiseS = noiseFor(state.seed, state.systemIndex, state.planetIndex)
const z0 = state.player.position.z
for (let i = 0; i < 30; i++) {
  updateWalker(state, flightInput({ ay: -1 }), 0.05, noiseS, () => {})
}
check('walks', Math.abs(state.player.position.z - z0) > 0.4, String(state.player.position.z - z0))
state.player.grounded = false
state.player.position.y += 2
const y0 = state.player.position.y
for (let i = 0; i < 12; i++) {
  updateWalker(state, flightInput({ down: { jetpack: true } }), 0.05, noiseS, () => {})
}
check('jetpack', state.player.position.y > y0 - 0.2 || state.player.stamina < 99)

const ore = session.mine(12)
check('mine ore', ore >= 4, String(ore))
const smelt = session.craft('smelt-drift')
check('smelt', smelt.ok, smelt.error)
session.craft('smelt-drift')
session.craft('smelt-drift')
const cube = session.craft('shape-cube')
check('craft hull', cube.ok && countItem(state, 'hull-cube') >= 1, cube.error)
const poured = session.craft('pour-foundation')
check('craft foundation', poured.ok, poured.error)

const massBefore = session.stats().mass
const placed = session.editorPlace('hull-cube', 1, 0, 0)
check('editor place', placed.ok, placed.error)
const report = session.editorReport()
check('editor still valid', report.ok, (report.errors || []).join('; '))
const named = session.saveBlueprint('Salt Wedge')
check('blueprint saved', named.ok !== false)
session.editorCommit()
check('mass rose', session.stats().mass > massBefore, `${massBefore} -> ${session.stats().mass}`)

const floorY = Math.round(state.player.position.y)
const block = session.place('foundation', 2, floorY, 2)
check('place foundation', block.ok, block.error)
session.give('solar', 1)
session.give('lamp', 1)
session.give('refiner', 1)
session.give('battery', 1)
const nearX = Math.round(state.player.position.x)
const nearZ = Math.round(state.player.position.z)
check('solar', session.place('solar', nearX, floorY, nearZ + 1).ok)
check('lamp', session.place('lamp', nearX + 1, floorY, nearZ).ok)
check('battery', session.place('battery', nearX - 1, floorY, nearZ).ok)
check('refiner piece', session.place('refiner', nearX, floorY, nearZ - 1).ok)
const power = session.power()
check('power network', power && power.powered && power.produce > power.draw, JSON.stringify(power))

state.unlockedTech.push('metallurgy')
session.give('rust-bark', 4)
const queued = session.craft('kiln-rust')
check('queue refiner', queued.ok && queued.queued, queued.error)
const ingotBefore = countItem(state, 'drift-ingot')
state.params.hostiles = false
state.params.enemyAggression = 0
state.params.hungerDrain = 0
state.params.thirstDrain = 0
session.runtime.mineHeat = 0
session.runtime.drones = []
session.runtime.creatures = []
state.player.health = 100
for (let i = 0; i < 120; i++) session.tick(0.1)
check('refiner output', countItem(state, 'drift-ingot') > ingotBefore, `${ingotBefore} -> ${countItem(state, 'drift-ingot')}`)

session.give('teleporter', 2)
const t1 = session.place('teleporter', nearX + 2, floorY, nearZ)
check('bell a', t1.ok, t1.error)
const other = {
  id: 'camp-b',
  name: 'Far Camp',
  systemIndex: state.systemIndex,
  planetIndex: Math.min(1, session.galaxy.systems[state.systemIndex].planets.length - 1),
  pieces: [{ uid: 'bell-b', blockId: 'teleporter', x: 4, y: 2, z: 4, rot: 0 }],
  powerStored: 20,
  powered: true,
}
if (other.planetIndex === state.planetIndex) other.planetIndex = (state.planetIndex + 1) % session.galaxy.systems[state.systemIndex].planets.length
state.bases.push(other)
const hopped = teleportToNext(state, t1.piece)
check('teleporter', hopped.ok && state.planetIndex === other.planetIndex, hopped.error)
state.systemIndex = 0
state.planetIndex = 0
state.biomeId = session.galaxy.systems[0].planets[0].biome

const packed = packState(state)
const unpacked = unpackState(packed)
check('save roundtrip', unpacked.seed === state.seed && unpacked.inventory && unpacked.flags.frozen === false)
state.flags.frozen = true
const sig = session.signature()
const saved = session.saveGame(0)
check('write slot', saved.ok !== false, saved.error)
const loaded = session.loadGame(0)
session.state.flags.frozen = true
check('reload signature', loaded.ok && session.signature() === sig, loaded.error)

const graveRun = boot('normal', { seed: 9, slot: 1 })
graveRun.session.approach(0)
graveRun.session.requestLand()
graveRun.session.skipTransition()
graveRun.session.give('ration', 1)
const kind = graveRun.session.die('test')
check('grave', kind === 'grave' && graveRun.session.state.graves.length === 1)
graveRun.session.respawn()
check('respawn', graveRun.session.state.player.health > 40)

const deadRun = boot('permadeath', { seed: 11, slot: 2 })
deadRun.session.saveGame(2)
check('permadeath slot written', slotSummary(2))
const burned = deadRun.session.die('void')
check('permadeath deletes', burned === 'permadeath' && deadRun.session.state == null && slotSummary(2) == null)

const custom = boot('custom', { seed: 3, custom: { hazardRate: 0.15, fuelCost: 2 } })
check('custom stored', custom.session.state.params.hazardRate === 0.15 && custom.session.state.params.fuelCost === 2)

const survey = boot('normal', { seed: 21 })
survey.session.approach(0)
survey.session.requestLand()
survey.session.skipTransition()
for (let i = 0; i < 5; i++) survey.session.tick(0.2)
const scan = survey.session.scan()
check('scan', scan.ok, scan.error)
check('codex or creatures', Object.keys(survey.session.state.codex.plants).length + Object.keys(survey.session.state.codex.creatures).length + survey.session.runtime.creatures.length > 0)

const space = boot('normal', { seed: 4 })
space.session.spawnPirates(1)
const pirate = space.session.runtime.pirates[0]
const px = pirate.x
fireShip(space.session.state, space.session.runtime, space.bus)
for (let i = 0; i < 40; i++) tickCombat(space.session.state, space.session.runtime, 0.05, space.bus, (n, s) => space.session.hurt(n, s))
const still = space.session.runtime.pirates.find((entry) => entry.id === pirate.id)
check('pirate ai moves', Math.abs((still?.x ?? px + 5) - px) > 0.3)
check('ship weapon', space.session.runtime.bolts.length > 0 || (still && still.hp < 46))

const foot = boot('normal', { seed: 8 })
foot.session.approach(0)
foot.session.requestLand()
foot.session.skipTransition()
foot.session.runtime.mineHeat = 40
tickCombat(foot.session.state, foot.session.runtime, 0.2, foot.bus, (n, s) => foot.session.hurt(n, s))
check('overmine drone', foot.session.runtime.drones.length >= 1)
foot.session.state.player.tool = 'blaster'
const shot = fireFoot(foot.session.state, foot.session.runtime, foot.bus)
check('foot blaster', shot.ok && foot.session.runtime.bolts.length >= 1)

const econ = boot('normal', { seed: 6 })
econ.session.approachStation()
const dock = econ.session.requestDock()
check('dock', dock.ok, dock.error)
econ.session.skipTransition()
check('station', econ.session.state.location === 'station')
const market = econ.session.market()
check('market listings', market.listings.length >= 15)
econ.session.give('drift-ore', 2)
const credits = econ.session.state.credits
const sold = econ.session.sell('drift-ore')
check('sell', sold.ok && econ.session.state.credits > credits, sold.error)
const bought = econ.session.buy(market.listings[0].id)
check('buy', bought.ok, bought.error)
econ.session.state.research = 40
const unlocked = econ.session.unlock('metallurgy')
check('tech unlock', unlocked.ok, unlocked.error)

const warp = boot('normal', { seed: 15 })
warp.session.state.ship.fuel = 80
const from = warp.session.state.systemIndex
const jumped = warp.session.requestWarp(5)
check('warp request', jumped.ok, jumped.error)
warp.session.skipTransition()
check('warped', warp.session.state.systemIndex === 5 && warp.session.state.systemIndex !== from)
const fuelAfter = warp.session.state.ship.fuel
check('warp fuel', fuelAfter < 80, String(fuelAfter))

const heavy = deriveStats(starterParts())
const bulky = starterParts()
for (let i = 0; i < 6; i++) bulky.push({ partId: 'hull-cube', x: 2, y: i, z: 0, rot: 0, color: '#fff', hp: 20 })
const heavyStats = deriveStats(bulky)
check('mass changes handling', heavyStats.mass > heavy.mass && heavyStats.topSpeed < heavy.topSpeed, `${heavy.topSpeed} -> ${heavyStats.topSpeed}`)

const survival = boot('survival', { seed: 2 })
survival.session.approach(0)
survival.session.requestLand()
survival.session.skipTransition()
const hazard0 = survival.session.state.player.hazard
survival.session.state.player.position.y = 40
for (let i = 0; i < 40; i++) tickSurvival(survival.session.state, 0.25, false, (n, s) => survival.session.hurt(n, s))
check('hazard pressure', survival.session.state.player.hazard < hazard0 || survival.session.state.player.health < 100)

const settings = structuredClone(DEFAULT_SETTINGS)
const input = createInput(() => settings)
input.setFakePad({
  axes: [0, -1, 0, 0],
  buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: index === 10 })),
})
input.update()
check('gamepad axis', input.moveAxes().y < -0.5, JSON.stringify(input.moveAxes()))
check('gamepad button', input.pressed('assistToggle'))
input.rebind('forward', 'KeyI')
check('rebind', input.exportBindings().forward[0] === 'KeyI')

const creative = boot('creative', { seed: 1 })
check('creative credits', creative.session.state.credits >= 999)
check('creative tech', creative.session.state.unlockedTech.length >= TECH.length)

if (failures.length) {
  console.error('\nFAILED')
  for (const line of failures) console.error(' -', line)
  process.exit(1)
}
console.log('\nverify-data passed', failures.length === 0)
