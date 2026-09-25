import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const geos = new Map()

function geo(key, build) {
  if (!geos.has(key)) geos.set(key, build())
  return geos.get(key)
}

const box = (x, y, z) => geo(`b${x}x${y}x${z}`, () => new THREE.BoxGeometry(x, y, z))
const cyl = (r, h, n = 8) => geo(`c${r}x${h}x${n}`, () => new THREE.CylinderGeometry(r, r * 0.86, h, n))
const sph = (r) => geo(`s${r}`, () => new THREE.SphereGeometry(r, 12, 8))
const rb = (w, h, d, r = 0.08) => geo(`rb${w}x${h}x${d}x${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w * 0.45, h * 0.45, d * 0.45)))

const mats = new Map()

export function paint(color, extras = {}) {
  const key = `${color}|${extras.emissive || ''}|${extras.opacity || 1}|${extras.rough || ''}`
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: extras.rough ?? 0.62,
      metalness: extras.metal ?? 0.16,
      emissive: new THREE.Color(extras.emissive || '#000000'),
      emissiveIntensity: extras.emissive ? (extras.glow ?? 0.7) : 0,
      transparent: (extras.opacity ?? 1) < 1,
      opacity: extras.opacity ?? 1,
    }))
  }
  return mats.get(key)
}

let glowTex = null
export function glowTexture() {
  if (glowTex || typeof document === 'undefined') return glowTex
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const g = canvas.getContext('2d')
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,236,196,0.95)')
  grd.addColorStop(0.35, 'rgba(232,93,76,0.45)')
  grd.addColorStop(1, 'rgba(232,93,76,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  glowTex = new THREE.CanvasTexture(canvas)
  return glowTex
}

function meshFor(part) {
  const color = part.color || '#d7efe8'
  const id = part.partId
  const group = new THREE.Group()
  const add = (geometry, material, x = 0, y = 0, z = 0, rx = 0) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.rotation.x = rx
    mesh.castShadow = false
    group.add(mesh)
    return mesh
  }
  if (id === 'cockpit-lantern') {
    add(rb(0.92, 0.46, 1.28, 0.12), paint(color, { rough: 0.42, metal: 0.22 }))
    add(box(0.96, 0.05, 0.16), paint('#e85d4c'), 0, 0.02, 0.42)
    add(sph(0.34), paint('#e7fff8', { emissive: '#9cf0e4', glow: 0.7, opacity: 0.55, rough: 0.05, metal: 0.1 }), 0, 0.34, -0.08)
    add(box(0.62, 0.06, 0.48), paint('#14343a', { rough: 0.2, metal: 0.4 }), 0, 0.42, -0.02)
    add(box(0.06, 0.22, 0.7), paint('#24170f'), -0.34, 0.32, -0.02)
    add(box(0.06, 0.22, 0.7), paint('#24170f'), 0.34, 0.32, -0.02)
  } else if (id === 'hull-slope' || id === 'hull-wedge') {
    add(rb(0.9, 0.4, 1.15, 0.08), paint(color, { rough: 0.48 }), 0, -0.12, 0)
    add(rb(0.7, 0.22, 0.7, 0.06), paint(color), 0, 0.12, -0.12)
    add(box(0.92, 0.045, 0.14), paint('#f3e6c8'), 0, 0.08, 0.28)
  } else if (id === 'hull-corner') {
    add(rb(0.7, 0.55, 0.7, 0.08), paint(color), -0.08, 0, -0.08)
    add(box(0.22, 0.08, 0.62), paint('#f3e6c8'), 0.16, 0.22, -0.08)
  } else if (id === 'wing-panel') {
    const wingMat = new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.18, side: THREE.DoubleSide })
    add(wingGeometry(), wingMat, 0, 0.02, 0.05)
    add(box(0.28, 0.05, 0.22), paint('#e85d4c', { emissive: '#ff6b4a', glow: 0.35 }), 1.28, 0.04, -0.02)
    add(sph(0.07), paint('#fff1c9', { emissive: '#ffe08a', glow: 1.3 }), 1.42, 0.06, 0.16)
    if (part.x < 0) group.scale.x = -1
  } else if (id === 'thruster-main' || id === 'thruster-maneuver') {
    const scale = id === 'thruster-main' ? 1 : 0.62
    add(rb(0.72 * scale, 0.72 * scale, 0.28 * scale, 0.06), paint(color, { rough: 0.45, metal: 0.25 }), 0, 0, -0.28)
    const body = add(cyl(0.28 * scale, 0.7 * scale, 12), paint('#2a211c'), 0, 0, 0.18, Math.PI / 2)
    body.userData.thrust = true
    add(geo(`bell${scale}`, () => new THREE.ConeGeometry(0.34 * scale, 0.42 * scale, 12, 1, true)), paint('#1a120e', { rough: 0.4 }), 0, 0, 0.55, -Math.PI / 2)
    add(geo(`ring${scale}`, () => new THREE.TorusGeometry(0.3 * scale, 0.045, 8, 16)), paint('#e85d4c', { emissive: '#ff6b4a', glow: 0.45 }), 0, 0, 0.36)
    const flame = add(cyl(0.16 * scale, 0.55), paint('#ffb703', { emissive: '#ff6b3d', glow: 0.4 }), 0, 0, 0.72)
    flame.rotation.x = Math.PI / 2
    flame.userData.flame = true
    const spriteMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb080', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const sprite = new THREE.Sprite(spriteMat)
    sprite.position.z = 0.95
    sprite.scale.set(1.8 * scale, 1.8 * scale, 1)
    sprite.userData.flame = true
    group.add(sprite)
  } else if (id === 'fuel-tank') {
    add(cyl(0.32, 0.92, 14), paint(color, { metal: 0.28, rough: 0.4 }))
    add(box(0.7, 0.08, 0.16), paint('#24170f'), 0, -0.42, 0)
    add(box(0.12, 0.16, 0.5), paint('#24170f'), -0.28, -0.22, 0)
    add(box(0.12, 0.16, 0.5), paint('#24170f'), 0.28, -0.22, 0)
    add(cyl(0.36, 0.06, 14), paint('#e85d4c'), 0, 0.1, 0)
  } else if (id === 'cargo-bay') {
    add(rb(0.96, 0.58, 1.05, 0.08), paint(color))
    add(box(0.5, 0.06, 0.7), paint('#24170f'), 0, 0.3, 0)
  } else if (id === 'shield-generator') {
    add(rb(0.58, 0.42, 0.58, 0.08), paint(color, { metal: 0.3 }))
    add(sph(0.46), paint('#d9f6ff', { emissive: '#7ad7ff', glow: 0.8, opacity: 0.32, rough: 0.08 }))
  } else if (id === 'power-core') {
    add(rb(0.66, 0.66, 0.72, 0.08), paint('#3a2a22', { rough: 0.4, metal: 0.3 }))
    add(box(0.72, 0.06, 0.16), paint('#f3e6c8'), 0, 0.28, 0.2)
    add(sph(0.26), paint('#ffe08a', { emissive: '#ffb703', glow: 1.5 }))
  } else if (id === 'laser-mount') {
    add(rb(0.26, 0.14, 0.95, 0.04), paint(color), 0, 0.28, -0.2)
    add(sph(0.1), paint('#ff6b6b', { emissive: '#ff4d4d', glow: 1.4 }), 0, 0.28, -0.68)
  } else if (id === 'cannon-mount') {
    add(cyl(0.14, 1.05, 10), paint(color, { metal: 0.4, rough: 0.35 }), 0, 0.28, 0, Math.PI / 2)
    add(cyl(0.2, 0.1, 10), paint('#24170f'), 0, 0.28, -0.46, Math.PI / 2)
  } else if (id === 'missile-rack') {
    add(rb(0.78, 0.14, 0.5, 0.04), paint(color))
    add(cyl(0.07, 0.78, 8), paint('#e85d4c'), -0.2, 0.16, 0, Math.PI / 2)
    add(cyl(0.07, 0.78, 8), paint('#e85d4c'), 0.2, 0.16, 0, Math.PI / 2)
  } else if (id === 'landing-gear') {
    add(box(0.08, 0.7, 0.08), paint(color), -0.28, -0.22, 0.05)
    add(box(0.08, 0.7, 0.08), paint(color), 0.28, -0.22, 0.05)
    add(box(0.86, 0.07, 0.18), paint('#24170f'), 0, -0.58, 0.05)
  } else if (id === 'running-light') {
    add(sph(0.12), paint('#fff6d8', { emissive: '#ffe08a', glow: 1.8 }))
    add(cyl(0.04, 0.55, 6), paint('#24170f'), 0, 0.28, 0)
  } else if (id === 'nose-cap') {
    add(geo('nose', () => new THREE.ConeGeometry(0.38, 1.15, 12)), paint(color, { rough: 0.4, metal: 0.2 }), 0, 0, -0.42, Math.PI / 2)
    add(box(0.55, 0.05, 0.16), paint('#e85d4c'), 0, 0.1, 0.05)
  } else if (id === 'antenna') {
    add(cyl(0.03, 1.35, 6), paint(color), 0, 0.62, 0)
    add(sph(0.08), paint('#ff6b6b', { emissive: '#ff4d4d', glow: 1.2 }), 0, 1.28, 0)
  } else if (id === 'hyperdrive') {
    add(rb(0.72, 0.4, 0.86, 0.08), paint(color, { metal: 0.28 }))
    add(geo('ring-drive', () => new THREE.TorusGeometry(0.38, 0.045, 8, 18)), paint('#d7fff8', { emissive: '#4cc9f0', glow: 1.3 }), 0, 0.28, 0)
    add(sph(0.18), paint('#e7fbff', { emissive: '#7ae7ff', glow: 1.4 }))
  } else {
    add(rb(0.98, 0.52, 1.35, 0.1), paint(color, { rough: 0.45, metal: 0.2 }))
    add(box(1.0, 0.045, 0.12), paint('#e85d4c'), 0, 0.16, 0.15)
    add(box(0.86, 0.04, 0.08), paint('#f3e6c8'), 0, 0.2, -0.28)
  }
  const broken = part.hp != null && part.hp <= 0
  if (broken) group.scale.set(0.2, 0.2, 0.2)
  return group
}

export function fillShip(group, parts) {
  for (const child of [...group.children]) {
    group.remove(child)
    child.traverse((obj) => {
      if (obj.material && obj.material.isSpriteMaterial) obj.material.dispose()
    })
  }
  const flames = []
  for (const part of parts) {
    const piece = meshFor(part)
    piece.position.set(part.x, part.y, part.z)
    piece.rotation.order = 'YXZ'
    piece.rotation.y = (part.rot || 0) * (Math.PI / 2)
    group.add(piece)
    piece.traverse((obj) => { if (obj.userData?.flame) flames.push(obj) })
  }
  stitchHull(group, parts)
  fairHull(group, parts)
  group.userData.flames = flames
}

function fairHull(group, parts) {
  if (!parts.length) return
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const part of parts) {
    minX = Math.min(minX, part.x)
    maxX = Math.max(maxX, part.x)
    minY = Math.min(minY, part.y)
    maxY = Math.max(maxY, part.y)
    minZ = Math.min(minZ, part.z)
    maxZ = Math.max(maxZ, part.z)
  }
  const spanX = maxX - minX
  const spanZ = maxZ - minZ
  const alongZ = spanZ >= spanX
  const length = Math.max(1.6, (alongZ ? spanZ : spanX) + 1.15)
  const width = Math.max(0.72, Math.min(alongZ ? spanX : spanZ, 2.4) * 0.42 + 0.55)
  const color = parts.find((part) => String(part.partId).includes('hull'))?.color || parts[0].color || '#f3ead8'
  const body = new THREE.Mesh(
    geo(`fair-${length.toFixed(2)}-${width.toFixed(2)}`, () => new THREE.CapsuleGeometry(width * 0.5, Math.max(0.3, length - width), 5, 10)),
    new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.34 }),
  )
  body.rotation.x = Math.PI / 2
  if (!alongZ) body.rotation.z = Math.PI / 2
  body.position.set((minX + maxX) / 2, (minY + maxY) / 2 - 0.08, (minZ + maxZ) / 2)
  body.scale.y = alongZ ? 1 : Math.max(1, spanZ / Math.max(0.4, width))
  group.add(body)
  const belly = new THREE.Mesh(
    geo('fair-belly', () => new THREE.SphereGeometry(0.55, 12, 8)),
    new THREE.MeshStandardMaterial({ color, roughness: 0.46, metalness: 0.22 }),
  )
  belly.scale.set(Math.max(1.1, (alongZ ? spanX : spanZ) * 0.28 + 0.8), 0.42, length * 0.42)
  belly.position.copy(body.position)
  belly.position.y -= 0.22
  group.add(belly)
}

function stitchHull(group, parts) {
  const keys = new Set(parts.map((part) => `${part.x},${part.y},${part.z}`))
  const box = geo('hull-stitch', () => new THREE.BoxGeometry(0.55, 0.28, 0.55))
  for (const part of parts) {
    for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      if (!keys.has(`${part.x + dx},${part.y + dy},${part.z + dz}`)) continue
      const link = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: part.color || '#d9d3c6', roughness: 0.42, metalness: 0.32 }))
      link.position.set(part.x + dx * 0.5, part.y + dy * 0.5, part.z + dz * 0.5)
      if (dx) link.scale.set(2.05, 0.95, 1.15)
      if (dy) link.scale.set(0.9, 2.05, 1.05)
      if (dz) link.scale.set(1.05, 0.9, 2.05)
      group.add(link)
    }
  }
}

export function setThrustVisual(group, level) {
  const flames = group.userData.flames || []
  for (const flame of flames) {
    const on = Math.max(0, Math.min(1.4, level))
    flame.visible = on > 0.04
    if (flame.material?.emissiveIntensity != null && flame.userData.flame && !flame.material.isSpriteMaterial) {
      flame.material.emissiveIntensity = 0.25 + on * 1.4
    }
    if (flame.material?.isSpriteMaterial) flame.scale.setScalar(1.8 + on * 2.2)
  }
}

function wingGeometry() {
  return geo('wing-kite', () => {
    const shape = new THREE.Shape()
    shape.moveTo(-1.28, 0.5)
    shape.lineTo(1.48, 0.06)
    shape.lineTo(1.38, -0.2)
    shape.lineTo(-1.02, -0.4)
    shape.closePath()
    const wing = new THREE.ExtrudeGeometry(shape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.02,
      bevelSegments: 1,
    })
    wing.translate(0, 0, -0.08)
    wing.rotateX(Math.PI / 2)
    return wing
  })
}

export function shipSignature(parts) {
  if (!parts) return ''
  let sig = ''
  for (const part of parts) sig += `${part.uid}:${part.partId}:${part.x}:${part.y}:${part.z}:${part.rot}:${part.color}:${Math.round(part.hp ?? 0)}|`
  return sig
}
