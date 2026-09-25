import * as THREE from 'three'
import { createBus } from './core/events.js'
import { createMachine } from './core/statemachine.js'
import { createSession } from './core/session.js'
import { createInput } from './input/input.js'
import { DEFAULT_SETTINGS } from './data/bindings.js'
import { loadSettings, writeSettings } from './save/save.js'
import { createAudio } from './audio/audio.js'
import { createUI } from './ui/ui.js'
import { SpaceView } from './render/spaceview.js'
import { SurfaceView } from './render/surfaceview.js'
import { noiseFor } from './worldgen/terrain.js'
import { countItem } from './inventory/inventory.js'
import { createPresenter } from './render/grade.js'

const settings = loadSettings(DEFAULT_SETTINGS)
const bus = createBus()
const machine = createMachine('TITLE')
const input = createInput(() => settings)
const audio = createAudio(() => settings)
const session = createSession(bus, machine, () => settings)

const canvas = document.querySelector('#view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.18
renderer.setClearColor('#140c18', 1)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(settings.fov || 72, 1, 0.08, 1800)
const hemi = new THREE.HemisphereLight('#ffd0b0', '#1a6e66', 1.05)
const sun = new THREE.DirectionalLight('#fff1d6', 1.45)
sun.position.set(40, 70, 24)
const rim = new THREE.DirectionalLight('#7ec8c4', 0.62)
rim.position.set(-48, 18, -36)
const amb = new THREE.AmbientLight('#fff6ea', 0.28)
scene.add(hemi, sun, rim, amb)
const presenter = createPresenter(renderer, scene, camera)

const spaceView = new SpaceView(scene)
const surfaceView = new SurfaceView(scene)
const ui = createUI({
  root: document.querySelector('#overlay'),
  lock: document.querySelector('#lock'),
  fade: document.querySelector('#fade'),
  session,
  machine,
  input,
  settings,
  audio,
  bus,
  saveSettings: () => writeSettings(settings),
})

bus.on('sfx', (name) => audio.play(name))

const work = []
let last = performance.now()
let adaptHold = 0
const sky = new THREE.Color('#49c2b8')
const night = new THREE.Color('#141824')

function resize() {
  const w = window.innerWidth
  const h = Math.max(1, window.innerHeight)
  const ratio = settings.graphics === 'high' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1
  renderer.setPixelRatio(ratio)
  renderer.setSize(w, h, false)
  presenter.setSize(w, h)
  camera.aspect = w / h
  camera.fov = settings.fov || 72
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

document.querySelector('#lock').addEventListener('click', () => {
  audio.resume()
  input.requestLock(canvas)
})
canvas.addEventListener('click', () => {
  audio.resume()
  const mode = machine.state
  const state = session.state
  if (['SPACE', 'SURFACE', 'BASE_BUILD'].includes(mode) && state && !state.menu) input.requestLock(canvas)
})

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016)
  last = now
  const started = performance.now()
  try {
  input.update()
  const ate = ui.eat(input)
  const mode = machine.state
  const state = session.state
  if (!ate && state && !['TITLE', 'MODE_SELECT'].includes(mode)) session.update(dt, input)
  else {
    input.consumeLook()
    input.consumeWheel()
  }
  if (state?.menu || mode === 'TITLE' || mode === 'MODE_SELECT' || mode === 'PAUSED') input.exitLock()
  const onSurface = state?.location === 'surface' && state.planetIndex != null
  if (onSurface) surfaceView.bindNoise(noiseFor(state.seed, state.systemIndex, state.planetIndex))
  spaceView.sync(state, session.galaxy, session.runtime, mode, camera, dt)
  surfaceView.sync(state, session.runtime, settings, mode, camera)
  dressLights(mode, state)
  ui.update(input)
  audio.update(state, mode)
  presenter.setQuality(settings.graphics || 'medium')
  presenter.render()
  input.endFrame()
  const spent = performance.now() - started
  work.push(spent)
  if (work.length > 600) work.shift()
  adapt(spent)
  } catch (error) {
    window.__errors.push(error && error.stack ? error.stack : String(error))
  }
  requestAnimationFrame(loop)
}

function dressLights(mode, state) {
  const surface = surfaceView.group.visible
  if (surface && state) {
    sun.position.copy(surfaceView.sun.position)
    rim.position.set(surfaceView.sun.position.x * -0.4, 24, surfaceView.sun.position.z * -0.3)
    sun.intensity = 0.45 + surfaceView.daylight * 1.25
    rim.intensity = 0.28 + surfaceView.daylight * 0.35
    amb.intensity = 0.28 + surfaceView.daylight * 0.28
    hemi.intensity = 0.45 + surfaceView.daylight * 0.4
    scene.fog = surfaceView.fog
    scene.background = surfaceView.tint
  } else {
    if (!sun.target.parent) scene.add(sun.target)
    if (state?.location === 'space') {
      sun.position.set(18, 40, 12)
      sun.target.position.set(state.space.position.x, state.space.position.y, state.space.position.z)
    } else {
      sun.position.set(48, 80, 20)
      sun.target.position.set(0, 0, 0)
    }
    sun.target.updateMatrixWorld()
    sun.intensity = 1.35
    rim.intensity = 0.7
    amb.intensity = 0.55
    hemi.intensity = 0.95
    scene.fog = null
    scene.background = null
    if (mode === 'SHIP_EDITOR') scene.background = sky.clone().lerp(night, 0.28)
    else if (mode === 'STATION') scene.background = sky.clone().lerp(night, 0.55)
  }
}

function adapt(spent) {
  adaptHold += 1
  if (adaptHold < 240) return
  adaptHold = 0
  const recent = work.slice(-120)
  if (!recent.length) return
  const avg = recent.reduce((sum, value) => sum + value, 0) / recent.length
  if (avg > 18 && settings.renderDistance > 2) {
    settings.renderDistance -= 1
    if (settings.graphics === 'high') settings.graphics = 'medium'
    else if (avg > 24) settings.graphics = 'low'
  }
}

function average(list) {
  if (!list.length) return 0
  return list.reduce((sum, value) => sum + value, 0) / list.length
}

window.__errors = []
window.addEventListener('error', (event) => window.__errors.push(String(event.message || event.error)))
window.addEventListener('unhandledrejection', (event) => window.__errors.push(String(event.reason)))

window.__debug = {
  ready: true,
  get errors() { return window.__errors.slice() },
  mode: () => machine.state,
  signature: () => session.signature(),
  getState: () => session.state,
  newGame: (opts = {}) => session.newGame(opts),
  load: (slot) => session.loadGame(slot),
  save: (slot) => session.saveGame(slot),
  exportSave: (slot) => session.exportSlot(slot),
  importSave: (text, slot) => session.importSlot(text, slot),
  summaries: () => session.summaries(),
  freeze: (value) => { if (session.state) session.state.flags.frozen = !!value },
  give: (id, n) => session.give(id, n),
  count: (id) => (session.state ? countItem(session.state, id) : 0),
  teleport: (partial) => session.teleport(partial),
  approach: (index) => session.approach(index),
  land: (index = 0) => {
    session.approach(index)
    const res = session.requestLand(session.flightStatus())
    session.skipTransition()
    return { ...res, location: session.state?.location, biome: session.state?.biomeId }
  },
  launch: () => {
    const res = session.requestLaunch()
    session.skipTransition()
    return { ...res, location: session.state?.location }
  },
  dock: () => {
    session.approachStation()
    const res = session.requestDock()
    session.skipTransition()
    return { ...res, location: session.state?.location }
  },
  undock: () => session.requestLaunch(),
  warp: (index) => {
    const res = session.requestWarp(index)
    session.skipTransition()
    return { ...res, system: session.state?.systemIndex, fuel: session.state?.ship.fuel }
  },
  mine: (seconds) => session.mine(seconds),
  craft: (id) => session.craft(id),
  place: (id, x, y, z) => session.place(id, x, y, z),
  scan: () => session.scan(),
  stats: () => (session.state ? session.stats() : null),
  power: () => session.power(),
  editorPlace: (id, x, y, z) => session.editorPlace(id, x, y, z),
  editorCommit: () => session.editorCommit(),
  editorUndo: () => session.editorUndo(),
  saveBlueprint: (name) => session.saveBlueprint(name),
  loadBlueprint: (name) => session.loadBlueprint(name),
  kill: () => {
    const kind = session.die('debug')
    if (kind === 'permadeath') machine.force('TITLE')
    else machine.force('DEAD')
    return kind
  },
  respawn: () => session.respawn(),
  setHealth: (value) => { if (session.state) session.state.player.health = value },
  setFlight: (partial) => session.setFlight(partial),
  setParams: (partial) => session.setParams(partial),
  unlockAll: () => {
    if (!session.state) return
    session.state.unlockedTech = ['fieldcraft', 'metallurgy', 'lifesupport', 'hullworks', 'propulsion', 'powercraft', 'armory', 'agriculture', 'logistics', 'cartography']
  },
  buy: (id) => session.buy(id),
  sell: (id) => session.sell(id),
  spawnPirates: (n) => session.spawnPirates(n),
  tick: (dt) => session.tick(dt),
  setState: (name) => machine.force(name),
  setFakePad: (pad) => input.setFakePad(pad),
  clearFakePad: () => input.clearFakePad(),
  capture: (value) => { if (session.state) session.state.flags.capturing = !!value },
  workAverage: () => average(work),
  sampleCount: () => work.length,
  resetWork: () => { work.length = 0 },
  credits: () => session.state?.credits,
  research: () => session.state?.research,
  menu: (name) => { if (session.state) session.state.menu = name },
  setQuality: (graphics, renderDistance) => {
    if (graphics) settings.graphics = graphics
    if (renderDistance) settings.renderDistance = renderDistance
  },
  flight: () => session.state?.flight || null,
  terrainReady: () => !!session.runtime.terrainReady,
}

loop(performance.now())
