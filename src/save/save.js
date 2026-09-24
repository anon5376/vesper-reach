import { SAVE_VERSION } from '../core/util.js'

const PREFIX = 'vesper-reach:v1'

export function slotKey(slot) {
  return `${PREFIX}:slot:${slot}`
}

export function settingsKey() {
  return `${PREFIX}:settings`
}

export function blueprintKey() {
  return `${PREFIX}:blueprints`
}

export function packState(state) {
  const copy = structuredClone(state)
  delete copy.flags?.capturing
  return { version: SAVE_VERSION, savedAt: Date.now(), state: copy }
}

export function unpackState(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('That log is empty.')
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (data.version !== SAVE_VERSION) throw new Error(`This log uses version ${data.version}, and the desk only reads ${SAVE_VERSION}.`)
  if (!data.state || typeof data.state !== 'object') throw new Error('The log has no survey inside it.')
  data.state.version = SAVE_VERSION
  if (!data.state.flags) data.state.flags = { frozen: false }
  data.state.flags.frozen = false
  return data.state
}

function storage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function writeSlot(slot, state) {
  const ls = storage()
  if (!ls) return { ok: false, error: 'The desk has no drawers here.' }
  try {
    ls.setItem(slotKey(slot), JSON.stringify(packState(state)))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || 'The drawer stuck.' }
  }
}

export function readSlot(slot) {
  const ls = storage()
  if (!ls) return null
  try {
    const text = ls.getItem(slotKey(slot))
    if (!text) return null
    return unpackState(text)
  } catch {
    return null
  }
}

export function slotSummary(slot) {
  const ls = storage()
  if (!ls) return null
  try {
    const text = ls.getItem(slotKey(slot))
    if (!text) return null
    const data = JSON.parse(text)
    const state = data.state || {}
    return {
      slot,
      savedAt: data.savedAt || 0,
      modeId: state.modeId || 'normal',
      systemIndex: state.systemIndex || 0,
      location: state.location || 'space',
      ship: state.ship?.name || 'Paper Kite',
    }
  } catch {
    return null
  }
}

export function deleteSlot(slot) {
  const ls = storage()
  if (!ls) return
  try { ls.removeItem(slotKey(slot)) } catch { /* ignore */ }
}

export function exportText(slot) {
  const ls = storage()
  if (!ls) return ''
  try { return ls.getItem(slotKey(slot)) || '' } catch { return '' }
}

export function importText(text, slot) {
  const state = unpackState(text)
  state.slot = slot
  const result = writeSlot(slot, state)
  if (!result.ok) throw new Error(result.error)
  return state
}

export function loadSettings(fallback) {
  const ls = storage()
  if (!ls) return structuredClone(fallback)
  try {
    const text = ls.getItem(settingsKey())
    if (!text) return structuredClone(fallback)
    return { ...structuredClone(fallback), ...JSON.parse(text) }
  } catch {
    return structuredClone(fallback)
  }
}

export function writeSettings(settings) {
  const ls = storage()
  if (!ls) return
  try { ls.setItem(settingsKey(), JSON.stringify(settings)) } catch { /* ignore */ }
}

export function loadBlueprints() {
  const ls = storage()
  if (!ls) return []
  try {
    const text = ls.getItem(blueprintKey())
    const list = text ? JSON.parse(text) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function writeBlueprints(list) {
  const ls = storage()
  if (!ls) return
  try { ls.setItem(blueprintKey(), JSON.stringify(list)) } catch { /* ignore */ }
}
