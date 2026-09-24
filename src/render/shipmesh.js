import * as THREE from 'three'

const geos = new Map()

function geo(key, build) {
  if (!geos.has(key)) geos.set(key, build())
  return geos.get(key)
}

const box = (x, y, z) => geo(`b${x}x${y}x${z}`, () => new THREE.BoxGeometry(x, y, z))
const cyl = (r, h, n = 8) => geo(`c${r}x${h}x${n}`, () => new THREE.CylinderGeometry(r, r * 0.86, h, n))
const sph = (r) => geo(`s${r}`, () => new THREE.SphereGeometry(r, 12, 8))

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
    add(box(0.92, 0.72, 1.05), paint(color))
    add(sph(0.34), paint('#f7fbff', { emissive: '#dff6ff', glow: 0.35, opacity: 0.88, rough: 0.15 }), 0, 0.28, -0.12)
  } else if (id === 'hull-slope' || id === 'hull-wedge') {
    add(box(0.96, 0.55, 1), paint(color), 0, -0.15, 0)
    add(box(0.96, 0.28, 0.7), paint(color), 0, 0.18, -0.12)
  } else if (id === 'hull-corner') {
    add(box(0.7, 0.7, 0.7), paint(color), -0.1, 0, -0.1)
  } else if (id === 'wing-panel') {
    add(box(1.5, 0.08, 0.72), paint(color))
  } else if (id === 'thruster-main' || id === 'thruster-maneuver') {
    const scale = id === 'thruster-main' ? 1 : 0.62
    const body = add(cyl(0.28 * scale, 0.9 * scale), paint('#2b2a33'), 0, 0, 0, Math.PI / 2)
    body.userData.thrust = true
    const flame = add(cyl(0.16 * scale, 0.45), paint('#ffb703', { emissive: '#ff6b3d', glow: 0.4 }), 0, 0, 0.55)
    flame.rotation.x = Math.PI / 2
    flame.userData.flame = true
    const spriteMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb080', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const sprite = new THREE.Sprite(spriteMat)
    sprite.position.z = 0.8
    sprite.scale.set(1.4 * scale, 1.4 * scale, 1)
    sprite.userData.flame = true
    group.add(sprite)
  } else if (id === 'fuel-tank') {
    add(cyl(0.38, 0.95, 10), paint(color))
  } else if (id === 'cargo-bay') {
    add(box(0.96, 0.7, 0.96), paint(color))
  } else if (id === 'shield-generator') {
    add(box(0.7, 0.7, 0.7), paint(color))
    add(sph(0.42), paint('#b9f3ff', { emissive: '#7ad7ff', glow: 0.45, opacity: 0.45 }))
  } else if (id === 'power-core') {
    add(box(0.72, 0.72, 0.72), paint('#3a342c'))
    add(sph(0.26), paint('#ffd166', { emissive: '#ffb703', glow: 0.9 }))
  } else if (id === 'laser-mount') {
    add(box(0.34, 0.22, 0.7), paint(color), 0, 0.2, -0.1)
  } else if (id === 'cannon-mount') {
    add(cyl(0.14, 0.9), paint(color), 0, 0.2, 0, Math.PI / 2)
  } else if (id === 'missile-rack') {
    add(box(0.7, 0.28, 0.7), paint(color))
  } else if (id === 'landing-gear') {
    add(box(0.16, 0.7, 0.16), paint(color), 0, -0.2, 0)
  } else if (id === 'running-light') {
    add(sph(0.16), paint('#fff1c9', { emissive: '#ffe08a', glow: 1.1 }))
  } else if (id === 'nose-cap') {
    add(box(0.7, 0.46, 0.7), paint(color), 0, 0, -0.1)
  } else if (id === 'antenna') {
    add(cyl(0.04, 1.1, 6), paint(color), 0, 0.4, 0)
  } else if (id === 'hyperdrive') {
    add(box(0.8, 0.55, 0.8), paint(color))
    add(sph(0.22), paint('#c9f7ff', { emissive: '#4cc9f0', glow: 0.8 }))
  } else {
    add(box(0.92, 0.92, 0.92), paint(color))
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
  group.userData.flames = flames
}

export function setThrustVisual(group, level) {
  const flames = group.userData.flames || []
  for (const flame of flames) {
    const on = Math.max(0, Math.min(1.4, level))
    flame.visible = on > 0.04
    if (flame.material?.emissiveIntensity != null && flame.userData.flame && !flame.material.isSpriteMaterial) {
      flame.material.emissiveIntensity = 0.25 + on * 1.4
    }
    if (flame.material?.isSpriteMaterial) flame.scale.setScalar(0.8 + on)
  }
}

export function shipSignature(parts) {
  if (!parts) return ''
  let sig = ''
  for (const part of parts) sig += `${part.uid}:${part.partId}:${part.x}:${part.y}:${part.z}:${part.rot}:${part.color}:${Math.round(part.hp ?? 0)}|`
  return sig
}
