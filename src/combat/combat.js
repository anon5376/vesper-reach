import { PARTS } from '../data/parts.js'
import { removeItem } from '../inventory/inventory.js'
import { shipBasis } from '../physics/flight.js'
import { lookDir } from '../player/tools.js'
import { damageCreature } from '../creatures/sim.js'
import { uid } from '../core/util.js'

export function fireFoot(state, runtime, bus) {
  if (state.player.tool !== 'blaster' || state.menu) return { ok: false }
  if (runtime.fireCd > 0) return { ok: false }
  if (!state.params.unlimited && !removeItem(state, 'blaster-cell', 1)) {
    bus.emit('notify', { text: 'The multitool wants a blaster cell.' })
    return { ok: false, error: 'ammo' }
  }
  runtime.fireCd = 0.26
  const dir = lookDir(state.player)
  const pos = state.player.position
  runtime.bolts.push({
    x: pos.x + dir.x * 0.8,
    y: pos.y + dir.y * 0.8,
    z: pos.z + dir.z * 0.8,
    vx: dir.x * 38,
    vy: dir.y * 38,
    vz: dir.z * 38,
    life: 1.1,
    damage: 15,
    team: 'player',
    kind: 'bolt',
  })
  bus.emit('sfx', 'laser')
  return { ok: true }
}

export function fireShip(state, runtime, bus) {
  if (runtime.fireCd > 0 || state.menu) return { ok: false }
  const weapons = state.ship.parts.filter((part) => PARTS[part.partId]?.weapon && (part.hp ?? 1) > 0)
  if (!weapons.length) {
    bus.emit('notify', { text: 'No working weapon is bolted to this hull.' })
    return { ok: false, error: 'weapon' }
  }
  const part = weapons[runtime.weaponCursor % weapons.length]
  runtime.weaponCursor = (runtime.weaponCursor + 1) % weapons.length
  const def = PARTS[part.partId]
  runtime.fireCd = def.weapon === 'missile' ? 1.15 : def.weapon === 'cannon' ? 0.5 : 0.15
  const basis = shipBasis(state.space.yaw, state.space.pitch, state.space.roll)
  const speed = def.weapon === 'missile' ? 42 : def.weapon === 'cannon' ? 36 : 68
  const origin = state.space.position
  runtime.bolts.push({
    x: origin.x + basis.forward.x * 2.4,
    y: origin.y + basis.forward.y * 2.4,
    z: origin.z + basis.forward.z * 2.4,
    vx: basis.forward.x * speed + state.space.velocity.x * 0.25,
    vy: basis.forward.y * speed + state.space.velocity.y * 0.25,
    vz: basis.forward.z * speed + state.space.velocity.z * 0.25,
    life: 2.4,
    damage: (def.damage || 12) * (state.location === 'space' ? 1 : 1),
    team: 'player',
    kind: def.weapon,
    homing: def.weapon === 'missile',
  })
  bus.emit('sfx', def.weapon === 'laser' ? 'laser' : 'cannon')
  return { ok: true, kind: def.weapon }
}

export function cycleTarget(runtime) {
  const living = runtime.pirates.filter((pirate) => pirate.hp > 0)
  if (!living.length) {
    runtime.target = null
    return null
  }
  const index = living.findIndex((pirate) => pirate.id === runtime.target)
  const next = living[(index + 1) % living.length]
  runtime.target = next.id
  return next
}

export function tickCombat(state, runtime, dt, bus, hurt) {
  runtime.fireCd = Math.max(0, (runtime.fireCd || 0) - dt)
  if (state.location === 'space' && state.params.pirates && state.params.enemyAggression > 0) {
    tickPirates(state, runtime, dt, bus)
  }
  if (state.location === 'surface' && state.params.hostiles && state.params.enemyAggression > 0) {
    tickDrones(state, runtime, dt, bus, hurt)
  } else if (state.location !== 'surface') runtime.drones = []
  tickBolts(state, runtime, dt, bus, hurt)
  updateLead(state, runtime)
}

function tickPirates(state, runtime, dt, bus) {
  runtime.pirateTimer = (runtime.pirateTimer ?? 28) - dt * Math.max(0.35, state.params.enemyAggression || 1)
  if (runtime.pirateTimer <= 0 && runtime.pirates.filter((pirate) => pirate.hp > 0).length === 0) {
    spawnPirates(state, runtime, bus)
    runtime.pirateTimer = 75 / Math.max(0.5, state.params.enemyAggression || 1)
  }
  const origin = state.space.position
  for (const pirate of runtime.pirates) {
    if (pirate.hp <= 0) continue
    const dx = origin.x - pirate.x
    const dy = origin.y - pirate.y
    const dz = origin.z - pirate.z
    const dist = Math.hypot(dx, dy, dz) || 1
    const flee = pirate.hp < pirate.maxHp * 0.34
    const speed = flee ? 18 : dist > 36 ? 22 : 14
    const side = Math.cos(state.time * 0.8 + pirate.phase)
    const nx = dx / dist
    const nz = dz / dist
    const strafeX = -nz * side
    const strafeZ = nx * side
    const dir = flee ? -1 : 1
    pirate.vx = nx * speed * dir + strafeX * 8
    pirate.vy = (dy / dist) * speed * 0.45
    pirate.vz = nz * speed * dir + strafeZ * 8
    pirate.x += pirate.vx * dt
    pirate.y += pirate.vy * dt
    pirate.z += pirate.vz * dt
    pirate.yaw = Math.atan2(-nx, -nz)
    pirate.cool -= dt
    if (!flee && dist < 70 && pirate.cool <= 0) {
      pirate.cool = 1.5 / Math.max(0.4, state.params.enemyAggression || 1)
      runtime.bolts.push({
        x: pirate.x, y: pirate.y, z: pirate.z,
        vx: nx * 32, vy: dy / dist * 32, vz: nz * 32,
        life: 2, damage: 8 * (state.params.enemyAggression || 1), team: 'enemy', kind: 'laser',
      })
      bus.emit('sfx', 'laser')
    }
  }
  runtime.pirates = runtime.pirates.filter((pirate) => pirate.hp > 0 && Math.hypot(pirate.x - origin.x, pirate.z - origin.z) < 220)
}

export function spawnPirates(state, runtime, bus, count) {
  const n = count || (1 + Math.min(2, Math.floor((state.params.enemyAggression || 1) / 1.2)))
  const origin = state.space.position
  for (let i = 0; i < n; i++) {
    const ang = state.time + i * 2.1
    runtime.pirates.push({
      id: uid('kite'),
      name: ['Ash Kite', 'Cinder Kite', 'Salt Kite'][i % 3],
      x: origin.x + Math.cos(ang) * 54,
      y: origin.y + (i - 1) * 4,
      z: origin.z + Math.sin(ang) * 54,
      vx: 0, vy: 0, vz: 0,
      yaw: ang,
      hp: 46,
      maxHp: 46,
      cool: 1 + i * 0.4,
      phase: i * 1.7,
    })
  }
  if (bus) bus.emit('notify', { text: 'Ash Kites on the margin.' })
  runtime.target = runtime.pirates[0]?.id || null
}

function tickDrones(state, runtime, dt, bus, hurt) {
  const threshold = 16 / Math.max(0.45, state.params.enemyAggression || 1)
  if (runtime.mineHeat > threshold && runtime.drones.length < 2) {
    runtime.mineHeat = 5
    const pos = state.player.position
    runtime.drones.push({
      id: uid('wasp'),
      x: pos.x + 8,
      y: pos.y + 3,
      z: pos.z + 4,
      hp: 24,
      maxHp: 24,
      cool: 0.8,
    })
    bus.emit('notify', { text: 'A Margin Wasp wakes. You cut too deep.' })
  }
  const pos = state.player.position
  for (const drone of runtime.drones) {
    const dx = pos.x - drone.x
    const dy = pos.y + 1.2 - drone.y
    const dz = pos.z - drone.z
    const dist = Math.hypot(dx, dy, dz) || 1
    const speed = dist > 8 ? 7 : 4.2
    drone.x += (dx / dist) * speed * dt
    drone.y += (dy / dist) * speed * dt
    drone.z += (dz / dist) * speed * dt
    drone.cool -= dt
    if (dist < 10 && drone.cool <= 0) {
      drone.cool = 1.3
      hurt(6 * (state.params.enemyAggression || 1), 'wasp')
      bus.emit('sfx', 'laser')
    }
  }
  runtime.drones = runtime.drones.filter((drone) => drone.hp > 0)
}

function tickBolts(state, runtime, dt, bus, hurt) {
  const next = []
  for (const bolt of runtime.bolts) {
    if (bolt.homing && runtime.target) {
      const pirate = runtime.pirates.find((entry) => entry.id === runtime.target && entry.hp > 0)
      if (pirate) {
        const dx = pirate.x - bolt.x
        const dy = pirate.y - bolt.y
        const dz = pirate.z - bolt.z
        const dist = Math.hypot(dx, dy, dz) || 1
        bolt.vx += (dx / dist) * 30 * dt
        bolt.vy += (dy / dist) * 30 * dt
        bolt.vz += (dz / dist) * 30 * dt
      }
    }
    bolt.x += bolt.vx * dt
    bolt.y += bolt.vy * dt
    bolt.z += bolt.vz * dt
    bolt.life -= dt
    if (bolt.life <= 0) continue
    let hit = false
    if (bolt.team === 'player' && state.location === 'space') {
      for (const pirate of runtime.pirates) {
        if (pirate.hp <= 0) continue
        if (Math.hypot(pirate.x - bolt.x, pirate.y - bolt.y, pirate.z - bolt.z) < 2.2) {
          pirate.hp -= bolt.damage
          hit = true
          if (pirate.hp <= 0) {
            bus.emit('notify', { text: `${pirate.name} breaks apart.` })
            state.credits += 12
            state.research += 1
          }
        }
      }
    }
    if (bolt.team === 'player' && state.location === 'surface') {
      for (const creature of runtime.creatures) {
        if (Math.hypot(creature.x - bolt.x, creature.z - bolt.z) < 1.4 && Math.abs((creature.y || 0) + 0.8 - bolt.y) < 1.6) {
          damageCreature(state, runtime, creature.id, bolt.damage, bus)
          hit = true
          break
        }
      }
      for (const drone of runtime.drones) {
        if (Math.hypot(drone.x - bolt.x, drone.y - bolt.y, drone.z - bolt.z) < 1.3) {
          drone.hp -= bolt.damage
          hit = true
          if (drone.hp <= 0) bus.emit('notify', { text: 'The wasp drops.' })
        }
      }
    }
    if (bolt.team === 'enemy' && state.location === 'space') {
      const ship = state.space.position
      if (Math.hypot(ship.x - bolt.x, ship.y - bolt.y, ship.z - bolt.z) < 2.6) {
        hurt(bolt.damage, 'kite')
        hit = true
      }
    }
    if (!hit) next.push(bolt)
  }
  runtime.bolts = next.slice(-40)
}

function updateLead(state, runtime) {
  runtime.lead = null
  if (state.location !== 'space' || !runtime.target) return
  const pirate = runtime.pirates.find((entry) => entry.id === runtime.target && entry.hp > 0)
  if (!pirate) return
  const origin = state.space.position
  const dist = Math.hypot(pirate.x - origin.x, pirate.y - origin.y, pirate.z - origin.z)
  const t = dist / 60
  runtime.lead = {
    id: pirate.id,
    name: pirate.name,
    hp: pirate.hp,
    maxHp: pirate.maxHp,
    dist,
    x: pirate.x + pirate.vx * t,
    y: pirate.y + pirate.vy * t,
    z: pirate.z + pirate.vz * t,
  }
}

export function repairShip(state, amount) {
  let healed = 0
  for (const part of state.ship.parts) {
    const max = PARTS[part.partId]?.hp || part.hp || 1
    const before = part.hp ?? max
    part.hp = Math.min(max, before + amount)
    healed += part.hp - before
  }
  return healed
}
