import type { FluidColor, FluidNumberSetting, FluidSim } from './fluid/createFluidSim'

/**
 * Edit this file to add interactions.
 *
 * `clickActions` run once when the button goes down.
 * `holdActions` run while the button is held. Change `paint` to affect the
 * velocity splat, or call `ctx.sim` yourself.
 * `properties` are the sim values the scroll wheel and the cursor axes can map.
 * The same list is the sliders in each settings category.
 */

export type ActionContext = {
  sim: FluidSim
  x: number
  y: number
  dx: number
  dy: number
  /** Canvas size in CSS pixels. Click actions can place splats anywhere inside it. */
  width: number
  height: number
  dye: number
  colorful: boolean
}

/** Shared paint for this movement. Hold actions can change it. */
export type PaintState = {
  /** Movement paints when this is true. The cursor preset can already set it. */
  paint: boolean
  force: number
  /** Replaces the splat radius while a hold sets it. */
  radius: number | null
}

export type NumberParam = {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
}

/** `default` is a packed `0xRRGGBB` color. */
export type ColorParam = {
  kind: 'color'
  key: string
  label: string
  default: number
}

/** `default` is a list of packed `0xRRGGBB` colors. */
export type ColorListParam = {
  kind: 'colors'
  key: string
  label: string
  default: number[]
}

export type ActionParam = NumberParam | ColorParam | ColorListParam

export type ParamValue = number | number[]

export type ParamValues = Record<string, ParamValue>

export type ClickAction = {
  id: string
  label: string
  detail: string
  params?: ActionParam[]
  onPress: (ctx: ActionContext, params: ParamValues) => void
}

export type HoldAction = {
  id: string
  label: string
  detail: string
  params?: ActionParam[]
  onHold: (ctx: ActionContext, params: ParamValues, paint: PaintState) => void
}

export type ControlGroup = 'Splat' | 'Flow' | 'Bloom' | 'Quality'

export type MappedProperty = {
  key: FluidNumberSetting
  label: string
  min: number
  max: number
  step: number
  group: ControlGroup
}

export const clickActions: ClickAction[] = [
  {
    id: 'clear',
    label: 'Clear',
    detail: 'Clear',
    onPress(ctx) {
      ctx.sim.clear()
    },
  },
  {
    id: 'randomSplats',
    label: 'Random splats',
    detail: 'Burst',
    params: [
      { key: 'count', label: 'Count', min: 1, max: 40, step: 1, default: 10 },
      { key: 'speed', label: 'Speed', min: 0, max: 2000, step: 10, default: 1000 },
      { key: 'size', label: 'Size', min: 0.05, max: 2, step: 0.01, default: 0.3 },
      { key: 'intensity', label: 'Intensity', min: 0, max: 1, step: 0.01, default: 0.15 },
      {
        kind: 'colors',
        key: 'colors',
        label: 'Colors',
        default: [0xff4466, 0x44dd88, 0x4488ff],
      },
    ],
    onPress(ctx, params) {
      // Same burst as multipleSplats in the reference sim: full-screen, strong random
      // velocity, and the chosen color boosted by 10. Each splat picks from the list.
      const count = Math.round(paramNumber(params, 'count', 10))
      const speed = paramNumber(params, 'speed', 1000)
      const intensity = paramNumber(params, 'intensity', 0.15)
      const colors = paramColors(params, 'colors')
      ctx.sim.set('SPLAT_RADIUS', paramNumber(params, 'size', 0.3))
      for (let i = 0; i < count; i++) {
        const packed = colors[Math.floor(Math.random() * colors.length)] ?? 0xffffff
        const color = dyeFromColor(packed, intensity)
        color.r *= 10
        color.g *= 10
        color.b *= 10
        ctx.sim.splat(
          ctx.width * Math.random(),
          ctx.height * Math.random(),
          speed * (Math.random() - 0.5),
          speed * (Math.random() - 0.5),
          color,
        )
      }
    },
  },
]

export const holdActions: HoldAction[] = [
  {
    id: 'extraForce',
    label: 'Extra force',
    detail: 'Force',
    params: [{ key: 'multiplier', label: 'Multiplier', min: 1, max: 12, step: 0.1, default: 4 }],
    onHold(_ctx, params, paint) {
      paint.force *= paramNumber(params, 'multiplier', 4)
    },
  },
  {
    id: 'widerSplat',
    label: 'Wider splat',
    detail: 'Wide',
    params: [{ key: 'radius', label: 'Radius', min: 0.2, max: 3, step: 0.01, default: 1.4 }],
    onHold(_ctx, params, paint) {
      paint.radius = paramNumber(params, 'radius', 1.4)
    },
  },
]

export const properties: MappedProperty[] = [
  { key: 'SPLAT_RADIUS', label: 'Radius', min: 0.05, max: 2, step: 0.01, group: 'Splat' },
  { key: 'DENSITY_DISSIPATION', label: 'Dye fade', min: 0.8, max: 1, step: 0.001, group: 'Flow' },
  { key: 'VELOCITY_DISSIPATION', label: 'Velocity fade', min: 0.8, max: 1, step: 0.001, group: 'Flow' },
  { key: 'PRESSURE_DISSIPATION', label: 'Pressure fade', min: 0, max: 1, step: 0.01, group: 'Flow' },
  { key: 'PRESSURE_ITERATIONS', label: 'Pressure steps', min: 1, max: 40, step: 1, group: 'Flow' },
  { key: 'CURL', label: 'Vorticity', min: 0, max: 150, step: 1, group: 'Flow' },
  { key: 'DELTA_TIME', label: 'Delta time', min: 0, max: 0.08, step: 0.001, group: 'Flow' },
  { key: 'BLOOM_INTENSITY', label: 'Intensity', min: 0, max: 2, step: 0.01, group: 'Bloom' },
  { key: 'BLOOM_THRESHOLD', label: 'Threshold', min: 0, max: 1, step: 0.01, group: 'Bloom' },
  { key: 'BLOOM_SOFT_KNEE', label: 'Soft knee', min: 0, max: 1, step: 0.01, group: 'Bloom' },
  { key: 'BLOOM_ITERATIONS', label: 'Iterations', min: 1, max: 12, step: 1, group: 'Bloom' },
  { key: 'BLOOM_RESOLUTION', label: 'Bloom resolution', min: 64, max: 512, step: 16, group: 'Bloom' },
  { key: 'SIM_RESOLUTION', label: 'Sim resolution', min: 64, max: 512, step: 16, group: 'Quality' },
  { key: 'DYE_RESOLUTION', label: 'Dye resolution', min: 128, max: 2048, step: 64, group: 'Quality' },
]

export function isColorParam(param: ActionParam): param is ColorParam {
  return 'kind' in param && param.kind === 'color'
}

export function isColorListParam(param: ActionParam): param is ColorListParam {
  return 'kind' in param && param.kind === 'colors'
}

export function isNumberParam(param: ActionParam): param is NumberParam {
  return !('kind' in param)
}

export function paramNumber(params: ParamValues, key: string, fallback = 0) {
  const value = params[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function paramColors(params: ParamValues, key: string) {
  const value = params[key]
  if (!Array.isArray(value)) return []
  return value.filter((color) => typeof color === 'number' && Number.isFinite(color))
}

export function clickAction(id: string | null) {
  if (!id) return null
  return clickActions.find((action) => action.id === id) ?? null
}

export function holdAction(id: string | null) {
  if (!id) return null
  return holdActions.find((action) => action.id === id) ?? null
}

export function actionParams(action: { params?: ActionParam[] } | null, stored: ParamValues) {
  const values: ParamValues = {}
  for (const param of action?.params ?? []) values[param.key] = storedParam(param, stored[param.key])
  return values
}

export function defaultParams(action: { params?: ActionParam[] } | null) {
  const values: ParamValues = {}
  for (const param of action?.params ?? []) values[param.key] = storedParam(param, undefined)
  return values
}

function storedParam(param: ActionParam, stored: ParamValue | undefined): ParamValue {
  if (isColorListParam(param)) return Array.isArray(stored) ? [...stored] : [...param.default]
  return typeof stored === 'number' ? stored : param.default
}

export function controlFor(key: FluidNumberSetting) {
  const control = properties.find((item) => item.key === key)
  if (!control) throw new Error(`No control range for ${key}`)
  return control
}

export function formatControl(value: number, step: number) {
  if (step >= 1) return String(Math.round(value))
  const digits = step < 0.01 ? 3 : 2
  return value.toFixed(digits)
}

export function splatColor(dye: number, hue: number): FluidColor {
  const color = hsvToRgb(hue, 1, 1)
  color.r *= dye
  color.g *= dye
  color.b *= dye
  return color
}

/** Packed `0xRRGGBB`, scaled by the splat dye so the chosen hue keeps the usual brightness. */
export function dyeFromColor(packed: number, dye: number): FluidColor {
  const value = packed & 0xffffff
  return {
    r: (((value >> 16) & 255) / 255) * dye,
    g: (((value >> 8) & 255) / 255) * dye,
    b: ((value & 255) / 255) * dye,
  }
}

export function colorParamToHex(packed: number) {
  return `#${(packed & 0xffffff).toString(16).padStart(6, '0')}`
}

export function hexToColorParam(hex: string) {
  return Number.parseInt(hex.slice(1), 16)
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
