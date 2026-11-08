export type HeldButtons = {
  left: boolean
  right: boolean
  middle: boolean
}

export type PointerMove = {
  x: number
  y: number
  dx: number
  dy: number
  buttons: HeldButtons
}

/** Wheel change in notches. A typical mouse notch is 1; trackpads send fractions. */
export type WheelDelta = {
  notches: number
  x: number
  y: number
}

const NONE: HeldButtons = { left: false, right: false, middle: false }

function buttonsFrom(bits: number): HeldButtons {
  return {
    left: (bits & 1) !== 0,
    right: (bits & 2) !== 0,
    middle: (bits & 4) !== 0,
  }
}

function sameButtons(a: HeldButtons, b: HeldButtons) {
  return a.left === b.left && a.right === b.right && a.middle === b.middle
}

function anyHeld(buttons: HeldButtons) {
  return buttons.left || buttons.right || buttons.middle
}

/**
 * Tracks one pointer on the canvas.
 * Movement is raw pixel deltas. Held buttons clear on blur so a missed mouse-up cannot stick.
 */
export function watchPointer(
  canvas: HTMLCanvasElement,
  listener: {
    onMove: (move: PointerMove) => void
    onButtons?: (buttons: HeldButtons, point: { x: number; y: number }) => void
    onWheel?: (wheel: WheelDelta) => void
  },
): () => void {
  let buttons = { ...NONE }
  let last: { x: number; y: number } | null = null
  let capturedId: number | null = null

  function publishButtons(next: HeldButtons, point: { x: number; y: number }) {
    if (sameButtons(buttons, next)) return
    buttons = next
    listener.onButtons?.({ ...buttons }, point)
  }

  function pointFrom(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button === 1) event.preventDefault()
    try {
      canvas.setPointerCapture(event.pointerId)
      capturedId = event.pointerId
    } catch {
      capturedId = null
    }
    publishButtons(buttonsFrom(event.buttons), pointFrom(event))
  }

  function onPointerMove(event: PointerEvent) {
    if (capturedId != null && event.pointerId !== capturedId) return
    const point = pointFrom(event)
    publishButtons(buttonsFrom(event.buttons), point)
    if (last) {
      listener.onMove({
        x: point.x,
        y: point.y,
        dx: point.x - last.x,
        dy: point.y - last.y,
        buttons: { ...buttons },
      })
    }
    last = point
  }

  function onPointerLeave() {
    if (capturedId != null) return
    last = null
  }

  function onPointerUp(event: PointerEvent) {
    if (capturedId != null && event.pointerId !== capturedId) return
    publishButtons(buttonsFrom(event.buttons), pointFrom(event))
    if (!anyHeld(buttons)) {
      capturedId = null
      last = null
    }
  }

  function releaseHeld() {
    const point = last ?? { x: 0, y: 0 }
    capturedId = null
    last = null
    publishButtons({ ...NONE }, point)
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 1 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 16 : 100
    listener.onWheel?.({
      notches: event.deltaY / unit,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }

  function onMiddleMouseDown(event: MouseEvent) {
    if (event.button === 1) event.preventDefault()
  }

  function onContextMenu(event: Event) {
    event.preventDefault()
  }

  function onBlur() {
    releaseHeld()
  }

  function onVisibility() {
    if (document.hidden) releaseHeld()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('mousedown', onMiddleMouseDown)
  canvas.addEventListener('auxclick', onMiddleMouseDown)
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerleave', onPointerLeave)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerUp)
    canvas.removeEventListener('mousedown', onMiddleMouseDown)
    canvas.removeEventListener('auxclick', onMiddleMouseDown)
    canvas.removeEventListener('contextmenu', onContextMenu)
    canvas.removeEventListener('wheel', onWheel)
    window.removeEventListener('blur', onBlur)
    document.removeEventListener('visibilitychange', onVisibility)
    releaseHeld()
  }
}
