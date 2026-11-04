import { properties } from '../behaviors'
import type { FluidNumberSetting } from '../fluid/createFluidSim'
import { defaultPreset } from './defaultPreset'
import type { AxisMap, ButtonBinding, Preset, PresetSettings, ScrollSetting } from './types'

const STORAGE_KEY = 'live-fluid-presets'

export type PresetLibrary = {
  activeId: string
  presets: Preset[]
}

const propertyKeys = new Set<string>(properties.map((property) => property.key))

export function loadPresetLibrary(): PresetLibrary {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return freshLibrary()
    return parseLibrary(JSON.parse(raw)) ?? freshLibrary()
  } catch {
    return freshLibrary()
  }
}

export function savePresetLibrary(library: PresetLibrary) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(library))
  } catch {
    // A full or blocked store should not stop the show.
  }
}

function freshLibrary(): PresetLibrary {
  return { activeId: defaultPreset.id, presets: [structuredClone(defaultPreset)] }
}

function parseLibrary(raw: unknown): PresetLibrary | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as { activeId?: unknown; presets?: unknown }
  if (!Array.isArray(value.presets)) return null
  const presets: Preset[] = []
  const seen = new Set<string>()
  for (const item of value.presets) {
    const preset = parsePreset(item)
    if (!preset || seen.has(preset.id)) continue
    seen.add(preset.id)
    presets.push(preset)
  }
  if (presets.length === 0) return null
  const activeId = typeof value.activeId === 'string' && seen.has(value.activeId) ? value.activeId : presets[0].id
  return { activeId, presets }
}

function parsePreset(raw: unknown): Preset | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<Preset>
  if (typeof value.id !== 'string' || value.id.length === 0) return null
  const base = defaultPreset
  return {
    id: value.id,
    name: typeof value.name === 'string' && value.name.length > 0 ? value.name : 'Preset',
    splat: {
      force: finite(value.splat?.force, base.splat.force),
      dye: finite(value.splat?.dye, base.splat.dye),
      colorful: bool(value.splat?.colorful, base.splat.colorful),
      paint: parsePaint(value),
    },
    cursor: {
      x: parseAxis(value.cursor?.x, base.cursor.x),
      y: parseAxis(value.cursor?.y, base.cursor.y),
    },
    settings: parseSettings(value.settings),
    left: parseBinding(value.left, base.left),
    right: parseBinding(value.right, base.right),
    middle: parseBinding(value.middle, base.middle),
    scroll: {
      setting: settingOf(value.scroll?.setting, base.scroll.setting),
      min: finite(value.scroll?.min, base.scroll.min),
      max: finite(value.scroll?.max, base.scroll.max),
      sensitivity: finite(value.scroll?.sensitivity, base.scroll.sensitivity),
    },
  }
}

function parseSettings(raw: unknown): PresetSettings {
  const settings = structuredClone(defaultPreset.settings)
  if (!raw || typeof raw !== 'object') return settings
  const value = raw as Partial<PresetSettings>
  for (const property of properties) {
    const next = value[property.key]
    if (typeof next === 'number' && Number.isFinite(next)) settings[property.key] = next
  }
  settings.SHADING = bool(value.SHADING, settings.SHADING)
  settings.BLOOM = bool(value.BLOOM, settings.BLOOM)
  settings.PAUSED = bool(value.PAUSED, settings.PAUSED)
  settings.TRANSPARENT = bool(value.TRANSPARENT, settings.TRANSPARENT)
  const color = value.BACK_COLOR
  if (color && finite(color.r, -1) >= 0 && finite(color.g, -1) >= 0 && finite(color.b, -1) >= 0) {
    settings.BACK_COLOR = { r: color.r, g: color.g, b: color.b }
  }
  return settings
}

function parsePaint(value: Partial<Preset>): Preset['splat']['paint'] {
  const saved = value.splat as { paint?: unknown; always?: unknown } | undefined
  if (saved?.paint === 'always' || saved?.paint === 'left' || saved?.paint === 'right') return saved.paint
  if (saved?.always === false) {
    if (value.left?.hold === 'velocitySplat') return 'left'
    if (value.right?.hold === 'velocitySplat') return 'right'
    return 'left'
  }
  return 'always'
}

function parseAxis(raw: Partial<AxisMap> | undefined, fallback: AxisMap): AxisMap {
  return {
    enabled: bool(raw?.enabled, fallback.enabled),
    setting: settingOf(raw?.setting, fallback.setting),
    min: finite(raw?.min, fallback.min),
    max: finite(raw?.max, fallback.max),
  }
}

function parseBinding(raw: Partial<ButtonBinding> | undefined, fallback: ButtonBinding): ButtonBinding {
  if (!raw) return structuredClone(fallback)
  return {
    click: idOrNull(raw.click, fallback.click),
    hold: idOrNull(raw.hold === 'velocitySplat' ? null : raw.hold, fallback.hold),
    clickParams: paramRecord(raw.clickParams),
    holdParams: paramRecord(raw.holdParams),
  }
}

function idOrNull(value: unknown, fallback: string | null) {
  if (value === null) return null
  return typeof value === 'string' ? value : fallback
}

function paramRecord(raw: unknown): Record<string, number | number[]> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, number | number[]> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    if (!Array.isArray(value)) continue
    const colors = value.filter((color): color is number => typeof color === 'number' && Number.isFinite(color))
    out[key] = colors.map((color) => color & 0xffffff)
  }
  return out
}

function settingOf(value: unknown, fallback: ScrollSetting): ScrollSetting {
  return typeof value === 'string' && propertyKeys.has(value) ? (value as FluidNumberSetting) : fallback
}

function finite(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}
