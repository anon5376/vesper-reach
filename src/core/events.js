export function createBus() {
  const map = new Map()
  return {
    on(type, fn) {
      if (!map.has(type)) map.set(type, new Set())
      map.get(type).add(fn)
      return () => map.get(type)?.delete(fn)
    },
    off(type, fn) {
      map.get(type)?.delete(fn)
    },
    emit(type, payload) {
      const set = map.get(type)
      if (!set) return
      for (const fn of set) fn(payload)
    },
  }
}
