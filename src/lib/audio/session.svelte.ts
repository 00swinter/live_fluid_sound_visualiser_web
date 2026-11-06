import {
  aboveFloor,
  BeatDetector,
  listenBands,
  peakLevel,
  pitchLevel,
  rmsLevel,
  smoothToward,
  type AudioBands,
  type AudioFrame,
} from './analyze'

export type AudioSource = 'off' | 'mic' | 'system'

export type AudioListenOptions = {
  gain: number
  floor: number
  sensitivity: number
  cooldown: number
}

type SystemCaptureOptions = {
  video: { displaySurface: 'monitor' }
  audio: { suppressLocalAudioPlayback: boolean }
  preferCurrentTab: boolean
  selfBrowserSurface: 'exclude'
  systemAudio: 'include'
  surfaceSwitching: 'include'
  monitorTypeSurfaces: 'include'
}

const silentBands = (): AudioBands => ({ level: 0, bass: 0, mid: 0, treble: 0, pitch: 0 })

const defaultOptions: AudioListenOptions = {
  gain: 1.25,
  floor: 0.06,
  sensitivity: 0.58,
  cooldown: 0.16,
}

class AudioEngine {
  source = $state<AudioSource>('off')
  message = $state('')
  opening = $state(false)
  level = $state(0)
  bass = $state(0)
  mid = $state(0)
  treble = $state(0)
  pitch = $state(0)
  beatOn = $state(false)

  private context: AudioContext | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private gain: GainNode | null = null
  private filters: BiquadFilterNode[] = []
  private pitchAnalyser: AnalyserNode | null = null
  private kickAnalyser: AnalyserNode | null = null
  private bassAnalyser: AnalyserNode | null = null
  private midAnalyser: AnalyserNode | null = null
  private trebleAnalyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private freq = new Uint8Array(0)
  private wave = new Float32Array(2048)
  private bandWave = new Float32Array(1024)
  private smooth: AudioBands = silentBands()
  private beats = new BeatDetector()
  private listeners = new Set<(frame: AudioFrame) => void>()
  private readOptions: (() => AudioListenOptions) | null = null
  private requestId = 0
  private raf = 0
  private shownAt = 0
  private beatTimer = 0

  /** Preset values read once per analysis frame. */
  setBeatInput(read: (() => AudioListenOptions) | null) {
    this.readOptions = read
  }

  watch(listener: (frame: AudioFrame) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  useMicrophone() {
    if (this.source === 'mic') return
    return this.capture('mic', () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('unsupported')
      }
      return navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
    })
  }

  /** Everything playing on this computer. The browser still asks to share the screen once. */
  useSystem() {
    if (this.source === 'system') return
    return this.capture('system', async () => {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('unsupported')
      }
      const options: SystemCaptureOptions = {
        video: { displaySurface: 'monitor' },
        audio: { suppressLocalAudioPlayback: false },
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        systemAudio: 'include',
        surfaceSwitching: 'include',
        monitorTypeSurfaces: 'include',
      }
      try {
        return await navigator.mediaDevices.getDisplayMedia(options as DisplayMediaStreamOptions)
      } catch (error) {
        const name = error instanceof DOMException ? error.name : ''
        if (name !== 'OverconstrainedError' && name !== 'TypeError') throw error
        return navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
          ...{ systemAudio: 'include', selfBrowserSurface: 'exclude', monitorTypeSurfaces: 'include' },
        } as DisplayMediaStreamOptions)
      }
    })
  }

  stop() {
    this.requestId += 1
    if (this.source === 'off' && !this.stream) return
    this.release()
    this.emit({ ...silentBands(), beat: false })
  }

  private async capture(source: AudioSource, open: () => Promise<MediaStream>) {
    if (this.opening) return
    this.opening = true
    this.message = ''
    const request = ++this.requestId
    const ctx = this.ensureContext()
    try {
      const stream = await open()
      if (request !== this.requestId) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      if (ctx.state === 'suspended') await ctx.resume()
      if (request !== this.requestId) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const audioTracks = stream.getAudioTracks()
      const surface = stream.getVideoTracks()[0]?.getSettings().displaySurface
      if (source === 'system' && surface === 'browser') {
        stream.getTracks().forEach((track) => track.stop())
        this.message = 'That was a browser tab. Choose Entire screen so this hears everything on the computer.'
        return
      }
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((track) => track.stop())
        this.message =
          source === 'system'
            ? 'That share had no sound. Choose Entire screen and leave Share system audio on.'
            : 'No microphone was available.'
        return
      }
      this.quietVideo(stream)
      this.attach(stream, source)
    } catch (error) {
      if (request !== this.requestId) return
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'NotAllowedError' || name === 'AbortError') {
        this.message = source === 'mic' ? 'Microphone permission was blocked.' : 'Share was cancelled.'
      } else if (error instanceof Error && error.message === 'unsupported') {
        this.message = source === 'mic' ? 'This browser cannot open the microphone.' : 'This browser cannot capture system audio. Use Chrome or Edge.'
      } else {
        this.message = source === 'mic' ? 'The microphone could not be opened.' : 'System audio could not be opened.'
      }
    } finally {
      this.opening = false
    }
  }

  private ensureContext() {
    if (!this.context) this.context = new AudioContext()
    return this.context
  }

  /** The picture has to stay open or the browser also drops the sound. It is never shown. */
  private quietVideo(stream: MediaStream) {
    for (const track of stream.getVideoTracks()) {
      void track.applyConstraints({ width: 16, height: 16, frameRate: 1 }).catch(() => {})
    }
  }

  private attach(stream: MediaStream, source: AudioSource) {
    this.release()
    const ctx = this.ensureContext()
    const sourceNode = ctx.createMediaStreamSource(stream)
    const gain = ctx.createGain()
    gain.gain.value = this.readOptions?.().gain ?? defaultOptions.gain
    const pitch = ctx.createAnalyser()
    pitch.fftSize = 2048
    pitch.smoothingTimeConstant = 0
    sourceNode.connect(gain)
    gain.connect(pitch)
    this.sourceNode = sourceNode
    this.gain = gain
    this.pitchAnalyser = pitch
    this.kickAnalyser = this.bandAnalyser(ctx, gain, listenBands.kick.frequency, listenBands.kick.q)
    this.bassAnalyser = this.bandAnalyser(ctx, gain, listenBands.bass.frequency, listenBands.bass.q)
    this.midAnalyser = this.bandAnalyser(ctx, gain, listenBands.mid.frequency, listenBands.mid.q)
    this.trebleAnalyser = this.bandAnalyser(ctx, gain, listenBands.treble.frequency, listenBands.treble.q)
    this.stream = stream
    this.freq = new Uint8Array(pitch.frequencyBinCount)
    this.smooth = silentBands()
    this.beats.reset()
    this.source = source
    this.message = ''
    const stopIfOurs = () => {
      if (this.stream === stream) this.stop()
    }
    stream.getAudioTracks()[0]?.addEventListener('ended', stopIfOurs)
    stream.getVideoTracks()[0]?.addEventListener('ended', stopIfOurs)
    this.raf = requestAnimationFrame(this.tick)
  }

  private bandAnalyser(ctx: AudioContext, gain: GainNode, frequency: number, q: number) {
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = frequency
    filter.Q.value = q
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0
    gain.connect(filter)
    filter.connect(analyser)
    this.filters.push(filter)
    return analyser
  }

  private release() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    window.clearTimeout(this.beatTimer)
    this.beatOn = false
    this.level = 0
    this.bass = 0
    this.mid = 0
    this.treble = 0
    this.pitch = 0
    this.smooth = silentBands()
    this.beats.reset()
    const stream = this.stream
    this.stream = null
    stream?.getTracks().forEach((track) => track.stop())
    this.sourceNode?.disconnect()
    this.sourceNode = null
    this.gain?.disconnect()
    this.gain = null
    for (const filter of this.filters) filter.disconnect()
    this.filters = []
    this.pitchAnalyser = null
    this.kickAnalyser = null
    this.bassAnalyser = null
    this.midAnalyser = null
    this.trebleAnalyser = null
    this.source = 'off'
  }

  private tick = (now: number) => {
    this.raf = 0
    const pitch = this.pitchAnalyser
    const kick = this.kickAnalyser
    const bass = this.bassAnalyser
    const mid = this.midAnalyser
    const treble = this.trebleAnalyser
    if (!pitch || !kick || !bass || !mid || !treble) return
    const options = this.readOptions?.() ?? defaultOptions
    const gain = this.gain
    if (gain) {
      const next = Math.min(4, Math.max(0, options.gain))
      if (Math.abs(gain.gain.value - next) > 0.001) gain.gain.value = next
    }
    pitch.getByteFrequencyData(this.freq)
    pitch.getFloatTimeDomainData(this.wave)
    const raw: AudioBands = {
      level: rmsLevel(this.wave),
      bass: this.bandPeak(bass),
      mid: this.bandPeak(mid),
      treble: this.bandPeak(treble),
      pitch: pitchLevel(this.freq),
    }
    this.smooth = {
      level: smoothToward(this.smooth.level, raw.level),
      bass: smoothToward(this.smooth.bass, raw.bass),
      mid: smoothToward(this.smooth.mid, raw.mid),
      treble: smoothToward(this.smooth.treble, raw.treble),
      pitch: smoothToward(this.smooth.pitch, raw.pitch, 0.2, 0.12),
    }
    const beat = this.beats.update(aboveFloor(this.bandPeak(kick), options.floor), now, options.sensitivity, options.cooldown)
    const frame: AudioFrame = {
      level: aboveFloor(this.smooth.level, options.floor),
      bass: aboveFloor(this.smooth.bass, options.floor),
      mid: aboveFloor(this.smooth.mid, options.floor),
      treble: aboveFloor(this.smooth.treble, options.floor),
      pitch: this.smooth.pitch,
      beat,
    }
    this.publish(now, frame)
    this.emit(frame)
    if (this.pitchAnalyser) this.raf = requestAnimationFrame(this.tick)
  }

  private bandPeak(analyser: AnalyserNode) {
    analyser.getFloatTimeDomainData(this.bandWave)
    return peakLevel(this.bandWave)
  }

  private publish(now: number, frame: AudioFrame) {
    if (frame.beat) {
      this.beatOn = true
      window.clearTimeout(this.beatTimer)
      this.beatTimer = window.setTimeout(() => (this.beatOn = false), 140)
    }
    if (!frame.beat && now - this.shownAt < 80) return
    this.shownAt = now
    this.level = frame.level
    this.bass = frame.bass
    this.mid = frame.mid
    this.treble = frame.treble
    this.pitch = frame.pitch
  }

  private emit(frame: AudioFrame) {
    for (const listener of this.listeners) listener(frame)
  }
}

export const audio = new AudioEngine()
