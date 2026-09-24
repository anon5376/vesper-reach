import { PARTS } from '../data/parts.js'
import { deriveStats } from '../ship/stats.js'
import { layoutSystem, nearestBody } from '../worldgen/galaxy.js'
import { clamp } from '../core/util.js'

const e = { pitch: 0, yaw: 0, roll: 0 }
const q = { x: 0, y: 0, z: 0, w: 1 }

function setQuatFromEuler(yaw, pitch, roll) {
  const cy = Math.cos(yaw * 0.5)
  const sy = Math.sin(yaw * 0.5)
  const cp = Math.cos(pitch * 0.5)
  const sp = Math.sin(pitch * 0.5)
  const cr = Math.cos(roll * 0.5)
  const sr = Math.sin(roll * 0.5)
  // YXZ: yaw (Y), pitch (X), roll (Z) matching THREE.Euler order YXZ
  q.w = cy * cp * cr + sy * sp * sr
  q.x = cy * sp * cr + sy * cp * sr
  q.y = sy * cp * cr - cy * sp * sr
  q.z = cy * cp * sr - sy * sp * cr
  return q
}

function rotate(out, v) {
  const { x, y, z, w } = q
  const ix = w * v.x + y * v.z - z * v.y
  const iy = w * v.y + z * v.x - x * v.z
  const iz = w * v.z + x * v.y - y * v.x
  const iw = -x * v.x - y * v.y - z * v.z
  out.x = ix * w + iw * -x + iy * -z - iz * -y
  out.y = iy * w + iw * -y + iz * -x - ix * -z
  out.z = iz * w + iw * -z + ix * -y - iy * -x
  return out
}

const forward = { x: 0, y: 0, z: 0 }
const right = { x: 0, y: 0, z: 0 }
const up = { x: 0, y: 0, z: 0 }

export function shipBasis(yaw, pitch, roll) {
  setQuatFromEuler(yaw, pitch, roll)
  rotate(forward, { x: 0, y: 0, z: -1 })
  rotate(right, { x: 1, y: 0, z: 0 })
  rotate(up, { x: 0, y: 1, z: 0 })
  return {
    forward: { ...forward },
    right: { ...right },
    up: { ...up },
  }
}

export function flightStatus(state, galaxy) {
  const system = galaxy.systems[state.systemIndex]
  const layout = layoutSystem(system, state.time)
  const near = nearestBody(layout, state.space.position)
  const speed = Math.hypot(state.space.velocity.x, state.space.velocity.y, state.space.velocity.z)
  const canLand = !!(near && near.distance < 34 && near.distance > -4 && speed < 42)
  const st = layout.station.position
  const dockDist = Math.hypot(state.space.position.x - st.x, state.space.position.y - st.y, state.space.position.z - st.z)
  return { canLand, canDock: dockDist < 16, near, layout, dockDist, speed, system }
}

export function updateFlight(state, input, dt, galaxy) {
  const space = state.space
  const look = input.consumeLook()
  const axes = input.moveAxes()
  const stats = deriveStats(state.ship.parts, 1, PARTS)
  const fuelMult = state.params.fuelCost ?? 1
  const scheme = state.flight.scheme === '6dof' ? '6dof' : 'arcade'
  space.yaw -= look.x
  space.pitch = clamp(space.pitch - look.y, -1.15, 1.15)
  const rollKeys = (input.isDown('rollRight') ? 1 : 0) - (input.isDown('rollLeft') ? 1 : 0)
  const forwardInput = -axes.y
  let strafe = 0
  let lift = 0
  if (scheme === 'arcade') {
    space.roll += (rollKeys - axes.x) * stats.rollRate * dt
    if (state.flight.assist && Math.abs(rollKeys) < 0.01 && Math.abs(axes.x) < 0.15) {
      space.roll += -space.roll * Math.min(1, dt * 2.2)
    }
  } else {
    space.roll += rollKeys * stats.rollRate * dt
    strafe = axes.x
    if (input.isDown('strafeUp')) lift += 1
    if (input.isDown('strafeDown')) lift -= 1
  }

  const wheel = input.consumeWheel()
  if (state.flight.throttleMode === 'hold') {
    space.throttle = clamp(Math.max(0, forwardInput), 0, 1)
  } else if (forwardInput > 0.2) space.throttle = clamp(space.throttle + dt * 1.65 * forwardInput, 0, 1)
  else if (forwardInput < -0.2) space.throttle = clamp(space.throttle + dt * 1.8 * forwardInput, 0, 1)
  if (input.pressed('throttleUp') || wheel < 0) space.throttle = clamp(space.throttle + 0.1, 0, 1)
  if (input.pressed('throttleDown') || wheel > 0) space.throttle = clamp(space.throttle - 0.1, 0, 1)

  let throttle = space.throttle
  const boosting = input.isDown('boost') && (state.ship.fuel > 0 || state.params.unlimited || fuelMult === 0)
  if (boosting) throttle = Math.min(1.35, throttle + 0.45)

  const basis = shipBasis(space.yaw, space.pitch, space.roll)
  const fuelGate = state.params.unlimited || fuelMult === 0 || state.ship.fuel > 0
  const thrustScale = fuelGate ? throttle : 0
  const accel = (stats.thrust / Math.max(1, stats.mass)) * 2.4 * thrustScale
  if (!fuelGate && throttle > 0.05) state.runtimeNote = 'The tanks are dry.'

  const moveX = basis.right.x * strafe + basis.up.x * lift
  const moveY = basis.right.y * strafe + basis.up.y * lift
  const moveZ = basis.right.z * strafe + basis.up.z * lift
  const speed = stats.topSpeed
  const desired = {
    x: basis.forward.x * speed * thrustScale + moveX * speed * 0.55,
    y: basis.forward.y * speed * thrustScale + moveY * speed * 0.55,
    z: basis.forward.z * speed * thrustScale + moveZ * speed * 0.55,
  }

  if (state.flight.assist) {
    const k = 1 - Math.exp(-2.4 * dt)
    space.velocity.x += (desired.x - space.velocity.x) * k
    space.velocity.y += (desired.y - space.velocity.y) * k
    space.velocity.z += (desired.z - space.velocity.z) * k
  } else {
    space.velocity.x += basis.forward.x * accel * dt + moveX * accel * 0.65 * dt
    space.velocity.y += basis.forward.y * accel * dt + moveY * accel * 0.65 * dt
    space.velocity.z += basis.forward.z * accel * dt + moveZ * accel * 0.65 * dt
    const sp = Math.hypot(space.velocity.x, space.velocity.y, space.velocity.z)
    const cap = Math.max(12, speed * 1.7)
    if (sp > cap) {
      const s = cap / sp
      space.velocity.x *= s
      space.velocity.y *= s
      space.velocity.z *= s
    }
  }

  space.position.x += space.velocity.x * dt
  space.position.y += space.velocity.y * dt
  space.position.z += space.velocity.z * dt

  const burn = (throttle + Math.abs(strafe) * 0.35 + Math.abs(lift) * 0.35) * dt * 0.55 * fuelMult * (boosting ? 1.8 : 1)
  if (!state.params.unlimited && fuelMult > 0) state.ship.fuel = Math.max(0, state.ship.fuel - burn)

  const system = galaxy.systems[state.systemIndex]
  const layout = layoutSystem(system, state.time)
  const near = nearestBody(layout, space.position)
  if (near && near.distance < 10) {
    const p = near.planet.position
    const dx = space.position.x - p.x
    const dy = space.position.y - p.y
    const dz = space.position.z - p.z
    const len = Math.hypot(dx, dy, dz) || 1
    const nx = dx / len
    const ny = dy / len
    const nz = dz / len
    const push = near.planet.radius + 12
    space.position.x = p.x + nx * push
    space.position.y = p.y + ny * push
    space.position.z = p.z + nz * push
    const radial = space.velocity.x * nx + space.velocity.y * ny + space.velocity.z * nz
    if (radial < 0) {
      space.velocity.x -= radial * nx
      space.velocity.y -= radial * ny
      space.velocity.z -= radial * nz
    }
  }
  const starR = system.star.radius + 4
  const sd = Math.hypot(space.position.x, space.position.y, space.position.z)
  if (sd < starR) {
    const k = starR / (sd || 1)
    space.position.x *= k
    space.position.y *= k
    space.position.z *= k
  }
  return { stats, basis, ...flightStatus(state, galaxy) }
}

export { e }
