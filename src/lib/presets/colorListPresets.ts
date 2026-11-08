/**
 * Palettes for every color list in the editor.
 * Choosing one copies these colors into that list and saves the copy on the preset.
 * Add another `{ name, colors }` entry. Each color is `#RRGGBB`.
 * Cycle mode blends neighboring colors, then the last color back into the first.
 */
const groups: { name: string; palettes: { name: string; colors: string[] }[] }[] = [
  {
    name: 'Colorful',
    palettes: [
      { name: 'Primary', colors: ['#ff4466', '#44dd88', '#4488ff'] },
      { name: 'Fire', colors: ['#ff2a00', '#ff8c00', '#ffe14a'] },
      { name: 'Ocean', colors: ['#063d73', '#1aa6c7', '#d7fff8'] },
      { name: 'Neon', colors: ['#ff2bd6', '#22f0ff', '#c8ff3a'] },
      { name: 'Dusk', colors: ['#6c4cff', '#ff5fa2', '#7ec8ff'] },
      { name: 'Rainbow', colors: ['#ff2d2d', '#ff8a00', '#ffe14a', '#3dde6a', '#2ad4ff', '#3d5bff', '#b44dff', '#ff3d9a'] },
      { name: 'Candy', colors: ['#ff5ea8', '#ffd23f', '#7cff6b', '#5ce1ff', '#b388ff'] },
      { name: 'Tropical', colors: ['#ff4d6d', '#ff9f1c', '#ffe66d', '#2ec4b6', '#145a73'] },
      { name: 'Carnival', colors: ['#ff006e', '#fb5607', '#ffbe0b', '#3a86ff', '#8338ec'] },
      { name: 'Jelly', colors: ['#ff6b6b', '#feca57', '#1dd1a1', '#48dbfb', '#ff9ff3'] },
      { name: 'Holi', colors: ['#ff1744', '#ffea00', '#00e676', '#00b0ff', '#d500f9', '#ffffff'] },
      { name: 'Prism', colors: ['#ff3355', '#ffcc33', '#33e07a', '#33c7ff', '#aa55ff'] },
      { name: 'Laser', colors: ['#ff0040', '#00ffd0', '#c8ff00', '#7a00ff'] },
      { name: 'Miami', colors: ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff', '#fffb96'] },
      { name: 'Festival', colors: ['#ff3864', '#ff9f1c', '#f7e733', '#2ec4b6', '#7b2cbf'] },
      { name: 'Aurora', colors: ['#071a33', '#1f8a5b', '#3dffb0', '#7a5cff', '#ff4fa3'] },
      { name: 'Galaxy', colors: ['#070714', '#3b1d6e', '#c084fc', '#ff4d8d', '#f8e7ff'] },
      { name: 'Sunset', colors: ['#1b1035', '#c23b6e', '#ff7a3c', '#ffd27a', '#7ec8ff'] },
      { name: 'Lagoon', colors: ['#042f2e', '#0f766e', '#2dd4bf', '#fef3c7', '#fb7185'] },
      { name: 'Peacock', colors: ['#012a4a', '#01497c', '#2a9d8f', '#e9c46a', '#e76f51'] },
      { name: 'Garden', colors: ['#1b4332', '#52b788', '#ffd166', '#ef476f', '#118ab2'] },
      { name: 'Butterfly', colors: ['#ffb703', '#fb8500', '#ff4d6d', '#c77dff', '#8ecae6', '#023047'] },
      { name: 'Koi', colors: ['#f7f3ee', '#faa307', '#e85d04', '#9b2226', '#1d3557'] },
      { name: 'Confetti', colors: ['#ff3b6a', '#ffd000', '#00e5a8', '#4d7cff', '#ff4fd8', '#f7f7f2'] },
      { name: 'Nebula', colors: ['#0b0614', '#4c1d95', '#db2777', '#fb7185', '#e0f2fe'] },
      { name: 'Jungle', colors: ['#052e16', '#166534', '#a3e635', '#facc15', '#f97316'] },
      { name: 'Night market', colors: ['#140814', '#ff2d6a', '#ffb703', '#2ec4b6', '#f7f3ee'] },
      { name: 'Lava lamp', colors: ['#1a0533', '#c026d3', '#fb923c', '#fde68a'] },
      { name: 'Citrus', colors: ['#fff7d6', '#ffe14a', '#ff9f1c', '#ff4d2e', '#7cb518'] },
      { name: 'Watermelon', colors: ['#14532d', '#4ade80', '#fb7185', '#fecdd3', '#f0fdf4'] },
    ],
  },
  {
    name: 'Soft',
    palettes: [
      { name: 'Sorbet', colors: ['#ffb3c6', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#bdb2ff'] },
      { name: 'Macaron', colors: ['#f6bd60', '#f28482', '#f5cac3', '#84a59d', '#f7ede2'] },
      { name: 'Sea glass', colors: ['#cfe8e4', '#f6d6c9', '#e7c6d4', '#d5e2c4', '#f3efe7'] },
      { name: 'Pearl', colors: ['#f7f4ef', '#e4dff0', '#d5ebe4', '#f3e2d4', '#ddd6e8'] },
      { name: 'Lilac fog', colors: ['#efeaf6', '#d4c4e0', '#b39cbc', '#7d6b86', '#3c3344'] },
      { name: 'Peony', colors: ['#fff1f2', '#fecdd3', '#fda4af', '#fb7185', '#fff7f8'] },
      { name: 'Bone', colors: ['#f6f1e7', '#e7dccb', '#cbbfa8', '#8a8175', '#2a2622'] },
      { name: 'Glacier', colors: ['#e0f2fe', '#bae6fd', '#7dd3fc', '#e0fdf4', '#f8fafc'] },
      { name: 'Cotton', colors: ['#fff7fb', '#ffe4ef', '#fbcfe8', '#f9a8d4'] },
      { name: 'Porcelain', colors: ['#fbf8f3', '#efe8df', '#d9cfc3', '#b7aea3'] },
    ],
  },
  {
    name: 'Dark',
    palettes: [
      { name: 'Ember', colors: ['#120806', '#7a1c0c', '#ff4d00', '#ffb703', '#2a120c'] },
      { name: 'Biolume', colors: ['#020510', '#06353a', '#14f1c4', '#b8ffe8', '#0b2a22'] },
      { name: 'UV', colors: ['#070014', '#3b0764', '#7c3aed', '#ff2bd6', '#e9d5ff'] },
      { name: 'Toxic', colors: ['#071006', '#1a1408', '#c6ff00', '#f4ff8a', '#0c1208'] },
      { name: 'Infrared', colors: ['#050007', '#4a0028', '#e11d48', '#ff6b8a', '#ffd6e0'] },
      { name: 'X-ray', colors: ['#02060a', '#083344', '#22d3ee', '#ecfeff'] },
      { name: 'Terminal', colors: ['#031206', '#0b3d1e', '#39ff14', '#c8ffc8'] },
      { name: 'Amber CRT', colors: ['#120c02', '#6b3e00', '#ffb000', '#ffe7a3'] },
      { name: 'Heat', colors: ['#05010a', '#4c1d95', '#e11d48', '#f97316', '#fde047', '#f8fafc'] },
      { name: 'Midnight', colors: ['#05060f', '#141833', '#3d4c7a', '#e8e6df'] },
      { name: 'Noir', colors: ['#070707', '#1a1a1a', '#c9a227', '#f4f0e6'] },
      { name: 'Candle', colors: ['#140e0a', '#78350f', '#fbbf24', '#fef3c7'] },
      { name: 'Blacklight', colors: ['#05000a', '#4c1d95', '#d946ef', '#e9d5ff', '#d9f99d'] },
      { name: 'Abyss', colors: ['#010208', '#0b1220', '#164e63', '#67e8f9'] },
      { name: 'Magma', colors: ['#1c0a0a', '#7f1d1d', '#ea580c', '#fde047', '#1c1410'] },
    ],
  },
  {
    name: 'Earth',
    palettes: [
      { name: 'Blood', colors: ['#1a0506', '#7f1d1d', '#dc2626', '#fecaca'] },
      { name: 'Moss', colors: ['#10180f', '#3f4f2f', '#7d9a62', '#e4efd4'] },
      { name: 'Wine', colors: ['#2a0a14', '#7f1d3a', '#c45c74', '#f3d0d6'] },
      { name: 'Gold', colors: ['#3a2814', '#a16207', '#eab308', '#fef3c7'] },
      { name: 'Copper', colors: ['#2b160f', '#9a3412', '#ea7a45', '#f6d2be'] },
      { name: 'Clay', colors: ['#3f2e2a', '#a15c48', '#e0b08a', '#f3e6da'] },
      { name: 'Sand', colors: ['#3f3426', '#a89070', '#e6d3a3', '#f6f0e4'] },
      { name: 'Rust', colors: ['#1c100c', '#9a3412', '#d4845a', '#f0d8c4'] },
      { name: 'Honey', colors: ['#3a2508', '#d97706', '#fbbf24', '#fff7e0'] },
      { name: 'Sepia', colors: ['#2a2118', '#6b5344', '#c4a484', '#f3e6d4'] },
      { name: 'Ink wash', colors: ['#f7f4ef', '#d6d3cd', '#6b7280', '#1f2937'] },
      { name: 'Fog', colors: ['#6b7280', '#9ca3af', '#e5e7eb', '#f9fafb'] },
      { name: 'Ash', colors: ['#141414', '#525252', '#a3a3a3', '#f5f5f5'] },
      { name: 'Matcha', colors: ['#1c2416', '#4d6b45', '#c5d5a1', '#f4f7ee'] },
      { name: 'Plum', colors: ['#1b1024', '#6b2d6b', '#c084b8', '#f3e0f0'] },
      { name: 'Blueprint', colors: ['#071426', '#1e3a5f', '#5b8fd4', '#e4eefc'] },
      { name: 'Sakura', colors: ['#3f241c', '#f4c2c2', '#fff7f8', '#8d5a4a'] },
      { name: 'Desert night', colors: ['#120c1e', '#4a3560', '#d4894a', '#f2d7b0', '#efe8dc'] },
      { name: 'Storm', colors: ['#0f1419', '#445566', '#b7c4d0', '#f2f5f8', '#c45c26'] },
      { name: 'Dawn', colors: ['#1a1030', '#d46b86', '#f4a261', '#ffe8c2', '#d7e8ff'] },
    ],
  },
  {
    name: 'Contrast',
    palettes: [
      { name: 'Ink', colors: ['#0a0a0a', '#f4f1ea', '#9f1239'] },
      { name: 'Signal', colors: ['#0c1208', '#39ff14'] },
      { name: 'One spark', colors: ['#0c0c0e', '#1a1a1e', '#ff2d2d'] },
      { name: 'Magenta lime', colors: ['#ff2bd6', '#d6ff00'] },
      { name: 'Orange blue', colors: ['#ff6a00', '#1d4ed8'] },
      { name: 'Red cyan', colors: ['#ff2a2a', '#00e5ff'] },
      { name: 'Ice fire', colors: ['#d7f6ff', '#38bdf8', '#ff7a3c', '#ff2a00'] },
      { name: 'Warning', colors: ['#111111', '#f5d000', '#111111', '#f5d000'] },
      { name: 'Tiger', colors: ['#1a1208', '#f5b000', '#111111', '#f7f3ee'] },
      { name: 'Bauhaus', colors: ['#e10600', '#f5d000', '#0047ab', '#111111', '#f7f4ef'] },
      { name: 'Riso', colors: ['#ff4fa3', '#2f5bff', '#ffe14a', '#161616'] },
      { name: 'Outrun', colors: ['#0b0320', '#ff2a6d', '#05d9e8', '#f9f871'] },
      { name: 'Vapor', colors: ['#ff71ce', '#b967ff', '#01cdfe', '#f7f4ef'] },
      { name: 'Traffic', colors: ['#15803d', '#f5d000', '#dc2626'] },
      { name: 'Film', colors: ['#12343a', '#2a6f78', '#f0ddc8', '#e07a3d', '#8c3a2b'] },
      { name: 'Oil', colors: ['#07080c', '#1e2a44', '#3d6b68', '#8a4f7a', '#d4a24c'] },
      { name: 'Bruise', colors: ['#2a2438', '#7a5a86', '#c4a35a', '#8a9a6a', '#efe6da'] },
      { name: 'Mint chip', colors: ['#052e16', '#166534', '#bbf7d0', '#f8fafc', '#3f3f46'] },
      { name: 'Ink gold', colors: ['#0c0a09', '#1c1917', '#ca8a04', '#fef3c7'] },
      { name: 'Steel rose', colors: ['#1f2937', '#9ca3af', '#f5f5f4', '#fda4af', '#9f1239'] },
      { name: 'Candy cane', colors: ['#f7f4ef', '#e11d48', '#f7f4ef', '#be123c'] },
      { name: 'Moth', colors: ['#1c140f', '#c4a574', '#f0e6d4', '#5c4636'] },
      { name: 'Chrome', colors: ['#0e1116', '#4b5563', '#d1d5db', '#f9fafb', '#7dd3fc'] },
      { name: 'Voltage', colors: ['#facc15', '#111827', '#22d3ee', '#fde047'] },
    ],
  },
]

export type ColorListPreset = {
  name: string
  colors: number[]
}

export type ColorListGroup = {
  name: string
  presets: (ColorListPreset & { index: number })[]
}

let nextIndex = 0

export const colorListGroups: ColorListGroup[] = groups.map((group) => ({
  name: group.name,
  presets: group.palettes.map((preset) => ({
    name: preset.name,
    colors: preset.colors.map(packColor),
    index: nextIndex++,
  })),
}))

export const colorListPresets: ColorListPreset[] = colorListGroups.flatMap((group) =>
  group.presets.map(({ name, colors }) => ({ name, colors })),
)

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
