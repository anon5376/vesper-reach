import { MODE_LIST } from '../data/modes.js'

const BASE = MODE_LIST.find((m) => m.id === 'normal').params

export function preset(id) {
  return MODE_LIST.find((m) => m.id === id) || MODE_LIST[0]
}

export function resolveParams(modeId, custom = null) {
  if (modeId === 'custom') {
    const src = custom || {}
    const params = { ...BASE, ...src, custom: true }
    if (!params.hungerEnabled) {
      params.hungerDrain = 0
      params.thirstDrain = 0
    }
    if (params.unlimited) params.craftingCost = 0
    return params
  }
  const mode = preset(modeId)
  return { ...mode.params, custom: false }
}

export function describeMode(modeId) {
  return preset(modeId).blurb
}

export { MODE_LIST }
