import { addItem } from '../inventory/inventory.js'
import { chunkCreatures } from '../worldgen/features.js'
import { chunkOf } from '../worldgen/terrain.js'
import { sampleFloorHeight } from '../physics/walker.js'
import { lifeFor } from '../player/tools.js'

export function tickCreatures(state, runtime, dt, noise, hurt, bus) {
  if (state.location !== 'surface' || state.planetIndex == null) return
  const life = lifeFor(state)
  runtime.life = life
  if (!life.species.length) return
  ensureCreatures(state, runtime, life)
  const player = state.player.position
  for (const creature of runtime.creatures) {
    const species = life.species[creature.species] || life.species[0]
    stepCreature(creature, species, player, state, dt, hurt, bus)
    creature.y = sampleFloorHeight(noise, creature.x, creature.z, state.biomeId)
  }
  runtime.creatures = runtime.creatures.filter((creature) => {
    if (creature.dead) return false
    const dist = Math.hypot(creature.x - player.x, creature.z - player.z)
    return dist < 96 || creature.anchor
  })
}

function ensureCreatures(state, runtime, life) {
  const { cx, cz } = chunkOf(state.player.position.x, state.player.position.z)
  const have = new Set(runtime.creatures.map((creature) => creature.id))
  const consider = (spawn) => {
    if (have.has(spawn.id) || state.removed[spawn.id]) return
    if (runtime.creatures.length >= 18) return
    const species = life.species[spawn.species % life.species.length]
    runtime.creatures.push({
      id: spawn.id,
      species: spawn.species % life.species.length,
      x: spawn.x,
      y: 0,
      z: spawn.z,
      homeX: spawn.x,
      homeZ: spawn.z,
      wander: spawn.wander || 0,
      phase: spawn.wander || 0,
      hp: species.hostile ? 30 : 16,
      maxHp: species.hostile ? 30 : 16,
      bite: 0,
      anchor: !!spawn.anchor,
      tame: !!spawn.tame,
    })
    have.add(spawn.id)
  }
  consider({ id: `home:${state.systemIndex}:${state.planetIndex}:a`, species: docileIndex(life), x: 8, z: -5, wander: 0.4, anchor: true, tame: true })
  consider({ id: `home:${state.systemIndex}:${state.planetIndex}:b`, species: docileIndex(life, 1), x: -6, z: 9, wander: 1.7, anchor: true, tame: true })
  for (let x = cx - 1; x <= cx + 1; x++) {
    for (let z = cz - 1; z <= cz + 1; z++) {
      if (x === 0 && z === 0) continue
      const spawns = chunkCreatures(state.seed, state.systemIndex, state.planetIndex, x, z, life.species.length)
      for (const spawn of spawns) consider(spawn)
    }
  }
}

function docileIndex(life, offset = 0) {
  const found = life.species.findIndex((species) => !species.hostile)
  if (found >= 0) return (found + offset) % life.species.length
  return offset % life.species.length
}

function stepCreature(creature, species, player, state, dt, hurt, bus) {
  creature.bite = Math.max(0, creature.bite - dt)
  creature.phase += dt
  const dx = player.x - creature.x
  const dz = player.z - creature.z
  const dist = Math.hypot(dx, dz) || 0.001
  let mode = species.temperament
  if (creature.tame) mode = 'graze'
  if (!state.params.hostiles && (mode === 'hunt' || mode === 'territorial')) mode = 'flee'
  const aggro = Math.max(0, state.params.enemyAggression ?? 1)
  const homeX = creature.x - creature.homeX
  const homeZ = creature.z - creature.homeZ
  if (Math.hypot(homeX, homeZ) > 22) {
    creature.x -= homeX * dt * 0.35
    creature.z -= homeZ * dt * 0.35
  }
  if (mode === 'hunt' && dist < 26 * Math.max(0.45, aggro)) {
    creature.x += (dx / dist) * dt * 4.4 * Math.max(0.4, aggro)
    creature.z += (dz / dist) * dt * 4.4 * Math.max(0.4, aggro)
    if (dist < 1.55 && creature.bite <= 0) {
      creature.bite = 1.1
      hurt(7 * Math.max(0.35, aggro), 'fauna')
      bus.emit('notify', { text: `${species.name} bites.` })
    }
  } else if (mode === 'territorial' && dist < 12) {
    creature.x += (dx / dist) * dt * 3.4 * Math.max(0.4, aggro)
    creature.z += (dz / dist) * dt * 3.4 * Math.max(0.4, aggro)
    if (dist < 1.6 && creature.bite <= 0) {
      creature.bite = 1.25
      hurt(5 * Math.max(0.35, aggro), 'fauna')
    }
  } else if (mode === 'flee' && dist < 14) {
    creature.x -= (dx / dist) * dt * 6
    creature.z -= (dz / dist) * dt * 6
  } else if (mode === 'graze') {
    creature.x += Math.cos(creature.phase * 0.6 + creature.wander) * dt * 0.9
    creature.z += Math.sin(creature.phase * 0.45 + creature.wander) * dt * 0.9
  } else {
    creature.x += Math.cos(creature.wander + creature.phase * 0.35) * dt * 1.5
    creature.z += Math.sin(creature.wander * 1.3 + creature.phase * 0.35) * dt * 1.5
  }
}

export function damageCreature(state, runtime, id, amount, bus) {
  const creature = runtime.creatures.find((entry) => entry.id === id)
  if (!creature || creature.dead) return false
  creature.hp -= amount
  if (creature.hp > 0) return true
  creature.dead = true
  state.removed[id] = true
  const life = runtime.life || lifeFor(state)
  const species = life.species[creature.species]
  const drop = species?.hostile ? 'marrow-cut' : 'lumen-frond'
  addItem(state, drop, species?.hostile ? 2 : 1)
  if (species) {
    const key = `${state.systemIndex}:${state.planetIndex}:fauna:${species.name}`
    if (!state.codex.creatures[key]) {
      state.codex.creatures[key] = { name: species.name, temperament: species.temperament, planet: state.planetName, hostile: species.hostile }
      state.research += 2
    }
  }
  bus.emit('notify', { text: `${species?.name || 'A creature'} folds. You keep the cut.` })
  bus.emit('sfx', 'cannon')
  return true
}
