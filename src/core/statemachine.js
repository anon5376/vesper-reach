export const STATES = [
  'TITLE',
  'MODE_SELECT',
  'SPACE',
  'SURFACE',
  'STATION',
  'SHIP_EDITOR',
  'BASE_BUILD',
  'GALAXY_MAP',
  'PAUSED',
  'DEAD',
]

const PLAY = new Set(['SPACE', 'SURFACE', 'STATION', 'SHIP_EDITOR', 'BASE_BUILD', 'GALAXY_MAP'])

export function createMachine(initial = 'TITLE') {
  let state = initial
  let previous = initial
  const listeners = new Set()
  return {
    get state() { return state },
    get previous() { return previous },
    isPlay() { return PLAY.has(state) },
    force(next) {
      if (next === state) return
      if (!STATES.includes(next)) throw new Error(`Unknown state ${next}`)
      previous = state
      state = next
      for (const fn of listeners) fn(state, previous)
    },
    pause() {
      if (state === 'PAUSED' || state === 'TITLE' || state === 'MODE_SELECT' || state === 'DEAD') return
      previous = state
      state = 'PAUSED'
      for (const fn of listeners) fn(state, previous)
    },
    resume() {
      if (state !== 'PAUSED') return
      const back = PLAY.has(previous) ? previous : 'SPACE'
      previous = state
      state = back
      for (const fn of listeners) fn(state, previous)
    },
    onChange(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
