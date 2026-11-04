import file from './defaultPreset.json'
import type { Preset } from './types'

/**
 * Template for the + button and for Reset.
 * Replace `defaultPreset.json` with a preset exported from the editor.
 * Presets already saved in the browser keep their own values until you reset them.
 */
export const defaultPreset = file as Preset
