import { BLOCKS } from '../data/blocks.js'
import { BIOMES } from '../data/biomes.js'
import { sunHeight } from '../base/power.js'
import { allPieces } from '../base/query.js'
import { rngFrom } from '../rng/rng.js'
import { addEffect, tickEffects } from './effects.js'

export function sheltered(state, cave) {
  if (!state) return false
  if (state.location === 'station') return true
  if (state.location === 'space') {
    const cockpit = state.ship.parts.find((part) => part.partId === 'cockpit-lantern')
    return !!cockpit && (cockpit.hp ?? 1) > 8
  }
  if (state.player.aboard) return true
  if (cave) return true
  const pos = state.player.position
  for (const entry of allPieces(state)) {
    const def = BLOCKS[entry.piece.blockId]
    if (!def?.shelter) continue
    const dx = entry.piece.x + 0.5 - pos.x
    const dz = entry.piece.z + 0.5 - pos.z
    if (Math.hypot(dx, dz) < 3.3 && Math.abs(entry.piece.y - pos.y) < 3.2) return true
  }
  return false
}

export function tickSurvival(state, dt, cave, hurt) {
  const player = state.player
  rollWeather(state)
  const biome = BIOMES[state.biomeId] || BIOMES.lush
  const shelter = sheltered(state, cave)
  const storm = !!(state.weather && state.weather.kind !== 'clear' && state.location === 'surface')
  let exposure = Math.abs(biome.temp || 0) * 0.38 + (biome.tox || 0) * 0.58 + (biome.rad || 0) * 0.62
  if (storm) exposure *= 1.8
  const day = state.params.dayLength || 480
  if (state.location === 'surface' && sunHeight(state.time, day) < -0.05) exposure += 0.12
  if (state.location === 'space') exposure = shelter ? 0.04 : 0.9
  if (state.location === 'station') exposure = 0
  exposure *= state.params.hazardRate || 0

  if (shelter || exposure <= 0) {
    player.hazard = Math.min(player.maxHazard, player.hazard + 12 * dt)
    player.oxygen = Math.min(player.maxOxygen, player.oxygen + (shelter ? 9 : 2) * dt)
  } else {
    const breathable = state.location === 'surface' ? biome.breathable : shelter
    if (!breathable) player.oxygen = Math.max(0, player.oxygen - 5.5 * dt)
    player.hazard = Math.max(0, player.hazard - exposure * 7 * dt)
  }

  if (player.oxygen <= 0) hurt(6 * dt, 'air')
  if (player.hazard <= 0 && exposure > 0) {
    hurt(3.4 * dt, 'hazard')
    if ((biome.temp || 0) < -0.45) addEffect(state, 'frozen', 8)
    if ((biome.temp || 0) > 0.65) addEffect(state, 'overheated', 8)
    if ((biome.rad || 0) > 0.5) addEffect(state, 'irradiated', 8)
    if ((biome.tox || 0) > 0.5) addEffect(state, 'poisoned', 8)
  }

  if (state.params.hungerEnabled) {
    const fed = player.effects.some((effect) => effect.id === 'well-fed' && effect.until > state.time)
    player.hunger = Math.max(0, player.hunger - (state.params.hungerDrain || 0) * dt * (fed ? 0.45 : 1))
    player.thirst = Math.max(0, player.thirst - (state.params.thirstDrain || 0) * dt)
    if (player.hunger <= 0) hurt(1.5 * dt, 'hunger')
    if (player.thirst <= 0) hurt(2.2 * dt, 'thirst')
  } else {
    player.hunger = 100
    player.thirst = 100
  }

  tickEffects(state, dt, hurt)
  player.health = Math.max(0, Math.min(player.maxHealth, player.health))
  player.hazard = Math.max(0, Math.min(player.maxHazard, player.hazard))
  player.oxygen = Math.max(0, Math.min(player.maxOxygen, player.oxygen))
  return { shelter, exposure, storm: storm ? state.weather.kind : 'clear' }
}

function rollWeather(state) {
  const freq = state.params.weatherFrequency || 0
  if (state.location !== 'surface' || freq <= 0) {
    if (!state.weather || state.weather.kind !== 'clear') state.weather = { kind: 'clear', until: state.time + 30 }
    return
  }
  if (state.weather && state.time < state.weather.until) return
  const bucket = Math.floor(state.time / 5)
  const rng = rngFrom(state.seed || 1, 'wx', state.systemIndex || 0, state.planetIndex || 0, bucket)
  const biome = BIOMES[state.biomeId] || BIOMES.lush
  const chance = Math.min(0.82, 0.28 * freq)
  if (rng.chance(chance)) {
    let kind = 'squall'
    if (biome.temp > 0.6) kind = 'ashfall'
    else if (biome.tox > 0.5) kind = 'spore-drift'
    else if (biome.id === 'radioactive') kind = 'ashfall'
    state.weather = { kind, until: state.time + 28 + rng.range(0, 24) }
  } else {
    state.weather = { kind: 'clear', until: state.time + 18 + rng.range(0, 16) }
  }
}
