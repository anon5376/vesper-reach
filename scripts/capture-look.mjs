import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const ROOT = new URL('..', import.meta.url).pathname
const PORT = 4174
const PAGE_URL = `http://127.0.0.1:${PORT}/`
const ART = '/opt/cursor/artifacts/screenshots'

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

const preview = startPreview()
await waitForServer(preview.child, preview.log)
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))
page.on('console', (msg) => {
  if (msg.type() === 'error') pageErrors.push(msg.text())
})
await page.goto(PAGE_URL)
await page.waitForFunction(() => window.__debug && window.__debug.ready, null, { timeout: 15000 })
await page.evaluate(() => {
  window.__debug.newGame({ modeId: 'creative', slot: 7, seed: 2 })
  window.__debug.setQuality('high', 4)
  const state = window.__debug.getState()
  state.time = 140
  window.__debug.freeze(true)
})
await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const space = await page.evaluate(() => {
  const biomes = []
  for (let i = 0; i < 6; i++) biomes.push(window.__debug.land(i).biome)
  const lush = Math.max(0, biomes.indexOf('lush'))
  window.__debug.launch()
  const state = window.__debug.getState()
  state.time = 140
  window.__debug.approach(lush)
  return { biomes, lush, location: state.location }
})
for (let i = 0; i < 8; i++) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
}
await mkdir(ART, { recursive: true })
await page.screenshot({ path: `${ART}/space-approach.png` })
await page.evaluate(() => {
  const state = window.__debug.getState()
  state.time = 140
  window.__debug.approach(1)
})
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
}
await page.screenshot({ path: `${ART}/space-ocean.png` })
const landed = await page.evaluate((index) => {
  const state = window.__debug.getState()
  state.time = 140
  return window.__debug.land(index)
}, space.lush)
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
}
await page.screenshot({ path: `${ART}/surface-ground.png` })
await page.evaluate(() => window.__debug.setState('SHIP_EDITOR'))
for (let i = 0; i < 8; i++) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
}
await page.screenshot({ path: `${ART}/ship-yard.png` })
const errors = await page.evaluate(() => window.__errors.slice())
const cover = await page.evaluate(() => window.__cover || null)
console.log(JSON.stringify({ space, landed, cover, errors: [...errors, ...pageErrors] }, null, 2))
preview.child.kill('SIGTERM')
await Promise.race([
  browser.close(),
  new Promise((resolve) => setTimeout(resolve, 4000)),
])
process.exit(0)
