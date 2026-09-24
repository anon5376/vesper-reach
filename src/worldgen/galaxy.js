import { BIOME_IDS, BIOMES } from '../data/biomes.js'
import { rngFrom } from '../rng/rng.js'
import { planetName, stationName, systemName } from './names.js'

const STAR_TYPES = [
  { id: 'amber-dwarf', name: 'Amber dwarf', color: '#ffb703', radius: 11 },
  { id: 'teal-giant', name: 'Teal giant', color: '#2ec4b6', radius: 16 },
  { id: 'violet-ember', name: 'Violet ember', color: '#9b5de5', radius: 10 },
  { id: 'coral-flare', name: 'Coral flare', color: '#ff6b6b', radius: 13 },
  { id: 'white-lantern', name: 'White lantern', color: '#f8f4e8', radius: 9 },
  { id: 'blue-cinder', name: 'Blue cinder', color: '#4cc9f0', radius: 12 },
]

export function generateSystem(seed, index) {
  const rng = rngFrom(seed, 'system', index)
  const name = systemName(rng)
  const star = { ...rng.pick(STAR_TYPES) }
  const angle = rng.next() * Math.PI * 2
  const rad = 12 + rng.next() * 88
  const count = 2 + rng.int(5)
  const planets = []
  for (let i = 0; i < count; i++) {
    const biome = BIOMES[rng.pick(BIOME_IDS)]
    const radius = rng.range(18, 30)
    const moons = []
    const moonCount = rng.int(3)
    for (let m = 0; m < moonCount; m++) {
      moons.push({
        radius: rng.range(2.2, 4.4),
        orbit: radius + rng.range(8, 16),
        phase: rng.next() * Math.PI * 2,
        speed: rng.range(0.15, 0.4),
        color: m % 2 ? '#f6d7a8' : '#7ee0d6',
      })
    }
    planets.push({
      index: i,
      name: planetName(rng),
      biome: biome.id,
      radius,
      orbit: 96 + i * 70 + rng.range(0, 12),
      phase: i === 0 ? -Math.PI / 2 : rng.next() * Math.PI * 2,
      speed: 0.012 / (i + 1),
      incline: rng.range(-6, 6),
      gravity: biome.gravity * rng.range(0.92, 1.08),
      moons,
      resources: biome.resources.slice(),
    })
  }
  const stationOrbit = 34 + rng.range(0, 6)
  return {
    index,
    seed: rngFrom(seed, 'sysseed', index).int(1e9),
    name,
    gx: Math.cos(angle) * rad,
    gy: Math.sin(angle) * rad,
    star,
    planets,
    station: {
      name: stationName(rng, name),
      orbit: stationOrbit,
      phase: 0.4,
    },
    belt: { radius: 40 + rng.range(-4, 4), count: 160 },
  }
}

export function generateGalaxy(seed) {
  const systems = []
  for (let i = 0; i < 100; i++) systems.push(generateSystem(seed, i))
  return { seed, systems }
}

export function layoutSystem(system, time) {
  const planets = system.planets.map((planet) => {
    const angle = planet.phase + time * planet.speed
    const position = {
      x: Math.cos(angle) * planet.orbit,
      y: Math.sin(angle) * planet.incline,
      z: Math.sin(angle) * planet.orbit,
    }
    const moons = planet.moons.map((moon) => {
      const ma = moon.phase + time * moon.speed
      return {
        ...moon,
        position: {
          x: position.x + Math.cos(ma) * moon.orbit,
          y: position.y + moon.orbit * 0.25,
          z: position.z + Math.sin(ma) * moon.orbit,
        },
      }
    })
    return { ...planet, position, moons }
  })
  const sa = system.station.phase + time * 0.02
  const station = {
    ...system.station,
    position: {
      x: Math.cos(sa) * system.station.orbit,
      y: 2,
      z: Math.sin(sa) * system.station.orbit,
    },
  }
  return { planets, station, star: system.star }
}

export function nearestBody(layout, pos) {
  let best = null
  for (let i = 0; i < layout.planets.length; i++) {
    const planet = layout.planets[i]
    const dx = pos.x - planet.position.x
    const dy = pos.y - planet.position.y
    const dz = pos.z - planet.position.z
    const center = Math.hypot(dx, dy, dz)
    const distance = center - planet.radius
    if (!best || distance < best.distance) best = { index: i, planet, distance, center }
  }
  return best
}

export function planetKey(systemIndex, planetIndex) {
  return `${systemIndex}:${planetIndex}`
}
