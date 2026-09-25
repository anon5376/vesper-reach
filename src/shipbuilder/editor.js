import { PARTS, PART_LIST } from '../data/parts.js'
import { addItem, countItem, removeItem } from '../inventory/inventory.js'
import { deriveStats, occupiedKey, validateShip } from '../ship/stats.js'
import { uid } from '../core/util.js'

const SWATCHES = ['#f3e6c8', '#1f8a84', '#e85d4c', '#f0a202', '#7c5cbf', '#d7efe8', '#8d99ae', '#4cc9f0']

export function swatches() {
  return SWATCHES
}

export function openEditor(state, runtime) {
  runtime.editor = {
    parts: structuredClone(state.ship.parts),
    undo: [],
    redo: [],
    category: 'hull',
    paint: '#d7efe8',
    rot: 0,
    mirror: false,
    cursor: { x: 1, y: 0, z: 0 },
    name: state.ship.name || 'Paper Kite',
  }
  return runtime.editor
}

function editorOf(state, runtime) {
  if (!runtime.editor) openEditor(state, runtime)
  return runtime.editor
}

function snapshot(editor) {
  editor.undo.push(structuredClone(editor.parts))
  if (editor.undo.length > 40) editor.undo.shift()
  editor.redo.length = 0
}

export function placePart(state, runtime, partId, at) {
  const editor = editorOf(state, runtime)
  const def = PARTS[partId]
  if (!def) return { ok: false, error: 'Unknown part.' }
  const spot = at || editor.cursor
  if (occupiedKey(editor.parts, spot.x, spot.y, spot.z)) return { ok: false, error: 'That cell is already a bone of the hull.' }
  const mirror = editor.mirror && spot.x !== 0 && !occupiedKey(editor.parts, -spot.x, spot.y, spot.z)
  const need = mirror ? 2 : 1
  if (!state.params.unlimited && !state.params.instantBuild && countItem(state, partId) < need) {
    return { ok: false, error: `You need ${need} ${def.name}.` }
  }
  snapshot(editor)
  if (!state.params.unlimited && !state.params.instantBuild) removeItem(state, partId, need)
  editor.parts.push(makePart(partId, spot.x, spot.y, spot.z, editor))
  if (mirror && !occupiedKey(editor.parts, -spot.x, spot.y, spot.z)) {
    editor.parts.push(makePart(partId, -spot.x, spot.y, spot.z, editor))
  }
  return { ok: true, stats: deriveStats(editor.parts) }
}

function makePart(partId, x, y, z, editor) {
  return {
    uid: uid('part'),
    partId,
    x, y, z,
    rot: editor.rot || 0,
    color: editor.paint || '#d7efe8',
    hp: PARTS[partId].hp,
  }
}

export function erasePart(state, runtime) {
  const editor = editorOf(state, runtime)
  const index = editor.parts.findIndex((part) => part.x === editor.cursor.x && part.y === editor.cursor.y && part.z === editor.cursor.z)
  if (index < 0) return { ok: false, error: 'Empty cell.' }
  snapshot(editor)
  const [part] = editor.parts.splice(index, 1)
  if (!state.params.unlimited && !state.params.instantBuild) addItem(state, part.partId, 1)
  return { ok: true }
}

export function paintCursor(state, runtime) {
  const editor = editorOf(state, runtime)
  const part = editor.parts.find((entry) => entry.x === editor.cursor.x && entry.y === editor.cursor.y && entry.z === editor.cursor.z)
  if (!part) return { ok: false, error: 'Nothing there to paint.' }
  snapshot(editor)
  part.color = editor.paint
  return { ok: true }
}

export function undoEdit(state, runtime) {
  const editor = editorOf(state, runtime)
  const prev = editor.undo.pop()
  if (!prev) return { ok: false, error: 'Nothing to undo.' }
  editor.redo.push(structuredClone(editor.parts))
  editor.parts = prev
  return { ok: true }
}

export function redoEdit(state, runtime) {
  const editor = editorOf(state, runtime)
  const next = editor.redo.pop()
  if (!next) return { ok: false, error: 'Nothing to redo.' }
  editor.undo.push(structuredClone(editor.parts))
  editor.parts = next
  return { ok: true }
}

export function moveCursor(state, runtime, dx, dy, dz) {
  const editor = editorOf(state, runtime)
  editor.cursor.x = clamp(editor.cursor.x + dx, -6, 6)
  editor.cursor.y = clamp(editor.cursor.y + dy, -3, 3)
  editor.cursor.z = clamp(editor.cursor.z + dz, -6, 6)
  return editor.cursor
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}

export function editorReport(state, runtime) {
  const editor = editorOf(state, runtime)
  const report = validateShip(editor.parts, 1, PARTS)
  return { ...report, name: editor.name, cursor: editor.cursor, paint: editor.paint, mirror: editor.mirror, category: editor.category }
}

export function commitEditor(state, runtime) {
  const editor = editorOf(state, runtime)
  const report = validateShip(editor.parts, 1, PARTS)
  if (!report.ok) return report
  state.ship.parts = structuredClone(editor.parts)
  state.ship.name = editor.name || state.ship.name
  state.ship.fuel = Math.min(state.ship.fuel, report.stats.fuelCap || 0)
  state.ship.shield = Math.min(state.ship.shield || 0, report.stats.shield || 0)
  return report
}

export function saveDraftBlueprint(state, runtime, name) {
  const editor = editorOf(state, runtime)
  const label = (name || editor.name || 'Untitled hull').slice(0, 32)
  const entry = { name: label, parts: structuredClone(editor.parts), savedAt: Date.now() }
  const index = state.blueprints.findIndex((item) => item.name === label)
  if (index >= 0) state.blueprints[index] = entry
  else state.blueprints.push(entry)
  return { ok: true, name: label }
}

export function loadDraftBlueprint(state, runtime, name) {
  const found = state.blueprints.find((item) => item.name === name)
  if (!found) return { ok: false, error: 'No folio by that name.' }
  const editor = editorOf(state, runtime)
  snapshot(editor)
  editor.parts = structuredClone(found.parts).map((part) => ({
    ...part,
    uid: part.uid || uid('part'),
    hp: part.hp ?? PARTS[part.partId]?.hp ?? 20,
    color: part.color || '#d7efe8',
  }))
  editor.name = found.name
  return { ok: true, name: found.name }
}

export function ownedCount(state, partId) {
  if (state.params.unlimited || state.params.instantBuild) return 99
  return countItem(state, partId)
}

export function partsInCategory(category) {
  return PART_LIST.filter((part) => part.category === category)
}

export { PART_LIST }
