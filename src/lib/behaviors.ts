import type { FluidColor, FluidNumberSetting, FluidSim } from './fluid/createFluidSim'

/**
 * Edit this file to add interactions.
 *
 * `clickActions` run once when the button goes down.
 * `holdActions` run while the button is held. Change `paint` to affect the
 * velocity splat, or call `ctx.setNumber`. `onRelease` runs when it comes up.
 * `properties` are the preset values the scroll wheel and the cursor axes can map.
 * The same list is the sliders in each settings category.
 * `performanceControls` are shared by every preset.
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
  /** Current preset value for a numeric setting. */
  getNumber: (key: PresetNumberSetting) => number
  /** Save a numeric setting on the preset and apply it to the simulation. */
  setNumber: (key: PresetNumberSetting, value: number) => void
  /** Value this setting is moving toward, or null when it is not transitioning. */
  transitionTarget: (key: PresetNumberSetting) => number | null
  /** Move a setting to a value. `seconds` is the length of the change. Zero jumps. */
  animateNumber: (key: PresetNumberSetting, value: number, seconds: number, easing: string) => void
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
  /** Slider range follows the setting chosen by this param key. */
  rangeFrom?: string
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

/** `default` is a key from `properties`. */
export type SettingParam = {
  kind: 'setting'
  key: string
  label: string
  default: PresetNumberSetting
}

export type ChoiceParam = {
  kind: 'choice'
  key: string
  label: string
  default: string
  options: readonly { value: string; label: string }[]
}

export type ActionParam = NumberParam | ColorParam | ColorListParam | SettingParam | ChoiceParam

export const easeModes = [
  { value: 'easeInOut', label: 'Ease in and out' },
  { value: 'easeIn', label: 'Ease in' },
  { value: 'easeOut', label: 'Ease out' },
  { value: 'constant', label: 'Constant' },
  { value: 'linear', label: 'Linear' },
] as const

export type EaseMode = (typeof easeModes)[number]['value']

export type ParamValue = number | number[] | string

export type ParamValues = Record<string, ParamValue>

export type ClickAction = {
  id: string
  label: string
  detail: string
  note?: string
  params?: ActionParam[]
  onPress: (ctx: ActionContext, params: ParamValues) => void
}

export type HoldAction = {
  id: string
  label: string
  detail: string
  note?: string
  params?: ActionParam[]
  onHold: (ctx: ActionContext, params: ParamValues, paint: PaintState) => void
  /** Runs when the button comes up. */
  onRelease?: (ctx: ActionContext, params: ParamValues) => void
}

export type ControlGroup = 'Splat' | 'Flow' | 'Bloom'

/** Resolution used for speed. Stored once, not on each preset. */
export type PerformanceSetting = 'SIM_RESOLUTION' | 'DYE_RESOLUTION'

export type PresetNumberSetting = Exclude<FluidNumberSetting, PerformanceSetting>

export type MappedProperty = {
  key: PresetNumberSetting
  label: string
  min: number
  max: number
  step: number
  group: ControlGroup
}

export type PerformanceControl = {
  key: PerformanceSetting
  label: string
  min: number
  max: number
  step: number
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
  {
    id: 'toggleValue',
    label: 'Toggle value',
    detail: 'Toggle',
    note: 'Each click moves the setting from one value to the other over the chosen time. Zero seconds jumps. Constant waits, then jumps.',
    params: valueChangeParams(
      { key: 'a', label: 'Value A', default: 0 },
      { key: 'b', label: 'Value B', default: 15 },
    ),
    onPress(ctx, params) {
      const setting = paramSetting(params, 'setting', 'CURL')
      const first = clampControl(setting, paramNumber(params, 'a', 0))
      const second = clampControl(setting, paramNumber(params, 'b', 15))
      const aimed = ctx.transitionTarget(setting)
      const basis = aimed ?? ctx.getNumber(setting)
      const next = Math.abs(basis - first) <= Math.abs(basis - second) ? second : first
      moveSetting(ctx, params, setting, next)
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
  {
    id: 'holdValue',
    label: 'Hold value',
    detail: 'Hold',
    note: 'Holding moves the setting to Held. Letting go moves it to Released. Zero seconds jumps. Constant waits, then jumps.',
    params: valueChangeParams(
      { key: 'released', label: 'Released', default: 0 },
      { key: 'held', label: 'Held', default: 15 },
    ),
    onHold(ctx, params) {
      applyHeldValue(ctx, params, true)
    },
    onRelease(ctx, params) {
      applyHeldValue(ctx, params, false)
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
]

export const performanceControls: PerformanceControl[] = [
  { key: 'SIM_RESOLUTION', label: 'Sim resolution', min: 64, max: 512, step: 16 },
  { key: 'DYE_RESOLUTION', label: 'Dye resolution', min: 128, max: 2048, step: 64 },
]

const propertyKeys = new Set<string>(properties.map((property) => property.key))

export function isColorParam(param: ActionParam): param is ColorParam {
  return 'kind' in param && param.kind === 'color'
}

export function isColorListParam(param: ActionParam): param is ColorListParam {
  return 'kind' in param && param.kind === 'colors'
}

export function isNumberParam(param: ActionParam): param is NumberParam {
  return !('kind' in param)
}

export function isSettingParam(param: ActionParam): param is SettingParam {
  return 'kind' in param && param.kind === 'setting'
}

export function isChoiceParam(param: ActionParam): param is ChoiceParam {
  return 'kind' in param && param.kind === 'choice'
}

export function paramSetting(params: ParamValues, key: string, fallback: PresetNumberSetting): PresetNumberSetting {
  const value = params[key]
  return typeof value === 'string' && propertyKeys.has(value) ? (value as PresetNumberSetting) : fallback
}

export function clampControl(key: FluidNumberSetting, value: number) {
  const control = controlFor(key)
  const lo = Math.min(control.min, control.max)
  const hi = Math.max(control.min, control.max)
  return Math.min(hi, Math.max(lo, value))
}

/** Clamp to the setting range and land on its step, so a transition does not stop between slider ticks. */
export function snapControl(key: FluidNumberSetting, value: number) {
  const control = controlFor(key)
  const clamped = clampControl(key, value)
  if (!(control.step > 0)) return clamped
  const steps = Math.round((clamped - control.min) / control.step)
  const snapped = control.min + steps * control.step
  const digits = control.step >= 1 ? 0 : control.step >= 0.01 ? 4 : 6
  return clampControl(key, Number(snapped.toFixed(digits)))
}

/** 0 at the start of a transition, 1 at the end. Constant stays at 0 until the last moment. */
export function easeBlend(amount: number, mode: string) {
  const t = Math.min(1, Math.max(0, amount))
  if (mode === 'easeIn') return t * t * t
  if (mode === 'easeOut') return 1 - (1 - t) ** 3
  if (mode === 'easeInOut') return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
  if (mode === 'constant') return t < 1 ? 0 : 1
  return t
}

/** Min, max, and step for a number param. Follows the chosen setting when `rangeFrom` is set. */
export function rangeFor(param: NumberParam, stored: ParamValues) {
  if (!param.rangeFrom) return { min: param.min, max: param.max, step: param.step }
  const control = controlFor(paramSetting(stored, param.rangeFrom, 'CURL'))
  return { min: control.min, max: control.max, step: control.step }
}

/** Write one param, then keep values that follow a setting inside that setting's range. */
export function commitParam(params: ActionParam[] | undefined, stored: ParamValues, key: string, value: ParamValue) {
  const next: ParamValues = { ...stored, [key]: value }
  for (const param of params ?? []) {
    if (!isNumberParam(param) || !param.rangeFrom) continue
    next[param.key] = clampControl(paramSetting(next, param.rangeFrom, 'CURL'), paramNumber(next, param.key, param.default))
  }
  return next
}

export function paramNumber(params: ParamValues, key: string, fallback = 0) {
  const value = params[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function paramEase(params: ParamValues, key = 'easing'): EaseMode {
  const value = params[key]
  if (typeof value === 'string' && easeModes.some((mode) => mode.value === value)) return value as EaseMode
  return 'easeInOut'
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
  if (isSettingParam(param)) return typeof stored === 'string' && propertyKeys.has(stored) ? stored : param.default
  if (isChoiceParam(param)) {
    return typeof stored === 'string' && param.options.some((option) => option.value === stored) ? stored : param.default
  }
  return typeof stored === 'number' ? stored : param.default
}

function settingValues(
  first: { key: string; label: string; default: number },
  second: { key: string; label: string; default: number },
): ActionParam[] {
  return [
    { kind: 'setting', key: 'setting', label: 'Setting', default: 'CURL' },
    { key: first.key, label: first.label, min: 0, max: 150, step: 1, default: first.default, rangeFrom: 'setting' },
    { key: second.key, label: second.label, min: 0, max: 150, step: 1, default: second.default, rangeFrom: 'setting' },
  ]
}

function valueChangeParams(
  first: { key: string; label: string; default: number },
  second: { key: string; label: string; default: number },
): ActionParam[] {
  return [
    ...settingValues(first, second),
    { kind: 'choice', key: 'easing', label: 'Transition', default: 'easeInOut', options: easeModes },
    { key: 'seconds', label: 'Seconds', min: 0, max: 5, step: 0.05, default: 0.5 },
  ]
}

function moveSetting(ctx: ActionContext, params: ParamValues, setting: PresetNumberSetting, value: number) {
  ctx.animateNumber(setting, value, paramNumber(params, 'seconds', 0.5), paramEase(params))
}

function applyHeldValue(ctx: ActionContext, params: ParamValues, down: boolean) {
  const setting = paramSetting(params, 'setting', 'CURL')
  const released = clampControl(setting, paramNumber(params, 'released', 0))
  const held = clampControl(setting, paramNumber(params, 'held', 15))
  moveSetting(ctx, params, setting, down ? held : released)
}

export function controlFor(key: FluidNumberSetting) {
  const control = [...properties, ...performanceControls].find((item) => item.key === key)
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
