import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const SAMPLE_JOB = 'one page that files a single field note on this machine'

const KEYS = ['Spare', 'Job', 'Nearest neighbor', 'Graft', 'Proof', 'Left on the table']

function normalize(value) {
  return value.toLowerCase().replace(/\s+/g, ' ').replace(/\.+$/g, '').trim()
}

function filesUnder(dir) {
  const found = []
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) found.push(...filesUnder(path))
    else found.push(path)
  }
  return found
}

function readRecord(root) {
  let text
  try {
    text = readFileSync(join(root, 'YIELD.md'), 'utf8')
  } catch {
    return { errors: ['YIELD.md is missing'] }
  }
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines.at(-1) === '') lines.pop()
  const errors = []
  if (lines[0] !== '# Yield' || lines[1] !== '') {
    errors.push('YIELD.md must be a heading, one blank line, and only six lines')
  }
  const body = lines[0] === '# Yield' && lines[1] === '' ? lines.slice(2) : []
  if (body.length !== KEYS.length) {
    errors.push(`YIELD.md must contain only six lines, found ${body.length}`)
  }
  const values = {}
  for (const [index, key] of KEYS.entries()) {
    const line = body[index] ?? ''
    const prefix = `${key}: `
    if (!line.startsWith(prefix)) {
      errors.push(`expected ${key}:`)
      continue
    }
    const value = line.slice(prefix.length).trim()
    if (!value) errors.push(`${key} is empty`)
    values[key] = value
  }
  return { errors, values }
}

export function checkYield({ root, graftRoot } = {}) {
  if (!root) return { ok: false, errors: ['pass --root'] }
  const { errors, values } = readRecord(root)
  if (!values || errors.length > 0) return { ok: false, errors }

  const job = values.Job
  if (normalize(job) === normalize(SAMPLE_JOB)) {
    errors.push('sample Job is the shape, not a product')
  }

  const neighbor = values['Nearest neighbor']
  const other = neighbor.split(/whose job is/i)[1]
  if (!other?.trim()) errors.push('Nearest neighbor must say whose job is')
  else if (normalize(other) === normalize(job)) errors.push('Nearest neighbor job must differ from Job')

  if (!/spare|leftover|reset|expir|unused|window|quota|roll/i.test(values.Spare)) {
    errors.push('Spare must name what expires')
  }

  const proof = values.Proof
  const shaped = /^`[^`]+`\s*(?:→|->)\s*\S/.test(proof)
  const deferred = /\b(pending|todo|tbd|not run|would|should|later)\b/i.test(proof)
  const resultSide = proof.split(/→|->/).slice(1).join('-')
  const counted = /\b(fail 0|\bok\b|pass)\b/i.test(resultSide) && !/\bduration_ms\b/i.test(resultSide)
  if (!shaped || deferred || !counted) errors.push('Proof must show pass or fail, not a timer')

  if (values.Graft !== 'none') {
    const match = values.Graft.match(/^(.+?) \u2014 (\S+)$/)
    if (!match) errors.push('Graft must be none, or a project name, an em dash, and an existing file')
    else if (!graftRoot) errors.push('pass --graft-root')
    else if (match[2].split('/').includes('..') || match[2].startsWith('/')) {
      errors.push('Graft path must stay inside the project')
    } else {
      const full = join(graftRoot, ...match[2].split('/'))
      if (!existsSync(full) || !statSync(full).isFile()) errors.push(`Graft file is missing: ${match[2]}`)
    }
  }

  const artifacts = filesUnder(root)
    .map((path) => relative(root, path))
    .filter((path) => {
      const base = path.split(sep).at(-1)
      return base !== 'YIELD.md' && base.toLowerCase() !== 'readme.md'
    })
  if (artifacts.length === 0) errors.push('the yield has no artifact besides YIELD.md and a README')
  else {
    const bodies = artifacts.map((path) => readFileSync(join(root, path), 'utf8')).join('\n')
    if (!/\b(reject|refuse|invalid|throws|throw)\b/i.test(bodies)) {
      errors.push('the yield needs a wrong path, not only a result')
    }
  }

  return { ok: errors.length === 0, errors }
}

function readArgs(argv) {
  const args = { root: '', graftRoot: '' }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') args.root = argv[++i] ?? ''
    else if (argv[i] === '--graft-root') args.graftRoot = argv[++i] ?? ''
  }
  return args
}

function ranAsCli() {
  if (!process.argv[1]) return false
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href
  }
}

if (ranAsCli()) {
  const args = readArgs(process.argv.slice(2))
  const result = checkYield({
    root: args.root,
    graftRoot: args.graftRoot || undefined,
  })
  if (!result.ok) {
    console.error(result.errors.join('\n'))
    process.exit(1)
  }
  console.log('yield ok')
}
