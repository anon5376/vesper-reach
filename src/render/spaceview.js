import * as THREE from 'three'
import { BIOMES } from '../data/biomes.js'
import { RNG } from '../rng/rng.js'
import { generateSystem, layoutSystem } from '../worldgen/galaxy.js'
import { fillShip, setThrustVisual, shipSignature } from './shipmesh.js'
import { atmosphereMaterial, cloudTexture, planetTexture } from './look.js'

function nebulaTexture(seed) {
  const rng = new RNG(seed || 1)
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const g = canvas.getContext('2d')
  g.fillStyle = '#140c1c'
  g.fillRect(0, 0, 512, 256)
  const inks = ['rgba(232,93,76,', 'rgba(46,196,182,', 'rgba(155,93,229,', 'rgba(255,183,3,', 'rgba(255,214,165,']
  for (let i = 0; i < 28; i++) {
    const x = rng.next() * 512
    const y = rng.next() * 256
    const rad = 30 + rng.next() * 120
    const grd = g.createRadialGradient(x, y, 0, x, y, rad)
    grd.addColorStop(0, `${rng.pick(inks)}0.45)`)
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fill()
  }
  for (let i = 0; i < 700; i++) {
    g.fillStyle = rng.next() > 0.92 ? '#ffe6a8' : '#f7f3ea'
    g.globalAlpha = 0.4 + rng.next() * 0.6
    g.fillRect(rng.next() * 512, rng.next() * 256, rng.next() > 0.8 ? 2 : 1, 1)
  }
  g.globalAlpha = 1
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class SpaceView {
  constructor(scene) {
    this.scene = scene
    this.root = new THREE.Group()
    scene.add(this.root)
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 20),
      new THREE.MeshBasicMaterial({ map: nebulaTexture(0x51a7), side: THREE.BackSide, depthWrite: false, fog: false }),
    )
    scene.add(this.sky)
    this.bodies = new THREE.Group()
    this.root.add(this.bodies)
    this.ship = new THREE.Group()
    this.ship.scale.setScalar(1.7)
    this.root.add(this.ship)
    this.actors = new THREE.Group()
    this.root.add(this.actors)
    this.editor = new THREE.Group()
    this.editor.visible = false
    scene.add(this.editor)
    this.editorShip = new THREE.Group()
    this.editor.add(this.editorShip)
    this.cursor = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 1.05, 1.05),
      new THREE.MeshBasicMaterial({ color: 0xe85d4c, wireframe: true }),
    )
    this.editor.add(this.cursor)
    this.editor.add(new THREE.GridHelper(16, 16, 0xe85d4c, 0x1f6f68))
    this.station = buildStation()
    scene.add(this.station)
    this.demo = generateSystem(0x51a7e, 2)
    this.shown = -1
    this.shipSig = ''
    this.editorSig = ''
    this.orbit = 0
    this.pirateSig = ''
    this.bolts = poolSpheres(0xffb703, 36)
    for (const mesh of this.bolts) this.actors.add(mesh)
  }

  sync(state, galaxy, runtime, mode, camera, dt) {
    const editing = mode === 'SHIP_EDITOR'
    const docked = mode === 'STATION'
    const showSpace = mode === 'TITLE' || mode === 'MODE_SELECT' || mode === 'GALAXY_MAP' || (!state ? true : state.location !== 'surface')
    this.root.visible = showSpace && !editing && !docked
    this.sky.visible = (showSpace && !docked) || editing
    this.editor.visible = editing
    this.station.visible = docked
    this.orbit += dt
    if (docked) {
      camera.position.set(0, 2.15, 5.2)
      camera.lookAt(0, 1.5, -2)
      return
    }
    if (editing) {
      const parts = runtime?.editor?.parts || state?.ship?.parts || []
      const sig = shipSignature(parts)
      if (sig !== this.editorSig) {
        this.editorSig = sig
        fillShip(this.editorShip, parts)
      }
      setThrustVisual(this.editorShip, 0.2 + Math.sin(this.orbit * 3) * 0.05)
      const cursor = runtime?.editor?.cursor || { x: 0, y: 0, z: 0 }
      this.cursor.position.set(cursor.x, cursor.y, cursor.z)
      const radius = 8
      const theta = this.orbit * 0.25
      camera.position.set(Math.sin(theta) * radius, 3.4, Math.cos(theta) * radius)
      camera.lookAt(0, 0.4, 0)
      this.sky.position.copy(camera.position)
      return
    }
    if (!this.root.visible) return
    const system = state && galaxy ? galaxy.systems[state.systemIndex] : this.demo
    const time = state?.time || this.orbit
    if (this.shown !== system.index) {
      this.shown = system.index
      this.rebuild(system)
    }
    const layout = layoutSystem(system, time)
    this.layout = layout
    this.placeBodies(layout, time)
    if (state && mode !== 'TITLE' && mode !== 'MODE_SELECT') {
      const sig = shipSignature(state.ship.parts)
      if (sig !== this.shipSig) {
        this.shipSig = sig
        fillShip(this.ship, state.ship.parts)
      }
      const pos = state.space.position
      this.ship.position.set(pos.x, pos.y, pos.z)
      this.ship.rotation.order = 'YXZ'
      this.ship.rotation.set(state.space.pitch, state.space.yaw, state.space.roll)
      setThrustVisual(this.ship, state.space.throttle || 0)
      this.aimChase(camera, state)
      this.sky.position.copy(camera.position)
    } else {
      this.aimTitle(camera, layout)
      this.sky.position.copy(camera.position)
    }
    this.placePirates(runtime)
    this.placeBolts(runtime, state?.location === 'space')
  }

  rebuild(system) {
    for (const child of [...this.bodies.children]) {
      this.bodies.remove(child)
      child.traverse((obj) => {
        if (obj.geometry && obj.userData.dispose) obj.geometry.dispose()
      })
    }
    const star = new THREE.Mesh(
      new THREE.SphereGeometry(system.star.radius, 24, 16),
      new THREE.MeshBasicMaterial({ color: system.star.color }),
    )
    star.userData.kind = 'star'
    this.bodies.add(star)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowMap(system.star.color),
      color: system.star.color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }))
    glow.scale.set(system.star.radius * 5, system.star.radius * 5, 1)
    this.bodies.add(glow)
    this.planets = []
    for (const planet of system.planets) {
      const biome = BIOMES[planet.biome] || BIOMES.lush
      const group = new THREE.Group()
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(planet.radius, 36, 24),
        new THREE.MeshStandardMaterial({
          map: planetTexture(biome, Math.round((planet.orbit || 1) * 10)),
          roughness: 0.78,
          metalness: 0.05,
          emissive: biome.low,
          emissiveIntensity: 0.12,
        }),
      )
      body.userData.dispose = true
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(planet.radius * 1.04, 28, 18),
        new THREE.MeshStandardMaterial({
          map: cloudTexture((planet.orbit || 1) * 3),
          transparent: true,
          depthWrite: false,
          roughness: 1,
          opacity: 0.85,
        }),
      )
      clouds.userData.cloud = true
      const atmos = new THREE.Mesh(
        new THREE.SphereGeometry(planet.radius * 1.16, 28, 20),
        atmosphereMaterial(biome.sky),
      )
      group.add(body, clouds, atmos)
      const moons = planet.moons.map((moon) => {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(moon.radius, 12, 10),
          new THREE.MeshStandardMaterial({ color: moon.color, roughness: 0.7 }),
        )
        group.add(mesh)
        return mesh
      })
      this.bodies.add(group)
      this.planets.push({ group, moons })
    }
    const station = new THREE.Group()
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.18, 8, 20), new THREE.MeshStandardMaterial({ color: '#f3e6c8', emissive: '#e85d4c', emissiveIntensity: 0.4, roughness: 0.4 }))
    const hub = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 1.4), new THREE.MeshStandardMaterial({ color: '#1f8a84', roughness: 0.5 }))
    station.add(ring, hub)
    station.userData.kind = 'station'
    this.bodies.add(station)
    this.stationMesh = station
    const belt = buildBelt(system)
    this.bodies.add(belt)
    this.belt = belt
  }

  placeBodies(layout, time) {
    this.planets.forEach((entry, index) => {
      const planet = layout.planets[index]
      if (!planet?.position) return
      entry.group.position.set(planet.position.x, planet.position.y, planet.position.z)
      entry.group.rotation.y = time * 0.05
      const clouds = entry.group.children.find((child) => child.userData.cloud)
      if (clouds) clouds.rotation.y = time * 0.02
      entry.moons.forEach((moon, m) => {
        const src = planet.moons[m]
        if (!src?.position || !planet.position) return
        moon.position.set(src.position.x - planet.position.x, src.position.y - planet.position.y, src.position.z - planet.position.z)
      })
    })
    const st = layout.station.position
    this.stationMesh.position.set(st.x, st.y, st.z)
    this.stationMesh.rotation.z = time * 0.2
    if (this.belt) this.belt.rotation.y = time * 0.01
  }

  aimChase(camera, state) {
    const pos = state.space.position
    this._fwd = this._fwd || new THREE.Vector3()
    this._up = this._up || new THREE.Vector3()
    this._euler = this._euler || new THREE.Euler(0, 0, 0, 'YXZ')
    this._euler.set(state.space.pitch, state.space.yaw, state.space.roll, 'YXZ')
    const forward = this._fwd.set(0, 0, -1).applyEuler(this._euler)
    const up = this._up.set(0, 1, 0).applyEuler(this._euler)
    const speed = Math.hypot(state.space.velocity.x, state.space.velocity.y, state.space.velocity.z)
    const back = 13 + Math.min(7, speed * 0.08)
    const lift = 3.4 + Math.min(1.6, speed * 0.03)
    camera.position.set(
      pos.x - forward.x * back + up.x * lift,
      pos.y - forward.y * back + up.y * lift,
      pos.z - forward.z * back + up.z * lift,
    )
    const pushed = this.layout ? keepCameraOutside(camera, this.layout) : false
    const look = pushed ? 5 : 9
    camera.lookAt(pos.x + forward.x * look, pos.y + forward.y * look + 0.7, pos.z + forward.z * look)
  }

  aimTitle(camera, layout) {
    const planet = layout.planets[0]
    const ang = this.orbit * 0.08
    const dist = planet.radius + 28
    camera.position.set(
      planet.position.x + Math.cos(ang) * dist,
      planet.position.y + 10,
      planet.position.z + Math.sin(ang) * dist,
    )
    camera.lookAt(planet.position.x, planet.position.y, planet.position.z)
  }

  placePirates(runtime) {
    const pirates = runtime?.pirates || []
    const sig = pirates.map((pirate) => pirate.id).join(',')
    if (sig !== this.pirateSig) {
      this.pirateSig = sig
      for (const child of [...this.actors.children]) {
        if (child.userData.pirate) this.actors.remove(child)
      }
      for (const pirate of pirates) {
        const group = new THREE.Group()
        group.userData.pirate = pirate.id
        const hull = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 2.2), new THREE.MeshStandardMaterial({ color: '#c4492a', roughness: 0.45 }))
        const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.7), new THREE.MeshStandardMaterial({ color: '#f3e6c8' }))
        group.add(hull, wing)
        this.actors.add(group)
      }
    }
    for (const child of this.actors.children) {
      if (!child.userData.pirate) continue
      const pirate = pirates.find((entry) => entry.id === child.userData.pirate)
      if (!pirate) continue
      child.position.set(pirate.x, pirate.y, pirate.z)
      child.rotation.y = pirate.yaw
    }
  }

  placeBolts(runtime, active) {
    const bolts = active ? (runtime?.bolts || []) : []
    this.bolts.forEach((mesh, index) => {
      const bolt = bolts[index]
      mesh.visible = !!bolt
      if (!bolt) return
      mesh.position.set(bolt.x, bolt.y, bolt.z)
      const scale = bolt.kind === 'missile' ? 0.45 : 0.22
      mesh.scale.setScalar(scale)
    })
  }
}

function keepCameraOutside(camera, layout) {
  let pushed = false
  for (const planet of layout.planets || []) {
    if (!planet.position) continue
    const dx = camera.position.x - planet.position.x
    const dy = camera.position.y - planet.position.y
    const dz = camera.position.z - planet.position.z
    const dist = Math.hypot(dx, dy, dz) || 1
    const limit = planet.radius + 7
    if (dist < limit) {
      const k = limit / dist
      camera.position.set(
        planet.position.x + dx * k,
        planet.position.y + dy * k,
        planet.position.z + dz * k,
      )
      pushed = true
    }
  }
  const starRadius = (layout.star?.radius || 8) + 8
  const sd = Math.hypot(camera.position.x, camera.position.y, camera.position.z) || 1
  if (sd < starRadius) {
    camera.position.multiplyScalar(starRadius / sd)
    pushed = true
  }
  return pushed
}

function poolSpheres(color, count) {
  const geo = new THREE.SphereGeometry(1, 8, 6)
  const mat = new THREE.MeshBasicMaterial({ color })
  return Array.from({ length: count }, () => {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.visible = false
    return mesh
  })
}

function glowMap(color) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const g = canvas.getContext('2d')
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32)
  grd.addColorStop(0, color)
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(canvas)
  return tex
}

function buildBelt(system) {
  const count = Math.min(90, system.belt?.count || 60)
  const geo = new THREE.DodecahedronGeometry(0.55, 0)
  const mat = new THREE.MeshStandardMaterial({ color: '#8d6b4a', roughness: 0.9 })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  const rng = new RNG((system.seed || 1) ^ 99)
  const dummy = new THREE.Object3D()
  const radius = system.belt?.radius || 42
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rng.next()
    const rad = radius + rng.range(-3, 3)
    dummy.position.set(Math.cos(ang) * rad, rng.range(-1.2, 1.2), Math.sin(ang) * rad)
    dummy.rotation.set(rng.next(), rng.next(), rng.next())
    const s = rng.range(0.35, 1.1)
    dummy.scale.setScalar(s)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.frustumCulled = false
  return mesh
}

function buildStation() {
  const group = new THREE.Group()
  const floor = new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, 12), new THREE.MeshStandardMaterial({ color: '#2a2420', roughness: 0.8 }))
  floor.position.y = 0
  const wallMat = new THREE.MeshStandardMaterial({ color: '#143f45', roughness: 0.7 })
  const back = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 0.3), wallMat)
  back.position.set(0, 2.5, -6)
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 12), wallMat)
  left.position.set(-8, 2.5, 0)
  const right = left.clone()
  right.position.x = 8
  const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 1.2), new THREE.MeshStandardMaterial({ color: '#e6d3b0', roughness: 0.55 }))
  counter.position.set(0, 0.7, -2)
  const lamp = new THREE.PointLight(0xffb703, 8, 18)
  lamp.position.set(0, 3.4, -1)
  const pane = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.8, 0.08), new THREE.MeshBasicMaterial({ color: '#7ee0d6' }))
  pane.position.set(0, 2.7, -5.82)
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(16, 0.25, 12), new THREE.MeshStandardMaterial({ color: '#1c3338', roughness: 0.8 }))
  ceiling.position.y = 4.6
  const rug = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.05, 2.4), new THREE.MeshStandardMaterial({ color: '#e85d4c', roughness: 0.9 }))
  rug.position.set(0, 0.22, 1.2)
  const warm = new THREE.PointLight(0xffb703, 6, 14)
  warm.position.set(-3.2, 3.2, 1)
  const cool = new THREE.PointLight(0x2ec4b6, 5, 12)
  cool.position.set(3.4, 3.1, 0.4)
  group.add(floor, back, left, right, counter, lamp, pane, ceiling, rug, warm, cool)
  const goods = ['#e85d4c', '#2ec4b6', '#ffd166', '#9b5de5']
  goods.forEach((color, index) => {
    const jar = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 }))
    jar.position.set(-1.2 + index * 0.8, 1.45, -2)
    group.add(jar)
  })
  return group
}
