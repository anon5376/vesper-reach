export const TEMPERAMENTS = ['wander', 'graze', 'flee', 'hunt', 'territorial']

export const BODY_PARTS = {
  body: ['barrel', 'disc', 'spindle', 'slab'],
  head: ['wedge', 'orb', 'crest', 'beak'],
  legs: ['stilt', 'pad', 'none', 'many'],
  tail: ['whip', 'fan', 'none', 'lantern'],
}

export const PLANT_FORMS = ['fan', 'spire', 'bulb', 'ribbon']

const EPITHETS = [
  'glasshorn', 'tideback', 'lanternjaw', 'paperwing', 'saltmule', 'cinderhoof',
  'veilmoth', 'marrowfin', 'quietjaw', 'amberback', 'sporebell', 'driftelk',
]

const PLANT_EPITHETS = [
  'moonfrond', 'ashlily', 'brinebulb', 'lanternreed', 'violetfan', 'saltspine',
  'cinderbloom', 'tidekelp', 'paperleaf', 'glowpod',
]

export function speciesCountFor(rng) {
  return 3 + rng.int(4)
}

export function rollSpecies(rng, index, planetName) {
  const temperament = rng.pick(TEMPERAMENTS)
  return {
    index,
    name: `${planetName} ${rng.pick(EPITHETS)}`,
    temperament,
    body: rng.pick(BODY_PARTS.body),
    head: rng.pick(BODY_PARTS.head),
    legs: rng.pick(BODY_PARTS.legs),
    tail: rng.pick(BODY_PARTS.tail),
    scale: rng.range(0.7, 1.5),
    hostile: temperament === 'hunt' || temperament === 'territorial',
    colors: [rng.range(0.2, 1), rng.range(0.25, 0.9), rng.range(0.3, 0.95)],
  }
}

export function rollPlant(rng, index, planetName) {
  return {
    index,
    name: `${planetName} ${rng.pick(PLANT_EPITHETS)}`,
    form: rng.pick(PLANT_FORMS),
    harvest: rng.pick(['lumen-frond', 'spore-pod', 'kelp-fiber', 'amber-resin']),
  }
}
