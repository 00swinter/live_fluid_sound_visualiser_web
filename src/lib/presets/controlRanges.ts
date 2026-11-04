import type { FluidNumberSetting } from '../fluid/createFluidSim'

export type ControlGroup = 'Splat' | 'Flow' | 'Bloom' | 'Quality'

export type NumberControl = {
  key: FluidNumberSetting
  label: string
  min: number
  max: number
  step: number
  group: ControlGroup
}

export const numberControls: NumberControl[] = [
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

export function controlFor(key: FluidNumberSetting) {
  const control = numberControls.find((item) => item.key === key)
  if (!control) throw new Error(`No control range for ${key}`)
  return control
}

export function formatControl(value: number, step: number) {
  if (step >= 1) return String(Math.round(value))
  const digits = step < 0.01 ? 3 : 2
  return value.toFixed(digits)
}
