import type { Preset } from './types'

/** Cursor paints on move. Left pushes harder, right paints wider, middle clears, wheel changes vorticity. */
export const defaultPreset: Preset = {
  id: 'default',
  name: 'Default',
  splat: {
    force: 5,
    dye: 0.15,
    colorful: true,
    always: true,
  },
  cursor: {
    x: { enabled: false, setting: 'CURL', min: 0, max: 80 },
    y: { enabled: false, setting: 'DELTA_TIME', min: 0, max: 0.08 },
  },
  settings: {
    SIM_RESOLUTION: 256,
    DYE_RESOLUTION: 1024,
    DENSITY_DISSIPATION: 0.97,
    VELOCITY_DISSIPATION: 0.98,
    PRESSURE_DISSIPATION: 0.8,
    PRESSURE_ITERATIONS: 20,
    CURL: 30,
    DELTA_TIME: 0.016,
    SPLAT_RADIUS: 0.3,
    BLOOM_ITERATIONS: 8,
    BLOOM_RESOLUTION: 256,
    BLOOM_INTENSITY: 0.8,
    BLOOM_THRESHOLD: 0.6,
    BLOOM_SOFT_KNEE: 0.7,
    SHADING: true,
    BLOOM: true,
    PAUSED: false,
    TRANSPARENT: false,
    BACK_COLOR: { r: 0, g: 0, b: 0 },
  },
  left: { kind: 'extraForce', multiplier: 4 },
  right: { kind: 'widerSplat', radius: 1.4 },
  middle: { kind: 'clear' },
  scroll: {
    setting: 'CURL',
    min: 0,
    max: 80,
    sensitivity: 6,
  },
}
