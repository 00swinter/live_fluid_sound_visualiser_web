/**
 * Palettes for every color list in the editor.
 * Choosing one copies these colors into that list and saves the copy on the preset.
 * Add another `{ name, colors }` entry. Each color is `#RRGGBB`.
 */
const palettes: { name: string; colors: string[] }[] = [
  { name: 'Primary', colors: ['#ff4466', '#44dd88', '#4488ff'] },
  { name: 'Fire', colors: ['#ff2a00', '#ff8c00', '#ffe14a'] },
  { name: 'Ocean', colors: ['#063d73', '#1aa6c7', '#d7fff8'] },
  { name: 'Neon', colors: ['#ff2bd6', '#22f0ff', '#c8ff3a'] },
  { name: 'Dusk', colors: ['#6c4cff', '#ff5fa2', '#7ec8ff'] },
]

export type ColorListPreset = {
  name: string
  colors: number[]
}

export const colorListPresets: ColorListPreset[] = palettes.map((preset) => ({
  name: preset.name,
  colors: preset.colors.map(packColor),
}))

/** Index of the palette whose colors match this list, or -1 when the list is custom. */
export function colorListPresetIndex(colors: number[]) {
  return colorListPresets.findIndex(
    (preset) =>
      preset.colors.length === colors.length &&
      preset.colors.every((color, index) => color === (colors[index] & 0xffffff)),
  )
}

function packColor(hex: string) {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!match) throw new Error(`Color list preset needs #RRGGBB, got ${hex}`)
  return Number.parseInt(match[1], 16)
}
