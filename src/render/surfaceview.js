import * as THREE from 'three'
import { BIOMES } from '../data/biomes.js'
import { BLOCKS } from '../data/blocks.js'
import { sunHeight } from '../base/power.js'
import { basesHere } from '../base/query.js'
import { CHUNK_SIZE, chunkOf, heightAt, isCave, seaOf } from '../worldgen/terrain.js'
import { chunkFeatures } from '../worldgen/features.js'
import { fillShip, shipSignature } from './shipmesh.js'

const SEG = { low: 4, medium: 6, high: 8 }

export class SurfaceView {
  constructor(scene) {
    this.group = new THREE.Group()
    scene.add(this.group)
    this.scene = scene
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.03 })
    this.chunks = new Map()
    this.pool = []
    this.water = new THREE.Mesh(
      new THREE.CircleGeometry(1, 36),
      new THREE.MeshStandardMaterial({ color: '#1b78c8', transparent: true, opacity: 0.55, roughness: 0.18, metalness: 0.05, depthWrite: false }),
    )
    this.water.rotation.x = -Math.PI / 2
    this.group.add(this.water)
    this.flora = instanced(new THREE.ConeGeometry(0.4, 1.8, 5), 420)
    this.rocks = instanced(new THREE.DodecahedronGeometry(0.42, 0), 320)
    this.group.add(this.flora, this.rocks)
    this.props = new THREE.Group()
    this.life = new THREE.Group()
    this.camp = new THREE.Group()
    this.ship = new THREE.Group()
    this.group.add(this.props, this.life, this.camp, this.ship)
    this.ghost = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.8, 1),
      new THREE.MeshStandardMaterial({ color: '#b6ffb0', transparent: true, opacity: 0.4, emissive: '#b6ffb0', emissiveIntensity: 0.2 }),
    )
    this.group.add(this.ghost)
    this.beam = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]),
      new THREE.LineBasicMaterial({ color: '#ffb703' }),
    )
    this.group.add(this.beam)
    this.sky = new THREE.Group()
    scene.add(this.sky)
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffe29a' }))
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 8), new THREE.MeshStandardMaterial({ color: '#f4ead7', emissive: '#d9e7ef', emissiveIntensity: 0.2 }))
    this.sibling = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), new THREE.MeshStandardMaterial({ color: '#c77dff', emissive: '#5ce1e6', emissiveIntensity: 0.15 }))
    this.sky.add(this.sun, this.moon, this.sibling)
    this.fog = new THREE.FogExp2('#e7b59a', 0.014)
    this.chunkSig = ''
    this.propSig = ''
    this.baseSig = ''
    this.shipSig = ''
    this.creatures = new Map()
    this.dummy = new THREE.Object3D()
    this.tint = new THREE.Color()
    this.ready = false
    this.daylight = 1
  }

  sync(state, runtime, settings, mode, camera) {
    const show = !!state && state.location === 'surface' && !['TITLE', 'MODE_SELECT', 'SHIP_EDITOR', 'STATION', 'GALAXY_MAP'].includes(mode)
    this.group.visible = show
    this.sky.visible = show
    if (!show || state.planetIndex == null) return
    const biome = BIOMES[state.biomeId] || BIOMES.lush
    const quality = settings.graphics || 'medium'
    const seg = SEG[quality] || 6
    const rd = Math.max(2, Math.min(6, settings.renderDistance || 3))
    const player = state.player.position
    const here = chunkOf(player.x, player.z)
    const noiseKey = `${state.seed}:${state.systemIndex}:${state.planetIndex}`
    if (this._noiseKey !== noiseKey) {
      this._noiseKey = noiseKey
      this.propSig = ''
      this.shipSig = ''
      for (const mesh of this.chunks.values()) {
        mesh.visible = false
        this.group.remove(mesh)
        this.pool.push(mesh)
      }
      this.chunks.clear()
    }
    const field = this._noise
    const wanted = []
    for (let x = here.cx - rd; x <= here.cx + rd; x++) {
      for (let z = here.cz - rd; z <= here.cz + rd; z++) {
        const dist = Math.max(Math.abs(x - here.cx), Math.abs(z - here.cz))
        wanted.push({ x, z, seg: dist >= rd - 1 ? Math.max(3, seg - 2) : seg })
      }
    }
    const keep = new Set(wanted.map((c) => `${c.x},${c.z},${c.seg}`))
    for (const [key, mesh] of this.chunks) {
      if (!keep.has(key)) {
        mesh.visible = false
        this.group.remove(mesh)
        this.pool.push(mesh)
        this.chunks.delete(key)
      }
    }
    for (const cell of wanted) {
      const key = `${cell.x},${cell.z},${cell.seg}`
      if (this.chunks.has(key)) continue
      const mesh = this.borrow(cell.seg)
      stampChunk(mesh, cell.x, cell.z, field, state.biomeId)
      this.group.add(mesh)
      this.chunks.set(key, mesh)
    }
    this.ready = this.chunks.size >= Math.min(wanted.length, 4)
    const sig = `${state.systemIndex}:${state.planetIndex}:${[...keep].sort().join('|')}`
    if (sig !== this.propSig && field) {
      this.propSig = sig
      this.scatter(state, wanted, field, biome)
    }
    this.water.position.set(player.x, seaOf(state.biomeId) + 0.05, player.z)
    this.water.scale.setScalar(CHUNK_SIZE * (rd + 1.4))
    this.water.material.color.set(biome.water)
    this.water.visible = seaOf(state.biomeId) > -12
    this.drawCamp(state, runtime)
    this.drawShip(state)
    this.drawLife(state, runtime, biome)
    this.drawGhost(runtime, mode)
    this.drawBeam(state, runtime)
    this.dressSky(state, biome, camera)
    const dir = lookOf(state.player)
    camera.position.set(player.x, player.y, player.z)
    camera.lookAt(player.x + dir.x, player.y + dir.y, player.z + dir.z)
    runtime.terrainReady = this.chunks.size >= wanted.length
  }

  bindNoise(noise) {
    this._noise = noise
  }

  borrow(seg) {
    const index = this.pool.findIndex((mesh) => mesh.userData.seg === seg)
    if (index >= 0) {
      const mesh = this.pool.splice(index, 1)[0]
      mesh.visible = true
      return mesh
    }
    const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, seg, seg)
    geometry.rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(geometry, this.mat)
    mesh.userData.seg = seg
    mesh.receiveShadow = false
    return mesh
  }

  scatter(state, cells, noise, biome) {
    const plants = []
    const rocks = []
    const props = []
    for (const cell of cells) {
      const features = chunkFeatures(state.seed, state.systemIndex, state.planetIndex, cell.x, cell.z, state.biomeId)
      let arch = false
      for (const feature of features) {
        if (state.harvested[feature.id]) continue
        const y = heightAt(noise, feature.x, feature.z, state.biomeId)
        if (feature.kind === 'plant') plants.push({ x: feature.x, y, z: feature.z, s: feature.scale || 1, c: biome.accent })
        else if (feature.kind === 'rock') rocks.push({ x: feature.x, y, z: feature.z, s: feature.scale || 1, c: biome.high })
        else props.push({ ...feature, y })
        if (!arch && isCave(noise, feature.x, feature.z)) arch = { x: feature.x, y, z: feature.z }
      }
      if (arch) props.push({ kind: 'arch', x: arch.x, y: arch.y, z: arch.z, id: `arch-${cell.x}-${cell.z}` })
    }
    paintInstances(this.flora, plants, this.dummy, (obj, item) => {
      obj.position.set(item.x, item.y + 0.7 * item.s, item.z)
      obj.scale.setScalar(item.s)
    })
    paintInstances(this.rocks, rocks, this.dummy, (obj, item) => {
      obj.position.set(item.x, item.y + 0.3, item.z)
      obj.scale.setScalar(item.s)
    })
    for (const child of [...this.props.children]) this.props.remove(child)
    for (const feature of props.slice(0, 24)) {
      const mesh = propMesh(feature, biome)
      mesh.position.set(feature.x, feature.y, feature.z)
      this.props.add(mesh)
    }
    for (const grave of state.graves) {
      if (grave.location !== 'surface' || grave.systemIndex !== state.systemIndex || grave.planetIndex !== state.planetIndex) continue
      const mark = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.2, 6), new THREE.MeshStandardMaterial({ color: '#e85d4c', emissive: '#e85d4c', emissiveIntensity: 0.5 }))
      mark.position.set(grave.x, grave.y, grave.z)
      this.props.add(mark)
    }
  }

  drawCamp(state, runtime) {
    const bases = basesHere(state)
    const sig = `${runtime.baseRev}|${runtime.build?.power}|${bases.map((base) => base.pieces.length).join(',')}|${bases.map((base) => base.powered).join(',')}`
    if (sig === this.baseSig) return
    this.baseSig = sig
    for (const child of [...this.camp.children]) this.camp.remove(child)
    for (const base of bases) {
      for (const piece of base.pieces) {
        const mesh = blockMesh(piece, base, !!runtime.build?.power)
        mesh.position.set(piece.x + 0.5, piece.y, piece.z + 0.5)
        mesh.rotation.y = (piece.rot || 0) * Math.PI / 2
        this.camp.add(mesh)
      }
    }
  }

  drawShip(state) {
    if (!this._noise) return
    const sig = shipSignature(state.ship.parts) + JSON.stringify(state.park)
    if (sig === this.shipSig) return
    this.shipSig = sig
    fillShip(this.ship, state.ship.parts)
    const ground = heightAt(this._noise, state.park.x, state.park.z, state.biomeId)
    this.ship.position.set(state.park.x, Math.max(ground, seaOf(state.biomeId)), state.park.z)
    this.ship.rotation.set(0, 0, 0)
  }

  drawLife(state, runtime, biome) {
    const live = new Set()
    for (const creature of runtime.creatures || []) {
      live.add(creature.id)
      let group = this.creatures.get(creature.id)
      if (!group) {
        const species = runtime.life?.species?.[creature.species]
        group = creatureMesh(species, biome)
        this.life.add(group)
        this.creatures.set(creature.id, group)
      }
      group.position.set(creature.x, (creature.y || 0) + 0.2, creature.z)
      group.rotation.y = creature.phase || 0
      const hurt = creature.hp < creature.maxHp
      group.scale.setScalar(hurt ? 0.92 : 1)
    }
    for (const [id, group] of this.creatures) {
      if (!live.has(id)) {
        this.life.remove(group)
        this.creatures.delete(id)
      }
    }
    const drones = runtime.drones || []
    if (!this.droneMeshes) this.droneMeshes = []
    drones.forEach((drone, index) => {
      let mesh = this.droneMeshes[index]
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.45, 0.8, 4),
          new THREE.MeshStandardMaterial({ color: '#d6ff4a', emissive: '#ddff00', emissiveIntensity: 0.6 }),
        )
        this.droneMeshes[index] = mesh
        this.life.add(mesh)
      }
      mesh.visible = true
      mesh.position.set(drone.x, drone.y, drone.z)
    })
    for (let index = drones.length; index < this.droneMeshes.length; index++) this.droneMeshes[index].visible = false
  }

  drawGhost(runtime, mode) {
    const ghost = runtime.ghost
    this.ghost.visible = mode === 'BASE_BUILD' && !!ghost
    if (!this.ghost.visible) return
    this.ghost.position.set(ghost.x + 0.5, ghost.y + 0.4, ghost.z + 0.5)
    this.ghost.material.color.set(ghost.valid ? '#b6ffb0' : '#ff6b6b')
    this.ghost.material.emissive.set(ghost.valid ? '#7dff9a' : '#ff4d4d')
  }

  drawBeam(state, runtime) {
    this.beam.visible = !!runtime.beam
    if (!runtime.beam) return
    const dir = lookOf(state.player)
    const pos = state.player.position
    const positions = this.beam.geometry.attributes.position
    positions.setXYZ(0, pos.x, pos.y, pos.z)
    positions.setXYZ(1, pos.x + dir.x * 5, pos.y + dir.y * 5, pos.z + dir.z * 5)
    positions.needsUpdate = true
    this.beam.geometry.computeBoundingSphere()
  }

  dressSky(state, biome, camera) {
    const dayLength = state.params.dayLength || 480
    const ang = (state.time / dayLength) * Math.PI * 2
    const lift = Math.sin(ang)
    this.daylight = Math.max(0, lift)
    this.sun.position.set(camera.position.x + Math.cos(ang) * 90, camera.position.y + lift * 60, camera.position.z + 16)
    this.moon.position.set(camera.position.x - Math.cos(ang) * 70, camera.position.y - lift * 40 + 20, camera.position.z - 24)
    this.sibling.position.set(camera.position.x + 40, camera.position.y + 28, camera.position.z - 80)
    this.sibling.material.color.set(biome.accent)
    const storm = state.weather && state.weather.kind !== 'clear'
    this.fog.color.set(storm ? biome.fog : biome.skyHorizon)
    this.fog.density = (storm ? 0.028 : 0.012) + (this.daylight < 0.05 ? 0.01 : 0)
    this._night = this._night || new THREE.Color('#141824')
    this.tint.copy(biome.sky).lerp(this._night, this.daylight < 0 ? 0.75 : (1 - this.daylight) * 0.55)
    if (storm) this.tint.lerp(new THREE.Color(biome.fog), 0.45)
  }
}

function instanced(geometry, count) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.04 })
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
  mesh.count = 0
  mesh.frustumCulled = false
  return mesh
}

function paintInstances(mesh, items, dummy, place) {
  const color = new THREE.Color()
  mesh.count = Math.min(mesh.instanceColor.count, items.length)
  for (let i = 0; i < mesh.count; i++) {
    place(dummy, items[i])
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    color.set(items[i].c)
    mesh.setColorAt(i, color)
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

function stampChunk(mesh, cx, cz, noise, biomeId) {
  if (!noise) return
  const biome = BIOMES[biomeId] || BIOMES.lush
  const pos = mesh.geometry.attributes.position
  let colors = mesh.geometry.getAttribute('color')
  if (!colors || colors.count !== pos.count) {
    colors = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3)
    mesh.geometry.setAttribute('color', colors)
  }
  const low = new THREE.Color(biome.low)
  const mid = new THREE.Color(biome.ground)
  const high = new THREE.Color(biome.high)
  const sand = new THREE.Color(biome.sand)
  const sea = seaOf(biomeId)
  const ox = (cx + 0.5) * CHUNK_SIZE
  const oz = (cz + 0.5) * CHUNK_SIZE
  const scratch = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox
    const z = pos.getZ(i) + oz
    const h = heightAt(noise, x, z, biomeId)
    pos.setY(i, h)
    const t = Math.max(0, Math.min(1, (h - sea) / Math.max(6, biome.amplitude)))
    if (h < sea + 0.4) scratch.copy(sand)
    else if (t > 0.55) scratch.copy(mid).lerp(high, t)
    else scratch.copy(low).lerp(mid, t / 0.55)
    colors.setXYZ(i, scratch.r, scratch.g, scratch.b)
  }
  pos.needsUpdate = true
  colors.needsUpdate = true
  mesh.geometry.computeVertexNormals()
  mesh.geometry.computeBoundingSphere()
  mesh.position.set(ox, 0, oz)
}

function propMesh(feature, biome) {
  if (feature.kind === 'arch') {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 1.2), new THREE.MeshStandardMaterial({ color: biome.high, roughness: 0.8 }))
    mesh.position.y = 2.2
    return mesh
  }
  if (feature.poi === 'deposit') {
    return new THREE.Mesh(new THREE.OctahedronGeometry(0.55), new THREE.MeshStandardMaterial({ color: biome.accent, emissive: biome.accent, emissiveIntensity: 0.55, roughness: 0.35 }))
  }
  if (feature.poi === 'crash') {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 1.1), new THREE.MeshStandardMaterial({ color: '#8d99ae' })))
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 0.5), new THREE.MeshStandardMaterial({ color: '#e85d4c' }))
    fin.position.set(0.4, 0.5, 0)
    group.add(fin)
    return group
  }
  if (feature.poi === 'ruin') {
    const group = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({ color: biome.sand, roughness: 0.85 })
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.8, 0.3), mat)
    left.position.set(-0.7, 0.9, 0)
    const right = left.clone()
    right.position.x = 0.7
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 0.4), mat)
    cap.position.y = 1.8
    group.add(left, right, cap)
    return group
  }
  const group = new THREE.Group()
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.4, 8), new THREE.MeshStandardMaterial({ color: '#6b705c' })))
  const hut = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.1), new THREE.MeshStandardMaterial({ color: '#cb997e' }))
  hut.position.y = 0.7
  group.add(hut)
  return group
}

function blockMesh(piece, base, overlay) {
  const def = BLOCKS[piece.blockId] || {}
  let color = '#d7c4a3'
  if (def.category === 'power') color = '#ffd166'
  if (def.category === 'function') color = '#e07a5f'
  if (def.category === 'light') color = '#fff1c9'
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.72 })
  if (overlay) {
    const hungry = (def.powerDraw || 0) > 0
    const giving = (def.powerProduce || 0) > 0 || def.solar || def.battery
    if (hungry) {
      mat.emissive = new THREE.Color(base.powered ? '#7dffb3' : '#ff5d5d')
      mat.emissiveIntensity = 0.45
    } else if (giving) {
      mat.emissive = new THREE.Color('#ffe08a')
      mat.emissiveIntensity = 0.35
    }
  }
  if (piece.blockId === 'lamp') mat.emissive = new THREE.Color('#fff1c9'), mat.emissiveIntensity = base.powered ? 0.8 : 0.05
  const tall = ['wall', 'door', 'window'].includes(piece.blockId)
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.96, tall ? 1 : 0.45, 0.96), mat)
  if (piece.blockId === 'ramp') mesh.scale.y = 0.5
  if (piece.blockId === 'roof') mesh.scale.set(1.05, 0.3, 1.05)
  return mesh
}

function creatureMesh(species, biome) {
  const group = new THREE.Group()
  const color = new THREE.Color(species?.colors?.[0] ?? 0.8, species?.colors?.[1] ?? 0.4, species?.colors?.[2] ?? 0.3)
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
  let body
  if (species?.body === 'disc') body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.28, 8), mat)
  else if (species?.body === 'spindle') body = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.2, 6), mat)
  else if (species?.body === 'slab') body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.6), mat)
  else body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 3, 6), mat)
  group.add(body)
  const headMat = new THREE.MeshStandardMaterial({ color: biome.accent, roughness: 0.45 })
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), headMat)
  head.position.set(0, 0.45, 0.35)
  group.add(head)
  if (species?.legs && species.legs !== 'none') {
    for (const side of [-0.22, 0.22]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), mat)
      leg.position.set(side, -0.35, 0)
      group.add(leg)
    }
  }
  if (species?.tail && species.tail !== 'none') {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.7), species.tail === 'lantern'
      ? new THREE.MeshStandardMaterial({ color: '#ffe08a', emissive: '#ffb703', emissiveIntensity: 0.8 })
      : mat)
    tail.position.set(0, 0.1, -0.6)
    group.add(tail)
  }
  return group
}

function lookOf(player) {
  const cp = Math.cos(player.pitch)
  return {
    x: Math.sin(player.yaw) * cp,
    y: Math.sin(player.pitch),
    z: Math.cos(player.yaw) * cp,
  }
}
