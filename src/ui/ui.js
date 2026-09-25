import { BLOCKS, BLOCK_CATEGORIES } from '../data/blocks.js'
import { CUSTOM_FIELDS, CUSTOM_TOGGLES, MODE_LIST } from '../data/modes.js'
import { EFFECT_DEFS } from '../survival/effects.js'
import { ITEMS } from '../data/items.js'
import { PART_CATEGORIES } from '../data/parts.js'
import { RECIPE_LIST } from '../data/recipes.js'
import { TECH } from '../data/tech.js'
import { labelFor } from '../data/bindings.js'
import { knownRecipes } from '../crafting/crafting.js'
import { moveSlot, useItem } from '../inventory/inventory.js'
import { completion } from '../player/tools.js'
import { ownedCount, partsInCategory, swatches } from '../shipbuilder/editor.js'
import { resolveParams } from '../modes/modes.js'
import { BIOMES } from '../data/biomes.js'

const TOOLS = ['mine', 'blaster', 'scan']

export function createUI(ctx) {
  const root = ctx.root
  root.innerHTML = `
    <div id="screen"></div>
    <div id="hud" hidden>
      <header class="top">
        <div class="brand">Vesper Reach</div>
        <div id="where"></div>
        <div id="clock"></div>
      </header>
      <div id="meters"></div>
      <div id="fx"></div>
      <div id="compass"><div id="compass-bar"></div></div>
      <div id="xhair"></div>
      <div id="target"></div>
      <div id="prompt"></div>
      <div id="feed"></div>
      <div id="hot"></div>
      <div id="wheel" hidden></div>
    </div>`
  const screen = root.querySelector('#screen')
  const hud = root.querySelector('#hud')
  let draft = { ...resolveParams('normal') }
  let showImport = false
  let focus = 0
  let stamp = ''
  let rebind = null
  let eaten = false
  let drag = null

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-act]')
    if (!button) return
    act(button.dataset)
  })
  root.addEventListener('dragstart', (event) => {
    const slot = event.target.closest('[data-slot]')
    if (!slot) return
    drag = { kind: slot.dataset.kind || 'inv', index: Number(slot.dataset.slot) }
    event.dataTransfer?.setData('text/plain', 'slot')
  })
  root.addEventListener('dragover', (event) => {
    if (event.target.closest('[data-slot]')) event.preventDefault()
  })
  root.addEventListener('drop', (event) => {
    const slot = event.target.closest('[data-slot]')
    if (!slot || !drag || !ctx.session.state) return
    event.preventDefault()
    transfer(drag, { kind: slot.dataset.kind || 'inv', index: Number(slot.dataset.slot) })
    drag = null
    stamp = ''
  })

  function eat(input) {
    if (!rebind) return false
    const code = input.pressedCodes()[0]
    if (!code) return false
    if (code !== 'Escape') {
      ctx.settings.bindings[rebind] = [code]
      ctx.saveSettings()
      ctx.audio.play('ui')
    }
    rebind = null
    eaten = true
    stamp = ''
    return true
  }

  function update(input) {
    const mode = ctx.machine.state
    const state = ctx.session.state
    const runtime = ctx.session.runtime
    const play = state && !['TITLE', 'MODE_SELECT'].includes(mode)
    hud.hidden = !play || mode === 'SHIP_EDITOR'
    if (play) paintHud(state, runtime, mode)
    const next = screenKey(mode, state, runtime)
    if (next !== stamp) {
      stamp = next
      screen.innerHTML = renderScreen(mode, state, runtime)
      focus = 0
    }
    if (!eaten) moveFocus(input)
    eaten = false
    const fade = ctx.fade
    const tr = runtime.transition
    if (!tr) fade.style.opacity = '0'
    else fade.style.opacity = String(tr.t < 0.5 ? tr.t * 2 : Math.max(0, (1 - tr.t) * 2))
    const lock = ctx.lock
    const wantLock = ['SPACE', 'SURFACE', 'BASE_BUILD'].includes(mode) && state && !state.menu && !state.flags.capturing
    lock.hidden = !wantLock || input.locked || state?.flags?.capturing
  }

  function screenKey(mode, state, runtime) {
    if (mode === 'TITLE') return `title:${showImport}:${ctx.session.summaries().map((s) => s?.savedAt || 0).join(',')}`
    if (mode === 'MODE_SELECT') return `mode:${JSON.stringify(draft)}`
    if (!state) return mode
    if (mode === 'DEAD') return 'dead'
    if (mode === 'PAUSED' || state.menu || mode === 'GALAXY_MAP' || mode === 'SHIP_EDITOR' || mode === 'STATION' || mode === 'BASE_BUILD') {
      return `${mode}:${state.menu}:${runtime.baseRev}:${runtime.partPick}:${runtime.editor?.category}:${runtime.mapIndex}:${state.research}:${state.credits}:${rebind}`
    }
    return 'play'
  }

  function renderScreen(mode, state, runtime) {
    if (mode === 'TITLE') return titleScreen()
    if (mode === 'MODE_SELECT') return modeScreen()
    if (!state) return ''
    if (mode === 'DEAD') return deadScreen(state)
    if (mode === 'PAUSED') return pauseScreen(state)
    if (state.menu) return menuScreen(state, runtime, state.menu)
    if (mode === 'GALAXY_MAP') return mapScreen(state, runtime)
    if (mode === 'SHIP_EDITOR') return editorScreen(state, runtime)
    if (mode === 'STATION') return stationScreen(state)
    if (mode === 'BASE_BUILD') return buildScreen(state, runtime)
    return ''
  }

  function titleScreen() {
    const slots = ctx.session.summaries()
    return `<div class="sheet title-sheet">
      <p class="kicker">A lantern survey</p>
      <h1>Vesper Reach</h1>
      <p class="lede">Chart the paper margin. Land where the sky is the wrong color. Bring the kite home if you can.</p>
      <div class="row">
        <button data-nav data-act="modes" class="primary">New survey</button>
        <button data-nav data-act="open-import">Import a log</button>
      </div>
      <div class="slots">
        ${[0, 1, 2].map((slot) => slotCard(slot, slots[slot])).join('')}
      </div>
      <div id="import-box" ${showImport ? '' : 'hidden'}>
        <textarea id="import-text" placeholder="Paste a survey log"></textarea>
        <button data-nav data-act="do-import">File it in drawer 1</button>
      </div>
    </div>`
  }

  function slotCard(slot, summary) {
    if (!summary) return `<button data-nav data-act="empty" data-id="${slot}" class="slot empty">Drawer ${slot + 1}<small>empty</small></button>`
    const when = new Date(summary.savedAt).toLocaleString()
    return `<button data-nav data-act="load" data-id="${slot}" class="slot">Drawer ${slot + 1}<small>${summary.ship} · ${summary.modeId} · ${when}</small></button>`
  }

  function modeScreen() {
    return `<div class="sheet">
      <p class="kicker">Choose a contract</p>
      <h2>How the margin treats you</h2>
      <div class="modes">
        ${MODE_LIST.map((mode) => `<button data-nav data-act="pick-mode" data-id="${mode.id}" class="mode"><strong>${mode.label}</strong><span>${mode.blurb}</span></button>`).join('')}
      </div>
      <div class="custom">
        <h3>Charter sliders</h3>
        ${CUSTOM_FIELDS.map((field) => `<label class="slider"><span>${field.label}</span><b>${Number(draft[field.key]).toFixed(field.step < 1 ? 2 : 0)}</b>
          <span><button data-nav data-act="nudge" data-key="${field.key}" data-dir="-1">−</button><button data-nav data-act="nudge" data-key="${field.key}" data-dir="1" data-slider="${field.key}">+</button></span></label>`).join('')}
        ${CUSTOM_TOGGLES.map((toggle) => `<button data-nav data-act="toggle" data-key="${toggle.key}" class="check ${draft[toggle.key] ? 'on' : ''}">${toggle.label}</button>`).join('')}
        <button data-nav data-act="pick-mode" data-id="custom" class="primary">Sign the charter</button>
      </div>
      <button data-nav data-act="back-title">Back</button>
    </div>`
  }

  function pauseScreen(state) {
    return `<div class="sheet narrow">
      <p class="kicker">${state.systemName}</p>
      <h2>The log is open</h2>
      <p>Seed ${state.seed} · ${state.modeId}</p>
      <button data-nav data-act="resume" class="primary">Resume</button>
      <button data-nav data-act="save">Save this drawer</button>
      <button data-nav data-act="menu" data-id="settings">Settings</button>
      <button data-nav data-act="menu" data-id="controls">Controls</button>
      <button data-nav data-act="menu" data-id="inventory">Pockets</button>
      <button data-nav data-act="menu" data-id="tech">Folios</button>
      <button data-nav data-act="export">Export log</button>
      <button data-nav data-act="title">Leave for the title</button>
    </div>`
  }

  function deadScreen() {
    return `<div class="sheet narrow">
      <p class="kicker">The suit failed</p>
      <h2>Margin closed</h2>
      <p>A cache remembers your pockets, unless the contract burned the log.</p>
      <button data-nav data-act="respawn" class="primary">Wake at the bell or the kite</button>
      <button data-nav data-act="title">Close the book</button>
    </div>`
  }

  function menuScreen(state, runtime, menu) {
    if (menu === 'inventory') return inventoryScreen(state, runtime, false)
    if (menu === 'storage') return inventoryScreen(state, runtime, true)
    if (menu === 'craft') return craftScreen(state)
    if (menu === 'tech') return techScreen(state)
    if (menu === 'discoveries') return codexScreen(state)
    if (menu === 'settings') return settingsScreen()
    if (menu === 'controls') return controlsScreen()
    return ''
  }

  function inventoryScreen(state, runtime, storage) {
    const piece = storage ? findStorage(state, runtime) : null
    return `<div class="sheet wide">
      <p class="kicker">Pockets</p>
      <h2>${storage ? 'Storage bin' : 'What you are carrying'}</h2>
      <div class="grids">
        <div>${grid(state.inventory.slots, 'inv')}</div>
        ${piece ? `<div>${grid(piece.slots, 'store')}</div>` : ''}
      </div>
      <button data-nav data-act="use" class="primary">Use selected</button>
      <button data-nav data-act="close">Close</button>
    </div>`
  }

  function grid(slots, kind) {
    return `<div class="grid">${slots.map((slot, index) => `<button draggable="true" data-slot="${index}" data-kind="${kind}" data-nav data-act="select-slot" data-id="${index}" data-bag="${kind}" class="cell ${slot ? '' : 'empty'}">${slot ? `<b>${ITEMS[slot.id]?.name || slot.id}</b><i>${slot.count}</i>` : ''}</button>`).join('')}</div>`
  }

  function craftScreen(state) {
    const recipes = knownRecipes(state)
    return `<div class="sheet wide">
      <p class="kicker">Bench</p>
      <h2>Make something honest</h2>
      <div class="list">${recipes.map((recipe) => {
        const name = ITEMS[recipe.output.id]?.name || recipe.output.id
        const needs = recipe.inputs.map((input) => `${input.count} ${ITEMS[input.id]?.name || input.id}`).join(', ')
        return `<button data-nav data-act="craft" data-id="${recipe.id}"><strong>${name}</strong><small>${recipe.station} · ${needs}</small></button>`
      }).join('')}</div>
      <button data-nav data-act="close">Close</button>
    </div>`
  }

  function techScreen(state) {
    return `<div class="sheet">
      <p class="kicker">${state.research} survey points</p>
      <h2>Folios</h2>
      <div class="list">${TECH.map((entry) => {
        const owned = state.unlockedTech.includes(entry.id)
        return `<button data-nav data-act="unlock" data-id="${entry.id}" ${owned ? 'disabled' : ''}><strong>${entry.name}</strong><small>${owned ? 'copied' : `${entry.cost} pts`} · ${entry.desc}</small></button>`
      }).join('')}</div>
      <button data-nav data-act="close">Close</button>
    </div>`
  }

  function codexScreen(state) {
    const planets = Object.entries(state.codex.planets)
    const creatures = Object.values(state.codex.creatures)
    const plants = Object.values(state.codex.plants)
    return `<div class="sheet wide">
      <p class="kicker">Discoveries</p>
      <h2>What the margin showed you</h2>
      <div class="split">
        <section><h3>Worlds</h3>${planets.map(([key, planet]) => `<p><b>${planet.name}</b> · ${BIOMES[planet.biome]?.name || planet.biome} · scan ${completion(planet)}%<br><small>${planet.system}</small></p>`).join('') || '<p>No worlds filed.</p>'}</section>
        <section><h3>Fauna</h3>${creatures.map((creature) => `<p>${creature.name} <small>${creature.temperament}</small></p>`).join('') || '<p>No creatures filed.</p>'}</section>
        <section><h3>Flora</h3>${plants.map((plant) => `<p>${plant.name} <small>${plant.form}</small></p>`).join('') || '<p>No plants filed.</p>'}</section>
      </div>
      <button data-nav data-act="close">Close</button>
    </div>`
  }

  function settingsScreen() {
    const flight = ctx.settings.flight || {}
    const volumes = ctx.settings.volumes || {}
    return `<div class="sheet wide">
      <p class="kicker">Desk</p>
      <h2>Settings</h2>
      <div class="row">
        ${['low', 'medium', 'high'].map((level) => `<button data-nav data-act="quality" data-id="${level}" class="${ctx.settings.graphics === level ? 'on' : ''}">${level}</button>`).join('')}
      </div>
      ${stepper('Render distance', 'renderDistance', ctx.settings.renderDistance, 1)}
      ${stepper('Field of view', 'fov', ctx.settings.fov, 2)}
      ${stepper('Look sensitivity', 'lookSensitivity', ctx.settings.lookSensitivity, 0.0002)}
      ${stepper('Gamepad deadzone', 'gamepadDeadzone', ctx.settings.gamepadDeadzone, 0.02)}
      <div class="row">
        <button data-nav data-act="scheme" data-id="arcade" class="${flight.scheme !== '6dof' ? 'on' : ''}">Arcade aim</button>
        <button data-nav data-act="scheme" data-id="6dof" class="${flight.scheme === '6dof' ? 'on' : ''}">6DOF</button>
        <button data-nav data-act="assist" class="${flight.assist !== false ? 'on' : ''}">Assist ${flight.assist !== false ? 'on' : 'off'}</button>
        <button data-nav data-act="throttle" data-id="${flight.throttleMode === 'hold' ? 'set' : 'hold'}">Throttle ${flight.throttleMode || 'set'}</button>
      </div>
      ${Object.entries(volumes).map(([key, value]) => stepper(`${key} volume`, `vol:${key}`, value, 0.05)).join('')}
      <h3>Bindings ${rebind ? `— press a key for ${rebind}` : ''}</h3>
      <div class="binds">${Object.keys(ctx.settings.bindings).map((action) => `<button data-nav data-act="rebind" data-id="${action}">${action}<small>${labelFor(ctx.settings.bindings[action][0])}</small></button>`).join('')}</div>
      <button data-nav data-act="close">Close</button>
    </div>`
  }

  function stepper(label, key, value, step) {
    const shown = typeof value === 'number' && step < 0.01 ? value.toFixed(4) : typeof value === 'number' && step < 1 ? value.toFixed(2) : value
    return `<label class="slider"><span>${label}</span><b>${shown}</b><span><button data-nav data-act="step" data-key="${key}" data-dir="-1" data-step="${step}">−</button><button data-nav data-act="step" data-key="${key}" data-dir="1" data-step="${step}">+</button></span></label>`
  }

  function controlsScreen() {
    const rows = Object.entries(ctx.settings.bindings).map(([action, codes]) => `<tr><td>${action}</td><td>${codes.map(labelFor).join(' / ')}</td></tr>`).join('')
    return `<div class="sheet wide"><p class="kicker">Hands</p><h2>Controls</h2>
      <p>Arcade aim steers with the mouse and rolls on A/D. 6DOF strafes on A/D, rises on Space, drops on C, and rolls on Q/E. Flight assist damps drift. Hold X to toggle it. The tool wheel is Q on foot. Gamepad uses the left stick to move, the right stick to look, and the face buttons for jump, interact, scan, and fire.</p>
      <table class="binds-table">${rows}</table>
      <button data-nav data-act="close">Close</button></div>`
  }

  function mapScreen(state, runtime) {
    const galaxy = ctx.session.galaxy
    const index = runtime.mapIndex || 0
    const picked = galaxy.systems[index]
    return `<div class="sheet wide map-sheet">
      <p class="kicker">Star index</p>
      <h2>${picked.name}</h2>
      <p>${picked.star.name} · ${picked.planets.length} worlds · bell ${picked.station.name}</p>
      <div class="chart">
        ${galaxy.systems.map((system, i) => {
          const left = ((system.gx + 110) / 220) * 100
          const top = ((system.gy + 110) / 220) * 100
          return `<button data-nav data-act="pick-system" data-id="${i}" class="pip ${i === index ? 'on' : ''} ${i === state.systemIndex ? 'here' : ''}" style="left:${left}%;top:${top}%" title="${system.name}"></button>`
        }).join('')}
      </div>
      <button data-nav data-act="warp" class="primary">Fold to ${picked.name}</button>
      <button data-nav data-act="close-map">Close the chart</button>
    </div>`
  }

  function editorScreen(state, runtime) {
    const report = ctx.session.editorReport()
    const category = runtime.editor?.category || 'hull'
    const parts = partsInCategory(category)
    return `<div class="dock">
      <p class="kicker">Shipyard</p>
      <h2>${runtime.editor?.name || 'Hull'}</h2>
      <div class="row wrap">${PART_CATEGORIES.map((cat) => `<button data-nav data-act="cat" data-id="${cat}" class="${cat === category ? 'on' : ''}">${cat}</button>`).join('')}</div>
      <div class="list short">${parts.map((part) => `<button data-nav data-act="pick-part" data-id="${part.id}" class="${runtime.partPick === part.id ? 'on' : ''}">${part.name}<small>${ownedCount(state, part.id)} owned</small></button>`).join('')}</div>
      <div class="swatches">${swatches().map((color) => `<button data-act="swatch" data-id="${color}" style="background:${color}" class="${runtime.editor?.paint === color ? 'on' : ''}"></button>`).join('')}</div>
      <div class="stats">
        <span>Mass ${report.stats.mass}</span><span>TWR ${report.stats.twr}</span><span>Speed ${report.stats.topSpeed}</span>
        <span>Fuel ${report.stats.fuelCap}</span><span>Shield ${report.stats.shield}</span><span>Power ${report.stats.balance}</span>
        <span>Cargo ${report.stats.cargo}</span><span>Yaw ${report.stats.yawRate}</span>
      </div>
      <div class="errors">${(report.errors || []).map((error) => `<p>${error}</p>`).join('') || '<p class="ok">This hull can leave a well.</p>'}</div>
      <div class="row wrap">
        <button data-nav data-act="place-part">Place</button>
        <button data-nav data-act="erase-part">Lift</button>
        <button data-nav data-act="paint-part">Paint</button>
        <button data-nav data-act="mirror">${runtime.editor?.mirror ? 'Mirror on' : 'Mirror off'}</button>
        <button data-nav data-act="rot-part">Rotate</button>
        <button data-nav data-act="undo">Undo</button>
        <button data-nav data-act="redo">Redo</button>
      </div>
      <button data-nav data-act="save-bp">Save folio</button>
      <div class="list short">${(state.blueprints || []).map((entry) => `<button data-nav data-act="load-bp" data-id="${entry.name}">${entry.name}</button>`).join('')}</div>
      <button data-nav data-act="commit" class="primary">Fly this hull</button>
      <button data-nav data-act="editor-back">Back</button>
    </div>`
  }

  function stationScreen(state) {
    const market = ctx.session.market()
    return `<div class="dock station-dock">
      <p class="kicker">${state.systemName}</p>
      <h2>${ctx.session.galaxy.systems[state.systemIndex].station.name}</h2>
      <p>${state.credits} credit</p>
      <div class="row">
        <button data-nav data-act="refuel">Fill the tanks</button>
        <button data-nav data-act="yard-repair">Patch the hull</button>
        <button data-nav data-act="open-yard">Open the shipyard</button>
        <button data-nav data-act="launch">Cast off</button>
      </div>
      <div class="list short">${market.listings.slice(0, 12).map((row) => `<div class="trade"><span>${ITEMS[row.id]?.name || row.id}<small>${row.stock} in stock · buy ${row.buy} / sell ${row.sell}</small></span><button data-nav data-act="buy" data-id="${row.id}">Buy</button><button data-nav data-act="sell" data-id="${row.id}">Sell</button></div>`).join('')}</div>
      <h3>Hull folios</h3>
      ${market.blueprints.map((offer) => `<button data-nav data-act="buy-bp" data-id="${offer.id}" ${offer.sold ? 'disabled' : ''}>${offer.name} · ${offer.price}</button>`).join('')}
      ${(state.blueprints || []).map((entry) => `<button data-nav data-act="sell-bp" data-id="${entry.name}">Sell folio ${entry.name}</button>`).join('')}
    </div>`
  }

  function buildScreen(state, runtime) {
    const power = ctx.session.power()
    return `<div class="dock">
      <p class="kicker">Camp</p>
      <h2>${runtime.build.demolish ? 'Lifting' : 'Setting'} ${BLOCKS[runtime.build.blockId]?.name || ''}</h2>
      ${power ? `<p>Power ${power.produce} in / ${power.draw} out · stored ${power.stored}${power.powered ? ' · live' : ' · dark'}</p>` : '<p>No camp grid yet.</p>'}
      ${BLOCK_CATEGORIES.map((category) => `<div class="row wrap"><b>${category}</b>${Object.values(BLOCKS).filter((block) => block.category === category).map((block) => `<button data-nav data-act="pick-block" data-id="${block.id}" class="${runtime.build.blockId === block.id ? 'on' : ''}">${block.name}</button>`).join('')}</div>`).join('')}
      <div class="row">
        <button data-nav data-act="build-rot">Rotate</button>
        <button data-nav data-act="build-demo" class="${runtime.build.demolish ? 'on' : ''}">${runtime.build.demolish ? 'Lift mode' : 'Place mode'}</button>
        <button data-nav data-act="build-power" class="${runtime.build.power ? 'on' : ''}">Power overlay</button>
        <button data-nav data-act="build-exit">Done</button>
      </div>
    </div>`
  }

  function paintHud(state, runtime, mode) {
    const player = state.player
    root.querySelector('#where').textContent = state.location === 'surface'
      ? `${state.planetName} · ${BIOMES[state.biomeId]?.name || ''}`
      : state.location === 'station' ? 'At the bell' : state.systemName
    const day = state.params.dayLength || 480
    const clock = state.location === 'surface'
      ? (Math.floor((state.time % day) / day * 24)).toString().padStart(2, '0') + ':00'
      : state.location === 'space'
        ? `thrust ${Math.round((state.space.throttle || 0) * 100)} · ${Math.round(Math.hypot(state.space.velocity.x, state.space.velocity.y, state.space.velocity.z))}`
        : 'bell'
    root.querySelector('#clock').textContent = `${clock}${runtime.storm && runtime.storm !== 'clear' ? ' · ' + runtime.storm : ''}`
    const meters = [
      ['health', player.health, '#e85d4c'],
      ['shield', state.location === 'space' ? state.ship.shield : player.shields, '#8ecae6'],
      ['air', player.oxygen, '#2ec4b6'],
      ['hazard', player.hazard, '#ffd166'],
      ['hunger', player.hunger, '#f4a261'],
      ['thirst', player.thirst, '#4ea8de'],
      ['stamina', player.stamina, '#95d5b2'],
    ]
    root.querySelector('#meters').innerHTML = meters.map(([name, value, color]) => `<div class="meter"><i>${name}</i><span><b style="width:${Math.max(0, Math.min(100, value))}%;background:${color}"></b></span></div>`).join('')
    const now = state.time
    root.querySelector('#fx').innerHTML = (player.effects || []).filter((effect) => effect.until > now).map((effect) => {
      const def = EFFECT_DEFS[effect.id]
      return `<span class="effect e-${effect.id}" title="${def?.blurb || ''}">${def?.name || effect.id} ${Math.ceil(effect.until - now)}s</span>`
    }).join('')
    root.querySelector('#prompt').textContent = (runtime.prompt || []).join('   ·   ')
    root.querySelector('#feed').innerHTML = (runtime.notes || []).filter((note) => note.until > now).map((note) => `<p>${note.text}</p>`).join('')
    const hot = player.hotbar || []
    root.querySelector('#hot').innerHTML = hot.map((index, i) => {
      const slot = state.inventory.slots[index]
      return `<span class="${player.hotbarIndex === i ? 'on' : ''}"><b>${i + 1}</b>${slot ? ITEMS[slot.id]?.name || '' : '—'}</span>`
    }).join('') + `<em>${player.tool}</em>`
    const lead = runtime.lead
    root.querySelector('#target').textContent = lead ? `${lead.name} ${Math.round(lead.dist)}  ·  ${Math.ceil(lead.hp)}/${lead.maxHp}  · lead` : ''
    paintCompass(state, runtime)
    const wheel = root.querySelector('#wheel')
    wheel.hidden = !runtime.wheel
    if (runtime.wheel) {
      wheel.innerHTML = TOOLS.map((tool, index) => `<button class="${index === runtime.wheelIndex ? 'on' : ''}">${tool}</button>`).join('')
    }
    root.querySelector('#xhair').style.opacity = ['SPACE', 'SURFACE', 'BASE_BUILD'].includes(mode) ? '1' : '0'
  }

  function paintCompass(state, runtime) {
    const bar = root.querySelector('#compass-bar')
    const markers = []
    const yaw = state.location === 'surface' ? state.player.yaw : state.space.yaw
    const origin = state.location === 'surface' ? state.player.position : state.space.position
    if (state.location === 'surface' && state.park) markers.push({ name: 'kite', x: state.park.x, z: state.park.z })
    for (const base of state.bases || []) {
      if (base.systemIndex !== state.systemIndex || base.planetIndex !== state.planetIndex) continue
      if (base.pieces[0]) markers.push({ name: 'camp', x: base.pieces[0].x, z: base.pieces[0].z })
    }
    if (runtime.scanPulse > 0 || state.player.flareUntil > state.time) {
      // veins are discovered by being near; compass shows the nearest deposit hint from notes only
    }
    bar.innerHTML = markers.map((marker) => {
      const bearing = Math.atan2(marker.x - origin.x, marker.z - origin.z)
      let rel = bearing - yaw
      while (rel > Math.PI) rel -= Math.PI * 2
      while (rel < -Math.PI) rel += Math.PI * 2
      if (Math.abs(rel) > 1.4) return ''
      const left = 50 + (rel / 1.4) * 46
      return `<i style="left:${left}%">${marker.name}</i>`
    }).join('')
  }

  function moveFocus(input) {
    const mode = ctx.machine.state
    if (mode === 'SHIP_EDITOR') return
    const nodes = [...root.querySelectorAll('#screen [data-nav]:not([disabled])')]
    if (!nodes.length) return
    if (input.pressed('uiDown')) focus = (focus + 1) % nodes.length
    if (input.pressed('uiUp')) focus = (focus + nodes.length - 1) % nodes.length
    nodes.forEach((node, index) => node.classList.toggle('nav-focus', index === focus))
    if (input.pressed('uiConfirm')) nodes[Math.min(focus, nodes.length - 1)]?.click()
    const current = nodes[Math.min(focus, nodes.length - 1)]
    if (current && (input.pressed('uiLeft') || input.pressed('uiRight'))) {
      if (current.dataset.act === 'nudge') act({ act: 'nudge', key: current.dataset.key, dir: input.pressed('uiLeft') ? '-1' : '1' })
      if (current.dataset.act === 'step') act({ act: 'step', key: current.dataset.key, dir: input.pressed('uiLeft') ? '-1' : '1', step: current.dataset.step })
    }
  }

  function act(data) {
    const state = ctx.session.state
    const runtime = ctx.session.runtime
    ctx.audio.resume()
    ctx.audio.play('ui')
    stamp = ''
    if (data.act === 'modes') ctx.machine.force('MODE_SELECT')
    else if (data.act === 'back-title' || data.act === 'title') {
      if (state) state.menu = null
      ctx.machine.force('TITLE')
    } else if (data.act === 'pick-mode') {
      const custom = data.id === 'custom' ? { ...draft } : null
      ctx.session.newGame({ modeId: data.id, custom, slot: 0, seed: (Math.random() * 4294967295) >>> 0 })
    } else if (data.act === 'nudge') nudge(data.key, Number(data.dir))
    else if (data.act === 'toggle') draft[data.key] = !draft[data.key]
    else if (data.act === 'load') {
      const res = ctx.session.loadGame(Number(data.id))
      if (!res.ok) ctx.session.runtime.notes.unshift({ text: res.error, until: 4 })
    } else if (data.act === 'open-import') showImport = !showImport
    else if (data.act === 'do-import') {
      const text = root.querySelector('#import-text')?.value || ''
      try { ctx.session.importSlot(text, 0) } catch (error) { alert(error.message) }
    } else if (data.act === 'resume') ctx.machine.resume()
    else if (data.act === 'save' && state) {
      const res = ctx.session.saveGame(state.slot || 0)
      ctx.bus.emit('notify', { text: res.ok ? 'The drawer took the log.' : res.error })
    } else if (data.act === 'menu') state.menu = data.id
    else if (data.act === 'close') state.menu = null
    else if (data.act === 'close-map') ctx.machine.force(state.location === 'surface' ? 'SURFACE' : state.location === 'station' ? 'STATION' : 'SPACE')
    else if (data.act === 'export' && state) {
      ctx.session.saveGame(state.slot || 0)
      const text = ctx.session.exportSlot(state.slot || 0)
      navigator.clipboard?.writeText(text).catch(() => {})
      const blob = new Blob([text], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `vesper-reach-slot-${(state.slot || 0) + 1}.json`
      link.click()
      URL.revokeObjectURL(url)
    } else if (data.act === 'respawn') {
      ctx.session.respawn()
      if (ctx.machine.state === 'DEAD') ctx.machine.force(state?.location === 'surface' ? 'SURFACE' : 'SPACE')
    } else if (data.act === 'craft') {
      const res = ctx.session.craft(data.id)
      ctx.bus.emit('notify', { text: res.ok ? `Made ${res.name || 'it'}${res.queued ? ' — the machine is working' : ''}.` : res.error })
    } else if (data.act === 'unlock') {
      const res = ctx.session.unlock(data.id)
      if (!res.ok) ctx.bus.emit('notify', { text: res.error })
    } else if (data.act === 'use' && state) {
      const index = state.player.hotbar?.[state.player.hotbarIndex] ?? state.inventory.selected ?? 0
      const res = useItem(state, index)
      ctx.bus.emit('notify', { text: res.ok ? `Used ${res.name}.` : res.error })
    } else if (data.act === 'select-slot' && state) {
      if (data.bag === 'inv') {
        state.inventory.selected = Number(data.id)
        if (state.player.hotbar) state.player.hotbar[state.player.hotbarIndex] = Number(data.id)
      }
    } else if (data.act === 'pick-system') runtime.mapIndex = Number(data.id)
    else if (data.act === 'warp') {
      const res = ctx.session.requestWarp(runtime.mapIndex || 0)
      if (!res.ok) ctx.bus.emit('notify', { text: res.error })
    } else if (data.act === 'buy') note(ctx.session.buy(data.id))
    else if (data.act === 'sell') note(ctx.session.sell(data.id))
    else if (data.act === 'buy-bp') note(ctx.session.buyBlueprint(data.id))
    else if (data.act === 'sell-bp') note(ctx.session.sellBlueprint(data.id))
    else if (data.act === 'refuel') note(ctx.session.refuel())
    else if (data.act === 'yard-repair') note(ctx.session.repair())
    else if (data.act === 'open-yard') {
      ctx.session.editorReport()
      ctx.machine.force('SHIP_EDITOR')
    } else if (data.act === 'launch') note(ctx.session.requestLaunch())
    else if (data.act === 'cat' && runtime.editor) {
      runtime.editor.category = data.id
      const first = partsInCategory(data.id)[0]
      if (first) runtime.partPick = first.id
    } else if (data.act === 'pick-part') runtime.partPick = data.id
    else if (data.act === 'swatch' && runtime.editor) runtime.editor.paint = data.id
    else if (data.act === 'place-part') note(ctx.session.editorPlace(runtime.partPick))
    else if (data.act === 'erase-part') note(ctx.session.editorErase())
    else if (data.act === 'paint-part') note(ctx.session.editorPaint())
    else if (data.act === 'mirror' && runtime.editor) runtime.editor.mirror = !runtime.editor.mirror
    else if (data.act === 'rot-part' && runtime.editor) runtime.editor.rot = (runtime.editor.rot + 1) % 4
    else if (data.act === 'undo') note(ctx.session.editorUndo())
    else if (data.act === 'redo') note(ctx.session.editorRedo())
    else if (data.act === 'save-bp') note(ctx.session.saveBlueprint(runtime.editor?.name || 'Paper folio'))
    else if (data.act === 'load-bp') note(ctx.session.loadBlueprint(data.id))
    else if (data.act === 'commit') {
      const res = ctx.session.editorCommit()
      if (!res.ok) ctx.bus.emit('notify', { text: res.errors?.[0] || 'The hull is not ready.' })
      else ctx.bus.emit('notify', { text: 'The kite accepts the new bones.' })
    } else if (data.act === 'editor-back') ctx.machine.force(state.location === 'station' ? 'STATION' : 'SURFACE')
    else if (data.act === 'pick-block') runtime.build.blockId = data.id
    else if (data.act === 'build-rot') runtime.build.rot = (runtime.build.rot + 1) % 4
    else if (data.act === 'build-demo') runtime.build.demolish = !runtime.build.demolish
    else if (data.act === 'build-power') runtime.build.power = !runtime.build.power
    else if (data.act === 'build-exit') ctx.machine.force('SURFACE')
    else if (data.act === 'quality') {
      ctx.settings.graphics = data.id
      if (data.id === 'low') ctx.settings.renderDistance = 2
      if (data.id === 'medium') ctx.settings.renderDistance = 3
      if (data.id === 'high') ctx.settings.renderDistance = 5
      ctx.saveSettings()
    } else if (data.act === 'scheme') {
      ctx.settings.flight.scheme = data.id
      if (state) state.flight.scheme = data.id
      ctx.saveSettings()
    } else if (data.act === 'assist') {
      ctx.settings.flight.assist = !ctx.settings.flight.assist
      if (state) state.flight.assist = ctx.settings.flight.assist
      ctx.saveSettings()
    } else if (data.act === 'throttle') {
      ctx.settings.flight.throttleMode = data.id
      if (state) state.flight.throttleMode = data.id
      ctx.saveSettings()
    } else if (data.act === 'step') stepSetting(data.key, Number(data.dir), Number(data.step))
    else if (data.act === 'rebind') rebind = data.id
  }

  function note(res) {
    if (!res) return
    if (res.ok === false && res.error) ctx.bus.emit('notify', { text: res.error })
    else if (res.ok && res.name) ctx.bus.emit('notify', { text: res.name })
    else if (res.errors) ctx.bus.emit('notify', { text: res.errors[0] || 'Done.' })
  }

  function nudge(key, dir) {
    const field = CUSTOM_FIELDS.find((entry) => entry.key === key)
    if (!field) return
    const next = Math.max(field.min, Math.min(field.max, (draft[key] ?? field.min) + dir * field.step))
    draft[key] = Math.round(next / field.step) * field.step
  }

  function stepSetting(key, dir, step) {
    if (key.startsWith('vol:')) {
      const name = key.slice(4)
      const value = ctx.settings.volumes[name] ?? 0.5
      ctx.settings.volumes[name] = Math.max(0, Math.min(1, Math.round((value + dir * step) * 100) / 100))
    } else if (key === 'lookSensitivity') {
      ctx.settings.lookSensitivity = Math.max(0.0004, Math.min(0.01, ctx.settings.lookSensitivity + dir * step))
    } else if (key === 'gamepadDeadzone') {
      ctx.settings.gamepadDeadzone = Math.max(0, Math.min(0.6, ctx.settings.gamepadDeadzone + dir * step))
    } else if (key === 'fov') {
      ctx.settings.fov = Math.max(50, Math.min(100, ctx.settings.fov + dir * step))
    } else if (key === 'renderDistance') {
      ctx.settings.renderDistance = Math.max(2, Math.min(6, ctx.settings.renderDistance + dir * step))
    }
    ctx.saveSettings()
  }

  function transfer(from, to) {
    const state = ctx.session.state
    if (from.kind === 'inv' && to.kind === 'inv') {
      moveSlot(state, from.index, to.index)
      return
    }
    const store = findStorage(state, ctx.session.runtime)
    if (!store) return
    const bag = from.kind === 'store' ? store.slots : state.inventory.slots
    const other = to.kind === 'store' ? store.slots : state.inventory.slots
    const a = bag[from.index]
    const b = other[to.index]
    if (a && b && a.id === b.id) {
      const max = ITEMS[a.id]?.stack || 20
      const moved = Math.min(max - b.count, a.count)
      b.count += moved
      a.count -= moved
      if (a.count <= 0) bag[from.index] = null
      return
    }
    bag[from.index] = b || null
    other[to.index] = a || null
  }

  function findStorage(state, runtime) {
    for (const base of state.bases || []) {
      const piece = base.pieces.find((entry) => entry.uid === runtime.storageUid && entry.slots)
      if (piece) return piece
    }
    for (const base of state.bases || []) {
      const piece = base.pieces.find((entry) => entry.slots)
      if (piece) return piece
    }
    return null
  }

  return { update, eat }
}
