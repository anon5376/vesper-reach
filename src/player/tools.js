import { BIOMES } from '../data/biomes.js'
import { addItem } from '../inventory/inventory.js'
import { planetLife, chunkFeatures } from '../worldgen/features.js'
import { CHUNK_SIZE, chunkOf } from '../worldgen/terrain.js'

export function lookDir(player) {
  const cp = Math.cos(player.pitch)
  return {
    x: Math.sin(player.yaw) * cp,
    y: Math.sin(player.pitch),
    z: Math.cos(player.yaw) * cp,
  }
}

export function nearbyFeatures(state, radius = 1) {
  if (state.planetIndex == null) return []
  const { cx, cz } = chunkOf(state.player.position.x, state.player.position.z)
  const list = []
  for (let x = cx - radius; x <= cx + radius; x++) {
    for (let z = cz - radius; z <= cz + radius; z++) {
      const found = chunkFeatures(state.seed, state.systemIndex, state.planetIndex, x, z, state.biomeId)
      for (const feature of found) list.push(feature)
    }
  }
  return list
}

export function veinAmount(state, feature) {
  if (!feature || feature.poi !== 'deposit') return 0
  if (state.veins[feature.id] == null) state.veins[feature.id] = feature.amount || 0
  return state.veins[feature.id]
}

export function lifeFor(state) {
  if (state.planetIndex == null) return { species: [], plants: [] }
  return planetLife(state.seed, state.systemIndex, state.planetIndex, state.planetName || 'World')
}

export function ensurePlanetEntry(state, life) {
  const key = `${state.systemIndex}:${state.planetIndex}`
  if (!state.codex.planets[key]) {
    state.codex.planets[key] = {
      name: state.planetName,
      biome: state.biomeId,
      system: state.systemName,
      resources: [],
      species: [],
      plants: [],
      speciesTotal: life?.species?.length || 0,
      plantTotal: life?.plants?.length || 0,
    }
    state.research += 1
  }
  return state.codex.planets[key]
}

function remember(entry, listName, value) {
  if (!value || entry[listName].includes(value)) return false
  entry[listName].push(value)
  return true
}

export function tickTools(state, runtime, dt, input, bus) {
  runtime.beam = false
  if (state.location !== 'surface') return
  const mining = state.player.tool === 'mine' && input.isDown('fire') && !state.menu
  if (mining) {
    runtime.beam = true
    const pace = 0.55 + Math.max(0.25, state.params.resourceYield || 1) * 0.7
    runtime.mineAcc += dt * pace
    if (runtime.mineAcc >= 0.7) {
      runtime.mineAcc = 0
      if (extract(state, bus)) runtime.mineHeat += 1
    }
  }
  runtime.mineHeat = Math.max(0, runtime.mineHeat - dt * 0.12)
  const wantScan = input.pressed('scan') || (state.player.tool === 'scan' && input.pressed('fire'))
  if (wantScan) pulseScan(state, runtime, bus)
  if (runtime.scanPulse > 0) runtime.scanPulse = Math.max(0, runtime.scanPulse - dt)
}

export function extract(state, bus) {
  const features = nearbyFeatures(state, 1)
  const pos = state.player.position
  const dir = lookDir(state.player)
  let best = null
  let bestDist = 8
  for (const feature of features) {
    if (feature.kind === 'poi' && feature.poi === 'deposit') {
      if (veinAmount(state, feature) <= 0) continue
    } else if (feature.kind !== 'rock') continue
    const dx = feature.x - pos.x
    const dz = feature.z - pos.z
    const dist = Math.hypot(dx, dz)
    if (dist > 7.5) continue
    const dot = (dx * dir.x + dz * dir.z) / (dist || 1)
    if (dot < 0.15 && dist > 3) continue
    if (dist < bestDist) {
      bestDist = dist
      best = feature
    }
  }
  const biome = BIOMES[state.biomeId] || BIOMES.lush
  const count = Math.max(1, Math.round(state.params.resourceYield >= 1 ? state.params.resourceYield : 1))
  const id = best?.resource || best?.kind === 'rock' && biome.resources[1] || biome.resources[0] || 'drift-ore'
  const resourceId = best?.poi === 'deposit' ? (best.resource || 'drift-ore') : id
  const left = addItem(state, resourceId, count)
  if (left >= count) {
    bus.emit('notify', { text: 'Pockets full.' })
    return false
  }
  if (best?.poi === 'deposit') state.veins[best.id] = Math.max(0, veinAmount(state, best) - 1)
  state.stats.mined = (state.stats.mined || 0) + count - (left > 0 ? left : 0)
  const entry = ensurePlanetEntry(state, lifeFor(state))
  if (remember(entry, 'resources', resourceId)) {
    state.research += 1
    bus.emit('notify', { text: `Filed ${resourceId.replaceAll('-', ' ')} in the folio.` })
  }
  bus.emit('sfx', 'mine')
  return true
}

export function pulseScan(state, runtime, bus) {
  if (state.location !== 'surface' || state.planetIndex == null) {
    bus.emit('notify', { text: 'The lens wants ground under it.' })
    return { ok: false }
  }
  if (runtime.lastScan && state.time - runtime.lastScan < 0.35) return { ok: false }
  runtime.lastScan = state.time
  runtime.scanPulse = 1
  const life = lifeFor(state)
  const entry = ensurePlanetEntry(state, life)
  const range = 28 + (state.player.lensBoost || 0) * 10
  const pos = state.player.position
  let notes = 0
  for (const feature of nearbyFeatures(state, 2)) {
    if (Math.hypot(feature.x - pos.x, feature.z - pos.z) > range) continue
    if (feature.kind === 'plant' && life.plants.length) {
      const plant = life.plants[feature.plantIndex % life.plants.length]
      const key = `${state.systemIndex}:${state.planetIndex}:flora:${plant.name}`
      if (!state.codex.plants[key]) {
        state.codex.plants[key] = { name: plant.name, form: plant.form, planet: state.planetName }
        notes += 1
        state.research += 1
      }
      if (remember(entry, 'plants', plant.name)) notes += 0
    }
    if (feature.poi === 'deposit' && remember(entry, 'resources', feature.resource)) {
      notes += 1
      state.research += 1
    }
  }
  for (const creature of runtime.creatures || []) {
    if (Math.hypot(creature.x - pos.x, creature.z - pos.z) > range) continue
    const species = life.species[creature.species]
    if (!species) continue
    const key = `${state.systemIndex}:${state.planetIndex}:fauna:${species.name}`
    if (!state.codex.creatures[key]) {
      state.codex.creatures[key] = {
        name: species.name,
        temperament: species.temperament,
        body: species.body,
        head: species.head,
        legs: species.legs,
        tail: species.tail,
        planet: state.planetName,
        hostile: species.hostile,
      }
      state.research += 2
      notes += 1
    }
    remember(entry, 'species', species.name)
  }
  state.stats.scanned = (state.stats.scanned || 0) + 1
  bus.emit('sfx', 'scan')
  bus.emit('notify', { text: notes ? `The folio took ${notes} new lines.` : 'Nothing new inside the ring.' })
  return { ok: true, notes }
}

export function completion(entry) {
  if (!entry) return 0
  const species = entry.speciesTotal ? entry.species.length / entry.speciesTotal : 0
  const plants = entry.plantTotal ? entry.plants.length / entry.plantTotal : 0
  const res = entry.resources.length ? Math.min(1, entry.resources.length / 4) : 0
  return Math.round(((species + plants + res) / 3) * 100)
}

export { CHUNK_SIZE }
