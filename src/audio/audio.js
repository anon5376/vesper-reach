import { rngFrom } from '../rng/rng.js'

export function createAudio(getSettings) {
  let ctx = null
  let master = null
  let sfxBus = null
  let ambientBus = null
  let uiBus = null
  let drone = null
  let thruster = null
  let weather = null
  let started = false

  function ensure() {
    if (ctx || typeof window === 'undefined') return
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain()
    sfxBus = ctx.createGain()
    ambientBus = ctx.createGain()
    uiBus = ctx.createGain()
    sfxBus.connect(master)
    ambientBus.connect(master)
    uiBus.connect(master)
    master.connect(ctx.destination)

    const o1 = ctx.createOscillator()
    const o2 = ctx.createOscillator()
    const g = ctx.createGain()
    o1.type = 'sine'
    o2.type = 'triangle'
    o1.frequency.value = 74
    o2.frequency.value = 77.5
    g.gain.value = 0.03
    o1.connect(g)
    o2.connect(g)
    g.connect(ambientBus)
    o1.start()
    o2.start()
    drone = { o1, o2, g }

    const thr = ctx.createOscillator()
    const tg = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    thr.type = 'sawtooth'
    thr.frequency.value = 90
    filter.type = 'lowpass'
    filter.frequency.value = 240
    tg.gain.value = 0
    thr.connect(filter)
    filter.connect(tg)
    tg.connect(sfxBus)
    thr.start()
    thruster = { thr, tg, filter }

    const noise = ctx.createBufferSource()
    noise.buffer = makeNoise(ctx, rngFrom(7, 'air'))
    noise.loop = true
    const ng = ctx.createGain()
    const nf = ctx.createBiquadFilter()
    nf.type = 'bandpass'
    nf.frequency.value = 500
    ng.gain.value = 0
    noise.connect(nf)
    nf.connect(ng)
    ng.connect(ambientBus)
    noise.start()
    weather = { ng, nf }
    applyVolumes()
  }

  function makeNoise(context, rng) {
    const rate = context.sampleRate
    const buffer = context.createBuffer(1, rate * 2, rate)
    const data = buffer.getChannelData(0)
    let v = 0
    for (let i = 0; i < data.length; i++) {
      v = v * 0.96 + (rng.next() * 2 - 1) * 0.04
      data[i] = v * 3.2
    }
    return buffer
  }

  function applyVolumes() {
    if (!ctx) return
    const volumes = getSettings().volumes || {}
    master.gain.value = volumes.master ?? 0.8
    sfxBus.gain.value = volumes.sfx ?? 0.7
    ambientBus.gain.value = volumes.ambient ?? 0.5
    uiBus.gain.value = volumes.ui ?? 0.7
  }

  function blip(freq, dur, type, busNode, vol) {
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    gain.gain.setValueAtTime(vol, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
    osc.connect(gain)
    gain.connect(busNode)
    osc.start()
    osc.stop(ctx.currentTime + dur + 0.02)
  }

  const api = {
    ensure,
    resume() {
      try {
        ensure()
        if (ctx && ctx.state === 'suspended') ctx.resume()
        started = true
      } catch { /* audio is optional if the desk has no speakers */ }
    },
    update(state, mode) {
      if (!started) return
      ensure()
      applyVolumes()
      if (!drone) return
      const surface = state && (mode === 'SURFACE' || mode === 'BASE_BUILD')
      const space = mode === 'SPACE' || mode === 'TITLE' || mode === 'MODE_SELECT' || mode === 'GALAXY_MAP'
      drone.o1.frequency.value = surface ? 92 : space ? 70 : 64
      drone.o2.frequency.value = surface ? 98 : 81
      drone.g.gain.value = mode === 'PAUSED' || mode === 'SHIP_EDITOR' ? 0.012 : 0.034
      const throttle = state?.space?.throttle || 0
      if (thruster) {
        const on = mode === 'SPACE' ? throttle : 0
        thruster.tg.gain.value = on * 0.045
        thruster.thr.frequency.value = 70 + on * 90
        thruster.filter.frequency.value = 180 + on * 700
      }
      if (weather) {
        const storm = state?.weather && state.weather.kind !== 'clear' && surface
        weather.ng.gain.value = storm ? 0.08 : 0
      }
    },
    play(name) {
      try {
        api.resume()
        if (!ctx) return
        if (name === 'ui') blip(620, 0.07, 'square', uiBus, 0.05)
        else if (name === 'mine') blip(120 + Math.random() * 40, 0.09, 'sawtooth', sfxBus, 0.04)
        else if (name === 'laser') blip(880, 0.08, 'square', sfxBus, 0.045)
        else if (name === 'cannon') blip(70, 0.22, 'sawtooth', sfxBus, 0.07)
        else if (name === 'scan') blip(540, 0.16, 'sine', sfxBus, 0.05)
        else if (name === 'warp') {
          blip(180, 0.4, 'sawtooth', sfxBus, 0.06)
          blip(640, 0.5, 'triangle', sfxBus, 0.04)
        }
      } catch { /* ignore */ }
    },
  }
  return api
}
