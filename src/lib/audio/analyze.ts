/** Smoothed levels are 0 when silent and 1 at full scale. `pitch` is 0 for low, 1 for high. */
export type AudioBands = {
  level: number
  bass: number
  mid: number
  treble: number
  pitch: number
}

export type AudioFrame = AudioBands & {
  beat: boolean
}

/**
 * Same centers and Q as the desktop engine's audio presets.
 * Each band is a 2nd-order band-pass, then the peak of that filtered sound.
 */
export const listenBands = {
  kick: { frequency: 60, q: 2 },
  bass: { frequency: 120, q: 1 },
  mid: { frequency: 2000, q: 1 },
  treble: { frequency: 8000, q: 1.5 },
} as const

/** Loudest sample in one analysis window, lifted so a musical peak can reach 1. */
export function peakLevel(samples: Float32Array) {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i] < 0 ? -samples[i] : samples[i]
    if (value > peak) peak = value
  }
  return Math.min(1, peak * 2.4)
}

/** Overall loudness from the unfiltered wave. */
export function rmsLevel(samples: Float32Array) {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.min(1, Math.sqrt(sum / samples.length) * 4)
}

/** 0 is low, 1 is high. Uses the full spectrum, not one band. */
export function pitchLevel(freq: Uint8Array) {
  return centroid(freq)
}

/** Quiet values collapse to 0, and the rest stretches to fill 0–1. */
export function aboveFloor(amount: number, floor: number) {
  const value = Math.min(1, Math.max(0, amount))
  if (floor <= 0) return value
  if (value <= floor) return 0
  return Math.min(1, (value - floor) / (1 - floor))
}

export function smoothToward(current: number, target: number, attack = 0.62, release = 0.2) {
  const rate = target > current ? attack : release
  return current + (target - current) * rate
}

/**
 * Fires when the kick band jumps above its recent average.
 * `sensitivity` is 0–1. Higher catches quieter hits. `cooldown` is seconds.
 */
export class BeatDetector {
  private history: number[] = []
  private previous = 0
  private lastAt = 0

  reset() {
    this.history = []
    this.previous = 0
    this.lastAt = 0
  }

  update(kick: number, now: number, sensitivity: number, cooldown: number) {
    const avg = this.history.length
      ? this.history.reduce((sum, value) => sum + value, 0) / this.history.length
      : kick
    this.history.push(kick)
    if (this.history.length > 50) this.history.shift()

    const rose = kick - this.previous
    this.previous = kick
    if (this.history.length < 12) return false
    if (rose < 0.03) return false
    if (now - this.lastAt < Math.max(0.05, cooldown) * 1000) return false

    const amount = Math.min(1, Math.max(0, sensitivity))
    const multiplier = 2.7 - amount * 1.55
    const threshold = Math.max(0.07, avg * multiplier)
    if (kick < threshold) return false
    this.lastAt = now
    return true
  }
}

function centroid(freq: Uint8Array) {
  let weighted = 0
  let sum = 0
  for (let i = 2; i < freq.length; i++) {
    weighted += i * freq[i]
    sum += freq[i]
  }
  if (sum < 1) return 0
  return Math.min(1, weighted / sum / (freq.length * 0.25))
}
