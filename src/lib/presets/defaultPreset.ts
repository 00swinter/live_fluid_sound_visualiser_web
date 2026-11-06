import file from './defaultPreset.json'
import { completeAudio, type Preset } from './types'

/**
 * Template for the + button and for Reset.
 * Replace `defaultPreset.json` with a preset exported from the editor.
 * Presets already saved in the browser keep their own values until you reset them.
 */
const loaded = file as Omit<Preset, 'audio'> & { audio?: unknown }

export const defaultPreset: Preset = {
  ...loaded,
  audio: completeAudio(loaded.audio),
}
