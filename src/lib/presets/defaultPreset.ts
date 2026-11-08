import file from './defaultPreset.json'
import { completeAudio, completeSymmetry, type Preset } from './types'

/**
 * Template for the + button and for Reset.
 * Replace `defaultPreset.json` with a preset exported from the editor.
 * Presets already saved in the browser keep their own values until you reset them.
 */
const loaded = file as Omit<Preset, 'audio'> & { audio?: unknown; cursor: { symmetry?: unknown } }

export const defaultPreset: Preset = {
  ...loaded,
  cursor: {
    ...loaded.cursor,
    symmetry: completeSymmetry(loaded.cursor.symmetry),
  },
  audio: completeAudio(loaded.audio),
}
