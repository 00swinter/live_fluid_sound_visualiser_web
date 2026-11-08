import {
  clickActions,
  controlFor,
  holdActions,
  isChoiceParam,
  isColorListParam,
  isColorParam,
  isNumberParam,
  isSettingParam,
  paramSetting,
  properties,
  rangeFor,
  type ActionParam,
  type NumberParam,
  type ParamValue,
  type PresetNumberSetting,
} from '../behaviors'
import { defaultPreset } from './defaultPreset'
import {
  defaultAudio,
  mirrorCounts,
  rotateCounts,
  type ButtonBinding,
  type ButtonSlot,
  type CursorSymmetry,
  type Preset,
} from './types'

/** Stable slot. Middle-click in the corner rewrites this preset instead of adding another. */
export const RANDOM_PRESET_ID = 'random'

const BUTTONS: ButtonSlot[] = ['left', 'right', 'middle']
const PAINT_MODES = ['always', 'left', 'right'] as const
const COLOR_MODES = ['click', 'cycle'] as const
const SYMMETRY_KINDS = ['off', 'mirror', 'rotate'] as const

/**
 * Narrower than the sliders. The full slider range includes values that make the
 * velocity field run away: the picture turns into noise and stays that way.
 */
const STABLE: Partial<Record<PresetNumberSetting, { min: number; max: number }>> = {
  SPLAT_RADIUS: { min: 0.1, max: 0.4 },
  DENSITY_DISSIPATION: { min: 0.98, max: 0.995 },
  VELOCITY_DISSIPATION: { min: 0.97, max: 0.99 },
  PRESSURE_DISSIPATION: { min: 0.4, max: 0.9 },
  PRESSURE_ITERATIONS: { min: 16, max: 24 },
  CURL: { min: 0, max: 30 },
  DELTA_TIME: { min: 0.012, max: 0.02 },
  BLOOM_INTENSITY: { min: 0.25, max: 1 },
  BLOOM_THRESHOLD: { min: 0.3, max: 0.75 },
  BLOOM_SOFT_KNEE: { min: 0.3, max: 0.8 },
  BLOOM_ITERATIONS: { min: 4, max: 8 },
  BLOOM_RESOLUTION: { min: 128, max: 256 },
}

/** Burst and hold amounts that stay visible without dumping the velocity field. */
const STABLE_PARAMS: Record<string, { min: number; max: number }> = {
  count: { min: 4, max: 12 },
  speed: { min: 250, max: 900 },
  size: { min: 0.12, max: 0.4 },
  intensity: { min: 0.06, max: 0.18 },
  multiplier: { min: 1.5, max: 3 },
  radius: { min: 0.3, max: 1 },
}

/** One preset named random. Every call rolls new settings into the same id. */
export function createRandomPreset(): Preset {
  const preset = structuredClone(defaultPreset)
  preset.id = RANDOM_PRESET_ID
  preset.name = 'random'

  preset.splat.force = randomStepped(2, 8, 0.1)
  preset.splat.dye = randomStepped(0.08, 0.3, 0.01)
  preset.splat.colors = randomColors(3, 6)
  preset.splat.colorMode = pick(COLOR_MODES)
  preset.splat.cycleSeconds = randomStepped(0.4, 40, 0.1)
  preset.splat.paint = pick(PAINT_MODES)

  preset.cursor.x.enabled = false
  preset.cursor.y.enabled = false
  preset.cursor.symmetry = randomSymmetry()

  for (const property of properties) {
    const range = stableRange(property.key)
    preset.settings[property.key] = randomStepped(range.min, range.max, range.step)
  }
  preset.settings.SHADING = coin()
  preset.settings.BLOOM = coin()
  // A paused sim is a still picture, and a transparent one would hide the black background.
  preset.settings.PAUSED = false
  preset.settings.TRANSPARENT = false
  preset.settings.BACK_COLOR = { r: 0, g: 0, b: 0 }

  for (const slot of BUTTONS) preset[slot] = randomBinding()

  const scrollKey = pick(properties).key
  const scroll = stableRange(scrollKey)
  const [scrollMin, scrollMax] = ordered(twoDifferent(scroll.min, scroll.max, scroll.step))
  preset.scroll = {
    setting: scrollKey,
    min: scrollMin,
    max: scrollMax,
    sensitivity: randomStepped(scroll.step, Math.max(scroll.step, scroll.max - scroll.min), scroll.step),
  }

  preset.audio = silentAudio()
  return preset
}

function randomBinding(): ButtonBinding {
  if (coin()) {
    const action = pick(clickActions)
    return { click: action.id, hold: null, clickParams: randomParams(action.params), holdParams: {} }
  }
  const action = pick(holdActions)
  return { click: null, hold: action.id, clickParams: {}, holdParams: randomParams(action.params) }
}

function randomParams(params: ActionParam[] | undefined): Record<string, ParamValue> {
  const values: Record<string, ParamValue> = {}
  for (const param of params ?? []) {
    if (isColorListParam(param)) values[param.key] = randomColors(2, 6)
    else if (isColorParam(param)) values[param.key] = randomPackedColor()
    else if (isSettingParam(param)) values[param.key] = pick(properties).key
    else if (isChoiceParam(param)) values[param.key] = pick(param.options).value
    else if (isNumberParam(param)) {
      const range = stableParamRange(param, values)
      values[param.key] = randomStepped(range.min, range.max, range.step)
    }
  }
  separatePair(values, params, 'a', 'b')
  separatePair(values, params, 'released', 'held')
  return values
}

/** Toggle and hold need two different values, otherwise the button does nothing. */
function separatePair(
  values: Record<string, ParamValue>,
  params: ActionParam[] | undefined,
  first: string,
  second: string,
) {
  if (values[first] === undefined || values[first] !== values[second]) return
  const param = params?.find((item) => item.key === second)
  if (!param || !isNumberParam(param) || typeof values[second] !== 'number') return
  const range = stableParamRange(param, values)
  const step = range.step > 0 ? range.step : 0
  const current = values[second]
  const hi = Math.max(range.min, range.max)
  const lo = Math.min(range.min, range.max)
  const up = roundStep(current + step, step)
  const down = roundStep(current - step, step)
  if (up <= hi) values[second] = up
  else if (down >= lo) values[second] = down
}

function stableRange(key: PresetNumberSetting) {
  const control = controlFor(key)
  const band = STABLE[key]
  return { min: band?.min ?? control.min, max: band?.max ?? control.max, step: control.step }
}

function stableParamRange(param: NumberParam, stored: ParamValues) {
  const base = rangeFor(param, stored)
  let min = base.min
  let max = base.max
  if (param.rangeFrom) {
    const band = stableRange(paramSetting(stored, param.rangeFrom, 'CURL'))
    min = Math.max(min, band.min)
    max = Math.min(max, band.max)
  }
  const cap = STABLE_PARAMS[param.key]
  if (cap) {
    min = Math.max(min, cap.min)
    max = Math.min(max, cap.max)
  }
  if (min > max) return base
  return { min, max, step: base.step }
}

function randomSymmetry(): CursorSymmetry {
  const kind = pick(SYMMETRY_KINDS)
  const counts = kind === 'mirror' ? mirrorCounts : rotateCounts
  return { kind, count: pick(counts) }
}

function silentAudio(): Preset['audio'] {
  const audio = structuredClone(defaultAudio)
  audio.beat = null
  audio.beatParams = {}
  audio.colorFromPitch = false
  audio.level.enabled = false
  audio.bass.enabled = false
  audio.mid.enabled = false
  audio.treble.enabled = false
  audio.drive.enabled = false
  return audio
}

function randomColors(minCount: number, maxCount: number) {
  const count = minCount + Math.floor(Math.random() * (maxCount - minCount + 1))
  return Array.from({ length: count }, randomPackedColor)
}

function randomPackedColor() {
  const rgb = hsvToRgb(Math.random(), 0.7 + Math.random() * 0.3, 0.8 + Math.random() * 0.2)
  return (Math.round(rgb.r * 255) << 16) | (Math.round(rgb.g * 255) << 8) | Math.round(rgb.b * 255)
}

function twoDifferent(min: number, max: number, step: number): [number, number] {
  const first = randomStepped(min, max, step)
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const second = randomStepped(min, max, step)
    if (second !== first) return [first, second]
  }
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  const nudged = first + step <= hi ? roundStep(first + step, step) : roundStep(first - step, step)
  return [first, Math.min(hi, Math.max(lo, nudged))]
}

function ordered(pair: [number, number]): [number, number] {
  return pair[0] <= pair[1] ? pair : [pair[1], pair[0]]
}

function randomStepped(min: number, max: number, step: number) {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  if (!(step > 0) || hi === lo) return lo
  const steps = Math.round((hi - lo) / step)
  const index = Math.floor(Math.random() * (steps + 1))
  return roundStep(lo + index * step, step)
}

function roundStep(value: number, step: number) {
  const digits = step >= 1 ? 0 : step >= 0.01 ? 4 : 6
  return Number(value.toFixed(digits))
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function coin() {
  return Math.random() < 0.5
}

function hsvToRgb(h: number, s: number, v: number) {
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
