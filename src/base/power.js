import { BLOCKS } from '../data/blocks.js'

export function sunHeight(time, dayLength) {
  const t = (time % dayLength) / dayLength
  return Math.sin(t * Math.PI * 2)
}

export function summarizePower(base, time, dayLength) {
  const day = sunHeight(time, dayLength) > 0.05
  let produce = 0
  let draw = 0
  let battery = 0
  for (const piece of base.pieces) {
    const def = BLOCKS[piece.blockId]
    if (!def) continue
    if (def.powerProduce) produce += def.solar ? (day ? def.powerProduce : 0) : def.powerProduce
    if (def.powerDraw) draw += def.powerDraw
    if (def.battery) battery += def.battery
  }
  return {
    produce: round(produce),
    draw: round(draw),
    battery,
    stored: round(base.powerStored || 0),
    daylight: day,
    balance: round(produce - draw),
    powered: produce + (base.powerStored || 0) >= draw - 0.001,
  }
}

function round(n) {
  return Math.round(n * 10) / 10
}

export function tickPower(base, dt, time, dayLength) {
  const before = summarizePower(base, time, dayLength)
  const cap = before.battery
  let stored = base.powerStored || 0
  stored = Math.max(0, Math.min(cap, stored + before.balance * dt))
  base.powerStored = stored
  const after = summarizePower(base, time, dayLength)
  base.powered = after.powered
  return after
}
