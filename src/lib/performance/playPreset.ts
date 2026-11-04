import type { FluidColor, FluidSim } from '../fluid/createFluidSim'
import type { HeldButtons } from '../input/pointerInput'
import { watchPointer } from '../input/pointerInput'
import { applySettings, type ButtonEffect, type ButtonSlot, type Preset } from '../presets/types'

const SLOTS: ButtonSlot[] = ['left', 'right', 'middle']
const COLOR_INTERVAL_MS = 100

/** Movement can paint and map screen position. Buttons and the wheel read the active preset. */
export function playPreset(canvas: HTMLCanvasElement, sim: FluidSim, getPreset: () => Preset): () => void {
  applySettings(sim, getPreset().settings)

  let held: HeldButtons = { left: false, right: false, middle: false }
  let hue = Math.random()
  let colorAt = 0

  return watchPointer(canvas, {
    onMove(move) {
      if (move.dx === 0 && move.dy === 0) return
      const preset = getPreset()
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width > 0) applyMapped(preset.cursor.x, clamp(move.x / width, 0, 1), move.buttons)
      if (height > 0) applyMapped(preset.cursor.y, clamp(move.y / height, 0, 1), move.buttons)
      if (!paints(move.buttons)) return
      const extra = effect(move.buttons, 'extraForce')
      const force = preset.splat.force * (extra?.multiplier ?? 1)
      applyRadius(move.buttons)
      const color = currentColor()
      sim.splat(move.x, move.y, move.dx * force, move.dy * force, color)
    },
    onButtons(next) {
      const preset = getPreset()
      for (const slot of SLOTS) {
        if (!held[slot] && next[slot] && preset[slot].kind === 'clear') sim.clear()
      }
      held = { ...next }
      applyRadius(held)
    },
    onWheel(wheel) {
      const preset = getPreset()
      const key = preset.scroll.setting
      const next = clamp(
        preset.settings[key] + wheel.notches * preset.scroll.sensitivity,
        preset.scroll.min,
        preset.scroll.max,
      )
      preset.settings[key] = next
      if (key === 'SPLAT_RADIUS') applyRadius(held)
      else sim.set(key, next)
    },
  })

  function currentColor(): FluidColor {
    const preset = getPreset()
    const now = performance.now()
    if (preset.splat.colorful && now - colorAt >= COLOR_INTERVAL_MS) {
      hue = Math.random()
      colorAt = now
    }
    const color = hsvToRgb(hue, 1, 1)
    const dye = preset.splat.dye
    color.r *= dye
    color.g *= dye
    color.b *= dye
    return color
  }

  function applyRadius(buttons: HeldButtons) {
    const preset = getPreset()
    const wide = effect(buttons, 'widerSplat')
    sim.set('SPLAT_RADIUS', wide ? wide.radius : preset.settings.SPLAT_RADIUS)
  }

  function paints(buttons: HeldButtons) {
    const preset = getPreset()
    if (preset.splat.always) return true
    return effect(buttons, 'velocitySplat') != null
  }

  function applyMapped(axis: Preset['cursor']['x'], amount: number, buttons: HeldButtons) {
    if (!axis.enabled) return
    const preset = getPreset()
    const key = axis.setting
    const next = clamp(axis.min + (axis.max - axis.min) * amount, axis.min, axis.max)
    preset.settings[key] = next
    if (key === 'SPLAT_RADIUS') applyRadius(buttons)
    else sim.set(key, next)
  }

  function effect<Kind extends ButtonEffect['kind']>(buttons: HeldButtons, kind: Kind) {
    const preset = getPreset()
    for (const slot of SLOTS) {
      if (!buttons[slot]) continue
      const buttonEffect = preset[slot]
      if (buttonEffect.kind === kind) return buttonEffect as Extract<ButtonEffect, { kind: Kind }>
    }
    return null
  }
}

function hsvToRgb(h: number, s: number, v: number): FluidColor {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0:
      return { r: v, g: t, b: p }
    case 1:
      return { r: q, g: v, b: p }
    case 2:
      return { r: p, g: v, b: t }
    case 3:
      return { r: p, g: q, b: v }
    case 4:
      return { r: t, g: p, b: v }
    default:
      return { r: v, g: p, b: q }
  }
}

function clamp(value: number, min: number, max: number) {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return Math.min(hi, Math.max(lo, value))
}
