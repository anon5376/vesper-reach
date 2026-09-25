import { ITEMS } from '../data/items.js'
import { seaOf } from '../worldgen/terrain.js'
import { addItem } from '../inventory/inventory.js'
import { useItem, selectedStack } from '../inventory/inventory.js'
import { harvestFarm, interactBase, teleportToNext } from '../base/base.js'
import { giveMany } from '../inventory/inventory.js'
import { lifeFor, nearbyFeatures } from './tools.js'
import { rngFrom } from '../rng/rng.js'

export function buildPrompts(state, runtime, flight) {
  const prompts = []
  const label = (action) => (runtime.label ? runtime.label(action) : action)
  if (!state) return prompts
  if (state.location === 'space' && flight) {
    if (flight.canLand) prompts.push(`Set down [${label('land')}]`)
    if (flight.canDock) prompts.push(`Ask the bell [${label('interact')}]`)
    prompts.push(`Chart [${label('map')}]`)
    if (state.ship.fuel < 8) prompts.push('Tanks are thin')
  }
  if (state.location === 'surface') {
    if (nearShip(state)) prompts.push(`Lift off [${label('launch')}]`)
    if (nearShip(state)) prompts.push(`Shipyard [${label('shipEditor')}]`)
    const grave = nearGrave(state)
    if (grave) prompts.push(`Recover cache [${label('interact')}]`)
    const feature = aimedFeature(state)
    if (feature?.poi === 'deposit') prompts.push(`Mine vein [${label('fire')}]`)
    if (feature?.kind === 'plant') prompts.push(`Harvest [${label('interact')}]`)
    if (feature?.poi === 'outpost' || feature?.poi === 'crash' || feature?.poi === 'ruin') prompts.push(`Search [${label('interact')}]`)
    prompts.push(`Build [${label('build')}]`)
  }
  if (state.location === 'station') prompts.push(`Cast off [${label('launch')}]`)
  return prompts.slice(0, 3)
}

export function nearShip(state) {
  if (state.location !== 'surface' || !state.park) return false
  return Math.hypot(state.player.position.x - state.park.x, state.player.position.z - state.park.z) < 8
}

function nearGrave(state) {
  let best = null
  let bestD = 3.2
  for (const grave of state.graves) {
    if (grave.systemIndex !== state.systemIndex || grave.planetIndex !== state.planetIndex) continue
    if (grave.location !== 'surface') continue
    const d = Math.hypot(grave.x - state.player.position.x, grave.z - state.player.position.z)
    if (d < bestD) {
      bestD = d
      best = grave
    }
  }
  return best
}

function aimedFeature(state) {
  const pos = state.player.position
  let best = null
  let bestD = 4.5
  for (const feature of nearbyFeatures(state, 1)) {
    const d = Math.hypot(feature.x - pos.x, feature.z - pos.z)
    if (d < bestD) {
      bestD = d
      best = feature
    }
  }
  return best
}

export function interact(state, runtime, bus) {
  if (state.location === 'surface') {
    const grave = nearGrave(state)
    if (grave) {
      const left = giveMany(state, grave.items)
      grave.items = left
      if (!left.length) state.graves = state.graves.filter((entry) => entry !== grave)
      bus.emit('notify', { text: left.length ? 'Recovered what would fit.' : 'The cache is back in your pockets.' })
      bus.emit('sfx', 'ui')
      return { ok: true }
    }
    const baseHit = interactBase(state)
    if (baseHit?.kind === 'beacon') {
      state.beacon = {
        systemIndex: state.systemIndex,
        planetIndex: state.planetIndex,
        x: state.player.position.x,
        y: state.player.position.y,
        z: state.player.position.z,
      }
      bus.emit('notify', { text: 'The Margin Bell has your name.' })
      bus.emit('sfx', 'ui')
      return { ok: true, beacon: true }
    }
    if (baseHit?.kind === 'teleporter') {
      if (!baseHit.base.powered && !state.params.unlimited) {
        return { ok: false, error: 'The paired bell is dark. Feed the camp some power.' }
      }
      const jumped = teleportToNext(state, baseHit.piece)
      if (!jumped.ok) return jumped
      bus.emit('notify', { text: `Stepped through to ${jumped.name}.` })
      bus.emit('sfx', 'warp')
      return { ok: true, teleport: true }
    }
    if (baseHit?.kind === 'storage') {
      state.menu = 'storage'
      runtime.storageUid = baseHit.piece.uid
      return { ok: true }
    }
    if (baseHit?.kind === 'farm') {
      const harvested = harvestFarm(state, baseHit.piece)
      if (harvested.ok) bus.emit('notify', { text: 'The plot gave up a handful of green.' })
      return harvested
    }
    if (baseHit?.kind === 'pad') {
      bus.emit('notify', { text: 'The pad will take a hull. Press the shipyard key.' })
      return { ok: true }
    }
    const feature = aimedFeature(state)
    if (feature?.kind === 'plant' && !state.harvested[feature.id]) {
      const life = lifeFor(state)
      const plant = life.plants[feature.plantIndex % Math.max(1, life.plants.length)]
      const id = plant?.harvest || 'lumen-frond'
      if (addItem(state, id, 1) > 0) return { ok: false, error: 'Pockets full.' }
      state.harvested[feature.id] = true
      bus.emit('notify', { text: `Cut ${ITEMS[id]?.name || id}.` })
      bus.emit('sfx', 'ui')
      return { ok: true }
    }
    if (feature && (feature.poi === 'outpost' || feature.poi === 'crash' || feature.poi === 'ruin') && !state.looted[feature.id]) {
      const rng = rngFrom(state.seed, 'loot', feature.id)
      const table = feature.poi === 'crash'
        ? ['drift-ore', 'repair-foam', 'ration']
        : feature.poi === 'outpost'
          ? ['map-folio', 'blaster-cell', 'pale-water', 'filament-wire']
          : ['brine-salt', 'glass-sand', 'map-folio']
      const id = rng.pick(table)
      const count = 1 + rng.int(2)
      addItem(state, id, count)
      state.looted[feature.id] = true
      state.research += 1
      bus.emit('notify', { text: `The ${feature.poi} kept ${ITEMS[id]?.name || id}.` })
      bus.emit('sfx', 'ui')
      return { ok: true }
    }
    const sea = seaOf(state.biomeId)
    if (state.player.position.y < sea + 1.7 && state.player.grounded) {
      if (!runtime.sip || state.time - runtime.sip > 1.2) {
        runtime.sip = state.time
        if (addItem(state, 'pale-water', 1) === 0) {
          bus.emit('notify', { text: 'Filled a palm with pale water.' })
          return { ok: true }
        }
      }
    }
    if (nearShip(state)) {
      state.player.aboard = !state.player.aboard
      bus.emit('notify', { text: state.player.aboard ? 'You fold into the lantern seat.' : 'Boots on the ground again.' })
      return { ok: true }
    }
  }
  const index = selectedStack(state)
  const slot = state.inventory.slots[index]
  if (slot?.id === 'repair-foam') {
    slot.count -= 1
    if (slot.count <= 0) state.inventory.slots[index] = null
    bus.emit('repair-ship', { amount: 36 })
    bus.emit('notify', { text: 'Foam crawls over the plates.' })
    bus.emit('sfx', 'ui')
    return { ok: true }
  }
  if (slot && ['food', 'drink', 'consumable'].includes(ITEMS[slot.id]?.kind)) {
    const used = useItem(state, index)
    if (used.ok) {
      bus.emit('notify', { text: `Used ${used.name}.` })
      bus.emit('sfx', 'ui')
    }
    return used
  }
  return { ok: false, error: 'Nothing here answers.' }
}
