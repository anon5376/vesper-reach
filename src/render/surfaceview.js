import * as THREE from 'three'
import { BIOMES } from '../data/biomes.js'
import { BLOCKS } from '../data/blocks.js'
import { sunHeight } from '../base/power.js'
import { basesHere } from '../base/query.js'
import { CHUNK_SIZE, chunkOf, heightAt, isCave, seaOf } from '../worldgen/terrain.js'
import { chunkFeatures } from '../worldgen/features.js'
import { fillShip, glowTexture, shipSignature } from './shipmesh.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { cloudTexture, createWaterMaterial, plantGeometry, skyShellMaterial } from './look.js'

const SEG = { low: 10, medium: 22, high: 32 }

export class SurfaceView {
  constructor(scene) {
    this.group = new THREE.Group()
    scene.add(this.group)
    this.scene = scene
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.04 })
    dressTerrain(this.mat)
    this.chunks = new Map()
    this.pool = []
    this.water = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      createWaterMaterial(),
    )
    this.water.rotation.x = -Math.PI / 2
    this.group.add(this.water)
    this.flora = instanced(plantGeometry(), 640)
    this.carpet = instanced(tuftGeometry(), 4800, THREE.DoubleSide, true)
    this.rocks = instanced(rockGeometry(), 720)
    this.group.add(this.carpet)
    this.group.add(this.flora, this.rocks)
    this.props = new THREE.Group()
    this.life = new THREE.Group()
    this.camp = new THREE.Group()
    this.ship = new THREE.Group()
    this.group.add(this.props, this.life, this.camp, this.ship)
    this.ghost = new THREE.Group()
    const ghostMat = new THREE.MeshStandardMaterial({ color: '#d8ffc4', transparent: true, opacity: 0.62, emissive: '#b6ff6a', emissiveIntensity: 0.8 })
    const ghostBox = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.55, 1.05), ghostMat)
    const ghostPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6),
      new THREE.MeshBasicMaterial({ color: '#e9ffb0', transparent: true, opacity: 0.9 }),
    )
    ghostPost.position.y = 1.35
    this.ghost.add(ghostBox, ghostPost)
    this.group.add(this.ghost)
    this.figure = buildSurveyor()
    this.group.add(this.figure)
    this.motes = new THREE.Group()
    const moteMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: '#fff4dd',
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    for (let i = 0; i < 28; i++) {
      const mote = new THREE.Sprite(moteMat)
      mote.scale.setScalar(0.12 + (i % 5) * 0.04)
      mote.userData.home = new THREE.Vector3((i % 7) - 3, (i % 4) * 0.45, ((i * 3) % 7) - 3)
      this.motes.add(mote)
    }
    this.group.add(this.motes)
    const beamGeo = new THREE.CylinderGeometry(0.16, 0.05, 1, 6)
    beamGeo.translate(0, 0.5, 0)
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: '#7ef0e4',
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }))
    const sheathGeo = new THREE.CylinderGeometry(0.28, 0.1, 1, 6)
    sheathGeo.translate(0, 0.5, 0)
    this.beamSheath = new THREE.Mesh(sheathGeo, new THREE.MeshBasicMaterial({
      color: '#14343a',
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }))
    this.impact = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(),
      color: '#9cf6ea',
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }))
    this.impact.scale.set(0.7, 0.7, 1)
    this.group.add(this.beam, this.beamSheath, this.impact)
    this._beamUp = new THREE.Vector3(0, 1, 0)
    this._beamDir = new THREE.Vector3()
    this.sky = new THREE.Group()
    scene.add(this.sky)
    this.skyShell = new THREE.Mesh(
      new THREE.SphereGeometry(480, 32, 20),
      skyShellMaterial('#9fd0ea', '#f4e7cf', '#d7c4a2'),
    )
    this.sky.add(this.skyShell)
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(4.2, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffe7b0', fog: false }))
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(),
      color: '#ffd7a1',
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }))
    this.sunGlow.scale.set(34, 34, 1)
    this.sky.add(this.sunGlow)
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 8), new THREE.MeshStandardMaterial({ color: '#f4ead7', emissive: '#d9e7ef', emissiveIntensity: 0.2 }))
    this.sibling = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), new THREE.MeshStandardMaterial({ color: '#c77dff', emissive: '#5ce1e6', emissiveIntensity: 0.15 }))
    this.sky.add(this.sun, this.moon, this.sibling)
    this.cloudBanks = new THREE.Group()
    for (let i = 0; i < 5; i++) {
      const bank = new THREE.Mesh(
        new THREE.PlaneGeometry(70 + i * 12, 18 + (i % 3) * 4),
        new THREE.MeshBasicMaterial({
          map: cloudTexture(i + 3),
          transparent: true,
          depthWrite: false,
          opacity: 0.42,
          side: THREE.DoubleSide,
          fog: false,
        }),
      )
      const ang = i * 1.2
      bank.position.set(Math.cos(ang) * 90, 28 + i * 6, Math.sin(ang) * 70 - 40)
      bank.lookAt(0, bank.position.y - 8, 0)
      this.cloudBanks.add(bank)
    }
    this.sky.add(this.cloudBanks)
    this.fog = new THREE.FogExp2('#e7b59a', 0.0048)
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
      this.scatter(state, wanted, field, biome, here)
    }
    const sea = seaOf(state.biomeId)
    this.water.position.set(player.x, sea + 0.08, player.z)
    this.water.scale.setScalar(1400)
    this.water.material.uniforms.uColor.value.set(biome.water)
    this.water.material.uniforms.uDeep.value.set(biome.low)
    this.water.material.uniforms.uTime.value = state.time
    this.water.visible = sea > -12
    this.drawCamp(state, runtime)
    this.drawShip(state)
    this.drawLife(state, runtime, biome)
    this.drawGhost(runtime, mode)
    this.drawBeam(state, runtime)
    this.placeWalker(state, camera)
    this.water.material.uniforms.uCam.value.copy(camera.position)
    this.dressSky(state, biome, camera)
    runtime.terrainReady = this.chunks.size >= wanted.length
  }

  placeWalker(state, camera) {
    const player = state.player
    const pos = player.position
    const dir = lookOf(player)
    const aboard = !!player.aboard
    this.figure.visible = !aboard
    if (!aboard) {
      const moving = Math.hypot(player.velocity.x, player.velocity.z) > 0.35
      const bob = moving ? Math.sin(state.time * 9) * 0.045 : 0
      this.figure.position.set(pos.x, pos.y - 1.65 + bob, pos.z)
      this.figure.rotation.y = player.yaw
      const scarf = this.figure.getObjectByName('scarf')
      if (scarf) scarf.rotation.x = moving ? Math.sin(state.time * 7) * 0.35 - 0.4 : -0.15
      this.motes.visible = true
      this.motes.position.set(pos.x, pos.y - 0.4, pos.z)
      this.motes.children.forEach((mote, index) => {
        const home = mote.userData.home
        const drift = state.time * 0.35 + index
        mote.position.set(home.x + Math.sin(drift) * 0.4, home.y + Math.cos(drift * 0.7) * 0.25, home.z + Math.cos(drift) * 0.4)
      })
    } else this.motes.visible = false
    const back = aboard ? 14 : 4.6
    const lift = aboard ? 3.6 : 1.15
    const shoulder = aboard ? 0.4 : 0.85
    const rx = Math.cos(player.yaw)
    const rz = -Math.sin(player.yaw)
    camera.position.set(
      pos.x - dir.x * back + rx * shoulder,
      pos.y - dir.y * back + lift,
      pos.z - dir.z * back + rz * shoulder,
    )
    if (this._noise && !aboard) {
      const floor = heightAt(this._noise, camera.position.x, camera.position.z, state.biomeId)
      const sea = seaOf(state.biomeId)
      const minY = Math.max(floor, sea > -12 ? sea : -999) + 0.7
      if (camera.position.y < minY) camera.position.y = minY
    }
    const aim = aboard ? 8 : 14
    camera.lookAt(pos.x + dir.x * aim, pos.y + dir.y * aim + (aboard ? 0.4 : 0), pos.z + dir.z * aim)
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

  scatter(state, cells, noise, biome, here) {
    const plants = []
    const rocks = []
    const props = []
    for (const cell of cells) {
      const features = chunkFeatures(state.seed, state.systemIndex, state.planetIndex, cell.x, cell.z, state.biomeId)
      let arch = false
      for (const feature of features) {
        if (state.harvested[feature.id]) continue
        const y = heightAt(noise, feature.x, feature.z, state.biomeId)
        if (feature.kind === 'plant') plants.push({ x: feature.x, y, z: feature.z, s: feature.scale || 1, c: (feature.plantIndex || 0) % 2 ? biome.accent : biome.high })
        else if (feature.kind === 'rock') rocks.push({ x: feature.x, y, z: feature.z, s: feature.scale || 1, c: biome.high })
        else props.push({ ...feature, y })
        if (!arch && isCave(noise, feature.x, feature.z)) arch = { x: feature.x, y, z: feature.z }
      }
      if (arch) props.push({ kind: 'arch', x: arch.x, y: arch.y, z: arch.z, id: `arch-${cell.x}-${cell.z}` })
    }
    const tufts = []
    const sea = seaOf(state.biomeId)
    const cover = Math.max(0.15, biome.flora || 0)
    const ordered = cells.slice().sort((a, b) => {
      const da = Math.max(Math.abs(a.x - here.cx), Math.abs(a.z - here.cz))
      const db = Math.max(Math.abs(b.x - here.cx), Math.abs(b.z - here.cz))
      return da - db
    })
    for (const cell of ordered) {
      if (tufts.length >= 4700 && rocks.length >= 680) break
      const dist = Math.max(Math.abs(cell.x - here.cx), Math.abs(cell.z - here.cz))
      const step = dist === 0 ? 1 : dist === 1 ? 2 : 5
      for (let i = 1; i < CHUNK_SIZE; i += step) {
        for (let j = 1; j < CHUNK_SIZE; j += step) {
          const x = cell.x * CHUNK_SIZE + i
          const z = cell.z * CHUNK_SIZE + j
          const n = noise.noise2(x * 0.11 + 3.1, z * 0.11 - 1.7) * 0.5 + 0.5
          if (dist > 1 && n < 0.38) continue
          const y = heightAt(noise, x, z, state.biomeId)
          if (y < sea + 0.55) continue
          if (n > 0.9 && rocks.length < 680 && dist < 3) rocks.push({ x, y, z, s: 0.7 + n, c: biome.low })
          else if (dist < 2 && cover > 0.2 && plants.length < 560 && n > 0.82) plants.push({ x, y, z, s: 1.1 + n * 0.6, c: biome.accent })
          else if (tufts.length < 4700 && (cover > 0.15 || n > 0.55)) {
            tufts.push({
              x, y: y + 0.02, z,
              s: dist === 0 ? 0.85 + n * 0.35 : 1 + n * 0.4,
              c: n > 0.58 ? biome.accent : biome.high,
              near: dist < 2,
            })
          }
        }
      }
    }
    if (typeof window !== 'undefined') window.__cover = { tufts: tufts.length, rocks: rocks.length, plants: plants.length }
    paintInstances(this.flora, plants, this.dummy, (obj, item) => {
      obj.position.set(item.x, item.y, item.z)
      obj.scale.set(item.s * 2.1, item.s * 2.6, item.s * 2.1)
      obj.rotation.y = item.x * 0.7
    })
    paintInstances(this.carpet, tufts, this.dummy, (obj, item) => {
      obj.position.set(item.x, item.y, item.z)
      const height = item.near ? 1.7 : 2.2
      obj.scale.set(item.s * 1.4, item.s * height, item.s * 1.4)
      obj.rotation.y = item.x * 1.7 + item.z
    })
    paintInstances(this.rocks, rocks, this.dummy, (obj, item) => {
      obj.position.set(item.x, item.y + 0.3, item.z)
      obj.scale.setScalar(item.s * 2.4)
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
    const shade = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 20),
      new THREE.MeshBasicMaterial({ color: '#12080c', transparent: true, opacity: 0.32, depthWrite: false }),
    )
    shade.rotation.x = -Math.PI / 2
    shade.position.y = -1.66
    this.ship.add(shade)
    const ground = heightAt(this._noise, state.park.x, state.park.z, state.biomeId)
    this.ship.position.set(state.park.x, Math.max(ground, seaOf(state.biomeId)) + 1.72, state.park.z)
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
      group.position.set(creature.x, (creature.y || 0) + 0.35, creature.z)
      group.rotation.y = creature.phase || 0
      const hurt = creature.hp < creature.maxHp
      group.scale.setScalar(hurt ? 1.2 : 1.45)
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
    this.ghost.position.set(ghost.x + 0.5, ghost.y + 0.28, ghost.z + 0.5)
    const box = this.ghost.children[0]
    const post = this.ghost.children[1]
    const color = ghost.valid ? '#d8ffc4' : '#ff8d8d'
    const glow = ghost.valid ? '#b6ff6a' : '#ff4d4d'
    box.material.color.set(color)
    box.material.emissive.set(glow)
    post.material.color.set(glow)
  }

  drawBeam(state, runtime) {
    this.beam.visible = !!runtime.beam
    this.beamSheath.visible = !!runtime.beam
    this.impact.visible = !!runtime.beam
    if (!runtime.beam) return
    const dir = lookOf(state.player)
    const pos = state.player.position
    const len = 7.2
    this.beam.scale.set(1, len, 1)
    this.beamSheath.scale.set(1, len, 1)
    const origin = { x: pos.x + dir.x * 0.4, y: pos.y - 0.35 + dir.y * 0.4, z: pos.z + dir.z * 0.4 }
    this.beam.position.set(origin.x, origin.y, origin.z)
    this.beamSheath.position.copy(this.beam.position)
    this._beamDir.set(dir.x, dir.y, dir.z).normalize()
    this.beam.quaternion.setFromUnitVectors(this._beamUp, this._beamDir)
    this.beamSheath.quaternion.copy(this.beam.quaternion)
    this.impact.position.set(origin.x + dir.x * len, origin.y + dir.y * len, origin.z + dir.z * len)
    this.impact.visible = true
    this.beamSheath.visible = true
  }

  dressSky(state, biome, camera) {
    const dayLength = state.params.dayLength || 480
    const ang = (state.time / dayLength) * Math.PI * 2
    const lift = Math.sin(ang)
    this.daylight = Math.max(0, lift)
    this.skyShell.position.copy(camera.position)
    this.cloudBanks.position.copy(camera.position)
    const top = this.daylight < 0.18 ? '#1a1030' : biome.sky
    const horizon = stormish(state) ? biome.fog : biome.skyHorizon
    const belly = this.daylight < 0.18 ? '#120c18' : biome.fog
    const skyMat = this.skyShell.material
    if (skyMat.uniforms) {
      skyMat.uniforms.uTop.value.set(top)
      skyMat.uniforms.uHorizon.value.set(horizon)
      skyMat.uniforms.uBelly.value.set(belly)
    }
    this.sun.position.set(camera.position.x + Math.cos(ang) * 140, camera.position.y + lift * 90, camera.position.z + 20)
    if (skyMat.uniforms) {
      this._sunDir = this._sunDir || new THREE.Vector3()
      this._sunDir.copy(this.sun.position).sub(camera.position).normalize()
      skyMat.uniforms.uSun.value.copy(this._sunDir)
    }
    this.sunGlow.position.copy(this.sun.position)
    this.sunGlow.scale.setScalar(18 + this.daylight * 26)
    this.sun.visible = this.daylight > 0.02
    this.moon.position.set(camera.position.x - Math.cos(ang) * 110, camera.position.y - lift * 50 + 30, camera.position.z - 36)
    this.sibling.position.set(camera.position.x + 70, camera.position.y + 36, camera.position.z - 120)
    this.sibling.material.color.set(biome.accent)
    const storm = stormish(state)
    this.fog.color.set(storm ? biome.fog : biome.skyHorizon)
    this.fog.density = (storm ? 0.008 : 0.00072) + (this.daylight < 0.05 ? 0.0024 : 0)
    this._night = this._night || new THREE.Color('#141824')
    this.tint.copy(biome.sky).lerp(this._night, this.daylight < 0 ? 0.75 : (1 - this.daylight) * 0.55)
    if (storm) this.tint.lerp(new THREE.Color(biome.fog), 0.45)
  }
}

function stormish(state) {
  return !!(state.weather && state.weather.kind !== 'clear')
}

function tuftGeometry() {
  const planes = [0, 1, 2].map((i) => {
    const geo = new THREE.PlaneGeometry(0.85, 1.35)
    geo.translate(0, 0.68, 0)
    geo.rotateY((i * Math.PI) / 3)
    return geo
  })
  const merged = mergeGeometries(planes)
  for (const geo of planes) geo.dispose()
  const colors = new Float32Array(merged.attributes.position.count * 3)
  colors.fill(1)
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return merged
}

function instanced(geometry, count, side = THREE.FrontSide, basic = false) {
  const material = basic
    ? new THREE.MeshBasicMaterial({ vertexColors: true, side })
    : new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.06, vertexColors: true, side })
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
  const foam = new THREE.Color('#f4efe4')
  const deep = new THREE.Color(biome.water)
  const accent = new THREE.Color(biome.accent)
  const sea = seaOf(biomeId)
  const ox = (cx + 0.5) * CHUNK_SIZE
  const oz = (cz + 0.5) * CHUNK_SIZE
  const scratch = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox
    const z = pos.getZ(i) + oz
    const h = heightAt(noise, x, z, biomeId)
    pos.setY(i, h)
    const blot = noise ? noise.noise2(x * 0.045, z * 0.045) : 0
    const mineral = noise ? noise.noise2(x * 0.11 + 8, z * 0.11) : 0
    if (h < sea - 1.1) scratch.copy(deep)
    else if (h < sea + 0.35) scratch.copy(sand).lerp(foam, 0.35)
    else if (h < sea + 1.1) scratch.copy(sand).lerp(low, (h - sea - 0.35) / 0.75)
    else if (blot > 0.12) scratch.copy(mid).lerp(high, 0.35 + blot * 0.4)
    else if (blot < -0.18) scratch.copy(low)
    else scratch.copy(low).lerp(mid, 0.55)
    if (mineral > 0.35 && h > sea + 2.2) scratch.lerp(accent, 0.45)
    if (h > sea + biome.amplitude * 0.55) scratch.lerp(high, 0.35)
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
    const group = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({ color: biome.accent, emissive: biome.accent, emissiveIntensity: 0.75, roughness: 0.28 })
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 0), mat)
    core.position.y = 1.15
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), mat)
    shard.position.set(0.85, 0.5, 0.15)
    shard.rotation.z = 0.7
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(),
      color: biome.accent,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }))
    glow.scale.set(3.6, 3.6, 1)
    glow.position.y = 1.2
    group.add(core, shard, glow)
    return group
  }
  if (feature.poi === 'crash') {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.55, 1.5), new THREE.MeshStandardMaterial({ color: '#8d99ae', roughness: 0.55 })))
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.3, 0.7), new THREE.MeshStandardMaterial({ color: '#e85d4c', emissive: '#e85d4c', emissiveIntensity: 0.25 }))
    fin.position.set(0.7, 0.7, 0)
    const scar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.8), new THREE.MeshStandardMaterial({ color: '#24170f' }))
    scar.position.set(-0.6, 0.35, 0.2)
    group.add(fin, scar)
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
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 6, 4),
    new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: '#ffe08a', emissiveIntensity: 0.8 }),
  )
  eye.position.set(0.08, 0.5, 0.5)
  const eye2 = eye.clone()
  eye2.position.x = -0.08
  group.add(eye, eye2)
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

function rockGeometry() {
  const geo = new THREE.IcosahedronGeometry(0.62, 1)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const n = Math.sin(x * 8.2 + z * 3.1) * Math.cos(y * 6.4 + x) 
    const s = 0.82 + n * 0.28
    pos.setXYZ(i, x * s, y * s * 0.72, z * s)
  }
  geo.computeVertexNormals()
  return geo
}

function dressTerrain(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;\nvarying vec3 vWn;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWn = normalize(mat3(modelMatrix) * objectNormal);`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWp;
varying vec3 vWn;
float vhash(vec2 p){return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);}
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = vhash(i);
  float b = vhash(i + vec2(1.0, 0.0));
  float c = vhash(i + vec2(0.0, 1.0));
  float d = vhash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
float hx = vnoise(vWp.xz * 2.8);
float hy = vnoise(vWp.xz * 2.8 + vec2(0.35, 0.0));
float hz = vnoise(vWp.xz * 2.8 + vec2(0.0, 0.35));
normal = normalize(normal + vec3(hx - hy, 0.0, hx - hz) * 1.35);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float grain = vnoise(vWp.xz * 1.7);
float fine = vnoise(vWp.xz * 8.0);
float slope = clamp(vWn.y, 0.0, 1.0);
vec3 zone = diffuseColor.rgb;
vec3 rock = vec3(0.34, 0.3, 0.26);
zone = mix(rock, zone, smoothstep(0.12, 0.48, slope));
zone *= 0.86 + grain * 0.22 + fine * 0.06;
diffuseColor.rgb = zone;`)
  }
}

function buildSurveyor() {
  const group = new THREE.Group()
  const suit = new THREE.MeshStandardMaterial({ color: '#f4ead4', roughness: 0.48, metalness: 0.08 })
  const cloth = new THREE.MeshStandardMaterial({ color: '#176e6a', roughness: 0.5, metalness: 0.12 })
  const dark = new THREE.MeshStandardMaterial({ color: '#24170f', roughness: 0.6 })
  const lampMat = new THREE.MeshStandardMaterial({ color: '#ffe08a', emissive: '#ffb703', emissiveIntensity: 1.2 })
  const visorMat = new THREE.MeshStandardMaterial({ color: '#062428', emissive: '#5ce1e6', emissiveIntensity: 0.85, roughness: 0.08, metalness: 0.4 })
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.42, 4, 10), suit)
  torso.position.y = 1.02
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.12), cloth)
  chest.position.set(0, 1.08, 0.2)
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), cloth)
  helm.position.y = 1.58
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.08), visorMat)
  visor.position.set(0, 1.58, 0.2)
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.16), cloth)
  pack.position.set(0, 1.08, -0.26)
  const tankGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.36, 8)
  const tankL = new THREE.Mesh(tankGeo, dark)
  tankL.position.set(-0.1, 1.12, -0.34)
  const tankR = new THREE.Mesh(tankGeo, dark)
  tankR.position.set(0.1, 1.12, -0.34)
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lampMat)
  lamp.position.set(0.2, 1.22, 0.26)
  const legGeo = new THREE.CapsuleGeometry(0.09, 0.34, 3, 6)
  const legL = new THREE.Mesh(legGeo, suit)
  legL.position.set(-0.12, 0.4, 0)
  const legR = new THREE.Mesh(legGeo, suit)
  legR.position.set(0.12, 0.4, 0)
  const bootGeo = new THREE.BoxGeometry(0.14, 0.08, 0.22)
  const bootL = new THREE.Mesh(bootGeo, dark)
  bootL.position.set(-0.12, 0.12, 0.04)
  const bootR = new THREE.Mesh(bootGeo, dark)
  bootR.position.set(0.12, 0.12, 0.04)
  const scarf = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.62, 0.04),
    new THREE.MeshStandardMaterial({ color: '#e85d4c', roughness: 0.5, side: THREE.DoubleSide }),
  )
  scarf.name = 'scarf'
  scarf.geometry.translate(0, -0.28, 0)
  scarf.position.set(-0.22, 1.42, -0.08)
  scarf.rotation.z = 0.55
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.035, 6, 14), dark)
  brim.rotation.x = Math.PI / 2
  brim.position.y = 1.4
  const armGeo = new THREE.CapsuleGeometry(0.07, 0.46, 3, 6)
  const armL = new THREE.Mesh(armGeo, suit)
  armL.position.set(-0.4, 0.92, 0.02)
  armL.rotation.z = 0.18
  const armR = new THREE.Mesh(armGeo, suit)
  armR.position.set(0.4, 0.92, 0.02)
  armR.rotation.z = -0.18
  const shade = new THREE.Mesh(
    new THREE.CircleGeometry(0.48, 14),
    new THREE.MeshBasicMaterial({ color: '#12080c', transparent: true, opacity: 0.45, depthWrite: false }),
  )
  shade.rotation.x = -Math.PI / 2
  shade.position.y = 0.03
  const pauldronGeo = new THREE.BoxGeometry(0.22, 0.12, 0.2)
  const pauldronL = new THREE.Mesh(pauldronGeo, cloth)
  pauldronL.position.set(-0.32, 1.28, 0.02)
  const pauldronR = pauldronL.clone()
  pauldronR.position.x = 0.32
  group.add(torso, chest, helm, visor, brim, pack, tankL, tankR, lamp, legL, legR, bootL, bootR, scarf, shade, pauldronL, pauldronR, armL, armR)
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
