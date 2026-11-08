import type { FluidColor, FluidSim } from '../fluid/createFluidSim'

/** Lower name band, grown well past the marked rectangle. Fractions of the view: left, top, right, bottom. */
const NAME_BAND = { x0: 0.16, y0: 0.54, x1: 0.84, y1: 0.96 }

const plate = document.createElement('canvas')

/** White dye, bright enough to read, with no push of its own. */
const INK: FluidColor = { r: 1, g: 1, b: 1 }

/** Clear the lower band, then stamp the preset name there as dye with no velocity. */
export function stampPresetName(sim: FluidSim, canvas: HTMLCanvasElement, name: string) {
  const viewW = canvas.clientWidth
  const viewH = canvas.clientHeight
  if (viewW < 2 || viewH < 2) return
  const label = name.trim() || 'Preset'
  const x = viewW * NAME_BAND.x0
  const y = viewH * NAME_BAND.y0
  const width = viewW * (NAME_BAND.x1 - NAME_BAND.x0)
  const height = viewH * (NAME_BAND.y1 - NAME_BAND.y0)
  sim.clearPatch(x, y, width, height)
  drawName(label, width, height)
  sim.stampInk(plate, x, y, width, height, INK)
}

function drawName(label: string, width: number, height: number) {
  const w = Math.max(2, Math.round(width))
  const h = Math.max(2, Math.round(height))
  plate.width = w
  plate.height = h
  const ctx = plate.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const maxW = w * 0.96
  const maxH = h * 0.92
  let size = maxH
  for (let attempt = 0; attempt < 4; attempt += 1) {
    ctx.font = `800 ${size}px "Segoe UI", system-ui, sans-serif`
    const metrics = ctx.measureText(label)
    const textW = Math.max(metrics.width, 1)
    const textH = Math.max((metrics.actualBoundingBoxAscent || size * 0.8) + (metrics.actualBoundingBoxDescent || size * 0.2), 1)
    const fit = Math.min(maxW / textW, maxH / textH)
    if (fit >= 0.99) break
    size *= fit
  }
  ctx.font = `800 ${size}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText(label, w / 2, h / 2)
}
