import { TECH, TECH_BY_ID } from '../data/tech.js'
import { starterParts } from '../data/parts.js'
import { PARTS } from '../data/parts.js'
import { BIOMES } from '../data/biomes.js'
import { labelFor } from '../data/bindings.js'
import { resolveParams, preset } from '../modes/modes.js'
import { deriveStats, validateShip } from '../ship/stats.js'
import { updateFlight, flightStatus } from '../physics/flight.js'
import { updateWalker, sampleFloorHeight } from '../physics/walker.js'
import { heightAt, noiseFor, seaOf } from '../worldgen/terrain.js'
import { generateGalaxy, layoutSystem } from '../worldgen/galaxy.js'
import { emptyInventory, addItem, countItem } from '../inventory/inventory.js'
import { giveMany, takeAll } from '../inventory/inventory.js'
import { craftRecipe } from '../crafting/crafting.js'
import { placeBlock, removeBlock, updateBases } from '../base/base.js'
import { basesHere } from '../base/query.js'
import { summarizePower } from '../base/power.js'
import { tickSurvival } from '../survival/survival.js'
import { tickTools, pulseScan, ensurePlanetEntry, lifeFor, nearbyFeatures } from '../player/tools.js'
import { buildPrompts, interact, nearShip } from '../player/context.js'
import { tickCreatures } from '../creatures/sim.js'
import { cycleTarget, fireFoot, fireShip, repairShip, spawnPirates, tickCombat } from '../combat/combat.js'
import { buyBlueprint, buyGood, ensureMarket, refuelShip, repairAtStation, sellBlueprint, sellGood } from '../economy/economy.js'
import { commitEditor, editorReport, erasePart, loadDraftBlueprint, moveCursor, openEditor, paintCursor, partsInCategory, placePart, redoEdit, saveDraftBlueprint, undoEdit } from '../shipbuilder/editor.js'
import { PART_CATEGORIES } from '../data/parts.js'
import { deleteSlot, exportText, importText, readSlot, slotSummary, writeSlot } from '../save/save.js'
import { uid } from './util.js'

function pickPad(noise, biomeId) {
  const sea = seaOf(biomeId)
  let best = null
  for (let ring = 0; ring <= 5; ring++) {
    const steps = ring === 0 ? 1 : 10
    for (let i = 0; i < steps; i++) {
      const ang = (i / steps) * Math.PI * 2
      const x = Math.round(Math.cos(ang) * ring * 7)
      const z = Math.round(Math.sin(ang) * ring * 7)
      const h = heightAt(noise, x, z, biomeId)
      const score = h - sea
      if (!best || score > best.score) best = { x, z, h, score }
    }
  }
  return best || { x: 0, z: 0, h: 2, score: 1 }
}

function blankRuntime() {
  return {
    creatures: [],
    pirates: [],
    drones: [],
    bolts: [],
    notes: [],
    transition: null,
    editor: null,
    build: { blockId: 'foundation', rot: 0, demolish: false, power: false },
    wheel: false,
    wheelIndex: 0,
    cave: false,
    mineAcc: 0,
    mineHeat: 0,
    scanPulse: 0,
    pirateTimer: 36,
    target: null,
    fireCd: 0,
    shieldCd: 0,
    weaponCursor: 0,
    baseRev: 1,
    flight: null,
    prompt: [],
    ghost: null,
    shelter: false,
    storm: 'clear',
    lead: null,
    beam: false,
    label: () => '',
    mapIndex: 0,
    storageUid: null,
    lastScan: 0,
    sip: 0,
    partPick: 'hull-cube',
    glide: null,
  }
}

export function createSession(bus, machine, getSettings) {
  let state = null
  let galaxy = null
  let runtime = blankRuntime()

  bus.on('notify', ({ text } = {}) => {
    if (!text) return
    runtime.notes.unshift({ text, until: (state?.time || 0) + 6.5 })
    runtime.notes = runtime.notes.slice(0, 6)
  })
  bus.on('repair-ship', ({ amount } = {}) => {
    if (state) repairShip(state, amount || 20)
  })

  function settings() {
    return getSettings()
  }

  function refreshNames() {
    const system = galaxy.systems[state.systemIndex]
    state.systemName = system.name
    if (state.planetIndex != null) state.planetName = system.planets[state.planetIndex].name
  }

  function noise() {
    return noiseFor(state.seed, state.systemIndex, state.planetIndex || 0)
  }

  function aimAtPlanet(index) {
    const system = galaxy.systems[state.systemIndex]
    const layout = layoutSystem(system, state.time)
    const planet = layout.planets[index] || layout.planets[0]
    const dist = planet.radius + 20
    state.space.position = {
      x: planet.position.x + dist,
      y: planet.position.y + 5,
      z: planet.position.z + 7,
    }
    state.space.velocity = { x: 0, y: 0, z: 0 }
    state.space.pitch = -0.08
    state.space.roll = 0
    state.space.throttle = 0
    const dx = planet.position.x - state.space.position.x
    const dz = planet.position.z - state.space.position.z
    const len = Math.hypot(dx, dz) || 1
    state.space.yaw = Math.atan2(-dx / len, -dz / len)
  }

  function freshState(modeId, custom, slot, seed) {
    const params = resolveParams(modeId, custom)
    const parts = starterParts()
    const stats = deriveStats(parts)
    const unlocked = params.unlimited || params.instantBuild ? TECH.map((entry) => entry.id) : ['fieldcraft']
    const flight = settings().flight || {}
    return {
      version: 1,
      slot,
      seed,
      modeId,
      custom: modeId === 'custom' ? { ...params } : null,
      params,
      systemIndex: 0,
      planetIndex: null,
      biomeId: null,
      systemName: '',
      planetName: '',
      location: 'space',
      time: (params.dayLength || 480) * 0.22,
      research: params.unlimited ? 40 : 0,
      unlockedTech: unlocked,
      credits: params.unlimited ? 9999 : params.scarce ? 36 : 86,
      codex: { planets: {}, creatures: {}, plants: {} },
      inventory: emptyInventory(40),
      ship: {
        name: 'Paper Kite',
        parts,
        fuel: stats.fuelCap,
        shield: stats.shield,
      },
      blueprints: [],
      space: {
        position: { x: 0, y: 8, z: 40 },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        roll: 0,
        throttle: 0,
      },
      player: {
        position: { x: 0, y: 4, z: 2 },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        health: 100,
        maxHealth: 100,
        shields: 36,
        maxShields: 40,
        oxygen: 100,
        maxOxygen: 100,
        hazard: 100,
        maxHazard: 100,
        hunger: 82,
        thirst: 80,
        stamina: 100,
        effects: [],
        aboard: false,
        grounded: false,
        flying: false,
        crouch: false,
        tool: 'mine',
        hotbar: [0, 1, 2, 3, 4],
        hotbarIndex: 0,
        gravChute: false,
        lensBoost: 0,
        flareUntil: 0,
      },
      bases: [],
      graves: [],
      veins: {},
      harvested: {},
      looted: {},
      removed: {},
      markets: {},
      weather: { kind: 'clear', until: 0 },
      beacon: null,
      park: { x: 3, z: 12 },
      flight: {
        scheme: flight.scheme === '6dof' ? '6dof' : 'arcade',
        assist: flight.assist !== false,
        throttleMode: flight.throttleMode === 'hold' ? 'hold' : 'set',
      },
      menu: null,
      flags: { frozen: false, dying: false, capturing: false },
      stats: { crafted: 0, mined: 0, scanned: 0 },
      runtimeNote: '',
    }
  }

  function grantStarter() {
    addItem(state, 'ration', 2)
    addItem(state, 'pale-water', 2)
    addItem(state, 'blaster-cell', state.params.scarce ? 4 : 8)
    addItem(state, 'medpatch', 1)
    if (!state.params.scarce) addItem(state, 'lumen-frond', 1)
  }

  function normalize(next) {
    next.flags = next.flags || {}
    next.flags.frozen = false
    next.flags.dying = false
    next.player.effects = next.player.effects || []
    next.player.velocity = next.player.velocity || { x: 0, y: 0, z: 0 }
    next.space.velocity = next.space.velocity || { x: 0, y: 0, z: 0 }
    next.codex = next.codex || { planets: {}, creatures: {}, plants: {} }
    next.codex.planets = next.codex.planets || {}
    next.codex.creatures = next.codex.creatures || {}
    next.codex.plants = next.codex.plants || {}
    next.bases = next.bases || []
    next.graves = next.graves || []
    next.veins = next.veins || {}
    next.harvested = next.harvested || {}
    next.looted = next.looted || {}
    next.removed = next.removed || {}
    next.markets = next.markets || {}
    next.blueprints = next.blueprints || []
    next.unlockedTech = next.unlockedTech || ['fieldcraft']
    next.stats = next.stats || { crafted: 0, mined: 0, scanned: 0 }
    next.park = next.park || { x: 3, z: 12 }
    next.menu = null
    next.weather = next.weather || { kind: 'clear', until: 0 }
    if (!next.flight) next.flight = { scheme: 'arcade', assist: true, throttleMode: 'set' }
    if (!next.params) next.params = resolveParams(next.modeId || 'normal', next.custom)
    return next
  }

  function newGame({ modeId = 'normal', custom = null, slot = 0, seed = null } = {}) {
    const actual = (seed == null ? ((Math.random() * 4294967295) ^ Date.now()) : seed) >>> 0 || 1
    galaxy = generateGalaxy(actual)
    state = freshState(modeId, custom, slot, actual)
    runtime = blankRuntime()
    grantStarter()
    refreshNames()
    aimAtPlanet(0)
    if (machine.state !== 'SPACE') machine.force('SPACE')
    bus.emit('notify', { text: `${preset(modeId).label} begins in ${state.systemName}.` })
    return state
  }

  function loadGame(slot) {
    const loaded = readSlot(slot)
    if (!loaded) return { ok: false, error: 'That drawer is empty.' }
    state = normalize(loaded)
    state.slot = slot
    galaxy = generateGalaxy(state.seed)
    runtime = blankRuntime()
    refreshNames()
    const mode = state.location === 'surface' ? 'SURFACE' : state.location === 'station' ? 'STATION' : 'SPACE'
    if (machine.state !== mode) machine.force(mode)
    return { ok: true, location: state.location }
  }

  function saveGame(slot = state?.slot ?? 0) {
    if (!state) return { ok: false, error: 'Nothing to log.' }
    state.slot = slot
    state.menu = null
    return writeSlot(slot, state)
  }

  function hurt(amount, source) {
    if (!state || amount <= 0 || state.flags.dying) return
    const dmg = amount * (state.params.damage ?? 1)
    if (state.location === 'space') {
      let rest = dmg
      const pool = state.ship.shield || 0
      const absorb = Math.min(pool, rest)
      state.ship.shield = pool - absorb
      rest -= absorb
      runtime.shieldCd = 3.2
      if (rest > 0) {
        const living = state.ship.parts.filter((part) => (part.hp ?? 1) > 0)
        if (!living.length) state.player.health -= rest
        else {
          const part = living[Math.abs(Math.floor(state.time * 17)) % living.length]
          const max = PARTS[part.partId]?.hp || 20
          part.hp = Math.max(0, (part.hp ?? max) - rest)
          if (part.partId === 'cockpit-lantern' && part.hp <= 0) state.player.health -= 12
        }
      }
      return
    }
    let rest = dmg
    const absorb = Math.min(state.player.shields, rest)
    state.player.shields -= absorb
    rest -= absorb
    state.player.health = Math.max(0, state.player.health - rest)
    if (rest > 4) bus.emit('notify', { text: `Hit — ${source || 'something'}.` })
  }

  function die(reason) {
    if (!state || state.flags.dying) return state?.params?.permadeath ? 'permadeath' : 'grave'
    state.flags.dying = true
    state.player.health = 0
    if (state.params.permadeath) {
      deleteSlot(state.slot ?? 0)
      bus.emit('notify', { text: 'The log burned with the suit.' })
      state = null
      return 'permadeath'
    }
    const dropped = takeAll(state)
    const onSurface = state.location === 'surface'
    state.graves.push({
      id: uid('grave'),
      systemIndex: state.systemIndex,
      planetIndex: state.planetIndex,
      location: onSurface ? 'surface' : 'space',
      x: onSurface ? state.player.position.x : state.space.position.x,
      y: onSurface ? state.player.position.y : state.space.position.y,
      z: onSurface ? state.player.position.z : state.space.position.z,
      items: dropped,
      reason: reason || 'suit',
    })
    bus.emit('notify', { text: 'The suit failed. A cache marks where you folded.' })
    return 'grave'
  }

  function respawn() {
    if (!state) return { ok: false }
    state.flags.dying = false
    state.player.health = 58
    state.player.oxygen = 78
    state.player.hazard = 72
    state.player.hunger = Math.max(40, state.player.hunger)
    state.player.thirst = Math.max(40, state.player.thirst)
    state.player.shields = 18
    state.player.effects = []
    state.player.velocity = { x: 0, y: 0, z: 0 }
    state.player.aboard = false
    if (state.beacon) {
      state.systemIndex = state.beacon.systemIndex
      state.planetIndex = state.beacon.planetIndex
      const planet = galaxy.systems[state.systemIndex].planets[state.planetIndex]
      state.biomeId = planet.biome
      state.location = 'surface'
      refreshNames()
      state.player.position = { x: state.beacon.x + 1, y: state.beacon.y, z: state.beacon.z + 1 }
      runtime.creatures = []
      if (machine.state !== 'SURFACE') machine.force('SURFACE')
      return { ok: true, where: 'beacon' }
    }
    if (state.planetIndex != null) {
      state.location = 'surface'
      const planet = galaxy.systems[state.systemIndex].planets[state.planetIndex]
      state.biomeId = planet.biome
      refreshNames()
      const floor = sampleFloorHeight(noise(), state.park.x, state.park.z + 2, state.biomeId)
      state.player.position = { x: state.park.x, y: floor + 1.65, z: state.park.z + 2 }
      state.player.yaw = Math.PI
      runtime.creatures = []
      if (machine.state !== 'SURFACE') machine.force('SURFACE')
      return { ok: true, where: 'ship' }
    }
    state.location = 'space'
    if (machine.state !== 'SPACE') machine.force('SPACE')
    return { ok: true, where: 'space' }
  }

  function applyTransition(tr) {
    if (tr.kind === 'land') finishLanding(tr.planetIndex)
    if (tr.kind === 'launch') finishLaunch()
    if (tr.kind === 'dock') finishDock()
    if (tr.kind === 'warp') finishWarp(tr.index, tr.cost)
  }

  function advanceTransition(dt) {
    const tr = runtime.transition
    if (!tr) return
    tr.t += dt / 0.85
    if (!tr.switched && tr.t >= 0.5) {
      tr.switched = true
      applyTransition(tr)
    }
    if (tr.t >= 1) runtime.transition = null
  }

  function finishLanding(index) {
    const system = galaxy.systems[state.systemIndex]
    const planet = system.planets[index]
    state.planetIndex = index
    state.biomeId = planet.biome
    state.planetName = planet.name
    state.location = 'surface'
    const pad = pickPad(noise(), planet.biome)
    state.park = { x: pad.x, z: pad.z + 6 }
    state.player.aboard = false
    state.player.flying = false
    state.player.yaw = 0
    state.player.pitch = -0.1
    state.player.velocity = { x: 0, y: 0, z: 0 }
    const floor = sampleFloorHeight(noise(), pad.x, pad.z, planet.biome)
    state.player.position = { x: pad.x, y: floor + 1.7, z: pad.z }
    state.space.velocity = { x: 0, y: 0, z: 0 }
    state.space.throttle = 0
    runtime.creatures = []
    runtime.drones = []
    runtime.bolts = []
    runtime.glide = null
    runtime.baseRev++
    ensurePlanetEntry(state, lifeFor(state))
    if (machine.state !== 'SURFACE') machine.force('SURFACE')
    bus.emit('notify', { text: `${planet.name}, ${BIOMES[planet.biome].name}.` })
  }

  function finishLaunch() {
    const index = state.planetIndex ?? 0
    state.location = 'space'
    state.player.aboard = false
    aimAtPlanet(index)
    runtime.bolts = []
    runtime.drones = []
    if (machine.state !== 'SPACE') machine.force('SPACE')
    bus.emit('notify', { text: 'The kite clears the well.' })
  }

  function finishDock() {
    state.location = 'station'
    ensureMarket(state)
    if (machine.state !== 'STATION') machine.force('STATION')
    bus.emit('notify', { text: `${galaxy.systems[state.systemIndex].station.name} takes your line.` })
  }

  function finishWarp(index, cost) {
    if (!state.params.unlimited && cost > 0) state.ship.fuel = Math.max(0, state.ship.fuel - cost)
    state.systemIndex = index
    state.location = 'space'
    state.planetIndex = null
    state.biomeId = null
    refreshNames()
    aimAtPlanet(0)
    runtime.pirates = []
    runtime.bolts = []
    runtime.creatures = []
    runtime.glide = null
    if (machine.state !== 'SPACE') machine.force('SPACE')
    bus.emit('notify', { text: `Folded into ${state.systemName}.` })
  }

  function requestLand(flight) {
    if (!state || runtime.transition) return { ok: false, error: 'Not now.' }
    const status = flight || flightStatus(state, galaxy)
    if (!status.canLand) return { ok: false, error: 'Too fast, or no world close enough.' }
    runtime.transition = { kind: 'land', t: 0, switched: false, planetIndex: status.near.index }
    bus.emit('sfx', 'ui')
    return { ok: true }
  }

  function requestLaunch() {
    if (!state || runtime.transition) return { ok: false, error: 'Not now.' }
    if (state.location === 'station') {
      state.location = 'space'
      if (machine.state !== 'SPACE') machine.force('SPACE')
      return { ok: true }
    }
    if (state.location !== 'surface') return { ok: false, error: 'Already aloft.' }
    if (!nearShip(state) && !state.player.aboard) return { ok: false, error: 'Get back to the kite.' }
    const report = validateShip(state.ship.parts)
    if (!report.ok) return { ok: false, error: report.errors[0] }
    runtime.transition = { kind: 'launch', t: 0, switched: false }
    bus.emit('sfx', 'ui')
    return { ok: true }
  }

  function requestDock() {
    if (!state || runtime.transition) return { ok: false }
    const status = flightStatus(state, galaxy)
    if (!status.canDock) return { ok: false, error: 'The bell is still far.' }
    runtime.transition = { kind: 'dock', t: 0, switched: false }
    bus.emit('sfx', 'ui')
    return { ok: true }
  }

  function requestWarp(index) {
    if (!state || runtime.transition) return { ok: false, error: 'Not now.' }
    if (index == null || index < 0 || index >= galaxy.systems.length) return { ok: false, error: 'No such margin.' }
    const report = validateShip(state.ship.parts)
    if (!report.hasDrive) return { ok: false, error: 'No lantern drive is bolted to this hull.' }
    if (index === state.systemIndex && state.location === 'space') return { ok: false, error: 'You are already in this margin.' }
    const cost = 14 * (state.params.fuelCost || 0)
    if (!state.params.unlimited && state.ship.fuel < cost) return { ok: false, error: 'The drive wants more fuel.' }
    runtime.transition = { kind: 'warp', t: 0, switched: false, index, cost }
    bus.emit('sfx', 'warp')
    return { ok: true }
  }

  function skipTransition() {
    const tr = runtime.transition
    if (!tr) return
    if (!tr.switched) applyTransition(tr)
    runtime.transition = null
  }

  function toggleMenu(name) {
    state.menu = state.menu === name ? null : name
  }

  function globalKeys(input) {
    if (input.pressed('pause')) {
      if (state.menu) {
        state.menu = null
        return
      }
      if (machine.state === 'SHIP_EDITOR' || machine.state === 'GALAXY_MAP' || machine.state === 'BASE_BUILD') {
        const back = state.location === 'surface' ? 'SURFACE' : state.location === 'station' ? 'STATION' : 'SPACE'
        machine.force(machine.state === 'BASE_BUILD' ? 'SURFACE' : back)
        return
      }
      if (machine.state === 'PAUSED') machine.resume()
      else if (machine.state !== 'DEAD') machine.pause()
      return
    }
    if (input.pressed('uiBack')) {
      if (state.menu) {
        state.menu = null
        return
      }
      if (machine.state === 'SHIP_EDITOR' || machine.state === 'GALAXY_MAP' || machine.state === 'BASE_BUILD') {
        const back = state.location === 'surface' ? 'SURFACE' : state.location === 'station' ? 'STATION' : 'SPACE'
        machine.force(machine.state === 'BASE_BUILD' ? 'SURFACE' : back)
        return
      }
    }
    if (machine.state === 'PAUSED' || machine.state === 'DEAD') return
    if (input.pressed('inventory')) toggleMenu('inventory')
    if (input.pressed('craft')) {
      if (state.location !== 'space') toggleMenu('craft')
    }
    if (input.pressed('tech')) toggleMenu('tech')
    if (input.pressed('discoveries')) toggleMenu('discoveries')
    if (input.pressed('map')) {
      state.menu = null
      if (machine.state === 'GALAXY_MAP') machine.force(machine.previous === 'GALAXY_MAP' ? 'SPACE' : machine.previous)
      else machine.force('GALAXY_MAP')
    }
  }

  function cycleCategory(runtime) {
    const editor = runtime.editor
    if (!editor) return
    const index = PART_CATEGORIES.indexOf(editor.category)
    editor.category = PART_CATEGORIES[(index + 1) % PART_CATEGORIES.length]
    const list = partsInCategory(editor.category)
    if (list[0]) runtime.partPick = list[0].id
  }

  function cyclePart(runtime) {
    const editor = runtime.editor
    if (!editor) return
    const list = partsInCategory(editor.category)
    if (!list.length) return
    const index = Math.max(0, list.findIndex((part) => part.id === runtime.partPick))
    runtime.partPick = list[(index + 1) % list.length].id
  }

  function tickEditor(input) {
    const editor = runtime.editor
    if (!editor) return
    if (input.pressed('uiLeft')) moveCursor(state, runtime, -1, 0, 0)
    if (input.pressed('uiRight')) moveCursor(state, runtime, 1, 0, 0)
    if (input.pressed('uiUp')) moveCursor(state, runtime, 0, 0, -1)
    if (input.pressed('uiDown')) moveCursor(state, runtime, 0, 0, 1)
    if (input.pressed('strafeUp')) moveCursor(state, runtime, 0, 1, 0)
    if (input.pressed('crouch')) moveCursor(state, runtime, 0, -1, 0)
    for (const code of input.pressedCodes()) {
      if (code === 'BracketLeft') editor.rot = (editor.rot + 3) % 4
      if (code === 'BracketRight') editor.rot = (editor.rot + 1) % 4
      if (code === 'KeyZ') undoEdit(state, runtime)
    }
    if (input.pressed('uiConfirm')) {
      const res = placePart(state, runtime, runtime.partPick || 'hull-cube')
      if (!res.ok && res.error) bus.emit('notify', { text: res.error })
    }
    if (input.pressed('altFire')) erasePart(state, runtime)
  }

  function tickSpace(dt, input) {
    runtime.flight = updateFlight(state, input, dt, galaxy)
    runtime.shieldCd = Math.max(0, runtime.shieldCd - dt)
    if (runtime.shieldCd <= 0) {
      const max = deriveStats(state.ship.parts).shield
      state.ship.shield = Math.min(max, (state.ship.shield || 0) + 8 * dt)
    }
    tickCombat(state, runtime, dt, bus, hurt)
    if (input.pressed('land')) {
      if (runtime.glide != null) {
        runtime.glide = null
        bus.emit('notify', { text: 'Glide cancelled.' })
      } else if (runtime.flight?.canLand) {
        const res = requestLand(runtime.flight)
        if (!res.ok && res.error) bus.emit('notify', { text: res.error })
      } else if (runtime.flight?.near && runtime.flight.near.distance < 220) {
        runtime.glide = runtime.flight.near.index
        bus.emit('notify', { text: 'The kite noses toward the world.' })
      } else bus.emit('notify', { text: 'No world close enough to set down.' })
    }
    if (runtime.glide != null && !runtime.transition) {
      const layout = layoutSystem(galaxy.systems[state.systemIndex], state.time)
      const planet = layout.planets[runtime.glide]
      if (planet?.position) {
        const p = planet.position
        const dx = state.space.position.x - p.x
        const dy = state.space.position.y - p.y
        const dz = state.space.position.z - p.z
        const len = Math.hypot(dx, dy, dz) || 1
        const hover = planet.radius + 18
        const tx = p.x + (dx / len) * hover
        const ty = p.y + 4
        const tz = p.z + (dz / len) * hover
        const k = Math.min(1, dt * 2.4)
        state.space.position.x += (tx - state.space.position.x) * k
        state.space.position.y += (ty - state.space.position.y) * k
        state.space.position.z += (tz - state.space.position.z) * k
        state.space.velocity.x *= 0.72
        state.space.velocity.y *= 0.72
        state.space.velocity.z *= 0.72
        state.space.throttle = 0.7
        const fdx = p.x - state.space.position.x
        const fdz = p.z - state.space.position.z
        const fl = Math.hypot(fdx, fdz) || 1
        state.space.yaw = Math.atan2(-fdx / fl, -fdz / fl)
        state.space.pitch = -0.18
        runtime.flight = flightStatus(state, galaxy)
        if (runtime.flight.canLand) {
          runtime.glide = null
          state.space.velocity = { x: 0, y: 0, z: 0 }
          requestLand(runtime.flight)
        }
      } else runtime.glide = null
    }
    if (input.pressed('interact')) {
      const grave = state.graves.find((entry) => entry.location === 'space' && entry.systemIndex === state.systemIndex && Math.hypot(entry.x - state.space.position.x, entry.z - state.space.position.z) < 14)
      if (grave) {
        const left = giveMany(state, grave.items)
        grave.items = left
        if (!left.length) state.graves = state.graves.filter((entry) => entry !== grave)
        bus.emit('notify', { text: 'You gathered the drifting cache.' })
      } else if (runtime.flight.canDock) requestDock()
    }
    if (input.pressed('fire')) fireShip(state, runtime, bus)
    if (input.pressed('target')) {
      const locked = cycleTarget(runtime)
      bus.emit('notify', { text: locked ? `Lock: ${locked.name}` : 'No kite to lock.' })
    }
    if (input.pressed('assistToggle')) {
      state.flight.assist = !state.flight.assist
      bus.emit('notify', { text: state.flight.assist ? 'Flight assist on. The kite settles.' : 'Flight assist off. The kite drifts.' })
    }
    if (input.pressed('launch') && state.player) { /* launch is land's twin; ignore in space */ }
    runtime.prompt = buildPrompts(state, runtime, runtime.flight)
  }

  function tickSurface(dt, input) {
    if (input.isDown('toolWheel')) {
      runtime.wheel = true
      if (input.pressed('uiLeft')) runtime.wheelIndex = (runtime.wheelIndex + 2) % 3
      if (input.pressed('uiRight')) runtime.wheelIndex = (runtime.wheelIndex + 1) % 3
      const wheel = input.consumeWheel()
      if (wheel) runtime.wheelIndex = (runtime.wheelIndex + (wheel > 0 ? 1 : 2)) % 3
      input.consumeLook()
      runtime.prompt = ['Release to keep the tool']
      return
    }
    if (runtime.wheel) {
      state.player.tool = ['mine', 'blaster', 'scan'][runtime.wheelIndex] || 'mine'
      runtime.wheel = false
      bus.emit('notify', { text: `Multitool: ${state.player.tool}` })
    }
    for (let i = 1; i <= 5; i++) {
      if (input.pressed(`quick${i}`)) {
        state.player.hotbarIndex = i - 1
        state.inventory.selected = state.player.hotbar[i - 1] ?? 0
      }
    }
    const walk = updateWalker(state, input, dt, noise(), hurt)
    runtime.cave = !!walk.cave
    const body = tickSurvival(state, dt, runtime.cave, hurt)
    runtime.shelter = body.shelter
    runtime.storm = body.storm
    if (state.location === 'surface') {
      state.player.shields = Math.min(state.player.maxShields, state.player.shields + dt * 1.2)
    }
    tickCreatures(state, runtime, dt, noise(), hurt, bus)
    tickCombat(state, runtime, dt, bus, hurt)
    updateBases(state, dt)
    if (machine.state === 'BASE_BUILD') updateGhost(input)
    else tickTools(state, runtime, dt, input, bus)
    if (machine.state !== 'BASE_BUILD' && state.player.tool === 'blaster' && (input.pressed('fire') || input.isDown('fire'))) {
      fireFoot(state, runtime, bus)
    }
    if (input.pressed('interact')) {
      const res = interact(state, runtime, bus)
      if (res?.beacon) saveGame(state.slot ?? 0)
      if (res?.teleport) {
        const planet = galaxy.systems[state.systemIndex].planets[state.planetIndex]
        state.biomeId = planet.biome
        refreshNames()
        runtime.creatures = []
        runtime.baseRev++
      }
      if (res && res.ok === false && res.error) bus.emit('notify', { text: res.error })
    }
    if (input.pressed('launch')) {
      const res = requestLaunch()
      if (!res.ok && res.error) bus.emit('notify', { text: res.error })
    }
    if (input.pressed('build')) {
      if (machine.state === 'BASE_BUILD') machine.force('SURFACE')
      else machine.force('BASE_BUILD')
    }
    if (input.pressed('shipEditor') && (nearShip(state) || state.location === 'station')) {
      openEditor(state, runtime)
      machine.force('SHIP_EDITOR')
    }
    runtime.prompt = buildPrompts(state, runtime, null)
    if (machine.state === 'BASE_BUILD') runtime.prompt.unshift(runtime.build.demolish ? 'Lift piece [fire]' : 'Set piece [fire]')
  }

  function updateGhost(input) {
    const dir = {
      x: Math.sin(state.player.yaw) * Math.cos(state.player.pitch),
      y: Math.sin(state.player.pitch),
      z: Math.cos(state.player.yaw) * Math.cos(state.player.pitch),
    }
    const x = Math.round(state.player.position.x + dir.x * 4.5)
    const z = Math.round(state.player.position.z + dir.z * 4.5)
    const floor = sampleFloorHeight(noise(), x, z, state.biomeId)
    let y = Math.max(0, Math.round(floor))
    const base = basesHere(state)[0]
    if (base) {
      const column = base.pieces.filter((piece) => piece.x === x && piece.z === z)
      if (column.length) y = Math.max(...column.map((piece) => piece.y)) + 1
    }
    const occupied = !!base?.pieces.some((piece) => piece.x === x && piece.y === y && piece.z === z)
    runtime.ghost = { x, y, z, valid: !occupied, blockId: runtime.build.blockId, rot: runtime.build.rot }
    if (input.pressed('fire')) {
      if (runtime.build.demolish) {
        const target = base?.pieces.find((piece) => Math.hypot(piece.x - x, piece.z - z) < 1.2 && Math.abs(piece.y - y) <= 1)
        const res = target ? removeBlock(state, target.x, target.y, target.z) : { ok: false, error: 'Nothing to lift.' }
        if (!res.ok) bus.emit('notify', { text: res.error })
        else runtime.baseRev++
      } else if (runtime.ghost.valid) {
        const res = placeBlock(state, runtime.build.blockId, x, y, z, runtime.build.rot)
        if (!res.ok) bus.emit('notify', { text: res.error })
        else {
          runtime.baseRev++
          bus.emit('sfx', 'ui')
        }
      }
    }
    for (const code of input.pressedCodes()) {
      if (code === 'BracketRight') runtime.build.rot = (runtime.build.rot + 1) % 4
    }
  }

  function update(dt, input) {
    if (!state || state.flags.frozen) {
      input.consumeLook()
      input.consumeWheel()
      return null
    }
    state.time += Math.min(0.05, dt)
    runtime.label = (action) => labelFor(settings().bindings?.[action]?.[0])
    advanceTransition(Math.min(0.05, dt))
    const mode = machine.state
    if (mode === 'TITLE' || mode === 'MODE_SELECT') {
      input.consumeLook()
      input.consumeWheel()
      return null
    }
    if (mode === 'DEAD') {
      input.consumeLook()
      input.consumeWheel()
      if (input.pressed('uiConfirm')) respawn()
      return null
    }
    globalKeys(input)
    if (state.menu || mode === 'PAUSED' || mode === 'GALAXY_MAP' || mode === 'SHIP_EDITOR' || mode === 'STATION') {
      input.consumeLook()
      input.consumeWheel()
      if (mode === 'SHIP_EDITOR') tickEditor(input)
      if (mode === 'STATION' && input.pressed('launch')) requestLaunch()
      if (mode === 'STATION' && input.pressed('shipEditor')) {
        openEditor(state, runtime)
        machine.force('SHIP_EDITOR')
      }
      if (mode === 'SHIP_EDITOR' && input.pressed('scan')) cyclePart(runtime)
      if (mode === 'SHIP_EDITOR' && input.pressed('toolWheel')) cycleCategory(runtime)
      runtime.prompt = buildPrompts(state, runtime, flightStatus(state, galaxy))
      return { mode }
    }
    if (mode === 'SPACE') tickSpace(dt, input)
    else if (mode === 'SURFACE' || mode === 'BASE_BUILD') tickSurface(dt, input)
    else {
      input.consumeLook()
      input.consumeWheel()
    }
    if (state && state.player.health <= 0 && !state.flags.dying) {
      const kind = die('suit')
      if (kind === 'permadeath') machine.force('TITLE')
      else machine.force('DEAD')
    }
    return { mode }
  }

  function signature() {
    if (!state) return ''
    return JSON.stringify({
      modeId: state.modeId,
      seed: state.seed,
      systemIndex: state.systemIndex,
      planetIndex: state.planetIndex,
      location: state.location,
      credits: state.credits,
      research: state.research,
      fuel: Math.round(state.ship.fuel * 10) / 10,
      parts: state.ship.parts.map((part) => [part.partId, part.x, part.y, part.z]),
      items: state.inventory.slots.filter(Boolean).map((slot) => [slot.id, slot.count]),
      bases: state.bases.map((base) => [base.systemIndex, base.planetIndex, base.pieces.map((piece) => piece.blockId)]),
      tech: [...state.unlockedTech].sort(),
      hazard: state.modeId === 'custom' ? state.params.hazardRate : null,
      graves: state.graves.length,
    })
  }

  function unlock(id) {
    const def = TECH_BY_ID[id]
    if (!def) return { ok: false, error: 'No such folio.' }
    if (state.unlockedTech.includes(id)) return { ok: false, error: 'Already copied.' }
    if (def.prereq.some((need) => !state.unlockedTech.includes(need))) return { ok: false, error: 'Earlier folios first.' }
    if (!state.params.unlimited && state.research < def.cost) return { ok: false, error: 'Not enough survey points.' }
    if (!state.params.unlimited) state.research -= def.cost
    state.unlockedTech.push(id)
    bus.emit('notify', { text: `Unlocked ${def.name}.` })
    return { ok: true, name: def.name }
  }

  return {
    get state() { return state },
    get galaxy() { return galaxy },
    get runtime() { return runtime },
    newGame,
    loadGame,
    saveGame,
    update,
    signature,
    hurt,
    die,
    respawn,
    requestLand,
    requestLaunch,
    requestDock,
    requestWarp,
    skipTransition,
    aimAtPlanet,
    unlock,
    flightStatus: () => (state && galaxy ? flightStatus(state, galaxy) : null),
    craft: (id) => craftRecipe(state, id),
    mine(seconds = 3) {
      state.player.tool = 'mine'
      state.player.position.x = 7
      state.player.position.z = 2
      state.player.yaw = 0
      state.player.pitch = -0.15
      const floor = sampleFloorHeight(noise(), 7, 2, state.biomeId)
      state.player.position.y = floor + 1.65
      const fake = { isDown: (action) => action === 'fire', pressed: () => false }
      let t = 0
      const step = 0.1
      while (t < seconds) {
        tickTools(state, runtime, step, fake, bus)
        t += step
      }
      return countItem(state, 'drift-ore')
    },
    scan: () => pulseScan(state, runtime, bus),
    place(blockId, x, y, z, rot = 0) {
      const res = placeBlock(state, blockId, x, y, z, rot)
      if (res.ok) runtime.baseRev++
      return res
    },
    remove(x, y, z) {
      const res = removeBlock(state, x, y, z)
      if (res.ok) runtime.baseRev++
      return res
    },
    give(id, n = 1) {
      return addItem(state, id, n)
    },
    editorPlace(partId, x, y, z) {
      openEditor(state, runtime)
      if (x != null) runtime.editor.cursor = { x, y, z }
      runtime.partPick = partId
      return placePart(state, runtime, partId, x != null ? { x, y, z } : undefined)
    },
    editorCommit: () => commitEditor(state, runtime),
    editorUndo: () => undoEdit(state, runtime),
    editorErase: () => erasePart(state, runtime),
    editorRedo: () => redoEdit(state, runtime),
    editorPaint: () => paintCursor(state, runtime),
    editorReport: () => editorReport(state, runtime),
    saveBlueprint: (name) => saveDraftBlueprint(state, runtime, name),
    loadBlueprint: (name) => loadDraftBlueprint(state, runtime, name),
    stats: () => deriveStats(state.ship.parts),
    market: () => ensureMarket(state),
    buy: (id) => buyGood(state, id),
    sell: (id) => sellGood(state, id),
    buyBlueprint: (id) => buyBlueprint(state, id),
    sellBlueprint: (name) => sellBlueprint(state, name),
    refuel: () => refuelShip(state),
    repair: () => repairAtStation(state),
    power() {
      const base = basesHere(state)[0]
      if (!base) return null
      return summarizePower(base, state.time, state.params.dayLength || 480)
    },
    tick(dt = 0.05) {
      if (!state) return
      const idle = {
        isDown: () => false,
        pressed: () => false,
        consumeLook: () => ({ x: 0, y: 0 }),
        consumeWheel: () => 0,
        pressedCodes: () => [],
        moveAxes: () => ({ x: 0, y: 0 }),
      }
      const frozen = state.flags.frozen
      state.flags.frozen = false
      update(dt, idle)
      if (state) state.flags.frozen = frozen
    },
    spawnPirates: (n) => spawnPirates(state, runtime, bus, n),
    nearby: () => nearbyFeatures(state, 1),
    summaries: () => [0, 1, 2].map((slot) => slotSummary(slot)),
    exportSlot: (slot) => exportText(slot ?? state?.slot ?? 0),
    importSlot: (text, slot) => {
      const loaded = importText(text, slot)
      return loadGame(slot) && loaded
    },
    setFlight(partial) {
      Object.assign(state.flight, partial)
      const current = settings()
      current.flight = { ...current.flight, ...state.flight }
    },
    setParams(partial) {
      Object.assign(state.params, partial)
    },
    teleport(partial) {
      if (partial.location) state.location = partial.location
      if (partial.system != null) state.systemIndex = partial.system
      if (partial.planet != null) {
        state.planetIndex = partial.planet
        state.biomeId = galaxy.systems[state.systemIndex].planets[partial.planet].biome
        refreshNames()
      }
      const bag = partial.location === 'space' ? state.space.position : state.player.position
      if (partial.x != null) bag.x = partial.x
      if (partial.y != null) bag.y = partial.y
      if (partial.z != null) bag.z = partial.z
      if (partial.location === 'surface') runtime.creatures = []
    },
    approach(index = 0) {
      aimAtPlanet(index)
      return flightStatus(state, galaxy)
    },
    approachStation() {
      const layout = layoutSystem(galaxy.systems[state.systemIndex], state.time)
      const st = layout.station.position
      state.space.position = { x: st.x + 8, y: st.y + 1, z: st.z }
      state.space.velocity = { x: 0, y: 0, z: 0 }
      state.space.throttle = 0
      return flightStatus(state, galaxy)
    },
  }
}
