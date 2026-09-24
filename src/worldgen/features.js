import { BIOMES } from '../data/biomes.js'
import { rollPlant, rollSpecies, speciesCountFor } from '../data/creatures.js'
import { rngFrom } from '../rng/rng.js'
import { CHUNK_SIZE } from './terrain.js'

export function planetLife(seed, systemIndex, planetIndex, planetName) {
  const rng = rngFrom(seed, 'life', systemIndex, planetIndex)
  const species = []
  const n = speciesCountFor(rng)
  for (let i = 0; i < n; i++) species.push(rollSpecies(rng, i, planetName))
  const plants = []
  const pn = 2 + rng.int(2)
  for (let i = 0; i < pn; i++) plants.push(rollPlant(rng, i, planetName))
  return { species, plants }
}

export function chunkFeatures(seed, systemIndex, planetIndex, cx, cz, biomeId) {
  const rng = rngFrom(seed, 'feat', systemIndex, planetIndex, cx, cz)
  const biome = BIOMES[biomeId] || BIOMES.lush
  const features = []
  const flora = Math.max(0, Math.round(8 * biome.flora))
  for (let i = 0; i < flora; i++) {
    if (rng.next() > biome.flora) continue
    features.push({
      id: `${systemIndex}:${planetIndex}:${cx}:${cz}:f${i}`,
      x: cx * CHUNK_SIZE + rng.range(2, CHUNK_SIZE - 2),
      z: cz * CHUNK_SIZE + rng.range(2, CHUNK_SIZE - 2),
      kind: rng.next() > 0.45 ? 'plant' : 'rock',
      variant: rng.int(3),
      scale: rng.range(0.7, 1.45),
      plantIndex: rng.int(4),
    })
  }
  if ((cx !== 0 || cz !== 0) && rng.next() < 0.2) {
    const poi = rng.pick(['crash', 'ruin', 'outpost', 'deposit'])
    features.push({
      id: `${systemIndex}:${planetIndex}:${cx}:${cz}:poi`,
      x: cx * CHUNK_SIZE + CHUNK_SIZE * 0.5,
      z: cz * CHUNK_SIZE + CHUNK_SIZE * 0.5,
      kind: 'poi',
      poi,
      resource: rng.pick(biome.resources),
      amount: poi === 'deposit' ? 16 + rng.int(20) : 0,
      scale: rng.range(0.8, 1.3),
    })
  }
  if (cx === 0 && cz === 0) {
    features.push({
      id: `landing-vein:${systemIndex}:${planetIndex}`,
      x: 7,
      z: 5,
      kind: 'poi',
      poi: 'deposit',
      resource: 'drift-ore',
      amount: 48,
      scale: 1.2,
    })
    features.push({
      id: `landing-frond:${systemIndex}:${planetIndex}`,
      x: -4,
      z: 6,
      kind: 'plant',
      variant: 0,
      scale: 1.3,
      plantIndex: 0,
    })
    features.push({
      id: `landing-arch:${systemIndex}:${planetIndex}`,
      x: 14,
      z: -8,
      kind: 'poi',
      poi: 'ruin',
      resource: 'drift-ore',
      amount: 0,
      scale: 1,
    })
  }
  return features
}

export function chunkCreatures(seed, systemIndex, planetIndex, cx, cz, speciesLength) {
  if (!speciesLength) return []
  const rng = rngFrom(seed, 'mob', systemIndex, planetIndex, cx, cz)
  if (cx === 0 && cz === 0) return []
  if (rng.next() > 0.62) return []
  const list = []
  const n = 1 + rng.int(2)
  for (let i = 0; i < n; i++) {
    let x = cx * CHUNK_SIZE + rng.range(3, CHUNK_SIZE - 3)
    let z = cz * CHUNK_SIZE + rng.range(3, CHUNK_SIZE - 3)
    const d = Math.hypot(x, z)
    if (d < 16) {
      const k = 16 / (d || 1)
      x *= k
      z *= k
    }
    list.push({
      id: `${systemIndex}:${planetIndex}:${cx}:${cz}:c${i}`,
      species: rng.int(speciesLength),
      x,
      z,
      wander: rng.next() * Math.PI * 2,
    })
  }
  return list
}
