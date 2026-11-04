<script lang="ts">
  import { onMount } from 'svelte'
  import Controls from './lib/controls/Controls.svelte'
  import { createFluidSim, type FluidBooleanSetting, type FluidColor, type FluidNumberSetting, type FluidSim } from './lib/fluid/createFluidSim'
  import { playPreset } from './lib/performance/playPreset'
  import { defaultPreset } from './lib/presets/defaultPreset'
  import { applySettings, type AxisMap, type ButtonEffect, type ButtonSlot, type Preset } from './lib/presets/types'

  type BooleanSetting = Exclude<FluidBooleanSetting, 'COLORFUL'>

  let canvas: HTMLCanvasElement | undefined
  let showUi = $state(false)
  let presets = $state<Preset[]>([structuredClone(defaultPreset)])
  let activeId = $state(presets[0].id)
  let sim: FluidSim | undefined

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

  function setButton(slot: ButtonSlot, effect: ButtonEffect) {
    livePreset()[slot] = effect
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

  function selectPreset(id: string) {
    if (id === activeId) return
    activeId = id
    const next = presets.find((item) => item.id === id)
    if (next && sim) applySettings(sim, next.settings)
  }

  function addPreset() {
    const copy = structuredClone($state.snapshot(livePreset()))
    copy.id = crypto.randomUUID()
    copy.name = `Preset ${presets.length + 1}`
    presets.push(copy)
    activeId = copy.id
  }

  onMount(() => {
    if (!canvas) return
    const fluid = createFluidSim(canvas)
    sim = fluid
    const stopPreset = playPreset(canvas, fluid, livePreset)

    function onKey(event: KeyboardEvent) {
      if (event.repeat || (event.key !== 't' && event.key !== 'T')) return
      const target = event.target
      if (showUi && target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return
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
