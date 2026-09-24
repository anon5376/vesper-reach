/** Deterministic PRNG. Mulberry32, salted forks never share a stream. */
export class RNG {
  constructor(seed) {
    this.s = (seed >>> 0) || 1
  }

  next() {
    let t = (this.s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  int(n) {
    return Math.floor(this.next() * n)
  }

  range(a, b) {
    return a + (b - a) * this.next()
  }

  pick(arr) {
    return arr[this.int(arr.length)]
  }

  chance(p) {
    return this.next() < p
  }
}

export function hashString(str) {
  let h = 2166136261
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mixSeed(seed, salt) {
  const n = typeof salt === 'number' ? salt >>> 0 : hashString(salt)
  let x = (seed >>> 0) ^ Math.imul(n, 0x9e3779b1)
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d)
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b)
  x ^= x >>> 16
  return x >>> 0 || 1
}

export function rngFrom(seed, ...salts) {
  let s = seed >>> 0 || 1
  for (const salt of salts) s = mixSeed(s, salt)
  return new RNG(s)
}
