import { properties, type ParamValue, type PresetNumberSetting } from '../behaviors'
import type { FluidColor, FluidBooleanSetting, FluidSim } from '../fluid/createFluidSim'

export type ScrollSetting = PresetNumberSetting

export type ButtonSlot = 'left' | 'right' | 'middle'

/** One mouse button. `click` and `hold` are ids from `src/lib/behaviors.ts`. */
export type ButtonBinding = {
  click: string | null
  hold: string | null
  clickParams: Record<string, ParamValue>
  holdParams: Record<string, ParamValue>
}

/** Maps one screen axis onto a setting. Disabled axes do nothing. */
export type AxisMap = {
  enabled: boolean
  setting: ScrollSetting
  min: number
  max: number
}

export type AudioBand = 'level' | 'bass' | 'mid' | 'treble'

/** Maps one audio band onto a setting. Quiet is the minimum, loud is the maximum. */
export type AudioMap = {
  enabled: boolean
  setting: ScrollSetting
  min: number
  max: number
}

export type AudioDrive = {
  /** Bass energy paints the fluid while the source is playing. */
  enabled: boolean
  force: number
  dye: number
}

export type PresetAudio = {
  /** Applied to the input before it is measured. */
  gain: number
  /** Levels at or below this are treated as silence. */
  floor: number
  /** 0 catches only the loudest hits. 1 catches quiet ones too. */
  beatSensitivity: number
  /** Minimum time between beats, in seconds. */
  beatCooldown: number
  /** Click-action id from `src/lib/behaviors.ts`, or null. */
  beat: string | null
  beatParams: Record<string, ParamValue>
  /** Splat color follows the pitch of the input. */
  colorFromPitch: boolean
  level: AudioMap
  bass: AudioMap
  mid: AudioMap
  treble: AudioMap
  drive: AudioDrive
}

export const defaultAudio: PresetAudio = {
  gain: 1.25,
  floor: 0.06,
  beatSensitivity: 0.58,
  beatCooldown: 0.16,
  beat: null,
  beatParams: {},
  colorFromPitch: false,
  level: { enabled: false, setting: 'CURL', min: 0, max: 45 },
  bass: { enabled: false, setting: 'SPLAT_RADIUS', min: 0.08, max: 0.5 },
  mid: { enabled: false, setting: 'VELOCITY_DISSIPATION', min: 0.97, max: 0.995 },
  treble: { enabled: false, setting: 'BLOOM_INTENSITY', min: 0.1, max: 1.5 },
  drive: { enabled: false, force: 7, dye: 1 },
}

export type BooleanSetting = Exclude<FluidBooleanSetting, 'COLORFUL'>

export type PresetSettings = Record<PresetNumberSetting, number> &
  Record<BooleanSetting, boolean> & {
    BACK_COLOR: FluidColor
  }

export type Preset = {
  id: string
  name: string
  splat: {
    force: number
    dye: number
    colorful: boolean
    /** Always, or only while the left or right button is dragged. */
    paint: 'always' | 'left' | 'right'
  }
  /** Screen position mapped like two wheels. Left and top are the minimum. */
  cursor: {
    x: AxisMap
    y: AxisMap
  }
  settings: PresetSettings
  left: ButtonBinding
  right: ButtonBinding
  middle: ButtonBinding
  scroll: {
    setting: ScrollSetting
    min: number
    max: number
    /** Added for each wheel notch. Scrolling down increases the setting. */
    sensitivity: number
  }
  audio: PresetAudio
}

const propertyKeys = new Set<string>(properties.map((property) => property.key))

/** Fills any audio fields missing from an older saved preset. */
export function completeAudio(raw: unknown): PresetAudio {
  const audio = structuredClone(defaultAudio)
  if (!raw || typeof raw !== 'object') return audio
  const value = raw as Partial<PresetAudio>
  audio.gain = numberOr(value.gain, audio.gain)
  audio.floor = numberOr(value.floor, audio.floor)
  audio.beatSensitivity = numberOr(value.beatSensitivity, audio.beatSensitivity)
  audio.beatCooldown = numberOr(value.beatCooldown, audio.beatCooldown)
  audio.beat = value.beat === null ? null : typeof value.beat === 'string' ? value.beat : audio.beat
  audio.beatParams = paramValues(value.beatParams)
  audio.colorFromPitch = typeof value.colorFromPitch === 'boolean' ? value.colorFromPitch : audio.colorFromPitch
  audio.level = completeMap(value.level, audio.level)
  audio.bass = completeMap(value.bass, audio.bass)
  audio.mid = completeMap(value.mid, audio.mid)
  audio.treble = completeMap(value.treble, audio.treble)
  audio.drive = {
    enabled: typeof value.drive?.enabled === 'boolean' ? value.drive.enabled : audio.drive.enabled,
    force: numberOr(value.drive?.force, audio.drive.force),
    dye: numberOr(value.drive?.dye, audio.drive.dye),
  }
  return audio
}

function completeMap(raw: Partial<AudioMap> | undefined, fallback: AudioMap): AudioMap {
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    setting: typeof raw?.setting === 'string' && propertyKeys.has(raw.setting) ? (raw.setting as ScrollSetting) : fallback.setting,
    min: numberOr(raw?.min, fallback.min),
    max: numberOr(raw?.max, fallback.max),
  }
}

function paramValues(raw: unknown): Record<string, ParamValue> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, ParamValue> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (typeof value === 'string') out[key] = value
    else if (Array.isArray(value)) {
      const colors = value.filter((color): color is number => typeof color === 'number' && Number.isFinite(color))
      if (colors.length) out[key] = colors.map((color) => color & 0xffffff)
    }
  }
  return out
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function applySettings(sim: FluidSim, settings: PresetSettings) {
  for (const property of properties) sim.set(property.key, settings[property.key])
  sim.set('SHADING', settings.SHADING)
  sim.set('PAUSED', settings.PAUSED)
  sim.set('BLOOM', settings.BLOOM)
  sim.set('TRANSPARENT', settings.TRANSPARENT)
  sim.set('BACK_COLOR', { ...settings.BACK_COLOR })
}
