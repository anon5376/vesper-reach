import { BLOCKS } from '../data/blocks.js'
import { RECIPES } from '../data/recipes.js'
import { addItem, removeItem, countItem } from '../inventory/inventory.js'
import { uid } from '../core/util.js'
import { basesHere, findPieceNear, pieceAt } from './query.js'
import { tickPower } from './power.js'

export function ensureBase(state) {
  let base = basesHere(state)[0]
  if (base) return base
  base = {
    id: uid('camp'),
    name: 'Margin Camp',
    systemIndex: state.systemIndex,
    planetIndex: state.planetIndex,
    pieces: [],
    powerStored: 0,
    powered: false,
  }
  state.bases.push(base)
  return base
}

export function placeBlock(state, blockId, x, y, z, rot = 0) {
  const def = BLOCKS[blockId]
  if (!def) return { ok: false, error: 'Unknown piece.' }
  if (state.location !== 'surface') return { ok: false, error: 'Build on the ground, not in the dark.' }
  x = Math.round(x); y = Math.round(y); z = Math.round(z)
  const base = ensureBase(state)
  if (pieceAt(base, x, y, z)) return { ok: false, error: 'That square is taken.' }
  if (base.pieces.length > 220) return { ok: false, error: 'This camp is as large as the charter allows.' }
  const free = state.params.unlimited || state.params.instantBuild
  if (!free && countItem(state, blockId) < 1) return { ok: false, error: `You need a ${def.name} in your pockets.` }
  if (!free) removeItem(state, blockId, 1)
  const piece = {
    uid: uid('blk'),
    blockId,
    x, y, z,
    rot,
    color: '#d7c4a3',
    slots: def.storage ? Array.from({ length: def.storage }, () => null) : null,
    job: null,
    grow: def.id === 'farm' ? 0 : null,
  }
  base.pieces.push(piece)
  return { ok: true, piece, base }
}

export function removeBlock(state, x, y, z) {
  const base = basesHere(state)[0]
  if (!base) return { ok: false, error: 'No camp here.' }
  const index = base.pieces.findIndex((piece) => piece.x === x && piece.y === y && piece.z === z)
  if (index < 0) return { ok: false, error: 'Nothing there to lift.' }
  const [piece] = base.pieces.splice(index, 1)
  if (!(state.params.unlimited || state.params.instantBuild)) addItem(state, piece.blockId, 1)
  return { ok: true, piece }
}

export function updateBases(state, dt) {
  const day = state.params.dayLength || 480
  for (const base of state.bases) {
    const here = base.systemIndex === state.systemIndex && base.planetIndex === state.planetIndex && state.location === 'surface'
    const summary = tickPower(base, here ? dt : 0, state.time, day)
    if (!here || !summary.powered) continue
    for (const piece of base.pieces) {
      if (piece.blockId === 'farm' && piece.grow != null && piece.grow < 1) {
        piece.grow = Math.min(1, piece.grow + dt / 40)
      }
      if (piece.job) {
        piece.job.progress += dt
        if (piece.job.progress >= piece.job.time) {
          const recipe = RECIPES[piece.job.recipeId]
          piece.job = null
          if (recipe) addItem(state, recipe.output.id, recipe.output.count)
        }
      }
    }
  }
}

export function interactBase(state) {
  const beacon = findPieceNear(state, ['beacon'], 3.5)
  if (beacon) return { kind: 'beacon', ...beacon }
  const tele = findPieceNear(state, ['teleporter'], 3.5)
  if (tele) return { kind: 'teleporter', ...tele }
  const storage = findPieceNear(state, ['storage'], 3.5)
  if (storage) return { kind: 'storage', ...storage }
  const farm = findPieceNear(state, ['farm'], 3.5)
  if (farm && farm.piece.grow >= 1) return { kind: 'farm', ...farm }
  const pad = findPieceNear(state, ['landing-pad'], 5)
  if (pad) return { kind: 'pad', ...pad }
  return null
}

export function harvestFarm(state, piece) {
  if (!piece || piece.grow < 1) return { ok: false, error: 'Still growing.' }
  piece.grow = 0
  addItem(state, 'lumen-frond', 2)
  addItem(state, 'spore-pod', 1)
  return { ok: true }
}

export function teleportToNext(state, piece) {
  const bells = []
  for (const base of state.bases) {
    for (const candidate of base.pieces) {
      if (candidate.blockId === 'teleporter') bells.push({ base, piece: candidate })
    }
  }
  if (bells.length < 2) return { ok: false, error: 'A paired bell needs a twin in another camp.' }
  const index = bells.findIndex((bell) => bell.piece === piece)
  const next = bells[(index + 1) % bells.length]
  state.systemIndex = next.base.systemIndex
  state.planetIndex = next.base.planetIndex
  state.location = 'surface'
  state.player.aboard = false
  state.player.position.x = next.piece.x + 1.5
  state.player.position.y = next.piece.y + 2
  state.player.position.z = next.piece.z + 1.5
  state.player.velocity = { x: 0, y: 0, z: 0 }
  return { ok: true, name: next.base.name }
}

export { findPieceNear }
