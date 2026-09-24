import { execSync, spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const ROOT = new URL('..', import.meta.url).pathname
execSync('npm run build', { stdio: 'inherit', cwd: ROOT })

const PORT = 4173
const PAGE_URL = `http://127.0.0.1:${PORT}/`
const SHOTS = '/tmp/vesper-shots'
const ART = '/opt/cursor/artifacts/screenshots'

const errors = []
function fail(message) {
  errors.push(message)
  console.error('FAIL', message)
}
function ok(message) {
  console.log('ok', message)
}

function startPreview() {
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout.on('data', (chunk) => { log += chunk })
  child.stderr.on('data', (chunk) => { log += chunk })
  return { child, log: () => log }
}

async function waitForServer(child, log) {
  const started = Date.now()
  while (Date.now() - started < 20000) {
    if (child.exitCode != null) throw new Error(`preview exited ${child.exitCode}\n${log()}`)
    try {
      const res = await fetch(PAGE_URL)
      if (res.ok) return
    } catch { /* booting */ }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`preview did not answer\n${log()}`)
}

async function ready(page) {
  await page.waitForFunction(() => window.__debug && window.__debug.ready, null, { timeout: 15000 })
}

async function frames(page, count = 2) {
  for (let i = 0; i < count; i++) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  }
}

async function shot(page, name) {
  await mkdir(SHOTS, { recursive: true })
  await mkdir(ART, { recursive: true }).catch(() => {})
  const file = `${SHOTS}/${name}.png`
  await page.screenshot({ path: file })
  await page.screenshot({ path: `${ART}/${name}.png` }).catch(() => {})
  return file
}

async function mineUntil(page, need) {
  for (let i = 0; i < 6; i++) {
    const count = await page.evaluate((seconds) => window.__debug.mine(seconds), 4)
    if (count >= need) return count
  }
  return page.evaluate(() => window.__debug.count('drift-ore'))
}

async function playMode(page, modeId, slot, custom) {
  const started = await page.evaluate(({ modeId, slot, custom }) => {
    localStorage.clear()
    const state = window.__debug.newGame({ modeId, slot, seed: 88000 + slot * 17 + modeId.length, custom })
    window.__debug.freeze(true)
    window.__debug.capture(true)
    return {
      location: state.location,
      mode: window.__debug.mode(),
      hazard: state.params.hazardRate,
      unlimited: state.params.unlimited,
      permadeath: state.params.permadeath,
      systems: 100,
    }
  }, { modeId, slot, custom })
  if (started.location !== 'space' || started.mode !== 'SPACE') fail(`${modeId} did not enter space`)
  else ok(`${modeId} in space`)
  if (modeId === 'custom' && started.hazard !== custom.hazardRate) fail(`custom hazard ${started.hazard}`)
  else if (modeId === 'custom') ok('custom hazard slider')
  if (modeId === 'creative' && !started.unlimited) fail('creative is limited')
  if (modeId === 'permadeath' && !started.permadeath) fail('permadeath flag missing')

  await page.evaluate(() => window.__debug.freeze(false))
  const before = await page.evaluate(() => {
    const space = window.__debug.getState().space
    return { x: space.position.x, z: space.position.z, throttle: space.throttle }
  })
  await page.evaluate(() => window.__debug.setFakePad({ axes: [0, -1, 0, 0], buttons: [] }))
  await frames(page, 20)
  const after = await page.evaluate(() => {
    const space = window.__debug.getState().space
    return { x: space.position.x, z: space.position.z, throttle: space.throttle }
  })
  await page.evaluate(() => window.__debug.clearFakePad())
  const flew = Math.hypot(after.x - before.x, after.z - before.z)
  if (after.throttle <= before.throttle && flew < 0.4) fail(`${modeId} did not fly (${flew}, throttle ${after.throttle})`)
  else ok(`${modeId} flew`)
  await page.evaluate(() => window.__debug.freeze(true))

  if (modeId === 'normal') {
    const assistBefore = await page.evaluate(() => window.__debug.flight().assist)
    await page.evaluate(() => {
      window.__debug.freeze(false)
      window.__debug.setFakePad({
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: index === 10 })),
      })
    })
    await frames(page, 2)
    await page.evaluate(() => window.__debug.clearFakePad())
    const assistAfter = await page.evaluate(() => window.__debug.flight().assist)
    if (assistAfter === assistBefore) fail('gamepad assist toggle did not flip')
    else ok('gamepad assist toggle')

    await page.evaluate(() => {
      window.__debug.setFlight({ scheme: '6dof', assist: true, throttleMode: 'set' })
      window.__debug.freeze(false)
      const space = window.__debug.getState().space
      space.velocity = { x: 0, y: 0, z: 0 }
      window.__debug.setFakePad({ axes: [1, 0, 0, 0], buttons: [] })
    })
    await frames(page, 18)
    const lateral = await page.evaluate(() => {
      const space = window.__debug.getState().space
      return Math.hypot(space.velocity.x, space.velocity.z)
    })
    await page.evaluate(() => {
      window.__debug.clearFakePad()
      window.__debug.setFlight({ scheme: 'arcade', assist: false, throttleMode: 'set' })
      const space = window.__debug.getState().space
      space.throttle = 1
      space.velocity = { x: 0, y: 0, z: 0 }
    })
    await frames(page, 8)
    await page.evaluate(() => {
      const space = window.__debug.getState().space
      space.throttle = 0
      window.__debug.setFlight({ scheme: 'arcade', assist: false, throttleMode: 'hold' })
    })
    await frames(page, 10)
    const drift = await page.evaluate(() => {
      const space = window.__debug.getState().space
      return Math.hypot(space.velocity.x, space.velocity.y, space.velocity.z)
    })
    await page.evaluate(() => window.__debug.freeze(true))
    if (lateral < 0.4) fail(`6dof strafe too small (${lateral})`)
    else ok('6dof strafe')
    if (drift < 0.4) fail(`assist-off drift too small (${drift})`)
    else ok('flight assist off drifts')
    await page.evaluate(() => window.__debug.setFlight({ scheme: 'arcade', assist: true, throttleMode: 'set' }))
  }

  const landed = await page.evaluate(() => window.__debug.land(0))
  if (landed.location !== 'surface') fail(`${modeId} land ${landed.error || landed.location}`)
  else ok(`${modeId} landed ${landed.biome}`)
  await page.evaluate(() => window.__debug.freeze(true))
  let terrain = false
  for (let i = 0; i < 8 && !terrain; i++) {
    await frames(page, 1)
    terrain = await page.evaluate(() => window.__debug.terrainReady())
  }
  if (!terrain) {
    const diag = await page.evaluate(() => ({
      mode: window.__debug.mode(),
      location: window.__debug.getState()?.location,
      planet: window.__debug.getState()?.planetIndex,
      errors: window.__debug.errors.slice(-3),
    }))
    fail(`${modeId} terrain not ready ${JSON.stringify(diag)}`)
  } else ok(`${modeId} terrain`)

  const need = modeId === 'survival' ? 12 : 8
  const ore = await mineUntil(page, Math.max(need, 18))
  if (ore < 6) fail(`${modeId} mined ${ore}`)
  else ok(`${modeId} mined ${ore}`)

  const crafted = await page.evaluate(() => {
    const problems = []
    let guard = 0
    while (window.__debug.count('drift-ingot') < 6 && guard < 8) {
      const row = window.__debug.craft('smelt-drift')
      if (!row.ok) {
        problems.push(row.error || 'smelt')
        break
      }
      guard += 1
    }
    for (const id of ['shape-cube', 'pour-foundation']) {
      const row = window.__debug.craft(id)
      if (!row.ok) problems.push(`${id}: ${row.error}`)
    }
    return problems
  })
  if (crafted.length) fail(`${modeId} craft ${crafted.join('; ')}`)
  else ok(`${modeId} crafted`)

  const massBefore = await page.evaluate(() => window.__debug.stats().mass)
  const editor = await page.evaluate(() => {
    const placed = window.__debug.editorPlace('hull-cube', 1, 0, 0)
    const report = window.__debug.stats && window.__debug.editorCommit()
    return { placed, report, mass: window.__debug.stats().mass }
  })
  if (!editor.placed.ok) fail(`${modeId} editor ${editor.placed.error}`)
  else if (!(editor.mass > massBefore)) fail(`${modeId} mass unchanged`)
  else ok(`${modeId} ship part ${massBefore.toFixed(1)} -> ${editor.mass.toFixed(1)}`)
  await page.evaluate(() => window.__debug.setState('SHIP_EDITOR'))
  await frames(page, 2)

  const base = await page.evaluate(() => {
    const player = window.__debug.getState().player.position
    const y = Math.round(player.y)
    window.__debug.setState('SURFACE')
    const placed = window.__debug.place('foundation', 4, y, 4)
    window.__debug.give('solar', 1)
    window.__debug.give('lamp', 1)
    const solar = window.__debug.place('solar', 5, y, 4)
    const lamp = window.__debug.place('lamp', 4, y + 1, 4)
    window.__debug.setState('BASE_BUILD')
    return { placed, solar, lamp, power: window.__debug.power() }
  })
  if (!base.placed.ok) fail(`${modeId} base ${base.placed.error}`)
  else ok(`${modeId} base piece`)
  if (!base.power?.powered) fail(`${modeId} power ${JSON.stringify(base.power)}`)
  else ok(`${modeId} power`)
  await frames(page, 2)

  const aloft = await page.evaluate(() => {
    const park = window.__debug.getState().park
    window.__debug.setState('SURFACE')
    window.__debug.teleport({ x: park.x, z: park.z })
    return window.__debug.launch()
  })
  if (aloft.location !== 'space') fail(`${modeId} launch ${aloft.error || aloft.location}`)
  else ok(`${modeId} launch`)

  const warped = await page.evaluate(() => {
    const ship = window.__debug.getState().ship
    ship.fuel = Math.max(ship.fuel, 60)
    return window.__debug.warp(5)
  })
  if (warped.system !== 5) fail(`${modeId} warp ${warped.error || warped.system}`)
  else ok(`${modeId} warp`)

  const saved = await page.evaluate((slot) => {
    window.__debug.freeze(true)
    const signature = window.__debug.signature()
    const res = window.__debug.save(slot)
    return { signature, ok: res.ok, error: res.error, text: window.__debug.exportSave(slot) }
  }, slot)
  if (!saved.ok || !saved.text) fail(`${modeId} save ${saved.error || 'empty'}`)
  else ok(`${modeId} saved`)

  await page.reload()
  await ready(page)
  const loaded = await page.evaluate((slot) => {
    const res = window.__debug.load(slot)
    window.__debug.freeze(true)
    return { ok: res.ok, error: res.error, signature: window.__debug.signature() }
  }, slot)
  if (!loaded.ok || loaded.signature !== saved.signature) {
    fail(`${modeId} reload mismatch ${loaded.error || ''}`)
  } else ok(`${modeId} reload matches`)

  if (modeId === 'permadeath') {
    const burned = await page.evaluate((slot) => {
      const kind = window.__debug.kill()
      return { kind, summary: window.__debug.summaries()[slot], mode: window.__debug.mode() }
    }, slot)
    if (burned.kind !== 'permadeath' || burned.summary || burned.mode !== 'TITLE') {
      fail(`permadeath delete ${JSON.stringify(burned)}`)
    } else ok('permadeath deleted the drawer')
  }
  return saved.text
}

const preview = startPreview()
let browser
try {
  await waitForServer(preview.child, preview.log)
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const consoleErrors = []
  page.on('pageerror', (error) => consoleErrors.push(String(error)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  await page.goto(PAGE_URL, { waitUntil: 'networkidle' })
  await ready(page)
  await frames(page, 3)
  const title = await page.locator('h1').innerText()
  if (!title.includes('Vesper Reach')) fail(`title text ${title}`)
  else ok('title')
  await shot(page, 'title')
  await page.click('button[data-act="modes"]')
  await frames(page, 2)
  const modes = await page.locator('button[data-act="pick-mode"]').count()
  if (modes < 5) fail(`mode buttons ${modes}`)
  else ok('mode select')
  await shot(page, 'mode-select')

  await page.evaluate(() => localStorage.clear())
  await playMode(page, 'normal', 0, null)
  await page.evaluate(() => window.__debug.capture(true))
  await page.evaluate(() => window.__debug.setState('SPACE'))
  await frames(page, 3)
  await shot(page, 'space')
  await page.evaluate(() => window.__debug.land(0))
  await frames(page, 4)
  await shot(page, 'surface')
  await page.evaluate(() => window.__debug.setState('SHIP_EDITOR'))
  await frames(page, 2)
  await shot(page, 'ship-editor')
  await page.evaluate(() => {
    window.__debug.setState('SURFACE')
    window.__debug.setState('BASE_BUILD')
  })
  await frames(page, 2)
  await shot(page, 'base-build')
  await page.evaluate(() => window.__debug.setState('GALAXY_MAP'))
  await frames(page, 2)
  const pips = await page.locator('.pip').count()
  if (pips !== 100) fail(`galaxy pips ${pips}`)
  else ok('galaxy map 100')
  await shot(page, 'galaxy-map')
  await page.evaluate(() => window.__debug.menu('inventory'))
  await frames(page, 1)
  await shot(page, 'inventory')
  const docked = await page.evaluate(() => {
    window.__debug.setState('SPACE')
    window.__debug.getState().menu = null
    return window.__debug.dock()
  })
  if (docked.location !== 'station') fail(`dock ${docked.error || docked.location}`)
  else ok('station')
  await frames(page, 2)
  await shot(page, 'station')

  await playMode(page, 'survival', 1, null)
  await playMode(page, 'creative', 0, null)
  await playMode(page, 'custom', 1, { hazardRate: 0.33, fuelCost: 1.1, resourceYield: 1.4, enemyAggression: 0.4 })
  await playMode(page, 'permadeath', 2, null)

  await page.evaluate(() => {
    window.__debug.newGame({ modeId: 'normal', seed: 4242, slot: 0 })
    window.__debug.freeze(true)
    window.__debug.setQuality('low', 2)
  })
  await frames(page, 5)
  const spaceSamples = await page.evaluate(async () => {
    window.__debug.resetWork()
    window.__debug.freeze(false)
    const start = performance.now()
    while (performance.now() - start < 10000) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    window.__debug.freeze(true)
    return { avg: window.__debug.workAverage(), n: window.__debug.sampleCount() }
  })
  ok(`space frame work ${spaceSamples.avg.toFixed(2)}ms over ${spaceSamples.n} frames`)
  await page.evaluate(() => {
    window.__debug.land(0)
    window.__debug.freeze(true)
  })
  await frames(page, 6)
  const surfaceSamples = await page.evaluate(async () => {
    window.__debug.resetWork()
    window.__debug.freeze(false)
    const start = performance.now()
    while (performance.now() - start < 10000) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    window.__debug.freeze(true)
    return { avg: window.__debug.workAverage(), n: window.__debug.sampleCount() }
  })
  ok(`surface frame work ${surfaceSamples.avg.toFixed(2)}ms over ${surfaceSamples.n} frames`)
  await writeFile(`${SHOTS}/perf.json`, JSON.stringify({ space: spaceSamples, surface: surfaceSamples }, null, 2))
  if (spaceSamples.avg > 16.7 || surfaceSamples.avg > 16.7) {
    fail(`frame work over 16.7ms space ${spaceSamples.avg.toFixed(2)} surface ${surfaceSamples.avg.toFixed(2)}`)
  }

  const pageErrors = await page.evaluate(() => window.__debug.errors)
  const fresh = [...consoleErrors, ...pageErrors].filter((line) => !/favicon/i.test(line))
  if (fresh.length) fail(`console errors:\n${fresh.slice(0, 8).join('\n---\n')}`)
  else ok('no console errors')
} catch (error) {
  fail(error.stack || error.message)
} finally {
  if (browser) await browser.close().catch(() => {})
  preview.child.kill('SIGTERM')
}

if (errors.length) {
  console.error(`\nsmoke failed (${errors.length})`)
  process.exit(1)
}
console.log('\nsmoke passed')
