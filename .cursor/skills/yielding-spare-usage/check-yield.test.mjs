import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkYield } from './check-yield.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const checker = join(here, 'check-yield.mjs')

const fields = {
  Spare: 'included usage resets tonight and will not roll over',
  Job: 'a desk that marks the one line that breaks a printed record',
  'Nearest neighbor': 'a notes app, whose job is to keep many notes',
  Graft: 'none',
  Proof: '`node --test` → # fail 0',
  'Left on the table': 'tags on the note',
}

function card(overrides = {}) {
  const row = { ...fields, ...overrides }
  const order = ['Spare', 'Job', 'Nearest neighbor', 'Graft', 'Proof', 'Left on the table']
  return `# Yield\n\n${order.map((key) => `${key}: ${row[key]}`).join('\n')}\n`
}

const KEEPER = `export function take(raw) {
  if (!raw) throw new Error('invalid')
  return String(raw).trim()
}
`

function site(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'yield-'))
  writeFileSync(join(root, 'YIELD.md'), options.card ?? card())
  if (options.artifact !== false) {
    writeFileSync(join(root, 'note.js'), options.artifact ?? KEEPER)
  }
  if (options.readme) writeFileSync(join(root, 'README.md'), '# hi\n')
  return root
}

test('a six-line yield with an artifact passes', () => {
  const result = checkYield({ root: site() })
  assert.equal(result.ok, true, result.errors?.join('\n'))
})

test('a result with no wrong path is rejected', () => {
  const result = checkYield({ root: site({ artifact: 'export const minutes = 20\n' }) })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /wrong path/i)
})

test('readme alone is not an artifact', () => {
  const result = checkYield({ root: site({ artifact: false, readme: true }) })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /artifact/i)
})

test('a missing field is rejected', () => {
  const text = card().replace('Job: a desk that marks the one line that breaks a printed record\n', '')
  const result = checkYield({ root: site({ card: text }) })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /Job/)
})

test('extra prose is rejected', () => {
  const result = checkYield({ root: site({ card: `${card()}\nAlso a second app.\n` }) })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /six lines|only/i)
})

test('the neighbor must name the other job, and that job must differ', () => {
  const missing = checkYield({
    root: site({ card: card({ 'Nearest neighbor': 'a notes app' }) }),
  })
  assert.equal(missing.ok, false)
  const same = checkYield({
    root: site({
      card: card({
        'Nearest neighbor':
          'a notebook, whose job is a desk that marks the one line that breaks a printed record',
      }),
    }),
  })
  assert.equal(same.ok, false)
})

test('a timer is not a proof result', () => {
  const result = checkYield({
    root: site({ card: card({ Proof: '`node --test` → # duration_ms 43.7' }) }),
  })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /pass or fail/i)
})

test('spare must be an expiring window, and the proof must be a result', () => {
  const spare = checkYield({ root: site({ card: card({ Spare: 'a Tuesday' }) }) })
  assert.equal(spare.ok, false)
  const pending = checkYield({
    root: site({ card: card({ Proof: '`node --test` → not run' }) }),
  })
  assert.equal(pending.ok, false)
  const arrow = checkYield({
    root: site({ card: card({ Proof: '`node --test` -> # fail 0' }) }),
  })
  assert.equal(arrow.ok, true, arrow.errors?.join('\n'))
})

test('graft none needs no project, and a graft must point at a real file', () => {
  const claimed = checkYield({
    root: site({ card: card({ Graft: 'vesper-reach — src/data/biomes.js' }) }),
  })
  assert.equal(claimed.ok, false)
  assert.match(claimed.errors.join('\n'), /graft-root/i)

  const project = mkdtempSync(join(tmpdir(), 'graft-'))
  mkdirSync(join(project, 'src/data'), { recursive: true })
  writeFileSync(join(project, 'src/data/biomes.js'), 'export const biomes = []\n')
  const missing = checkYield({
    root: site({ card: card({ Graft: 'vesper-reach — src/data/missing.js' }) }),
    graftRoot: project,
  })
  assert.equal(missing.ok, false)

  const hit = checkYield({
    root: site({ card: card({ Graft: 'vesper-reach — src/data/biomes.js' }) }),
    graftRoot: project,
  })
  assert.equal(hit.ok, true, hit.errors?.join('\n'))
})

test('the sample job is a shape, not a product', () => {
  const result = checkYield({
    root: site({
      card: card({ Job: 'one page that files a single field note on this machine' }),
    }),
  })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /sample/i)
})

test('cli prints yield ok for a real job', () => {
  const run = spawnSync(process.execPath, [checker, '--root', site()], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /yield ok/)
})

test('skill description tells the agent when, not the steps', () => {
  const text = readFileSync(join(here, 'SKILL.md'), 'utf8')
  assert.match(text, /^---\nname: yielding-spare-usage\n/)
  const description = text.match(/^description: >-\n([\s\S]*?)\n---/m)?.[1] ?? ''
  assert.match(description, /Use when/)
  assert.doesNotMatch(description, /YIELD\.md|check-yield|whose job is/)
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '')
  const words = body.split(/\s+/).filter(Boolean)
  assert.ok(words.length < 500, `skill body is ${words.length} words`)
})
