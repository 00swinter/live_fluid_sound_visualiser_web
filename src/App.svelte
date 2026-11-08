<script lang="ts">
  import { onMount } from 'svelte'
  import Controls from './lib/controls/Controls.svelte'
  import { createFluidSim, type FluidBooleanSetting, type FluidColor, type FluidSim } from './lib/fluid/createFluidSim'
  import { playPreset } from './lib/performance/playPreset'
  import { stampPresetName } from './lib/performance/presetName'
  import { defaultPreset } from './lib/presets/defaultPreset'
  import { createRandomPreset, RANDOM_PRESET_ID } from './lib/presets/randomPreset'
import { loadPerformance, loadPresetLibrary, presetCopies, savePerformance, savePresetLibrary, type PerformanceSettings } from './lib/presets/storage'
import { applySettings, completeSymmetry, defaultAudio, type AudioBand, type AudioMap, type AxisMap, type ButtonBinding, type ButtonSlot, type CursorSymmetry, type Preset } from './lib/presets/types'
import type { PresetNumberSetting } from './lib/behaviors'

  type BooleanSetting = Exclude<FluidBooleanSetting, 'COLORFUL'>

  const stored = loadPresetLibrary()
  const storedPerformance = loadPerformance()

  let canvas: HTMLCanvasElement | undefined
  let showUi = $state(false)
  let hideCursor = $state(true)
  let presets = $state<Preset[]>(stored.presets)
  let activeId = $state(stored.activeId)
  let performance = $state<PerformanceSettings>({ ...storedPerformance })
  let sim: FluidSim | undefined

  $effect(() => {
    const library = { activeId, presets: $state.snapshot(presets) as Preset[] }
    const handle = window.setTimeout(() => savePresetLibrary(library), 200)
    return () => window.clearTimeout(handle)
  })

  $effect(() => {
    const snapshot = $state.snapshot(performance)
    const handle = window.setTimeout(() => savePerformance(snapshot), 200)
    return () => window.clearTimeout(handle)
  })

  function livePreset() {
    return presets.find((item) => item.id === activeId) ?? presets[0]
  }

  function commitNumber(key: PresetNumberSetting, value: number) {
    const preset = livePreset()
    preset.settings[key] = value
    sim?.set(key, value)
  }

  function commitPerformance(key: keyof PerformanceSettings, value: number) {
    performance[key] = value
    sim?.set(key, value)
  }

  function commitBoolean(key: BooleanSetting, value: boolean) {
    const preset = livePreset()
    preset.settings[key] = value
    sim?.set(key, value)
  }

  function commitColor(color: FluidColor) {
    const preset = livePreset()
    preset.settings.BACK_COLOR = color
    sim?.set('BACK_COLOR', { ...color })
  }

  function setSplat(patch: Partial<Preset['splat']>) {
    Object.assign(livePreset().splat, patch)
  }

  function setCursor(axis: 'x' | 'y', patch: Partial<AxisMap>) {
    Object.assign(livePreset().cursor[axis], patch)
  }

  function setSymmetry(patch: Partial<CursorSymmetry>) {
    const cursor = livePreset().cursor
    const next = completeSymmetry({ ...completeSymmetry(cursor.symmetry), ...patch })
    if (!cursor.symmetry) cursor.symmetry = next
    else Object.assign(cursor.symmetry, next)
  }

  function setButton(slot: ButtonSlot, binding: ButtonBinding) {
    livePreset()[slot] = binding
  }

  function audioConfig() {
    const preset = livePreset()
    if (!preset.audio) preset.audio = structuredClone(defaultAudio)
    return preset.audio
  }

  function setAudio(patch: Partial<Preset['audio']>) {
    Object.assign(audioConfig(), patch)
  }

  function setAudioBand(band: AudioBand, patch: Partial<AudioMap>) {
    Object.assign(audioConfig()[band], patch)
  }

  function setAudioDrive(patch: Partial<Preset['audio']['drive']>) {
    Object.assign(audioConfig().drive, patch)
  }

  function setScroll(patch: Partial<Preset['scroll']>) {
    const preset = livePreset()
    Object.assign(preset.scroll, patch)
    const key = preset.scroll.setting
    const lo = Math.min(preset.scroll.min, preset.scroll.max)
    const hi = Math.max(preset.scroll.min, preset.scroll.max)
    const next = Math.min(hi, Math.max(lo, preset.settings[key]))
    if (next !== preset.settings[key]) commitNumber(key, next)
  }

  function isTextEntry(target: EventTarget | null) {
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
    if (target instanceof HTMLElement && target.isContentEditable) return true
    if (!(target instanceof HTMLInputElement)) return false
    const type = target.type
    return type !== 'range' && type !== 'checkbox' && type !== 'radio' && type !== 'color'
  }

  function revealPreset(name: string) {
    if (!sim || !canvas) return
    stampPresetName(sim, canvas, name)
  }

  function selectPreset(id: string) {
    if (id === activeId) return
    activeId = id
    const next = presets.find((item) => item.id === id)
    if (!next) return
    if (sim) applySettings(sim, next.settings)
    revealPreset(next.name)
  }

  function stepPreset(direction: 1 | -1) {
    const count = presets.length
    if (count < 2) return
    const index = presets.findIndex((item) => item.id === activeId)
    const from = index < 0 ? 0 : index
    selectPreset(presets[(from + direction + count) % count].id)
  }

  /** Rewrite the one random slot and play it. Every other preset stays as it is. */
  function loadRandomPreset() {
    const generated = createRandomPreset()
    const index = presets.findIndex((item) => item.id === RANDOM_PRESET_ID)
    if (index >= 0) presets[index] = generated
    else presets.push(generated)
    activeId = generated.id
    if (sim) {
      applySettings(sim, generated.settings)
      sim.clear()
    }
    revealPreset(generated.name)
  }

  function addPreset() {
    const copy = structuredClone(defaultPreset)
    copy.id = crypto.randomUUID()
    copy.name = `Preset ${presets.length + 1}`
    presets.push(copy)
    activeId = copy.id
    if (sim) applySettings(sim, copy.settings)
    revealPreset(copy.name)
  }

  function duplicatePreset() {
    const source = livePreset()
    const copy = clonePreset(source, copyName(source.name.trim() || 'Preset'))
    const index = presets.findIndex((item) => item.id === source.id)
    if (index < 0) presets.push(copy)
    else presets.splice(index + 1, 0, copy)
    activeId = copy.id
    revealPreset(copy.name)
  }

  function resetPreset() {
    const current = livePreset()
    const fresh = structuredClone(defaultPreset)
    fresh.id = current.id
    fresh.name = current.name
    const index = presets.findIndex((item) => item.id === current.id)
    if (index < 0) return
    presets[index] = fresh
    if (sim) applySettings(sim, fresh.settings)
  }

  function deletePreset() {
    if (presets.length < 2) return
    const index = presets.findIndex((item) => item.id === activeId)
    if (index < 0) return
    presets.splice(index, 1)
    const next = presets[Math.max(0, index - 1)]
    activeId = next.id
    if (sim) applySettings(sim, next.settings)
    revealPreset(next.name)
  }

  /** Copies `public/presets.json` into this browser. Does nothing until the button asks. */
  async function addBundledPresets() {
    let response: Response
    try {
      response = await fetch(`${import.meta.env.BASE_URL}presets.json`, { cache: 'no-cache' })
    } catch {
      return 'Could not load presets.json.'
    }
    if (!response.ok) return 'Could not load presets.json.'
    let raw: unknown
    try {
      raw = await response.json()
    } catch {
      return 'presets.json is not valid JSON.'
    }
    const copies = presetCopies(raw, presets.map((item) => item.name))
    if (copies.length === 0) return 'presets.json has no presets.'
    for (const copy of copies) presets.push(copy)
    return copies.length === 1 ? 'Added 1 preset.' : `Added ${copies.length} presets.`
  }

  /** Drops every preset saved in this browser and leaves one fresh default. */
  function clearSavedPresets() {
    const fresh = structuredClone(defaultPreset)
    fresh.id = crypto.randomUUID()
    presets.splice(0, presets.length, fresh)
    activeId = fresh.id
    if (sim) applySettings(sim, fresh.settings)
    revealPreset(fresh.name)
  }

  function clonePreset(source: Preset, name: string) {
    const copy = structuredClone($state.snapshot(source))
    copy.id = crypto.randomUUID()
    copy.name = name
    return copy
  }

  function copyName(name: string) {
    const base = name.trim() || 'Preset'
    const taken = new Set(presets.map((item) => item.name))
    let count = 1
    let next = `${base} (${count})`
    while (taken.has(next)) {
      count += 1
      next = `${base} (${count})`
    }
    return next
  }

  onMount(() => {
    if (!canvas) return
    const fluid = createFluidSim(canvas)
    sim = fluid
    fluid.set('SIM_RESOLUTION', performance.SIM_RESOLUTION)
    fluid.set('DYE_RESOLUTION', performance.DYE_RESOLUTION)
    const stopPreset = playPreset(canvas, fluid, livePreset, stepPreset, loadRandomPreset)

    function onKey(event: KeyboardEvent) {
      if (event.repeat) return
      const key = event.key.toLowerCase()
      if (key !== 't' && key !== 'c') return
      if (showUi && isTextEntry(event.target)) return
      event.preventDefault()
      if (key === 'c') {
        hideCursor = !hideCursor
        return
      }
      if (showUi && document.activeElement instanceof HTMLElement) document.activeElement.blur()
      showUi = !showUi
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      stopPreset()
      fluid.destroy()
      sim = undefined
    }
  })
</script>

<canvas bind:this={canvas} style:cursor={hideCursor ? 'none' : 'auto'}></canvas>

<div class="editor" class:hidden={!showUi} inert={!showUi} aria-hidden={!showUi}>
  <Controls
    {presets}
    {activeId}
    {selectPreset}
    {addPreset}
    {duplicatePreset}
    {resetPreset}
    {deletePreset}
    {commitNumber}
    {commitBoolean}
    {commitColor}
    {setSplat}
    {setCursor}
    {setSymmetry}
    {setButton}
    {setScroll}
    {setAudio}
    {setAudioBand}
    {setAudioDrive}
    {performance}
    {commitPerformance}
    {addBundledPresets}
    {clearSavedPresets}
  />
</div>

<style>
  canvas {
    position: fixed;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    background: #000;
    touch-action: none;
  }

  .editor.hidden {
    display: none;
  }
</style>
