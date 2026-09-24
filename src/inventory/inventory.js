import { ITEMS } from '../data/items.js'
import { addEffect } from '../survival/effects.js'

export function emptyInventory(size = 40) {
  return { slots: Array.from({ length: size }, () => null), selected: 0 }
}

export function countItem(state, id) {
  let n = 0
  for (const slot of state.inventory.slots) if (slot?.id === id) n += slot.count
  return n
}

export function addItem(state, id, count = 1) {
  const def = ITEMS[id]
  if (!def || count <= 0) return count
  const max = def.stack || 20
  let left = count
  for (const slot of state.inventory.slots) {
    if (left <= 0) break
    if (slot && slot.id === id && slot.count < max) {
      const add = Math.min(max - slot.count, left)
      slot.count += add
      left -= add
    }
  }
  for (let i = 0; i < state.inventory.slots.length && left > 0; i++) {
    if (!state.inventory.slots[i]) {
      const add = Math.min(max, left)
      state.inventory.slots[i] = { id, count: add }
      left -= add
    }
  }
  return left
}

export function removeItem(state, id, count = 1) {
  let left = count
  for (let i = state.inventory.slots.length - 1; i >= 0 && left > 0; i--) {
    const slot = state.inventory.slots[i]
    if (!slot || slot.id !== id) continue
    const take = Math.min(slot.count, left)
    slot.count -= take
    left -= take
    if (slot.count <= 0) state.inventory.slots[i] = null
  }
  return left === 0
}

export function canAfford(state, inputs) {
  if (state.params.unlimited || state.params.instantBuild) return true
  const mult = state.params.craftingCost || 1
  return inputs.every((input) => countItem(state, input.id) >= Math.max(1, Math.ceil(input.count * (mult || 1))))
}

export function pay(state, inputs) {
  if (state.params.unlimited || state.params.instantBuild) return true
  if (!canAfford(state, inputs)) return false
  const mult = state.params.craftingCost || 1
  for (const input of inputs) {
    removeItem(state, input.id, Math.max(1, Math.ceil(input.count * (mult || 1))))
  }
  return true
}

export function moveSlot(state, from, to) {
  const slots = state.inventory.slots
  if (!slots[from] || from === to) return
  const a = slots[from]
  const b = slots[to]
  if (b && b.id === a.id) {
    const max = ITEMS[a.id]?.stack || 20
    const space = max - b.count
    const moved = Math.min(space, a.count)
    b.count += moved
    a.count -= moved
    if (a.count <= 0) slots[from] = null
    return
  }
  slots[to] = a
  slots[from] = b
}

export function takeAll(state) {
  const items = state.inventory.slots.filter(Boolean).map((s) => ({ id: s.id, count: s.count }))
  state.inventory.slots = state.inventory.slots.map(() => null)
  return items
}

export function giveMany(state, items) {
  const leftover = []
  for (const item of items || []) {
    const left = addItem(state, item.id, item.count)
    if (left > 0) leftover.push({ id: item.id, count: left })
  }
  return leftover
}

export function useItem(state, index) {
  const slot = state.inventory.slots[index]
  if (!slot) return { ok: false, error: 'Empty pocket.' }
  const def = ITEMS[slot.id]
  if (!def) return { ok: false, error: 'Unknown kit.' }
  const player = state.player
  let used = false
  if (def.hunger) { player.hunger = Math.min(100, player.hunger + def.hunger); used = true }
  if (def.thirst) { player.thirst = Math.min(100, player.thirst + def.thirst); used = true }
  if (def.health) { player.health = Math.min(player.maxHealth, player.health + def.health); used = true }
  if (def.oxygen) { player.oxygen = Math.min(player.maxOxygen, player.oxygen + def.oxygen); used = true }
  if (def.hazard) { player.hazard = Math.min(player.maxHazard, player.hazard + def.hazard); used = true }
  if (def.shields) { player.shields = Math.min(player.maxShields + 20, player.shields + def.shields); used = true }
  if (def.stamina) { player.stamina = Math.min(100, player.stamina + def.stamina); used = true }
  if (def.cure) {
    player.effects = player.effects.filter((e) => e.id !== def.cure)
    used = true
  }
  if (def.effect) {
    addEffect(state, def.effect, def.effectTime || 45)
    used = true
  }
  if (def.research) {
    state.research += def.research
    used = true
  }
  if (def.id === 'grav-chute') {
    player.gravChute = true
    used = true
  }
  if (def.id === 'scanner-lens') {
    player.lensBoost = (player.lensBoost || 0) + 1
    used = true
  }
  if (def.id === 'survey-flare') {
    player.flareUntil = state.time + 45
    used = true
  }
  if (!used) return { ok: false, error: `${def.name} is for building, not sipping.` }
  slot.count -= 1
  if (slot.count <= 0) state.inventory.slots[index] = null
  return { ok: true, name: def.name }
}

export function selectedStack(state) {
  const hot = state.player.hotbar?.[state.player.hotbarIndex]
  if (hot != null && state.inventory.slots[hot]) return hot
  return state.inventory.selected || 0
}
