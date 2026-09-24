import { DEFAULT_BINDINGS, GAMEPAD_BUTTONS, labelFor } from '../data/bindings.js'

function dead(v, dz) {
  if (Math.abs(v) < dz) return 0
  const s = Math.sign(v)
  return s * ((Math.abs(v) - dz) / (1 - dz))
}

export function createInput(getSettings) {
  const down = new Set()
  const pressed = new Set()
  const released = new Set()
  let lookX = 0
  let lookY = 0
  let wheel = 0
  let locked = false
  const pointer = { x: 0, y: 0, left: false, right: false }
  let fakePad = null
  const buttonEdges = new Map()

  const settings = () => getSettings()

  function codesFor(action) {
    const bindings = settings().bindings || DEFAULT_BINDINGS
    return bindings[action] || DEFAULT_BINDINGS[action] || []
  }

  function isDown(action) {
    return codesFor(action).some((code) => down.has(code))
  }

  function wasPressed(action) {
    return codesFor(action).some((code) => pressed.has(code))
  }

  function pad() {
    if (fakePad) return fakePad
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    for (const gp of pads) if (gp) return gp
    return null
  }

  function axis(index) {
    const gp = pad()
    if (!gp) return 0
    return dead(gp.axes[index] || 0, settings().gamepadDeadzone ?? 0.18)
  }

  function moveAxes() {
    let x = axis(0)
    let y = axis(1)
    if (isDown('right') || isDown('strafeRight')) x += 1
    if (isDown('left') || isDown('strafeLeft')) x -= 1
    if (isDown('forward') || isDown('thrustForward')) y -= 1
    if (isDown('back') || isDown('thrustBack')) y += 1
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }
  }

  function onKeyDown(e) {
    if (e.repeat) return
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      if (e.code !== 'Escape') return
    }
    down.add(e.code)
    pressed.add(e.code)
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
      e.preventDefault()
    }
  }

  function onKeyUp(e) {
    down.delete(e.code)
    released.add(e.code)
  }

  function onMouseDown(e) {
    const code = `Mouse${e.button}`
    down.add(code)
    pressed.add(code)
    if (e.button === 0) pointer.left = true
    if (e.button === 2) pointer.right = true
  }

  function onMouseUp(e) {
    const code = `Mouse${e.button}`
    down.delete(code)
    released.add(code)
    if (e.button === 0) pointer.left = false
    if (e.button === 2) pointer.right = false
  }

  function onMove(e) {
    pointer.x = e.clientX
    pointer.y = e.clientY
    if (document.pointerLockElement) {
      lookX += e.movementX || 0
      lookY += e.movementY || 0
    }
  }

  function onWheel(e) {
    wheel += Math.sign(e.deltaY)
  }

  function onLock() {
    locked = document.pointerLockElement != null
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('wheel', onWheel, { passive: true })
  window.addEventListener('contextmenu', (e) => e.preventDefault())
  document.addEventListener('pointerlockchange', onLock)

  function pollGamepadEdges() {
    const gp = pad()
    if (!gp) return
    gp.buttons.forEach((button, index) => {
      const action = GAMEPAD_BUTTONS[index]
      if (!action) return
      const was = buttonEdges.get(index) || false
      const now = !!button.pressed
      buttonEdges.set(index, now)
      if (now && !was) pressed.add(`Pad:${action}`)
      if (now) down.add(`Pad:${action}`)
      else down.delete(`Pad:${action}`)
    })
  }

  const api = {
    get locked() { return locked },
    pointer,
    isDown(action) {
      if (down.has(`Pad:${action}`)) return true
      return isDown(action)
    },
    pressed(action) {
      if (pressed.has(`Pad:${action}`)) return true
      return wasPressed(action)
    },
    consumeLook() {
      const sens = settings().lookSensitivity ?? 0.0022
      const gx = axis(2) * 900 * (settings().lookSensitivity / 0.0022)
      const gy = axis(3) * 700 * (settings().lookSensitivity / 0.0022)
      const out = { x: lookX * sens + gx * 0.016, y: lookY * sens + gy * 0.016 }
      lookX = 0
      lookY = 0
      return out
    },
    consumeWheel() {
      const w = wheel
      wheel = 0
      return w
    },
    moveAxes,
    axis,
    bindingLabel(action) {
      const codes = codesFor(action)
      return labelFor(codes[0])
    },
    exportBindings() {
      return structuredClone(settings().bindings || DEFAULT_BINDINGS)
    },
    rebind(action, code) {
      const bindings = settings().bindings
      if (!bindings[action]) bindings[action] = []
      bindings[action] = [code]
    },
    setFakePad(padState) {
      fakePad = padState
    },
    clearFakePad() {
      fakePad = null
    },
    update() {
      pollGamepadEdges()
    },
    pressedCodes() {
      return [...pressed]
    },
    endFrame() {
      pressed.clear()
      released.clear()
    },
    requestLock(canvas) {
      if (!canvas || document.pointerLockElement) return
      const p = canvas.requestPointerLock()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    },
    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock()
    },
  }
  return api
}
