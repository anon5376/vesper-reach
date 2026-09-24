import { BIOMES } from '../data/biomes.js'
import { hasEffect } from '../survival/effects.js'
import { clamp } from '../core/util.js'
import { heightAt, isCave, seaOf } from '../worldgen/terrain.js'

export function updateWalker(state, input, dt, terrainNoise, hurt) {
  const player = state.player
  const biome = BIOMES[state.biomeId] || BIOMES.lush
  const look = input.consumeLook()
  player.yaw -= look.x
  player.pitch = clamp(player.pitch - look.y, -1.25, 1.25)
  if (player.aboard) {
    const park = state.park || { x: 0, z: 3.2 }
    player.velocity.x = 0
    player.velocity.z = 0
    player.position.x += (park.x - player.position.x) * Math.min(1, dt * 2)
    player.position.z += ((park.z || 0) + 1.4 - player.position.z) * Math.min(1, dt * 2)
    const floor = sampleFloor(terrainNoise, player.position.x, player.position.z, state.biomeId)
    player.position.y = floor + 2.2
    player.grounded = true
    return { floor, cave: false }
  }

  const flyingToggle = state.params.fly && input.pressed('jump') && !player.grounded
  if (flyingToggle) player.flying = !player.flying
  if (state.params.fly && player.grounded && input.pressed('crouch')) player.flying = false

  let speed = 4.4
  if (player.crouch) speed = 2.3
  else if (input.isDown('sprint') && player.stamina > 0) speed = 8.2
  if (hasEffect(state, 'frozen')) speed *= 0.62
  const axes = input.moveAxes()
  const sin = Math.sin(player.yaw)
  const cos = Math.cos(player.yaw)
  let mx = sin * -axes.y + cos * axes.x
  let mz = cos * -axes.y - sin * axes.x
  const len = Math.hypot(mx, mz)
  if (len > 1) { mx /= len; mz /= len }

  player.crouch = input.isDown('crouch') && player.grounded && !player.flying

  if (player.flying && state.params.fly) {
    player.velocity.x = mx * speed * 2.2
    player.velocity.z = mz * speed * 2.2
    player.velocity.y = (input.isDown('jump') ? 9 : 0) + (input.isDown('crouch') ? -9 : 0)
    player.position.x += player.velocity.x * dt
    player.position.y += player.velocity.y * dt
    player.position.z += player.velocity.z * dt
    player.grounded = false
    return { floor: player.position.y, cave: false }
  }

  const gravity = 20 * (biome.gravity || 1)
  if (input.pressed('jump') && player.grounded) {
    player.velocity.y = 7.4
    player.grounded = false
    player.stamina = Math.max(0, player.stamina - 8)
  }
  if (input.isDown('jetpack') && player.stamina > 1 && !state.params.unlimited) {
    player.velocity.y += 26 * dt
    player.velocity.y = Math.min(player.velocity.y, 9)
    player.stamina -= 20 * dt
  } else if (input.isDown('jetpack') && state.params.unlimited) {
    player.velocity.y += 26 * dt
    player.velocity.y = Math.min(player.velocity.y, 9)
  }
  player.velocity.y -= gravity * dt
  player.velocity.x = mx * speed
  player.velocity.z = mz * speed
  const beforeY = player.velocity.y
  player.position.x += player.velocity.x * dt
  player.position.y += player.velocity.y * dt
  player.position.z += player.velocity.z * dt

  const floor = sampleFloor(terrainNoise, player.position.x, player.position.z, state.biomeId)
  const eye = player.crouch ? 1.05 : 1.65
  if (player.position.y <= floor + eye) {
    const impact = -beforeY
    if (impact > 13 && !player.gravChute) hurt((impact - 13) * 2.2, 'fall')
    player.gravChute = false
    player.position.y = floor + eye
    player.velocity.y = 0
    player.grounded = true
  } else {
    player.grounded = false
  }

  const sprinting = input.isDown('sprint') && len > 0.1 && player.grounded
  if (sprinting) player.stamina = Math.max(0, player.stamina - 10 * dt)
  else if (!input.isDown('jetpack')) player.stamina = Math.min(100, player.stamina + 14 * dt)

  const cave = isCave(terrainNoise, player.position.x, player.position.z)
  return { floor, cave }
}

function sampleFloor(noise, x, z, biomeId) {
  const ground = heightAt(noise, x, z, biomeId)
  const sea = seaOf(biomeId)
  if (ground < sea) return sea
  return ground
}

export function sampleFloorHeight(noise, x, z, biomeId) {
  return sampleFloor(noise, x, z, biomeId)
}
