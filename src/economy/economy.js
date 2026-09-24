import { ITEMS } from '../data/items.js'
import { PARTS } from '../data/parts.js'
import { addItem, countItem, freeSpaceFor, removeItem } from '../inventory/inventory.js'
import { deriveStats } from '../ship/stats.js'
import { rngFrom } from '../rng/rng.js'
import { repairShip } from '../combat/combat.js'

const TRADE_IDS = [
  'drift-ore', 'cinder-quartz', 'lumen-frond', 'void-ice', 'amber-resin', 'glass-sand', 'marrow-cut',
  'drift-ingot', 'tempered-glass', 'circuit-wafer', 'fuel-pellet', 'alloy-plate', 'pure-water', 'charged-prism',
  'ration', 'medpatch', 'blaster-cell', 'hull-cube', 'fuel-tank', 'laser-mount', 'power-core', 'hyperdrive', 'shield-generator',
]

export function ensureMarket(state) {
  const key = String(state.systemIndex)
  if (!state.markets[key]) {
    const rng = rngFrom(state.seed, 'market', state.systemIndex)
    const listings = TRADE_IDS.filter((id) => ITEMS[id]).map((id) => {
      const base = ITEMS[id].baseValue || 8
      const swing = 0.68 + rng.next() * 0.85
      return {
        id,
        buy: Math.max(1, Math.round(base * swing * 1.38)),
        sell: Math.max(1, Math.round(base * swing * 0.72)),
        stock: 3 + rng.int(11),
      }
    })
    const blueprints = [0, 1].map((index) => offerBlueprint(rng, state.systemIndex, index))
    state.markets[key] = { listings, blueprints }
  }
  return state.markets[key]
}

function offerBlueprint(rng, systemIndex, index) {
  const palette = ['#1f8a84', '#e85d4c', '#f3e6c8', '#7c5cbf', '#f0a202']
  const ids = ['hull-cube', 'hull-slope', 'wing-panel', 'thruster-maneuver', 'fuel-tank', 'cargo-bay', 'running-light', 'nose-cap']
  const parts = []
  const count = 3 + rng.int(3)
  for (let i = 0; i < count; i++) {
    const partId = rng.pick(ids)
    parts.push({
      partId,
      x: i - Math.floor(count / 2),
      y: 0,
      z: index === 0 ? 1 : -1,
      rot: 0,
      color: rng.pick(palette),
      hp: PARTS[partId].hp,
    })
  }
  return {
    id: `offer-${systemIndex}-${index}`,
    name: rng.pick(['Cinder Skiff', 'Paper Wasp', 'Tide Knife', 'Lantern Moth', 'Quiet Hull', 'Salt Wedge']),
    parts,
    price: 48 + rng.int(90),
    sold: false,
  }
}

export function buyGood(state, id) {
  const market = ensureMarket(state)
  const row = market.listings.find((entry) => entry.id === id)
  if (!row) return { ok: false, error: 'Not on the slate.' }
  if (row.stock <= 0) return { ok: false, error: 'The bell is out of that.' }
  if (!state.params.unlimited && state.credits < row.buy) return { ok: false, error: 'Not enough lantern credit.' }
  if (!freeSpaceFor(state, id, 1)) return { ok: false, error: 'Pockets full.' }
  if (!state.params.unlimited) state.credits -= row.buy
  row.stock -= 1
  addItem(state, id, 1)
  return { ok: true, name: ITEMS[id].name, price: row.buy }
}

export function sellGood(state, id) {
  if (!ITEMS[id]) return { ok: false, error: 'Unknown goods.' }
  if (countItem(state, id) < 1) return { ok: false, error: 'You are not carrying that.' }
  const market = ensureMarket(state)
  let row = market.listings.find((entry) => entry.id === id)
  if (!row) {
    const base = ITEMS[id].baseValue || 6
    row = { id, buy: Math.round(base * 1.4), sell: Math.round(base * 0.7), stock: 0 }
    market.listings.push(row)
  }
  removeItem(state, id, 1)
  state.credits += row.sell
  row.stock += 1
  return { ok: true, name: ITEMS[id].name, price: row.sell }
}

export function buyBlueprint(state, id) {
  const market = ensureMarket(state)
  const offer = market.blueprints.find((entry) => entry.id === id)
  if (!offer || offer.sold) return { ok: false, error: 'That folio is gone.' }
  if (!state.params.unlimited && state.credits < offer.price) return { ok: false, error: 'Not enough lantern credit.' }
  if (!state.params.unlimited) state.credits -= offer.price
  offer.sold = true
  state.blueprints.push({
    name: offer.name,
    parts: structuredClone(offer.parts),
    savedAt: Date.now(),
  })
  return { ok: true, name: offer.name }
}

export function sellBlueprint(state, name) {
  const index = state.blueprints.findIndex((entry) => entry.name === name)
  if (index < 0) return { ok: false, error: 'No such folio.' }
  const [entry] = state.blueprints.splice(index, 1)
  const price = 20 + (entry.parts?.length || 1) * 8
  state.credits += price
  return { ok: true, price, name }
}

export function refuelShip(state) {
  const stats = deriveStats(state.ship.parts)
  const room = Math.max(0, stats.fuelCap - state.ship.fuel)
  if (room <= 0.5) return { ok: false, error: 'The tanks are already full.' }
  if (state.params.unlimited || (state.params.fuelCost ?? 1) === 0) {
    state.ship.fuel = stats.fuelCap
    return { ok: true, price: 0 }
  }
  const price = Math.max(1, Math.ceil(room * 0.35 * (state.params.fuelCost || 1)))
  if (state.credits < price) return { ok: false, error: 'The pump wants more credit.' }
  state.credits -= price
  state.ship.fuel = stats.fuelCap
  return { ok: true, price }
}

export function repairAtStation(state) {
  const price = state.params.unlimited ? 0 : 18
  if (state.credits < price) return { ok: false, error: 'The yard wants more credit.' }
  state.credits -= price
  repairShip(state, 40)
  const stats = deriveStats(state.ship.parts)
  state.ship.shield = stats.shield
  return { ok: true, price }
}
