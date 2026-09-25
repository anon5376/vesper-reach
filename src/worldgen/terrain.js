import { BIOMES } from '../data/biomes.js'
import { createNoise } from '../rng/noise.js'

export const CHUNK_SIZE = 32

const cache = new Map()

export function noiseFor(seed, systemIndex, planetIndex) {
  const key = `${seed}:${systemIndex}:${planetIndex}`
  if (!cache.has(key)) cache.set(key, createNoise((seed ^ (systemIndex * 997) ^ (planetIndex * 131)) >>> 0 || 1))
  return cache.get(key)
}

export function heightAt(noise, x, z, biomeId) {
  const biome = BIOMES[biomeId] || BIOMES.lush
  const n = noise.fbm2(x * biome.frequency, z * biome.frequency, 4)
  const detail = noise.fbm2(x * biome.frequency * 5.4, z * biome.frequency * 5.4, 2)
  const ridge = 1 - Math.abs(noise.noise2(x * biome.frequency * 2.2, z * biome.frequency * 2.2))
  let h = n * biome.amplitude + detail * Math.min(4.2, biome.amplitude * 0.34)
  h += (ridge * 2 - 1) * Math.min(6.5, biome.amplitude * 0.38)
  const pit = noise.noise2(x * 0.02 + 40, z * 0.02)
  if (pit > 0.72) h -= ((pit - 0.72) / 0.28) * biome.amplitude * 0.9
  return h
}

export function isCave(noise, x, z) {
  return noise.noise2(x * 0.02 + 40, z * 0.02) > 0.8
}

export function seaOf(biomeId) {
  return (BIOMES[biomeId] || BIOMES.lush).sea
}

export function chunkOf(x, z) {
  return {
    cx: Math.floor(x / CHUNK_SIZE),
    cz: Math.floor(z / CHUNK_SIZE),
  }
}
