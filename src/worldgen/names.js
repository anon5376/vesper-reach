const A = ['bri', 'cae', 'dol', 'fen', 'gal', 'har', 'jor', 'kel', 'lun', 'mor', 'nel', 'orin', 'pel', 'quin', 'rin', 'sael', 'tel', 'vel', 'wyr', 'yor']
const B = ['a', 'e', 'i', 'o', 'ae', 'ia', 'ou', 'u']
const C = ['n', 'th', 'r', 's', 'l', 'm', 'v', 'sh', 'nd', 'll']
const PLACES = ['Hold', 'Mere', 'Wake', 'Barrow', 'Light', 'Cove', 'Spire', 'Drift', 'Veil', 'Marrow', 'Quire', 'Fold', 'Crossing', 'Shade', 'Bloom', 'Cinder', 'Tide', 'Index', 'Lantern', 'Margin']

function title(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function softName(rng) {
  return title(rng.pick(A) + rng.pick(B) + rng.pick(C))
}

export function systemName(rng) {
  return `${softName(rng)} ${rng.pick(PLACES)}`
}

export function planetName(rng) {
  return softName(rng)
}

export function stationName(rng, system) {
  return `${system.split(' ')[0]} Bell`
}

export function creatureName(rng) {
  return softName(rng)
}

export function plantName(rng) {
  return softName(rng)
}
