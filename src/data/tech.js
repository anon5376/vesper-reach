export const TECH = [
  { id: 'fieldcraft', name: 'Fieldcraft', cost: 0, prereq: [], desc: 'Rations, cubes, foundations, and the first kiln trick.' },
  { id: 'metallurgy', name: 'Kiln Lore', cost: 8, prereq: ['fieldcraft'], desc: 'Alloys, glass, polymer, and the refiner.' },
  { id: 'lifesupport', name: 'Suit Hymns', cost: 8, prereq: ['fieldcraft'], desc: 'Filters, pure water, and patches that keep a surveyor kind.' },
  { id: 'hullworks', name: 'Paper Hulls', cost: 10, prereq: ['metallurgy'], desc: 'Slopes, wings, cockpits, and repair foam.' },
  { id: 'propulsion', name: 'Cinder Push', cost: 10, prereq: ['metallurgy'], desc: 'Thrusters, tanks, and the grav-chute.' },
  { id: 'powercraft', name: 'Lantern Math', cost: 10, prereq: ['metallurgy'], desc: 'Cores, solar veils, batteries, and running lights.' },
  { id: 'armory', name: 'Wasp Charter', cost: 12, prereq: ['hullworks'], desc: 'Ship weapons, shields, and blaster cells.' },
  { id: 'agriculture', name: 'Quiet Acre', cost: 8, prereq: ['lifesupport'], desc: 'Cookers, farm plots, and a stew worth the name.' },
  { id: 'logistics', name: 'Margin Stores', cost: 10, prereq: ['hullworks'], desc: 'Cargo, pads, doors, storage, and paired bells.' },
  { id: 'cartography', name: 'Star Index', cost: 12, prereq: ['powercraft', 'lifesupport'], desc: 'Hyperdrive, beacons, lenses, and the long antenna.' },
]

export const TECH_BY_ID = Object.fromEntries(TECH.map((t) => [t.id, t]))
