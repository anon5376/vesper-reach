import { PARTS } from '../data/parts.js'

function cellKey(p) {
  return `${p.x},${p.y},${p.z}`
}

export function isConnected(parts, defs = PARTS) {
  if (!parts.length) return false
  const cockpit = parts.find((p) => defs[p.partId]?.category === 'cockpit')
  if (!cockpit) return false
  const map = new Map(parts.map((p) => [cellKey(p), p]))
  const seen = new Set([cellKey(cockpit)])
  const queue = [cockpit]
  while (queue.length) {
    const cur = queue.pop()
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (!x && !y && !z) continue
          const k = `${cur.x + x},${cur.y + y},${cur.z + z}`
          if (map.has(k) && !seen.has(k)) {
            seen.add(k)
            queue.push(map.get(k))
          }
        }
      }
    }
  }
  return seen.size === parts.length
}

export function deriveStats(parts, gravity = 1, defs = PARTS) {
  let mass = 0
  let thrust = 0
  let power = 0
  let draw = 0
  let fuelCap = 0
  let cargo = 4
  let shield = 0
  let turn = 0
  let cx = 0
  let cy = 0
  let cz = 0
  let weapons = 0
  for (const p of parts) {
    const d = defs[p.partId]
    if (!d) continue
    const hp = p.hp == null ? d.hp : p.hp
    const health = Math.max(0, Math.min(1, hp / d.hp))
    const alive = health > 0.08
    mass += d.mass
    cx += p.x * d.mass
    cy += p.y * d.mass
    cz += p.z * d.mass
    if (!alive) continue
    thrust += (d.thrust || 0) * (0.35 + 0.65 * health)
    power += d.powerProduce || 0
    draw += d.powerDraw || 0
    fuelCap += d.fuel || 0
    cargo += d.cargo || 0
    shield += (d.shield || 0) * health
    turn += d.turn || 0
    if (d.weapon) weapons += 1
  }
  mass = Math.max(1, mass)
  const twr = thrust / (mass * Math.max(0.2, gravity))
  const balance = power - draw
  const topSpeed = Math.max(10, 18 + thrust * 0.62 - mass * 0.28)
  const yawRate = Math.max(0.35, (0.85 + turn) / Math.sqrt(mass / 10))
  return {
    mass: round(mass),
    thrust: round(thrust),
    twr: round(twr),
    power: round(power),
    draw: round(draw),
    balance: round(balance),
    fuelCap: Math.round(fuelCap),
    cargo,
    shield: Math.round(shield),
    topSpeed: round(topSpeed),
    yawRate: round(yawRate),
    pitchRate: round(yawRate * 0.86),
    rollRate: round(yawRate * 1.25),
    weapons,
    com: { x: round(cx / mass), y: round(cy / mass), z: round(cz / mass) },
  }
}

function round(n) {
  return Math.round(n * 100) / 100
}

export function validateShip(parts, gravity = 1, defs = PARTS) {
  const errors = []
  const stats = deriveStats(parts, gravity, defs)
  if (!parts.some((p) => defs[p.partId]?.category === 'cockpit')) {
    errors.push('Install a cockpit before this hull can fly.')
  }
  if (stats.balance < -0.05) {
    errors.push(`Power is short by ${(-stats.balance).toFixed(1)}. Add a core or drop a hungry part.`)
  }
  if (stats.thrust <= 0) {
    errors.push('There is no working thrust. The kite will not leave the pad.')
  } else if (stats.twr <= 1) {
    errors.push(`Thrust-to-weight is ${stats.twr.toFixed(2)}. Surface takeoff needs more than 1.00.`)
  }
  if (parts.length && !isConnected(parts, defs)) {
    errors.push('Some pieces do not touch the cockpit. Snap them to the hull.')
  }
  const drive = parts.some((p) => defs[p.partId]?.category === 'drive' && (p.hp == null || p.hp > 0))
  return { ok: errors.length === 0, errors, stats, hasDrive: drive }
}

export function occupiedKey(parts, x, y, z, ignoreUid = null) {
  return parts.some((p) => p.uid !== ignoreUid && p.x === x && p.y === y && p.z === z)
}
