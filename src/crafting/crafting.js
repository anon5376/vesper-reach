import { ITEMS } from '../data/items.js'
import { RECIPE_LIST } from '../data/recipes.js'
import { findPieceNear } from '../base/query.js'
import { addItem, canAfford, pay } from '../inventory/inventory.js'

export function knownRecipes(state) {
  const unlocked = new Set(state.unlockedTech)
  return RECIPE_LIST.filter((recipe) => !recipe.tech || unlocked.has(recipe.tech))
}

export function canCraft(state, recipe) {
  if (!recipe) return { ok: false, error: 'No such recipe.' }
  if (recipe.tech && !state.unlockedTech.includes(recipe.tech)) {
    return { ok: false, error: 'That folio is still shut.' }
  }
  if (recipe.station !== 'hand' && !findPieceNear(state, recipe.station)) {
    return { ok: false, error: `Needs a ${recipe.station} nearby.` }
  }
  if (!canAfford(state, recipe.inputs)) return { ok: false, error: 'Short on materials.' }
  return { ok: true }
}

export function craftRecipe(state, recipeId) {
  const recipe = RECIPE_LIST.find((entry) => entry.id === recipeId)
  const check = canCraft(state, recipe)
  if (!check.ok) return check
  if (recipe.time > 0 && (recipe.station === 'refiner' || recipe.station === 'purifier')) {
    const near = findPieceNear(state, recipe.station)
    if (!near) return { ok: false, error: 'The machine is not here.' }
    if (near.piece.job) return { ok: false, error: 'That machine is already busy.' }
    if (!pay(state, recipe.inputs)) return { ok: false, error: 'Short on materials.' }
    near.piece.job = { recipeId: recipe.id, progress: 0, time: recipe.time }
    return { ok: true, queued: true, name: ITEMS[recipe.output.id]?.name || recipe.output.id }
  }
  if (!pay(state, recipe.inputs)) return { ok: false, error: 'Short on materials.' }
  const left = addItem(state, recipe.output.id, recipe.output.count)
  if (left > 0) {
    addItem(state, recipe.output.id, 0)
    return { ok: false, error: 'Pockets full. The work had nowhere to land.' }
  }
  state.stats.crafted = (state.stats.crafted || 0) + 1
  return { ok: true, name: ITEMS[recipe.output.id]?.name || recipe.output.id }
}
