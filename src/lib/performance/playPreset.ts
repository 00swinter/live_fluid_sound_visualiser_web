import type { FluidSim } from '../fluid/createFluidSim'
import { actionParams, clickAction, holdAction, splatColor, type PaintState } from '../behaviors'
import type { HeldButtons } from '../input/pointerInput'
import { watchPointer } from '../input/pointerInput'
import { applySettings, type ButtonSlot, type Preset } from '../presets/types'

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
      const paint = collectHold(move.buttons, move)
      sim.set('SPLAT_RADIUS', paint.radius ?? getPreset().settings.SPLAT_RADIUS)
      if (!paint.paint) return
      sim.splat(move.x, move.y, move.dx * paint.force, move.dy * paint.force, currentColor())
    },
    onButtons(next, point) {
      const preset = getPreset()
      for (const slot of SLOTS) {
        if (held[slot] || !next[slot]) continue
        const binding = preset[slot]
        const action = clickAction(binding.click)
        if (!action) continue
        action.onPress(actionContext(point), actionParams(action, binding.clickParams))
      }
      held = { ...next }
      syncRadius(held, point)
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
      if (key === 'SPLAT_RADIUS') syncRadius(held, { x: 0, y: 0 })
      else sim.set(key, next)
    },
  })

  function currentColor() {
    const preset = getPreset()
    const now = performance.now()
    if (preset.splat.colorful && now - colorAt >= COLOR_INTERVAL_MS) {
      hue = Math.random()
      colorAt = now
    }
    return splatColor(preset.splat.dye, hue)
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
      colorful: preset.splat.colorful,
    }
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

function cursorPaints(preset: Preset, buttons: HeldButtons) {
  if (preset.splat.paint === 'left') return buttons.left
  if (preset.splat.paint === 'right') return buttons.right
  return true
}

function clamp(value: number, min: number, max: number) {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return Math.min(hi, Math.max(lo, value))
}
