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
}

export function applySettings(sim: FluidSim, settings: PresetSettings) {
  for (const property of properties) sim.set(property.key, settings[property.key])
  sim.set('SHADING', settings.SHADING)
  sim.set('PAUSED', settings.PAUSED)
  sim.set('BLOOM', settings.BLOOM)
  sim.set('TRANSPARENT', settings.TRANSPARENT)
  sim.set('BACK_COLOR', { ...settings.BACK_COLOR })
}
