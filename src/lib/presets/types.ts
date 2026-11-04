import type { FluidColor, FluidBooleanSetting, FluidNumberSetting, FluidSim } from '../fluid/createFluidSim'

export type ScrollSetting = FluidNumberSetting

export type ButtonSlot = 'left' | 'right' | 'middle'

/** Held effects last while the button is down. `clear` runs once on press. */
export type ButtonEffect =
  | { kind: 'velocitySplat' }
  | { kind: 'extraForce'; multiplier: number }
  | { kind: 'widerSplat'; radius: number }
  | { kind: 'clear' }

/** Maps one screen axis onto a setting. Disabled axes do nothing. */
export type AxisMap = {
  enabled: boolean
  setting: ScrollSetting
  min: number
  max: number
}

export type BooleanSetting = Exclude<FluidBooleanSetting, 'COLORFUL'>

export type PresetSettings = Record<FluidNumberSetting, number> &
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
    /** Movement paints even when no button is held. */
    always: boolean
  }
  /** Screen position mapped like two wheels. Left and top are the minimum. */
  cursor: {
    x: AxisMap
    y: AxisMap
  }
  settings: PresetSettings
  left: ButtonEffect
  right: ButtonEffect
  middle: ButtonEffect
  scroll: {
    setting: ScrollSetting
    min: number
    max: number
    /** Added for each wheel notch. Scrolling down increases the setting. */
    sensitivity: number
  }
}

export function applySettings(sim: FluidSim, settings: PresetSettings) {
  const numbers: FluidNumberSetting[] = [
    'SIM_RESOLUTION',
    'DYE_RESOLUTION',
    'DENSITY_DISSIPATION',
    'VELOCITY_DISSIPATION',
    'PRESSURE_DISSIPATION',
    'PRESSURE_ITERATIONS',
    'CURL',
    'DELTA_TIME',
    'SPLAT_RADIUS',
    'BLOOM_ITERATIONS',
    'BLOOM_RESOLUTION',
    'BLOOM_INTENSITY',
    'BLOOM_THRESHOLD',
    'BLOOM_SOFT_KNEE',
  ]
  for (const key of numbers) sim.set(key, settings[key])
  sim.set('SHADING', settings.SHADING)
  sim.set('PAUSED', settings.PAUSED)
  sim.set('BLOOM', settings.BLOOM)
  sim.set('TRANSPARENT', settings.TRANSPARENT)
  sim.set('BACK_COLOR', { ...settings.BACK_COLOR })
}
