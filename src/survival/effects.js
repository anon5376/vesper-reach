export const EFFECT_DEFS = {
  poisoned: { name: 'Poisoned', blurb: 'Sap in the blood.' },
  frozen: { name: 'Frozen', blurb: 'Joints filing complaints.' },
  overheated: { name: 'Overheated', blurb: 'The suit is cooking you gently.' },
  irradiated: { name: 'Irradiated', blurb: 'The counter will not shut up.' },
  'well-fed': { name: 'Well Fed', blurb: 'Stew. Actual stew.' },
}

export function addEffect(state, id, seconds) {
  if (!EFFECT_DEFS[id]) return
  const until = state.time + seconds
  const existing = state.player.effects.find((e) => e.id === id)
  if (existing) existing.until = Math.max(existing.until, until)
  else state.player.effects.push({ id, until })
}

export function hasEffect(state, id) {
  return state.player.effects.some((e) => e.id === id && e.until > state.time)
}

export function tickEffects(state, dt, hurt) {
  const keep = []
  for (const effect of state.player.effects) {
    if (effect.until <= state.time) continue
    keep.push(effect)
    if (effect.id === 'poisoned') hurt(3.2 * dt, 'poison')
    if (effect.id === 'irradiated') hurt(2.4 * dt, 'radiation')
    if (effect.id === 'overheated') hurt(1.8 * dt, 'heat')
    if (effect.id === 'frozen') hurt(1.2 * dt, 'cold')
    if (effect.id === 'well-fed') {
      state.player.health = Math.min(state.player.maxHealth, state.player.health + 0.8 * dt)
    }
  }
  state.player.effects = keep
}
