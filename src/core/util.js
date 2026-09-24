export const SAVE_VERSION = 1

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export const lerp = (a, b, t) => a + (b - a) * t

export function dist3(a, b) {
  const dx = a.x - b.x
  const dy = (a.y || 0) - (b.y || 0)
  const dz = a.z - b.z
  return Math.hypot(dx, dy, dz)
}

export function dist2(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`
}

export function cap(s) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function keyOf(x, y, z) {
  return `${x | 0},${y | 0},${z | 0}`
}
