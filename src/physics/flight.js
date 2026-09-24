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

export function updateFlight(state, input, dt, galaxy) {
  const space = state.space
  const look = input.consumeLook()
  const stats = deriveStats(state.ship.parts, 1, PARTS)
  const fuelMult = state.params.fuelCost || 0
  const scheme = state.flight.scheme
  space.yaw -= look.x
  space.pitch = clamp(space.pitch - look.y, -1.15, 1.15)
  const rollInput = (input.isDown('rollRight') ? 1 : 0) - (input.isDown('rollLeft') ? 1 : 0)
  space.roll += rollInput * stats.rollRate * dt
  if (scheme === 'arcade' && Math.abs(rollInput) < 0.1 && state.flight.assist) {
    space.roll += -space.roll * Math.min(1, dt * 2.2)
  }

  const wheel = input.consumeWheel()
  if (state.flight.throttleMode === 'set') {
    if (input.pressed('throttleUp') || wheel < 0) space.throttle = clamp(space.throttle + 0.1, 0, 1)
    if (input.pressed('throttleDown') || wheel > 0) space.throttle = clamp(space.throttle - 0.1, 0, 1)
    if (input.isDown('thrustForward')) space.throttle = clamp(space.throttle + dt * 0.35, 0, 1)
    if (input.isDown('thrustBack')) space.throttle = clamp(space.throttle - dt * 0.45, 0, 1)
  } else {
    space.throttle = input.isDown('thrustForward') ? 1 : 0
  }

  let throttle = space.throttle
  if (input.isDown('boost') && (state.ship.fuel > 0 || state.params.unlimited)) throttle = Math.min(1.35, throttle + 0.45)

  const basis = shipBasis(space.yaw, space.pitch, space.roll)
  const fuelGate = state.params.unlimited || state.ship.fuel > 0 || fuelMult === 0
  const thrustScale = fuelGate ? throttle : 0
  const accel = (stats.thrust / stats.mass) * 2.4 * thrustScale

  if (!fuelGate && throttle > 0) state.runtimeNote = 'The tanks are dry.'

  const move = { x: 0, y: 0, z: 0 }
  if (scheme === '6dof' || scheme === 'arcade') {
    if (input.isDown('thrustForward') && state.flight.throttleMode === 'hold') {
      /* throttle already applied */
    }
    const strafe = scheme === '6dof' || scheme === 'arcade'
    if (strafe) {
      if (input.isDown('strafeLeft')) { move.x -= basis.right.x; move.y -= basis.right.y; move.z -= basis.right.z }
      if (input.isDown('strafeRight')) { move.x += basis.right.x; move.y += basis.right.y; move.z += basis.right.z }
      if (input.isDown('strafeUp')) { move.x += basis.up.x; move.y += basis.up.y; move.z += basis.up.z }
      if (input.isDown('strafeDown')) { move.x -= basis.up.x; move.y -= basis.up.y; move.z -= basis.up.z }
    }
  }

  const desired = {
    x: basis.forward.x * stats.topSpeed * Math.max(throttle, 0) + move.x * stats.topSpeed * 0.45,
    y: basis.forward.y * stats.topSpeed * Math.max(throttle, 0) + move.y * stats.topSpeed * 0.45,
    z: basis.forward.z * stats.topSpeed * Math.max(throttle, 0) + move.z * stats.topSpeed * 0.45,
  }

  if (state.flight.assist) {
    const k = 1 - Math.exp(-2.4 * dt)
    space.velocity.x += (desired.x - space.velocity.x) * k
    space.velocity.y += (desired.y - space.velocity.y) * k
    space.velocity.z += (desired.z - space.velocity.z) * k
  } else {
    space.velocity.x += basis.forward.x * accel * dt + move.x * accel * 0.55 * dt
    space.velocity.y += basis.forward.y * accel * dt + move.y * accel * 0.55 * dt
    space.velocity.z += basis.forward.z * accel * dt + move.z * accel * 0.55 * dt
  }

  space.position.x += space.velocity.x * dt
  space.position.y += space.velocity.y * dt
  space.position.z += space.velocity.z * dt

  if (!state.params.unlimited && fuelMult > 0) {
    state.ship.fuel = Math.max(0, state.ship.fuel - throttle * dt * 0.55 * fuelMult * (input.isDown('boost') ? 1.8 : 1))
  }

  const system = galaxy.systems[state.systemIndex]
  const layout = layoutSystem(system, state.time)
  const near = nearestBody(layout, space.position)
  let canLand = false
  let canDock = false
  if (near && near.distance < 24 && near.distance > -2) {
    const speed = Math.hypot(space.velocity.x, space.velocity.y, space.velocity.z)
    canLand = speed < 28
  }
  if (near && near.distance < 4) {
    const p = near.planet.position
    const dx = space.position.x - p.x
    const dy = space.position.y - p.y
    const dz = space.position.z - p.z
    const len = Math.hypot(dx, dy, dz) || 1
    const push = near.planet.radius + 6
    space.position.x = p.x + (dx / len) * push
    space.position.y = p.y + (dy / len) * push
    space.position.z = p.z + (dz / len) * push
  }
  const st = layout.station.position
  const dockDist = Math.hypot(space.position.x - st.x, space.position.y - st.y, space.position.z - st.z)
  if (dockDist < 16) canDock = true
  const starR = system.star.radius + 4
  const sd = Math.hypot(space.position.x, space.position.y, space.position.z)
  if (sd < starR) {
    const k = starR / (sd || 1)
    space.position.x *= k
    space.position.y *= k
    space.position.z *= k
  }
  return { stats, canLand, canDock, near, layout, dockDist }
}

export { e }
