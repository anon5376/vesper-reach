function part(partial) {
  return {
    mass: 2,
    hp: 40,
    powerDraw: 0,
    powerProduce: 0,
    thrust: 0,
    fuel: 0,
    cargo: 0,
    shield: 0,
    turn: 0,
    weapon: null,
    category: 'decor',
    ...partial,
  }
}

export const PART_LIST = [
  part({ id: 'cockpit-lantern', name: 'Lantern Cockpit', category: 'cockpit', mass: 4.2, hp: 90, powerDraw: 2 }),
  part({ id: 'hull-cube', name: 'Hull Cube', category: 'hull', mass: 3, hp: 70 }),
  part({ id: 'hull-slope', name: 'Hull Slope', category: 'hull', mass: 2.6, hp: 60 }),
  part({ id: 'hull-corner', name: 'Hull Corner', category: 'hull', mass: 2.6, hp: 60 }),
  part({ id: 'hull-wedge', name: 'Hull Wedge', category: 'hull', mass: 2.4, hp: 55 }),
  part({ id: 'wing-panel', name: 'Wing Panel', category: 'wing', mass: 1.6, hp: 40, turn: 0.18 }),
  part({ id: 'thruster-main', name: 'Main Thruster', category: 'thruster', mass: 4.4, hp: 55, thrust: 52, powerDraw: 4 }),
  part({ id: 'thruster-maneuver', name: 'Maneuver Jet', category: 'thruster', mass: 1.5, hp: 35, thrust: 10, powerDraw: 1, turn: 0.22 }),
  part({ id: 'fuel-tank', name: 'Fuel Tank', category: 'tank', mass: 3.2, hp: 45, fuel: 90 }),
  part({ id: 'cargo-bay', name: 'Cargo Bay', category: 'cargo', mass: 3.4, hp: 50, cargo: 8 }),
  part({ id: 'shield-generator', name: 'Shield Generator', category: 'shield', mass: 3.3, hp: 45, shield: 45, powerDraw: 3 }),
  part({ id: 'power-core', name: 'Power Core', category: 'power', mass: 5, hp: 55, powerProduce: 16 }),
  part({ id: 'laser-mount', name: 'Laser Mount', category: 'weapon', mass: 2, hp: 35, powerDraw: 2, weapon: 'laser', damage: 14 }),
  part({ id: 'cannon-mount', name: 'Cannon Mount', category: 'weapon', mass: 3.2, hp: 45, powerDraw: 3, weapon: 'cannon', damage: 28 }),
  part({ id: 'missile-rack', name: 'Missile Rack', category: 'weapon', mass: 3.4, hp: 40, powerDraw: 2, weapon: 'missile', damage: 48 }),
  part({ id: 'landing-gear', name: 'Landing Gear', category: 'gear', mass: 2, hp: 40 }),
  part({ id: 'running-light', name: 'Running Light', category: 'light', mass: 0.3, hp: 15, powerDraw: 0.2 }),
  part({ id: 'nose-cap', name: 'Nose Cap', category: 'decor', mass: 0.8, hp: 25 }),
  part({ id: 'antenna', name: 'Long Antenna', category: 'decor', mass: 0.4, hp: 15, turn: 0.02 }),
  part({ id: 'hyperdrive', name: 'Lantern Drive', category: 'drive', mass: 4, hp: 50, powerDraw: 3 }),
]

export const PARTS = Object.fromEntries(PART_LIST.map((p) => [p.id, p]))

export const PART_CATEGORIES = [
  'cockpit', 'hull', 'wing', 'thruster', 'tank', 'cargo', 'shield', 'power', 'weapon', 'gear', 'light', 'decor', 'drive',
]

export function starterParts() {
  const paint = {
    'cockpit-lantern': '#f6f0e2',
    'hull-cube': '#f3ead8',
    'power-core': '#e7a322',
    'thruster-main': '#c4492a',
    'fuel-tank': '#e4d3b4',
    'landing-gear': '#2c241e',
    'shield-generator': '#b7e7ff',
    'hyperdrive': '#1c6d66',
    'laser-mount': '#2c241e',
    'wing-panel': '#f7f1e6',
    'nose-cap': '#f7f1e6',
    'running-light': '#fff6d4',
  }
  const cells = [
    ['cockpit-lantern', 0, 0, 0],
    ['nose-cap', 0, 0, -1],
    ['running-light', 0, 1, -1],
    ['laser-mount', 0, 1, 0],
    ['hull-cube', 0, 0, 1],
    ['fuel-tank', 1, 0, 1],
    ['hyperdrive', -1, 0, 1],
    ['wing-panel', 2, 0, 1],
    ['wing-panel', -2, 0, 1],
    ['landing-gear', 0, -1, 1],
    ['shield-generator', 1, 0, 2],
    ['power-core', 0, 0, 2],
    ['thruster-main', 0, 0, 3],
  ]
  return cells.map(([partId, x, y, z], i) => ({
    uid: `starter-${i}`,
    partId,
    x, y, z,
    rot: 0,
    color: paint[partId] || '#d7efe8',
    hp: PARTS[partId].hp,
  }))
}
