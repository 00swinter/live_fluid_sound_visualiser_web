import { properties, snapControl, type ParamValue, type PerformanceSetting } from '../behaviors'
import { defaultPreset } from './defaultPreset'
import { completeAudio, completeSymmetry, splatColorMode, type AxisMap, type ButtonBinding, type Preset, type PresetSettings, type ScrollSetting } from './types'

const STORAGE_KEY = 'live-fluid-presets'
const PERFORMANCE_KEY = 'live-fluid-performance'

export type PerformanceSettings = Record<PerformanceSetting, number>

const performanceDefaults: PerformanceSettings = {
  SIM_RESOLUTION: 256,
  DYE_RESOLUTION: 1024,
}

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

/** Resolution shared by every preset. The first visit keeps the resolution already saved on the active preset. */
export function loadPerformance(): PerformanceSettings {
  try {
    const raw = localStorage.getItem(PERFORMANCE_KEY)
    if (raw) return parsePerformance(JSON.parse(raw))
  } catch {
    // Fall through to the preset that was playing before resolution became global.
  }
  return performanceFromLibrary() ?? { ...performanceDefaults }
}

export function savePerformance(settings: PerformanceSettings) {
  try {
    localStorage.setItem(PERFORMANCE_KEY, JSON.stringify(settings))
  } catch {
    // A full or blocked store should not stop the show.
  }
}

function parsePerformance(raw: unknown): PerformanceSettings {
  const value = raw && typeof raw === 'object' ? (raw as Partial<PerformanceSettings>) : {}
  return {
    SIM_RESOLUTION: snapPerformance('SIM_RESOLUTION', value.SIM_RESOLUTION),
    DYE_RESOLUTION: snapPerformance('DYE_RESOLUTION', value.DYE_RESOLUTION),
  }
}

function snapPerformance(key: PerformanceSetting, value: unknown) {
  return snapControl(key, finite(value, performanceDefaults[key]))
}

function performanceFromLibrary(): PerformanceSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const library = JSON.parse(raw) as { activeId?: unknown; presets?: unknown }
    if (!Array.isArray(library.presets)) return null
    const active = library.presets.find((item) => {
      return !!item && typeof item === 'object' && (item as { id?: unknown }).id === library.activeId
    })
    const preset = active ?? library.presets[0]
    if (!preset || typeof preset !== 'object') return null
    const settings = (preset as { settings?: unknown }).settings
    if (!settings || typeof settings !== 'object') return null
    const value = settings as Partial<PerformanceSettings>
    if (typeof value.SIM_RESOLUTION !== 'number' && typeof value.DYE_RESOLUTION !== 'number') return null
    return parsePerformance(value)
  } catch {
    return null
  }
}

function freshLibrary(): PresetLibrary {
  return { activeId: defaultPreset.id, presets: [structuredClone(defaultPreset)] }
}

/**
 * Copies from `public/presets.json` for the browser library.
 * The file may be an array of exported presets, one preset, or `{ presets: [...] }`.
 * Each copy gets a new id. A name already in `takenNames` is kept and the new one ends with `(1)`, `(2)`, and so on.
 */
export function presetCopies(raw: unknown, takenNames: Iterable<string>): Preset[] {
  const taken = new Set(takenNames)
  const copies: Preset[] = []
  for (const item of bundleItems(raw)) {
    const preset = parsePreset(withPresetId(item))
    if (!preset) continue
    preset.id = crypto.randomUUID()
    preset.name = openName(preset.name, taken)
    taken.add(preset.name)
    copies.push(preset)
  }
  return copies
}

function bundleItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object' && Array.isArray((raw as { presets?: unknown }).presets)) {
    return (raw as { presets: unknown[] }).presets
  }
  if (raw && typeof raw === 'object') return [raw]
  return []
}

function withPresetId(item: unknown) {
  if (!item || typeof item !== 'object') return item
  const value = item as { id?: unknown }
  if (typeof value.id === 'string' && value.id.length > 0) return item
  return { ...value, id: crypto.randomUUID() }
}

function openName(name: string, taken: Set<string>) {
  const base = name.trim() || 'Preset'
  if (!taken.has(base)) return base
  let count = 1
  while (taken.has(`${base} (${count})`)) count += 1
  return `${base} (${count})`
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
      colors: parseColorList(savedSplat(value).colors, base.splat.colors),
      colorMode: splatColorMode(savedSplat(value), base.splat.colorMode),
      cycleSeconds: finite(value.splat?.cycleSeconds, base.splat.cycleSeconds),
      paint: parsePaint(value),
    },
    cursor: {
      x: parseAxis(value.cursor?.x, base.cursor.x),
      y: parseAxis(value.cursor?.y, base.cursor.y),
      symmetry: completeSymmetry(value.cursor?.symmetry),
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
    audio: completeAudio(value.audio),
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

function savedSplat(value: Partial<Preset>) {
  return (value.splat ?? {}) as Partial<Preset['splat']> & { colorful?: unknown }
}

function parseColorList(raw: unknown, fallback: number[]) {
  if (!Array.isArray(raw)) return [...fallback]
  return raw
    .filter((color): color is number => typeof color === 'number' && Number.isFinite(color))
    .map((color) => Math.round(color) & 0xffffff)
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

function paramRecord(raw: unknown): Record<string, ParamValue> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, ParamValue> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (typeof value === 'string') out[key] = value
    else if (Array.isArray(value)) {
      const colors = value.filter((color): color is number => typeof color === 'number' && Number.isFinite(color))
      out[key] = colors.map((color) => color & 0xffffff)
    }
  }
  return out
}

function settingOf(value: unknown, fallback: ScrollSetting): ScrollSetting {
  return typeof value === 'string' && propertyKeys.has(value) ? (value as ScrollSetting) : fallback
}

function finite(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}
