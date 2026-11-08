import { completeSymmetry, type CursorSymmetry } from '../presets/types'

export type SymmetryStroke = {
  x: number
  y: number
  dx: number
  dy: number
}

const SAME_PIXEL = 0.35

/**
 * Paint copies of one cursor stroke.
 * The real stroke is first. Copies that land on the same pixel are dropped so dye is not stacked.
 * Mirror lines start with a vertical split, then add lines through the center.
 * Rotation turns the stroke around the center. Nothing here draws a seam or changes the simulation.
 */
export function symmetryStrokes(
  symmetry: CursorSymmetry | undefined,
  x: number,
  y: number,
  dx: number,
  dy: number,
  width: number,
  height: number,
): SymmetryStroke[] {
  const real = { x, y, dx, dy }
  const resolved = completeSymmetry(symmetry)
  if (resolved.kind === 'off' || width < 2 || height < 2) return [real]
  const cx = width / 2
  const cy = height / 2
  if (resolved.kind === 'rotate') return rotateCopies(real, resolved.count, cx, cy)
  return mirrorCopies(real, resolved.count, cx, cy)
}

function rotateCopies(real: SymmetryStroke, count: number, cx: number, cy: number) {
  const px = real.x - cx
  const py = real.y - cy
  const step = (Math.PI * 2) / count
  const copies: SymmetryStroke[] = []
  for (let i = 0; i < count; i++) {
    const angle = step * i
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    pushUnique(copies, {
      x: cx + px * cos - py * sin,
      y: cy + px * sin + py * cos,
      dx: real.dx * cos - real.dy * sin,
      dy: real.dx * sin + real.dy * cos,
    })
  }
  return copies
}

function mirrorCopies(real: SymmetryStroke, count: number, cx: number, cy: number) {
  const lines = count / 2
  const gap = Math.PI / lines
  const local: SymmetryStroke[] = [{ x: real.x - cx, y: real.y - cy, dx: real.dx, dy: real.dy }]
  let grew = true
  while (grew && local.length < count) {
    grew = false
    for (let line = 0; line < lines && local.length < count; line++) {
      const phi = Math.PI / 2 + gap * line
      for (const stroke of local.slice()) {
        if (local.length >= count) break
        const before = local.length
        pushUnique(local, reflect(stroke, phi))
        if (local.length !== before) grew = true
      }
    }
  }
  return local.map((stroke) => ({
    x: stroke.x + cx,
    y: stroke.y + cy,
    dx: stroke.dx,
    dy: stroke.dy,
  }))
}

/** Reflect a point and its movement across the line through the origin at `phi`. */
function reflect(stroke: SymmetryStroke, phi: number): SymmetryStroke {
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  return {
    x: reflectedX(stroke.x, stroke.y, cos, sin),
    y: reflectedY(stroke.x, stroke.y, cos, sin),
    dx: reflectedX(stroke.dx, stroke.dy, cos, sin),
    dy: reflectedY(stroke.dx, stroke.dy, cos, sin),
  }
}

function reflectedX(x: number, y: number, cos: number, sin: number) {
  const parallel = x * cos + y * sin
  const across = -x * sin + y * cos
  return parallel * cos + across * sin
}

function reflectedY(x: number, y: number, cos: number, sin: number) {
  const parallel = x * cos + y * sin
  const across = -x * sin + y * cos
  return parallel * sin - across * cos
}

function pushUnique(copies: SymmetryStroke[], stroke: SymmetryStroke) {
  if (copies.some((item) => Math.abs(item.x - stroke.x) < SAME_PIXEL && Math.abs(item.y - stroke.y) < SAME_PIXEL)) return
  copies.push(stroke)
}
