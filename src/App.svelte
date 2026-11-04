<script lang="ts">
  import { onMount } from 'svelte'
  import Controls from './lib/controls/Controls.svelte'
  import { createFluidSim, type FluidBooleanSetting, type FluidColor, type FluidNumberSetting, type FluidSim } from './lib/fluid/createFluidSim'
  import { playPreset } from './lib/performance/playPreset'
  import { defaultPreset } from './lib/presets/defaultPreset'
  import { loadPresetLibrary, savePresetLibrary } from './lib/presets/storage'
  import { applySettings, type AxisMap, type ButtonBinding, type ButtonSlot, type Preset } from './lib/presets/types'

  type BooleanSetting = Exclude<FluidBooleanSetting, 'COLORFUL'>

  const stored = loadPresetLibrary()

  let canvas: HTMLCanvasElement | undefined
  let showUi = $state(false)
  let presets = $state<Preset[]>(stored.presets)
  let activeId = $state(stored.activeId)
  let sim: FluidSim | undefined

  $effect(() => {
    const library = { activeId, presets: $state.snapshot(presets) as Preset[] }
    const handle = window.setTimeout(() => savePresetLibrary(library), 200)
    return () => window.clearTimeout(handle)
  })

  function livePreset() {
    return presets.find((item) => item.id === activeId) ?? presets[0]
  }

  function commitNumber(key: FluidNumberSetting, value: number) {
    const preset = livePreset()
    preset.settings[key] = value
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

  function setButton(slot: ButtonSlot, binding: ButtonBinding) {
    livePreset()[slot] = binding
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

  function selectPreset(id: string) {
    if (id === activeId) return
    activeId = id
    const next = presets.find((item) => item.id === id)
    if (next && sim) applySettings(sim, next.settings)
  }

  function addPreset() {
    const copy = structuredClone(defaultPreset)
    copy.id = crypto.randomUUID()
    copy.name = `Preset ${presets.length + 1}`
    presets.push(copy)
    activeId = copy.id
    if (sim) applySettings(sim, copy.settings)
  }

  function duplicatePreset() {
    const source = livePreset()
    const copy = clonePreset(source, copyName(source.name.trim() || 'Preset'))
    presets.push(copy)
    activeId = copy.id
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
  }

  function clonePreset(source: Preset, name: string) {
    const copy = structuredClone($state.snapshot(source))
    copy.id = crypto.randomUUID()
    copy.name = name
    return copy
  }

  function copyName(name: string) {
    const base = name.replace(/ copy(?: \d+)?$/, '')
    const taken = new Set(presets.map((item) => item.name))
    let next = `${base} copy`
    let count = 2
    while (taken.has(next)) {
      next = `${base} copy ${count}`
      count += 1
    }
    return next
  }

  onMount(() => {
    if (!canvas) return
    const fluid = createFluidSim(canvas)
    sim = fluid
    const stopPreset = playPreset(canvas, fluid, livePreset)

    function onKey(event: KeyboardEvent) {
      if (event.repeat || (event.key !== 't' && event.key !== 'T')) return
      if (showUi && isTextEntry(event.target)) return
      event.preventDefault()
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

<canvas bind:this={canvas}></canvas>

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
    {setButton}
    {setScroll}
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
