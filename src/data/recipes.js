function recipe(id, output, inputs, tech, station = 'hand', time = 0) {
  return { id, output, inputs, tech, station, time }
}

const out = (id, count = 1) => ({ id, count })
const need = (...pairs) => {
  const inputs = []
  for (let i = 0; i < pairs.length; i += 2) inputs.push({ id: pairs[i], count: pairs[i + 1] })
  return inputs
}

export const RECIPE_LIST = [
  recipe('smelt-drift', out('drift-ingot'), need('drift-ore', 2), 'fieldcraft'),
  recipe('kiln-rust', out('drift-ingot'), need('rust-bark', 2), 'metallurgy', 'refiner', 8),
  recipe('smelt-alloy', out('alloy-plate'), need('drift-ingot', 2, 'star-ash', 1), 'metallurgy', 'refiner', 10),
  recipe('blow-glass', out('tempered-glass'), need('glass-sand', 2), 'metallurgy', 'refiner', 8),
  recipe('press-polymer', out('polymer-sheet'), need('amber-resin', 2, 'toxic-sap', 1), 'metallurgy', 'refiner', 10),
  recipe('etch-wafer', out('circuit-wafer'), need('cinder-quartz', 1, 'filament-wire', 1, 'magnet-dust', 1), 'metallurgy', 'refiner', 12),
  recipe('cook-gel', out('coolant-gel'), need('void-ice', 1, 'brine-salt', 1), 'lifesupport', 'refiner', 8),
  recipe('mill-nutrient', out('nutrient-paste'), need('lumen-frond', 2), 'agriculture', 'cooker'),
  recipe('mill-spore', out('nutrient-paste'), need('spore-pod', 1, 'lumen-frond', 1), 'agriculture', 'cooker'),
  recipe('purify-water', out('pure-water'), need('pale-water', 1), 'lifesupport', 'purifier', 6),
  recipe('spin-thread', out('shield-thread'), need('kelp-fiber', 1, 'coral-bone', 1), 'armory', 'refiner', 10),
  recipe('pack-fuel', out('fuel-pellet'), need('star-ash', 1, 'drift-ore', 1), 'propulsion', 'refiner', 6),
  recipe('weave-cloth', out('bio-cloth'), need('kelp-fiber', 2), 'fieldcraft'),
  recipe('charge-prism', out('charged-prism'), need('radio-shard', 1, 'cinder-quartz', 1), 'powercraft', 'refiner', 12),
  recipe('cook-ration', out('ration'), need('lumen-frond', 1), 'fieldcraft', 'campfire'),
  recipe('cook-stew', out('field-stew'), need('nutrient-paste', 1, 'pure-water', 1), 'agriculture', 'cooker'),
  recipe('cook-spore-stew', out('field-stew'), need('spore-pod', 1, 'pure-water', 1), 'agriculture', 'cooker'),
  recipe('fill-canteen', out('canteen'), need('pure-water', 1, 'tempered-glass', 1), 'lifesupport'),
  recipe('sew-medpatch', out('medpatch'), need('bio-cloth', 1, 'toxic-sap', 1), 'lifesupport'),
  recipe('sew-mask', out('filter-mask'), need('bio-cloth', 1, 'polymer-sheet', 1), 'lifesupport'),
  recipe('cut-suit-patch', out('suit-patch'), need('alloy-plate', 1), 'lifesupport'),
  recipe('pack-coolant', out('coolant-pack'), need('coolant-gel', 1, 'polymer-sheet', 1), 'lifesupport'),
  recipe('mix-foam', out('repair-foam'), need('polymer-sheet', 1, 'drift-ingot', 1), 'hullworks'),
  recipe('build-campfire', out('campfire'), need('drift-ore', 2, 'lumen-frond', 1), 'fieldcraft'),
  recipe('grind-lens', out('scanner-lens'), need('tempered-glass', 1, 'cinder-quartz', 1), 'cartography'),
  recipe('load-cell', out('blaster-cell', 2), need('charged-prism', 1, 'filament-wire', 1), 'armory'),
  recipe('pack-flare', out('survey-flare', 2), need('star-ash', 1, 'filament-wire', 1), 'fieldcraft'),
  recipe('bind-folio', out('map-folio'), need('bio-cloth', 1, 'brine-salt', 1), 'cartography'),
  recipe('fold-chute', out('grav-chute'), need('polymer-sheet', 1, 'shield-thread', 1), 'propulsion'),
  recipe('wrap-plating', out('reinforced-plating'), need('alloy-plate', 1), 'hullworks'),
  recipe('shape-cube', out('hull-cube'), need('drift-ingot', 2), 'fieldcraft'),
  recipe('shape-slope', out('hull-slope'), need('drift-ingot', 1, 'alloy-plate', 1), 'hullworks'),
  recipe('shape-corner', out('hull-corner'), need('drift-ingot', 1, 'alloy-plate', 1), 'hullworks'),
  recipe('shape-wedge', out('hull-wedge'), need('alloy-plate', 1, 'drift-ingot', 1), 'hullworks'),
  recipe('stretch-wing', out('wing-panel'), need('alloy-plate', 2, 'polymer-sheet', 1), 'hullworks'),
  recipe('mount-thruster', out('thruster-main'), need('alloy-plate', 2, 'fuel-pellet', 1, 'circuit-wafer', 1), 'propulsion'),
  recipe('mount-jet', out('thruster-maneuver'), need('alloy-plate', 1, 'circuit-wafer', 1), 'propulsion'),
  recipe('weld-tank', out('fuel-tank'), need('alloy-plate', 2, 'polymer-sheet', 1), 'propulsion'),
  recipe('frame-cargo', out('cargo-bay'), need('alloy-plate', 2), 'logistics'),
  recipe('wind-shield', out('shield-generator'), need('shield-thread', 1, 'circuit-wafer', 1, 'alloy-plate', 1), 'armory'),
  recipe('seat-core', out('power-core'), need('charged-prism', 2, 'alloy-plate', 1, 'circuit-wafer', 1), 'powercraft'),
  recipe('mount-laser', out('laser-mount'), need('tempered-glass', 1, 'circuit-wafer', 1, 'drift-ingot', 1), 'armory'),
  recipe('mount-cannon', out('cannon-mount'), need('alloy-plate', 2, 'circuit-wafer', 1), 'armory'),
  recipe('mount-missiles', out('missile-rack'), need('alloy-plate', 2, 'fuel-pellet', 1, 'circuit-wafer', 1), 'armory'),
  recipe('bend-gear', out('landing-gear'), need('drift-ingot', 2), 'fieldcraft'),
  recipe('wire-light', out('running-light'), need('tempered-glass', 1, 'filament-wire', 1), 'powercraft'),
  recipe('cast-nose', out('nose-cap'), need('alloy-plate', 1), 'hullworks'),
  recipe('raise-antenna', out('antenna'), need('filament-wire', 1, 'drift-ingot', 1), 'cartography'),
  recipe('fold-drive', out('hyperdrive'), need('charged-prism', 2, 'circuit-wafer', 2, 'alloy-plate', 1), 'cartography'),
  recipe('seat-cockpit', out('cockpit-lantern'), need('tempered-glass', 2, 'alloy-plate', 2, 'circuit-wafer', 1), 'hullworks'),
  recipe('pour-foundation', out('foundation'), need('drift-ingot', 1), 'fieldcraft'),
  recipe('raise-wall', out('wall'), need('drift-ingot', 1), 'fieldcraft'),
  recipe('lay-floor', out('floor'), need('drift-ingot', 1), 'fieldcraft'),
  recipe('pitch-roof', out('roof'), need('drift-ingot', 1, 'polymer-sheet', 1), 'fieldcraft'),
  recipe('hang-door', out('door'), need('drift-ingot', 1, 'filament-wire', 1), 'logistics'),
  recipe('set-window', out('window'), need('tempered-glass', 1), 'hullworks'),
  recipe('set-ramp', out('ramp'), need('drift-ingot', 1), 'fieldcraft'),
  recipe('hang-lamp', out('lamp'), need('filament-wire', 1, 'tempered-glass', 1), 'powercraft'),
  recipe('nail-bin', out('storage'), need('drift-ingot', 2), 'logistics'),
  recipe('build-refiner', out('refiner'), need('alloy-plate', 2, 'circuit-wafer', 1), 'metallurgy'),
  recipe('build-cooker', out('cooker'), need('drift-ingot', 1, 'alloy-plate', 1), 'agriculture'),
  recipe('build-purifier', out('purifier'), need('tempered-glass', 1, 'alloy-plate', 1, 'filament-wire', 1), 'lifesupport'),
  recipe('till-plot', out('farm'), need('bio-cloth', 1, 'lumen-frond', 2), 'agriculture'),
  recipe('hang-solar', out('solar'), need('tempered-glass', 2, 'circuit-wafer', 1, 'filament-wire', 1), 'powercraft'),
  recipe('cask-battery', out('battery'), need('charged-prism', 1, 'alloy-plate', 1), 'powercraft'),
  recipe('pour-pad', out('landing-pad'), need('alloy-plate', 3, 'circuit-wafer', 1), 'logistics'),
  recipe('hang-beacon', out('beacon'), need('circuit-wafer', 1, 'filament-wire', 1, 'drift-ingot', 1), 'cartography'),
  recipe('pair-bell', out('teleporter'), need('charged-prism', 2, 'circuit-wafer', 2, 'shield-thread', 1), 'logistics'),
  recipe('sear-marrow', out('ration'), need('marrow-cut', 1), 'fieldcraft', 'campfire'),
  recipe('stew-marrow', out('field-stew'), need('marrow-cut', 1, 'pure-water', 1), 'agriculture', 'cooker'),
]

export const RECIPES = Object.fromEntries(RECIPE_LIST.map((r) => [r.id, r]))

export function recipeById(id) {
  return RECIPES[id] || null
}
