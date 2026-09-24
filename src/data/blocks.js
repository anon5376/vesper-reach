function block(partial) {
  return {
    powerDraw: 0,
    powerProduce: 0,
    solar: false,
    battery: 0,
    shelter: false,
    category: 'structure',
    ...partial,
  }
}

export const BLOCK_LIST = [
  block({ id: 'foundation', name: 'Foundation', category: 'structure' }),
  block({ id: 'wall', name: 'Wall', category: 'structure', shelter: true }),
  block({ id: 'floor', name: 'Floor', category: 'structure', shelter: true }),
  block({ id: 'roof', name: 'Roof', category: 'structure', shelter: true }),
  block({ id: 'door', name: 'Door', category: 'structure' }),
  block({ id: 'window', name: 'Window', category: 'structure' }),
  block({ id: 'ramp', name: 'Ramp', category: 'structure' }),
  block({ id: 'lamp', name: 'Lamp', category: 'light', powerDraw: 1 }),
  block({ id: 'campfire', name: 'Campfire', category: 'comfort', shelter: true, station: 'campfire' }),
  block({ id: 'storage', name: 'Storage Bin', category: 'function', storage: 12 }),
  block({ id: 'refiner', name: 'Refiner', category: 'function', powerDraw: 3, station: 'refiner' }),
  block({ id: 'cooker', name: 'Cooker', category: 'function', powerDraw: 2, station: 'cooker' }),
  block({ id: 'purifier', name: 'Water Purifier', category: 'function', powerDraw: 2, station: 'purifier' }),
  block({ id: 'farm', name: 'Farm Plot', category: 'function', powerDraw: 1 }),
  block({ id: 'solar', name: 'Solar Veil', category: 'power', powerProduce: 6, solar: true }),
  block({ id: 'battery', name: 'Battery Cask', category: 'power', battery: 90 }),
  block({ id: 'landing-pad', name: 'Landing Pad', category: 'function', pad: true }),
  block({ id: 'beacon', name: 'Margin Bell', category: 'function', powerDraw: 0.5, beacon: true }),
  block({ id: 'teleporter', name: 'Paired Bell', category: 'function', powerDraw: 4, teleporter: true }),
]

export const BLOCKS = Object.fromEntries(BLOCK_LIST.map((b) => [b.id, b]))

export const BLOCK_CATEGORIES = ['structure', 'comfort', 'light', 'function', 'power']
