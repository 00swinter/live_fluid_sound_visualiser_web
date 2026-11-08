import { audio, type AudioListenOptions } from '../audio/session.svelte'
import type { AudioFrame } from '../audio/analyze'
import type { FluidColor, FluidSim } from '../fluid/createFluidSim'
import { actionParams, clickAction, dyeFromColor, easeBlend, holdAction, snapControl, splatColor, type EaseMode, type PaintState, type PresetNumberSetting } from '../behaviors'
import type { HeldButtons } from '../input/pointerInput'
import { symmetryStrokes } from '../input/cursorSymmetry'
import { watchPointer } from '../input/pointerInput'
import { applySettings, defaultAudio, defaultSplatColors, splatColorMode, type AudioMap, type ButtonSlot, type DriveSource, type Preset } from '../presets/types'

const SLOTS: ButtonSlot[] = ['left', 'right', 'middle']

/** Movement can paint and map screen position. Buttons and the wheel read the active preset. The bottom-left corner steps through presets with the wheel. A middle click there reloads the random preset. */
export function playPreset(
  canvas: HTMLCanvasElement,
  sim: FluidSim,
  getPreset: () => Preset,
  stepPreset: (direction: 1 | -1) => void,
  loadRandomPreset: () => void,
): () => void {
  applySettings(sim, getPreset().settings)

  let held: HeldButtons = { left: false, right: false, middle: false }
  let colorIndex = 0
  let colorArmed = false
  let colorPreset = ''
  let cyclePhase = 0
  let cycleAt = 0
  let seenColorMode: '' | 'click' | 'cycle' = ''
  let transitions: ActiveTransition[] = []
  let transitionPreset = ''
  let frame = 0
  let timers: number[] = []
  let pitch = 0
  let swirl = Math.random() * Math.PI * 2
  let beatBrush = 0
  let beatBrushAt = 0
  let driven: PresetNumberSetting[] = []
  let drivenValue = new Map<PresetNumberSetting, number>()
  let pulsePreset = ''
  let pulses = new Map<PresetNumberSetting, { home: number; generation: number }>()
  let cornerWheel = 0
  let physicalMiddle = false
  /** Middle click in the corner loads random and must not also run the middle binding. */
  let cornerMiddle = false

  const stopPointer = watchPointer(canvas, {
    onMove(move) {
      if (move.dx === 0 && move.dy === 0) return
      const buttons = liveButtons(move.buttons)
      const preset = getPreset()
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width > 0) applyMapped(preset.cursor.x, clamp(move.x / width, 0, 1), buttons)
      if (height > 0) applyMapped(preset.cursor.y, clamp(move.y / height, 0, 1), buttons)
      const paint = collectHold(buttons, move)
      sim.set('SPLAT_RADIUS', paint.radius ?? getPreset().settings.SPLAT_RADIUS)
      if (!paint.paint) return
      const color = currentColor()
      const force = paint.force
      for (const stroke of symmetryStrokes(preset.cursor.symmetry, move.x, move.y, move.dx * force, move.dy * force, width, height)) {
        sim.splat(stroke.x, stroke.y, stroke.dx, stroke.dy, color)
      }
    },
    onButtons(next, point) {
      const middlePressed = !physicalMiddle && next.middle
      physicalMiddle = next.middle
      if (middlePressed && inPresetCorner(point.x, point.y, canvas.clientWidth, canvas.clientHeight)) {
        cornerMiddle = true
        resetLiveState()
        loadRandomPreset()
      }
      if (!next.middle) cornerMiddle = false
      const buttons = liveButtons(next)
      const preset = getPreset()
      const mode = noteColorMode(preset)
      if (mode === 'click' && paintPressed(preset, held, buttons)) stepClickColor(listedColors(preset).length)
      const ctx = actionContext(point)
      for (const slot of SLOTS) {
        const binding = preset[slot]
        if (!held[slot] && buttons[slot]) {
          const action = clickAction(binding.click)
          if (action) action.onPress(ctx, actionParams(action, binding.clickParams))
        }
        if (held[slot] && !buttons[slot]) {
          const action = holdAction(binding.hold)
          if (action?.onRelease) action.onRelease(ctx, actionParams(action, binding.holdParams))
        }
      }
      held = { ...buttons }
      syncRadius(held, point)
    },
    onWheel(wheel) {
      if (inPresetCorner(wheel.x, wheel.y, canvas.clientWidth, canvas.clientHeight)) {
        cornerWheel += wheel.notches
        const steps = Math.trunc(cornerWheel)
        if (steps !== 0) {
          cornerWheel -= steps
          const direction = steps > 0 ? 1 : -1
          for (let i = 0; i < Math.abs(steps); i += 1) stepPreset(direction)
        }
        return
      }
      cornerWheel = 0
      const preset = getPreset()
      const key = preset.scroll.setting
      const next = clamp(
        preset.settings[key] + wheel.notches * preset.scroll.sensitivity,
        preset.scroll.min,
        preset.scroll.max,
      )
      preset.settings[key] = next
      if (key === 'SPLAT_RADIUS') syncRadius(held, { x: 0, y: 0 })
      else sim.set(key, next)
      collectHold(held, { x: 0, y: 0 })
    },
  })

  audio.setBeatInput(readAudioOptions)
  const stopAudio = audio.watch(onAudio)

  return () => {
    stopPointer()
    stopAudio()
    audio.setBeatInput(null)
    for (const handle of timers) window.clearTimeout(handle)
    timers = []
    transitions = []
    pulses.clear()
    restoreDriven()
    stopFrame()
  }

  /** Drop in-flight pulses and transitions so a fresh roll of the same preset is not overwritten. */
  function resetLiveState() {
    for (const handle of timers) window.clearTimeout(handle)
    timers = []
    transitions = []
    pulses.clear()
    colorPreset = ''
    transitionPreset = ''
    pulsePreset = ''
    stopFrame()
  }

  function liveButtons(buttons: HeldButtons): HeldButtons {
    return cornerMiddle ? { ...buttons, middle: false } : buttons
  }

  function currentColor() {
    const preset = getPreset()
    noteColorMode(preset)
    if (preset.audio?.colorFromPitch && audio.source !== 'off') return splatColor(preset.splat.dye, pitch)
    return paletteColor(preset)
  }

  function noteColorMode(preset: Preset) {
    if (preset.id !== colorPreset) {
      colorPreset = preset.id
      colorIndex = 0
      colorArmed = false
      cyclePhase = 0
      cycleAt = 0
      seenColorMode = ''
    }
    const colors = listedColors(preset)
    const mode = splatColorMode(preset.splat)
    if (seenColorMode === 'cycle' && mode === 'click' && colors.length) {
      colorIndex = Math.floor(cyclePhase) % colors.length
      colorArmed = false
    }
    if (seenColorMode === 'click' && mode === 'cycle') {
      cyclePhase = colors.length ? colorIndex % colors.length : 0
      cycleAt = performance.now()
    }
    seenColorMode = mode
    return mode
  }

  /** The first stroke keeps the current color. Each later press of the paint button moves to the next one. */
  function stepClickColor(count: number) {
    if (count < 2) return
    colorIndex %= count
    if (colorArmed) colorIndex = (colorIndex + 1) % count
    colorArmed = true
  }

  function paletteColor(preset: Preset): FluidColor {
    const colors = listedColors(preset)
    const dye = preset.splat.dye
    if (!colors.length) return dyeFromColor(0xffffff, dye)
    const mode = splatColorMode(preset.splat)
    if (mode === 'cycle' && colors.length > 1) {
      const now = performance.now()
      const dt = cycleAt ? Math.max(0, (now - cycleAt) / 1000) : 0
      cycleAt = now
      const seconds = Math.max(0.05, preset.splat.cycleSeconds || 8)
      cyclePhase = (cyclePhase + (dt / seconds) * colors.length) % colors.length
      const index = Math.floor(cyclePhase) % colors.length
      const next = (index + 1) % colors.length
      const t = cyclePhase - Math.floor(cyclePhase)
      const eased = t * t * (3 - 2 * t)
      return dyeBlend(colors[index], colors[next], eased, dye)
    }
    return dyeFromColor(colors[colorIndex % colors.length] ?? colors[0], dye)
  }

  function readAudioOptions(): AudioListenOptions {
    const cfg = getPreset().audio ?? defaultAudio
    return {
      gain: cfg.gain,
      floor: cfg.floor,
      sensitivity: cfg.beatSensitivity,
      cooldown: cfg.beatCooldown,
    }
  }

  function onAudio(frame: AudioFrame) {
    const preset = getPreset()
    const cfg = preset.audio ?? defaultAudio
    pitch = frame.pitch
    if (audio.source === 'off') {
      restoreDriven()
      beatBrush = 0
      beatBrushAt = 0
      return
    }
    const next = new Set<PresetNumberSetting>()
    applyBand(cfg.level, frame.level, next)
    applyBand(cfg.bass, frame.bass, next)
    applyBand(cfg.mid, frame.mid, next)
    applyBand(cfg.treble, frame.treble, next)
    for (const key of driven) {
      if (!next.has(key)) sim.set(key, getPreset().settings[key])
    }
    driven = [...next]
    if (frame.beat && cfg.beat) {
      const action = clickAction(cfg.beat)
      if (action) {
        action.onPress(
          actionContext({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }),
          actionParams(action, cfg.beatParams),
        )
      }
    }
    driveFluid(frame)
  }

  function applyBand(map: AudioMap, amount: number, drivenKeys: Set<PresetNumberSetting>) {
    if (!map.enabled) return
    const key = map.setting
    const next = snapControl(key, clamp(map.min + (map.max - map.min) * amount, map.min, map.max))
    drivenKeys.add(key)
    const reallocates = key === 'BLOOM_ITERATIONS' || key === 'BLOOM_RESOLUTION'
    if (reallocates && drivenValue.get(key) === next) return
    drivenValue.set(key, next)
    sim.set(key, next)
  }

  function restoreDriven() {
    if (!driven.length) return
    const preset = getPreset()
    for (const key of driven) {
      drivenValue.delete(key)
      sim.set(key, preset.settings[key])
    }
    driven = []
  }

  function driveFluid(frame: AudioFrame) {
    const drive = getPreset().audio?.drive
    const amount = drive?.enabled ? driveAmount(drive.source ?? 'bass', frame) : 0
    if (!drive?.enabled || amount < 0.02) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width < 2 || height < 2) return
    swirl += 0.05 + amount * 0.45
    const reach = Math.min(width, height) * (0.08 + amount * 0.28)
    const x = width * 0.5 + Math.cos(swirl) * reach
    const y = height * 0.5 + Math.sin(swirl * 0.87) * reach
    const speed = drive.force * amount * (frame.beat ? 620 : 260)
    const color = currentColor()
    const dye = drive.dye * (0.35 + amount * 0.65)
    color.r *= dye
    color.g *= dye
    color.b *= dye
    sim.splat(x, y, Math.cos(swirl) * speed, Math.sin(swirl) * speed, color)
    sim.splat(width - x, height - y, -Math.cos(swirl) * speed * 0.65, -Math.sin(swirl) * speed * 0.65, color)
  }

  function driveAmount(source: DriveSource, frame: AudioFrame) {
    if (source !== 'beat') {
      beatBrush = 0
      beatBrushAt = 0
      if (source === 'voice') return frame.mid
      if (source === 'highs') return frame.treble
      if (source === 'loudness') return frame.level
      return frame.bass
    }
    const now = performance.now()
    const dt = beatBrushAt ? Math.min(0.05, Math.max(0, (now - beatBrushAt) / 1000)) : 0.016
    beatBrushAt = now
    if (frame.beat) beatBrush = 1
    else beatBrush *= Math.exp(-dt / 0.14)
    return beatBrush
  }

  function actionContext(point: { x: number; y: number; dx?: number; dy?: number }) {
    const preset = getPreset()
    return {
      sim,
      x: point.x,
      y: point.y,
      dx: point.dx ?? 0,
      dy: point.dy ?? 0,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      dye: preset.splat.dye,
      getNumber,
      setNumber,
      transitionTarget,
      animateNumber,
      pulseNumber,
    }
  }

  function after(seconds: number, run: () => void) {
    const id = getPreset().id
    const handle = window.setTimeout(() => {
      timers = timers.filter((item) => item !== handle)
      if (getPreset().id !== id) return
      run()
    }, Math.max(0, seconds) * 1000)
    timers.push(handle)
  }

  function pulseNumber(key: PresetNumberSetting, peak: number, seconds: number) {
    const preset = getPreset()
    if (preset.id !== pulsePreset) {
      pulses = new Map()
      pulsePreset = preset.id
    }
    let state = pulses.get(key)
    if (!state) {
      state = { home: getNumber(key), generation: 0 }
      pulses.set(key, state)
    }
    state.generation += 1
    const generation = state.generation
    const home = state.home
    const hold = Math.max(0.05, seconds)
    animateNumber(key, peak, 0, 'linear')
    after(0.03, () => {
      if (getPreset().id !== preset.id || pulses.get(key)?.generation !== generation) return
      animateNumber(key, home, hold, 'easeOut')
      after(hold + 0.03, () => {
        if (pulses.get(key)?.generation !== generation) return
        pulses.delete(key)
      })
    })
  }

  function getNumber(key: PresetNumberSetting) {
    return getPreset().settings[key]
  }

  function setNumber(key: PresetNumberSetting, value: number) {
    const preset = getPreset()
    const next = snapControl(key, value)
    if (preset.settings[key] === next) return
    preset.settings[key] = next
    sim.set(key, next)
  }

  function transitionTarget(key: PresetNumberSetting) {
    if (getPreset().id !== transitionPreset) return null
    return transitions.find((item) => item.key === key)?.to ?? null
  }

  function animateNumber(key: PresetNumberSetting, value: number, seconds: number, easing: string) {
    const target = snapControl(key, value)
    const mode: EaseMode =
      easing === 'easeIn' || easing === 'easeOut' || easing === 'easeInOut' || easing === 'constant' || easing === 'linear'
        ? easing
        : 'easeInOut'
    const existing = transitions.find((item) => item.key === key)
    if (existing && existing.to === target && existing.easing === mode && getPreset().id === transitionPreset) return
    transitions = transitions.filter((item) => item.key !== key)
    const from = getNumber(key)
    const duration = Math.max(0, seconds) * 1000
    if (duration === 0 || from === target) {
      setNumber(key, target)
      if (!transitions.length) stopFrame()
      return
    }
    transitionPreset = getPreset().id
    transitions.push({ key, from, to: target, start: performance.now(), duration, easing: mode })
    startFrame()
  }

  function startFrame() {
    if (frame) return
    frame = requestAnimationFrame(tick)
  }

  function stopFrame() {
    if (!frame) return
    cancelAnimationFrame(frame)
    frame = 0
  }

  function tick(now: number) {
    frame = 0
    if (getPreset().id !== transitionPreset) {
      transitions = []
      return
    }
    const pending: ActiveTransition[] = []
    for (const item of transitions) {
      const amount = item.duration <= 0 ? 1 : Math.min(1, (now - item.start) / item.duration)
      const value = amount >= 1 ? item.to : item.from + (item.to - item.from) * easeBlend(amount, item.easing)
      setNumber(item.key, value)
      if (amount < 1) pending.push(item)
    }
    transitions = pending
    if (transitions.length) frame = requestAnimationFrame(tick)
  }

  function collectHold(buttons: HeldButtons, point: { x: number; y: number; dx?: number; dy?: number }): PaintState {
    const preset = getPreset()
    const paint: PaintState = { paint: cursorPaints(preset, buttons), force: preset.splat.force, radius: null }
    for (const slot of SLOTS) {
      if (!buttons[slot]) continue
      const binding = preset[slot]
      const action = holdAction(binding.hold)
      if (!action) continue
      action.onHold(actionContext(point), actionParams(action, binding.holdParams), paint)
    }
    return paint
  }

  function syncRadius(buttons: HeldButtons, point: { x: number; y: number }) {
    const paint = collectHold(buttons, point)
    sim.set('SPLAT_RADIUS', paint.radius ?? getPreset().settings.SPLAT_RADIUS)
  }

  function applyMapped(axis: Preset['cursor']['x'], amount: number, buttons: HeldButtons) {
    if (!axis.enabled) return
    const preset = getPreset()
    const key = axis.setting
    const next = clamp(axis.min + (axis.max - axis.min) * amount, axis.min, axis.max)
    preset.settings[key] = next
    if (key === 'SPLAT_RADIUS') syncRadius(buttons, { x: 0, y: 0 })
    else sim.set(key, next)
  }
}

type ActiveTransition = {
  key: PresetNumberSetting
  from: number
  to: number
  start: number
  duration: number
  easing: EaseMode
}

function cursorPaints(preset: Preset, buttons: HeldButtons) {
  if (preset.splat.paint === 'left') return buttons.left
  if (preset.splat.paint === 'right') return buttons.right
  return true
}

function paintPressed(preset: Preset, prev: HeldButtons, next: HeldButtons) {
  if (preset.splat.paint === 'left') return !prev.left && next.left
  if (preset.splat.paint === 'right') return !prev.right && next.right
  return false
}

function listedColors(preset: Preset) {
  const raw = preset.splat.colors
  if (!Array.isArray(raw)) return [...defaultSplatColors]
  return raw.filter((color): color is number => typeof color === 'number' && Number.isFinite(color))
}

function dyeBlend(from: number, to: number, amount: number, dye: number): FluidColor {
  const start = dyeFromColor(from, dye)
  const end = dyeFromColor(to, dye)
  const t = Math.min(1, Math.max(0, amount))
  return {
    r: start.r + (end.r - start.r) * t,
    g: start.g + (end.g - start.g) * t,
    b: start.b + (end.b - start.b) * t,
  }
}

/** The marked bottom-left square: 35px on a 381px-tall view, flush with the corner. */
const PRESET_CORNER_SHARE = 35 / 381

function inPresetCorner(x: number, y: number, width: number, height: number) {
  if (width <= 0 || height <= 0) return false
  const side = height * PRESET_CORNER_SHARE
  return x >= 0 && x <= side && y >= height - side && y <= height
}

function clamp(value: number, min: number, max: number) {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return Math.min(hi, Math.max(lo, value))
}
