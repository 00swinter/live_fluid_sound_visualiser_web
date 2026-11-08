<script lang="ts">
  import { audio } from '../audio/session.svelte'
  import { clickAction, clickActions, colorParamToHex, commitParam, controlFor, defaultParams, formatControl, hexToColorParam, holdAction, holdActions, isChoiceParam, isColorListParam, isColorParam, isNumberParam, isSettingParam, paramEase, paramSetting, performanceControls, properties, rangeFor, type ControlGroup, type ParamValue, type PerformanceSetting, type PresetNumberSetting } from '../behaviors'
  import { defaultSplatColors, driveSources, splatColorMode, type AudioBand, type AudioMap, type ButtonBinding, type ButtonSlot, type DriveSource, type Preset } from '../presets/types'
  import type { PerformanceSettings } from '../presets/storage'
  import type { FluidBooleanSetting, FluidColor } from '../fluid/createFluidSim'

  type BooleanSetting = Exclude<FluidBooleanSetting, 'COLORFUL'>
  type CategoryId = 'preset' | ButtonSlot | 'scroll' | 'cursor' | 'audio' | 'flow' | 'general'

  let {
    presets,
    activeId,
    selectPreset,
    addPreset,
    duplicatePreset,
    resetPreset,
    deletePreset,
    commitNumber,
    commitBoolean,
    commitColor,
    setSplat,
    setCursor,
    setButton,
    setScroll,
    setAudio,
    setAudioBand,
    setAudioDrive,
    performance,
    commitPerformance,
  }: {
    presets: Preset[]
    activeId: string
    selectPreset: (id: string) => void
    addPreset: () => void
    duplicatePreset: () => void
    resetPreset: () => void
    deletePreset: () => void
    commitNumber: (key: PresetNumberSetting, value: number) => void
    commitBoolean: (key: BooleanSetting, value: boolean) => void
    commitColor: (color: FluidColor) => void
    setSplat: (patch: Partial<Preset['splat']>) => void
    setCursor: (axis: 'x' | 'y', patch: Partial<Preset['cursor']['x']>) => void
    setButton: (slot: ButtonSlot, binding: ButtonBinding) => void
    setScroll: (patch: Partial<Preset['scroll']>) => void
    setAudio: (patch: Partial<Preset['audio']>) => void
    setAudioBand: (band: AudioBand, patch: Partial<AudioMap>) => void
    setAudioDrive: (patch: Partial<Preset['audio']['drive']>) => void
    performance: PerformanceSettings
    commitPerformance: (key: PerformanceSetting, value: number) => void
  } = $props()

  const meters = [
    { key: 'level', label: 'Level' },
    { key: 'bass', label: 'Bass' },
    { key: 'mid', label: 'Mid' },
    { key: 'treble', label: 'High' },
  ] as const

  const categories: { id: CategoryId; label: string; hint: string }[] = [
    { id: 'preset', label: 'Preset', hint: 'The + button starts from the default preset file. Duplicate copies this one. Reset restores this one to that file. Export copies its JSON.' },
    { id: 'left', label: 'Left', hint: 'Click runs once. Hold lasts while the left button is down. Either one can switch a setting between two values.' },
    { id: 'right', label: 'Right', hint: 'Click runs once. Hold lasts while the right button is down. Either one can switch a setting between two values.' },
    { id: 'middle', label: 'Middle', hint: 'Click runs once. Hold lasts while the middle button is down. Either one can switch a setting between two values.' },
    { id: 'scroll', label: 'Scroll', hint: 'Scrolling down increases the chosen setting, up to this range.' },
    { id: 'cursor', label: 'Cursor', hint: 'When the cursor paints, which colors it uses, and which settings follow its position.' },
    { id: 'audio', label: 'Audio', hint: 'Microphone is the room. System is everything playing on this computer. Beats can run an action, each band can move a setting, and the sound can paint on its own.' },
    { id: 'flow', label: 'Flow', hint: 'How the fluid moves and fades.' },
    { id: 'general', label: 'General', hint: 'Bloom, shading, pause, and the background.' },
  ]

  let category = $state<CategoryId>('left')
  let showPerformance = $state(false)

  const preset = $derived(presets.find((item) => item.id === activeId) ?? presets[0])
  const current = $derived(categories.find((item) => item.id === category) ?? categories[0])
  const scrollRange = $derived(preset ? controlFor(preset.scroll.setting) : controlFor('CURL'))
  const buttonSlot = $derived<ButtonSlot | null>(
    category === 'left' || category === 'right' || category === 'middle' ? category : null,
  )
  const numberGroup = $derived<ControlGroup | null>(category === 'flow' ? 'Flow' : null)

  function chooseClick(slot: ButtonSlot, id: string) {
    if (!preset) return
    const click = id === '' ? null : id
    if (preset[slot].click === click) return
    setButton(slot, { ...preset[slot], click, clickParams: defaultParams(clickAction(click)) })
  }

  function chooseHold(slot: ButtonSlot, id: string) {
    if (!preset) return
    const hold = id === '' ? null : id
    if (preset[slot].hold === hold) return
    setButton(slot, { ...preset[slot], hold, holdParams: defaultParams(holdAction(hold)) })
  }

  function setClickParam(slot: ButtonSlot, key: string, value: ParamValue) {
    if (!preset) return
    const binding = preset[slot]
    const params = commitParam(clickAction(binding.click)?.params, binding.clickParams, key, value)
    setButton(slot, { ...binding, clickParams: params })
  }

  function setHoldParam(slot: ButtonSlot, key: string, value: ParamValue) {
    if (!preset) return
    const binding = preset[slot]
    const params = commitParam(holdAction(binding.hold)?.params, binding.holdParams, key, value)
    setButton(slot, { ...binding, holdParams: params })
  }

  let dragKey = $state('')
  let dragIndex = $state(-1)
  let dragOver = $state(-1)

  function colorListValue(stored: ParamValue | undefined, fallback: number[]) {
    return Array.isArray(stored) ? stored : [...fallback]
  }

  function storedNumber(stored: ParamValue | undefined, fallback: number) {
    return typeof stored === 'number' ? stored : fallback
  }

  function startColorDrag(event: DragEvent, key: string, index: number) {
    dragKey = key
    dragIndex = index
    event.dataTransfer?.setData('text/plain', `${key}:${index}`)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  function allowColorDrop(event: DragEvent, key: string, index: number) {
    if (dragKey !== key || dragIndex < 0) return
    event.preventDefault()
    dragOver = index
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  function dropColor(event: DragEvent, key: string, index: number, colors: number[], onChange: (next: number[]) => void) {
    event.preventDefault()
    const from = dragKey === key ? dragIndex : -1
    dragKey = ''
    dragIndex = -1
    dragOver = -1
    if (from < 0 || from === index) return
    const next = colors.slice()
    const [item] = next.splice(from, 1)
    next.splice(index, 0, item)
    onChange(next)
  }

  function endColorDrag() {
    dragKey = ''
    dragIndex = -1
    dragOver = -1
  }

  function chooseAxis(axis: 'x' | 'y', setting: PresetNumberSetting) {
    const range = controlFor(setting)
    setCursor(axis, { setting, min: range.min, max: range.max })
  }

  function chooseDrive(id: string) {
    if (!driveSources.some((item) => item.id === id)) return
    setAudioDrive({ source: id as DriveSource })
  }

  function chooseBeat(id: string) {
    if (!preset) return
    const beat = id === '' ? null : id
    if (preset.audio.beat === beat) return
    setAudio({ beat, beatParams: defaultParams(clickAction(beat)) })
  }

  function setBeatParam(key: string, value: ParamValue) {
    if (!preset) return
    const params = commitParam(clickAction(preset.audio.beat)?.params, preset.audio.beatParams, key, value)
    setAudio({ beatParams: params })
  }

  function chooseBand(band: AudioBand, setting: PresetNumberSetting) {
    const range = controlFor(setting)
    setAudioBand(band, { setting, min: range.min, max: range.max })
  }

  function liveBand(band: AudioBand) {
    if (!preset) return 0
    const map = preset.audio[band]
    if (!map.enabled || audio.source === 'off') return preset.settings[map.setting]
    const amount = audio[band]
    return Math.min(Math.max(map.min, map.max), Math.max(Math.min(map.min, map.max), map.min + (map.max - map.min) * amount))
  }

  function chooseScroll(setting: PresetNumberSetting) {
    const range = controlFor(setting)
    const span = range.max - range.min
    const current = preset?.scroll.sensitivity ?? span
    const sensitivity = current > span ? Math.max(range.step, span / 16) : current
    setScroll({ setting, min: range.min, max: range.max, sensitivity })
  }

  function bindingDetail(binding: ButtonBinding) {
    const hold = holdAction(binding.hold)
    const click = clickAction(binding.click)
    const action = hold ?? click
    if (!action) return 'None'
    const stored = hold ? binding.holdParams : binding.clickParams
    const setting = action.params?.find(isSettingParam)
    if (setting) return controlFor(paramSetting(stored, setting.key, setting.default)).label
    return action.detail
  }

  function categoryDetail(id: CategoryId) {
    if (!preset) return ''
    if (id === 'preset') return preset.name
    if (id === 'left' || id === 'right' || id === 'middle') return bindingDetail(preset[id])
    if (id === 'scroll') return controlFor(preset.scroll.setting).label
    if (id === 'cursor') return preset.splat.paint === 'left' ? 'Left' : preset.splat.paint === 'right' ? 'Right' : 'Always'
    if (id === 'audio') {
      if (audio.source === 'mic') return 'Mic'
      if (audio.source === 'system') return 'System'
      return clickAction(preset.audio?.beat ?? null)?.detail ?? 'Off'
    }
    return ''
  }

  function toHex(color: FluidColor) {
    const channel = (value: number) =>
      Math.round(Math.min(255, Math.max(0, value)))
        .toString(16)
        .padStart(2, '0')
    return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
  }

  function fromHex(hex: string): FluidColor {
    const value = Number.parseInt(hex.slice(1), 16)
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
  }

  let exportLabel = $state('Export')
  let copyTimer = 0

  function exportPreset() {
    if (!preset) return
    const json = JSON.stringify($state.snapshot(preset), null, 2)
    if (copyText(json)) {
      showExportResult('Copied')
      return
    }
    void navigator.clipboard.writeText(json).then(
      () => showExportResult('Copied'),
      () => showExportResult('Copy failed'),
    )
  }

  function copyText(json: string) {
    const onCopy = (event: ClipboardEvent) => {
      event.preventDefault()
      event.clipboardData?.setData('text/plain', json)
    }
    document.addEventListener('copy', onCopy)
    const area = document.createElement('textarea')
    area.value = json
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } finally {
      document.removeEventListener('copy', onCopy)
      area.remove()
    }
    return ok
  }

  function showExportResult(label: string) {
    exportLabel = label
    window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => (exportLabel = 'Export'), 1500)
  }
</script>

{#snippet slider(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
)}
  <label class="field">
    <span class="name">{label}</span>
    <span class="readout">{formatControl(value, step)}</span>
    <input
      type="range"
      {min}
      {max}
      {step}
      {value}
      style:--fill="{(max === min ? 0 : ((value - min) / (max - min)) * 100)}%"
      oninput={(event) => onChange(Number(event.currentTarget.value))}
    />
  </label>
{/snippet}

{#snippet toggle(label: string, key: BooleanSetting)}
  <label class="check">
    <input
      type="checkbox"
      checked={preset.settings[key]}
      onchange={(event) => commitBoolean(key, event.currentTarget.checked)}
    />
    <span>{label}</span>
  </label>
{/snippet}

{#snippet colorList(key: string, label: string, colors: number[], onChange: (next: number[]) => void)}
  <div class="colors">
    <span class="name">{label}</span>
    <div class="swatches" role="list">
      {#each colors as color, index (index)}
        <div
          class="swatch"
          role="listitem"
          class:over={dragKey === key && dragOver === index && dragIndex !== index}
          ondragover={(event) => allowColorDrop(event, key, index)}
          ondrop={(event) => dropColor(event, key, index, colors, onChange)}
        >
          <button
            class="swatch-delete"
            type="button"
            aria-label="Remove color"
            onclick={() => onChange(colors.filter((_, item) => item !== index))}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
          <input
            type="color"
            aria-label={`${label} ${index + 1}`}
            value={colorParamToHex(color)}
            oninput={(event) => {
              const next = colors.slice()
              next[index] = hexToColorParam(event.currentTarget.value)
              onChange(next)
            }}
          />
          <button
            class="swatch-handle"
            type="button"
            aria-label="Drag to reorder"
            draggable="true"
            ondragstart={(event) => startColorDrag(event, key, index)}
            ondragend={endColorDrag}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="6" cy="4" r="1.15" />
              <circle cx="10" cy="4" r="1.15" />
              <circle cx="6" cy="8" r="1.15" />
              <circle cx="10" cy="8" r="1.15" />
              <circle cx="6" cy="12" r="1.15" />
              <circle cx="10" cy="12" r="1.15" />
            </svg>
          </button>
        </div>
      {/each}
      <button class="swatch-add" type="button" onclick={() => onChange([...colors, 0xffffff])}>Add color</button>
    </div>
  </div>
{/snippet}

{#snippet actionParams(
  params: typeof clickActions[number]['params'],
  stored: Record<string, ParamValue>,
  setParam: (key: string, value: ParamValue) => void,
)}
  {#each params ?? [] as param (param.key)}
    {#if isColorListParam(param)}
      {@render colorList(param.key, param.label, colorListValue(stored[param.key], param.default), (colors) => setParam(param.key, colors))}
    {:else if isColorParam(param)}
      <label class="field color">
        <span class="name">{param.label}</span>
        <input
          type="color"
          value={colorParamToHex(storedNumber(stored[param.key], param.default))}
          oninput={(event) => setParam(param.key, hexToColorParam(event.currentTarget.value))}
        />
      </label>
    {:else if isSettingParam(param)}
      {@const chosen = paramSetting(stored, param.key, param.default)}
      <label class="field">
        <span class="name">{param.label}</span>
        <span class="readout">{formatControl(preset.settings[chosen], controlFor(chosen).step)}</span>
        <select value={chosen} onchange={(event) => setParam(param.key, event.currentTarget.value)}>
          {#each properties as control (control.key)}
            <option value={control.key}>{control.label}</option>
          {/each}
        </select>
      </label>
    {:else if isChoiceParam(param)}
      <label class="field">
        <span class="name">{param.label}</span>
        <select value={paramEase(stored, param.key)} onchange={(event) => setParam(param.key, event.currentTarget.value)}>
          {#each param.options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
    {:else if isNumberParam(param)}
      {@const range = rangeFor(param, stored)}
      {@render slider(
        param.label,
        storedNumber(stored[param.key], param.default),
        range.min,
        range.max,
        range.step,
        (value) => setParam(param.key, value),
      )}
    {/if}
  {/each}
{/snippet}
{#snippet buttonFields(slot: ButtonSlot)}
  {@const binding = preset[slot]}
  {@const click = clickAction(binding.click)}
  {@const hold = holdAction(binding.hold)}
  <div class="group">
    <label class="field">
      <span class="name">Click</span>
      <select value={binding.click ?? ''} onchange={(event) => chooseClick(slot, event.currentTarget.value)}>
        <option value="">None</option>
        {#each clickActions as action (action.id)}
          <option value={action.id}>{action.label}</option>
        {/each}
      </select>
    </label>
    {#if click && (click.params?.length || click.note)}
      <div class="group-body">
        {@render actionParams(click.params, binding.clickParams, (key, value) => setClickParam(slot, key, value))}
        {#if click.note}
          <p class="note aside">{click.note}</p>
        {/if}
      </div>
    {/if}
  </div>
  <div class="group">
    <label class="field">
      <span class="name">Hold</span>
      <select value={binding.hold ?? ''} onchange={(event) => chooseHold(slot, event.currentTarget.value)}>
        <option value="">None</option>
        {#each holdActions as action (action.id)}
          <option value={action.id}>{action.label}</option>
        {/each}
      </select>
    </label>
    {#if hold && (hold.params?.length || hold.note)}
      <div class="group-body">
        {@render actionParams(hold.params, binding.holdParams, (key, value) => setHoldParam(slot, key, value))}
        {#if hold.note}
          <p class="note aside">{hold.note}</p>
        {/if}
      </div>
    {/if}
  </div>
  <p class="note aside">Click runs once when the button goes down. Hold lasts while it stays down.</p>
{/snippet}

{#snippet axisFields(axis: 'x' | 'y', label: string, note: string)}
  {@const map = preset.cursor[axis]}
  {@const range = controlFor(map.setting)}
  <div class="group">
    <label class="check">
      <input
        type="checkbox"
        checked={map.enabled}
        onchange={(event) => setCursor(axis, { enabled: event.currentTarget.checked })}
      />
      <span>{label}</span>
    </label>
    {#if map.enabled}
      <div class="group-body">
        <p class="note aside">{note}</p>
        <label class="field">
          <span class="name">Adjusts</span>
          <span class="readout">{formatControl(preset.settings[map.setting], range.step)}</span>
          <select
            value={map.setting}
            onchange={(event) => chooseAxis(axis, event.currentTarget.value as PresetNumberSetting)}
          >
            {#each properties as control (control.key)}
              <option value={control.key}>{control.label}</option>
            {/each}
          </select>
        </label>
        {@render slider('Minimum', map.min, range.min, range.max, range.step, (value) => setCursor(axis, { min: value }))}
        {@render slider('Maximum', map.max, range.min, range.max, range.step, (value) => setCursor(axis, { max: value }))}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet bandFields(band: AudioBand, label: string, note: string)}
  {@const map = preset.audio[band]}
  {@const range = controlFor(map.setting)}
  <div class="group">
    <label class="check">
      <input
        type="checkbox"
        checked={map.enabled}
        onchange={(event) => setAudioBand(band, { enabled: event.currentTarget.checked })}
      />
      <span>{label}</span>
    </label>
    {#if map.enabled}
      <div class="group-body">
        <p class="note aside">{note}</p>
        <label class="field">
          <span class="name">Adjusts</span>
          <span class="readout">{formatControl(liveBand(band), range.step)}</span>
          <select
            value={map.setting}
            onchange={(event) => chooseBand(band, event.currentTarget.value as PresetNumberSetting)}
          >
            {#each properties as control (control.key)}
              <option value={control.key}>{control.label}</option>
            {/each}
          </select>
        </label>
        {@render slider('Minimum', map.min, range.min, range.max, range.step, (value) => setAudioBand(band, { min: value }))}
        {@render slider('Maximum', map.max, range.min, range.max, range.step, (value) => setAudioBand(band, { max: value }))}
      </div>
    {/if}
  </div>
{/snippet}

<div class="shell">
  <div class="top">
    <div class="chips">
      {#each presets as item (item.id)}
        <div class="chip" class:on={item.id === activeId}>
          <input
            aria-label="Preset name"
            value={item.name}
            spellcheck="false"
            autocomplete="off"
            onfocus={() => selectPreset(item.id)}
            oninput={(event) => (item.name = event.currentTarget.value)}
            onkeydown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
        </div>
      {/each}
    </div>
    <button class="add" type="button" aria-label="Add preset" onclick={addPreset}>+</button>
    <p class="hint">Press T to hide</p>
    <button
      class="perf"
      class:on={showPerformance}
      type="button"
      aria-pressed={showPerformance}
      onclick={() => (showPerformance = !showPerformance)}
    >
      Performance
    </button>
  </div>

  {#if preset}
    <section class="panel">
      <div class="categories">
        {#each categories as item (item.id)}
          <button
            class="cat"
            class:on={category === item.id && !showPerformance}
            type="button"
            aria-pressed={category === item.id && !showPerformance}
            onclick={() => {
              showPerformance = false
              category = item.id
            }}
          >
            <span class="cat-label">{item.label}</span>
            {#if categoryDetail(item.id)}
              <span class="cat-detail">{categoryDetail(item.id)}</span>
            {/if}
          </button>
        {/each}
      </div>

      <div class="well">
        <h2>{showPerformance ? 'Performance' : current.label}</h2>
        <p class="note">
          {showPerformance ? 'Shared by every preset. Lower these if the simulation starts to lag.' : current.hint}
        </p>

        {#if showPerformance}
          {#each performanceControls as control (control.key)}
            {@render slider(control.label, performance[control.key], control.min, control.max, control.step, (value) =>
              commitPerformance(control.key, value),
            )}
          {/each}
        {:else if category === 'preset'}
          <label class="field">
            <span class="name">Name</span>
            <input
              class="text"
              type="text"
              aria-label="Preset name"
              value={preset.name}
              spellcheck="false"
              autocomplete="off"
              oninput={(event) => (preset.name = event.currentTarget.value)}
              onblur={(event) => {
                preset.name = event.currentTarget.value.trim() || 'Preset'
              }}
            />
          </label>
          <div class="actions">
            <button class="action" type="button" onclick={duplicatePreset}>Duplicate</button>
            <button class="action" type="button" onclick={resetPreset}>Reset</button>
            <button class="action" type="button" onclick={exportPreset}>{exportLabel}</button>
            <button class="action danger" type="button" onclick={deletePreset} disabled={presets.length < 2}>Delete</button>
          </div>
          {#if presets.length < 2}
            <p class="note aside">The last preset stays, so there is always one to play.</p>
          {/if}
        {:else if buttonSlot}
          {@render buttonFields(buttonSlot)}
        {:else if category === 'scroll'}
          <div class="group">
            <label class="field">
              <span class="name">Adjusts</span>
              <span class="readout">{formatControl(preset.settings[preset.scroll.setting], scrollRange.step)}</span>
              <select
                value={preset.scroll.setting}
                onchange={(event) => chooseScroll(event.currentTarget.value as PresetNumberSetting)}
              >
                {#each properties as control (control.key)}
                  <option value={control.key}>{control.label}</option>
                {/each}
              </select>
            </label>
            <div class="group-body">
              {@render slider(
                'Sensitivity',
                preset.scroll.sensitivity,
                scrollRange.step,
                Math.max(scrollRange.step, scrollRange.max - scrollRange.min),
                scrollRange.step,
                (value) => setScroll({ sensitivity: value }),
              )}
              {#if preset.scroll.setting === 'DELTA_TIME'}
                <p class="note aside">0.016 is normal speed. Higher runs the simulation faster, lower runs it slower.</p>
              {/if}
              {@render slider('Minimum', preset.scroll.min, scrollRange.min, scrollRange.max, scrollRange.step, (value) =>
                setScroll({ min: value }),
              )}
              {@render slider('Maximum', preset.scroll.max, scrollRange.min, scrollRange.max, scrollRange.step, (value) =>
                setScroll({ max: value }),
              )}
            </div>
          </div>
        {:else if category === 'cursor'}
          <div class="group">
            <label class="field">
              <span class="name">Paint</span>
              <select
                value={preset.splat.paint}
                onchange={(event) => {
                  const paint = event.currentTarget.value
                  if (paint === 'always' || paint === 'left' || paint === 'right') setSplat({ paint })
                }}
              >
                <option value="always">Whenever the cursor moves</option>
                <option value="left">While the left button is dragged</option>
                <option value="right">While the right button is dragged</option>
              </select>
            </label>
            <div class="group-body">
              <p class="note aside">
                Left and Right paint while that button is held. Set the button itself to None unless you also want a click or hold effect.
              </p>
              {@render slider('Force', preset.splat.force, 0.5, 40, 0.1, (value) => setSplat({ force: value }))}
              {@render slider('Dye', preset.splat.dye, 0.02, 1, 0.01, (value) => setSplat({ dye: value }))}
              {@render colorList('cursor-colors', 'Colors', preset.splat.colors ?? defaultSplatColors, (colors) => setSplat({ colors }))}
              <label class="field">
                <span class="name">Color change</span>
                <select
                  value={splatColorMode(preset.splat)}
                  onchange={(event) => {
                    const next = event.currentTarget.value
                    if (next === 'click' || next === 'cycle') setSplat({ colorMode: next })
                  }}
                >
                  <option value="click">On click</option>
                  <option value="cycle">Cycle</option>
                </select>
              </label>
              {#if splatColorMode(preset.splat) === 'cycle'}
                {@render slider('Seconds', preset.splat.cycleSeconds ?? 8, 0.4, 40, 0.1, (value) => setSplat({ cycleSeconds: value }))}
                <p class="note aside">One pass through the list. The color eases from each one into the next.</p>
              {:else if preset.splat.paint === 'always'}
                <p class="note aside">The cursor paints without a button, so this stays on the current color. Cycle moves through the list on its own.</p>
              {:else}
                <p class="note aside">
                  Each time the {preset.splat.paint} button goes down, the next color is used for that stroke.
                </p>
              {/if}
              {#each properties.filter((control) => control.group === 'Splat') as control (control.key)}
                {@render slider(control.label, preset.settings[control.key], control.min, control.max, control.step, (value) =>
                  commitNumber(control.key, value),
                )}
              {/each}
            </div>
          </div>
          {@render axisFields('x', 'Map horizontal position', 'Optional. Left uses the minimum, right uses the maximum. Swap the two to flip it.')}
          {@render axisFields('y', 'Map vertical position', 'Optional. Top uses the minimum, bottom uses the maximum. Swap the two to flip it.')}
        {:else if category === 'audio' && preset.audio}
          {@const beat = clickAction(preset.audio.beat)}
          <div class="group">
            <div class="source-switch" role="group" aria-label="Audio input">
              <button
                type="button"
                class:on={audio.source === 'mic'}
                disabled={audio.opening}
                onclick={() => void audio.useMicrophone()}
              >
                <span>Microphone</span>
                <small>Outside</small>
              </button>
              <button
                type="button"
                class:on={audio.source === 'system'}
                disabled={audio.opening}
                onclick={() => void audio.useSystem()}
              >
                <span>System</span>
                <small>This computer</small>
              </button>
            </div>
            {#if audio.source !== 'off'}
              <div class="actions">
                <button class="action" type="button" onclick={() => audio.stop()}>Stop</button>
              </div>
            {/if}
            {#if audio.source === 'mic'}
              <p class="note aside">Listening to the microphone, the sound outside the computer.</p>
            {:else if audio.source === 'system'}
              <p class="note aside">Listening to everything playing on this computer. The picture from the share is not shown.</p>
            {:else}
              <p class="note aside">
                Microphone is the room. System is everything playing on this computer. The browser asks once: choose Entire screen and leave system audio on.
              </p>
            {/if}
            {#if audio.message}
              <p class="note aside warn">{audio.message}</p>
            {/if}
            {#if audio.source !== 'off'}
              <div class="meters" aria-hidden="true">
                {#each meters as item (item.key)}
                  <div class="meter-row">
                    <span>{item.label}</span>
                    <span class="meter"><span style:width="{audio[item.key] * 100}%"></span></span>
                  </div>
                {/each}
                <div class="meter-row">
                  <span>Beat</span>
                  <span class="lamp" class:on={audio.beatOn}></span>
                </div>
              </div>
            {/if}
            {@render slider('Gain', preset.audio.gain, 0, 4, 0.05, (value) => setAudio({ gain: value }))}
            {@render slider('Noise floor', preset.audio.floor, 0, 0.4, 0.01, (value) => setAudio({ floor: value }))}
            <p class="note aside">Gain lifts a quiet source. Raise the noise floor if a quiet room still counts as sound.</p>
          </div>
          <div class="group">
            <label class="field">
              <span class="name">On beat</span>
              <select value={preset.audio.beat ?? ''} onchange={(event) => chooseBeat(event.currentTarget.value)}>
                <option value="">None</option>
                {#each clickActions as action (action.id)}
                  <option value={action.id}>{action.label}</option>
                {/each}
              </select>
            </label>
            {#if beat && (beat.params?.length || beat.note)}
              <div class="group-body">
                {@render actionParams(beat.params, preset.audio.beatParams, setBeatParam)}
                {#if beat.note}
                  <p class="note aside">{beat.note}</p>
                {/if}
              </div>
            {/if}
            {@render slider('Sensitivity', preset.audio.beatSensitivity, 0, 1, 0.01, (value) => setAudio({ beatSensitivity: value }))}
            {@render slider('Gap', preset.audio.beatCooldown, 0.05, 1, 0.01, (value) => setAudio({ beatCooldown: value }))}
            <p class="note aside">The beat follows the kick, the same 60 Hz band the desktop engine uses. Higher sensitivity catches quieter hits. Gap is the shortest pause between hits.</p>
          </div>
          <div class="group">
            <label class="check">
              <input
                type="checkbox"
                checked={preset.audio.drive.enabled}
                onchange={(event) => setAudioDrive({ enabled: event.currentTarget.checked })}
              />
              <span>Paint with the sound</span>
            </label>
            {#if preset.audio.drive.enabled}
              {@const driveSource = driveSources.find((item) => item.id === preset.audio.drive.source) ?? driveSources[0]}
              <div class="group-body">
                <label class="field">
                  <span class="name">Follows</span>
                  <select value={driveSource.id} onchange={(event) => chooseDrive(event.currentTarget.value)}>
                    {#each driveSources as item (item.id)}
                      <option value={item.id}>{item.label}</option>
                    {/each}
                  </select>
                </label>
                <p class="note aside">{driveSource.note} It keeps going while this panel is hidden.</p>
                {@render slider('Force', preset.audio.drive.force, 0, 30, 0.1, (value) => setAudioDrive({ force: value }))}
                {@render slider('Dye', preset.audio.drive.dye, 0, 4, 0.05, (value) => setAudioDrive({ dye: value }))}
              </div>
            {/if}
          </div>
          <label class="check">
            <input
              type="checkbox"
              checked={preset.audio.colorFromPitch}
              onchange={(event) => setAudio({ colorFromPitch: event.currentTarget.checked })}
            />
            <span>Color follows pitch</span>
          </label>
          <p class="note aside">Low notes stay toward red and higher notes climb the rainbow. Uses the dye amount from Cursor.</p>
          {@render bandFields('level', 'Map loudness', 'Overall volume. Quiet uses the minimum, loud uses the maximum.')}
          {@render bandFields('bass', 'Map bass', 'Kick and bass. Quiet uses the minimum, loud uses the maximum.')}
          {@render bandFields('mid', 'Map mids', 'Vocals and melody. Quiet uses the minimum, loud uses the maximum.')}
          {@render bandFields('treble', 'Map highs', 'Cymbals and brightness. Quiet uses the minimum, loud uses the maximum.')}
        {:else if numberGroup}
          {#each properties.filter((control) => control.group === numberGroup) as control (control.key)}
            {@render slider(control.label, preset.settings[control.key], control.min, control.max, control.step, (value) =>
              commitNumber(control.key, value),
            )}
          {/each}
        {:else if category === 'general'}
          <div class="group">
            {@render toggle('Bloom', 'BLOOM')}
            <div class="group-body">
              {#each properties.filter((control) => control.group === 'Bloom') as control (control.key)}
                {@render slider(control.label, preset.settings[control.key], control.min, control.max, control.step, (value) =>
                  commitNumber(control.key, value),
                )}
              {/each}
            </div>
          </div>
          {@render toggle('Shading', 'SHADING')}
          {@render toggle('Paused', 'PAUSED')}
          {@render toggle('Transparent', 'TRANSPARENT')}
          <label class="field color">
            <span class="name">Background</span>
            <input
              type="color"
              value={toHex(preset.settings.BACK_COLOR)}
              oninput={(event) => commitColor(fromHex(event.currentTarget.value))}
            />
          </label>
        {/if}
      </div>
    </section>
  {/if}
</div>

<style>
  .shell {
    --card: #1b2331;
    --card-2: #141b27;
    --line: rgba(255, 255, 255, 0.07);
    --mint: #3ee0b0;
    --mint-deep: #14b48a;
    --ink: #f4f7fb;
    --muted: #8e99ad;
    position: fixed;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 16px 18px 16px;
    background: transparent;
    pointer-events: none;
    color: var(--ink);
    color-scheme: dark;
    font: 14px/1.4 'Segoe UI', system-ui, sans-serif;
  }

  .top {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
    min-width: 0;
    margin: -16px -18px 0;
    padding: 16px 18px 12px;
    background: #07080c;
    pointer-events: auto;
  }

  .chips {
    display: flex;
    gap: 10px;
    min-width: 0;
    overflow-x: auto;
    flex: 0 1 auto;
  }

  .chip {
    width: 104px;
    height: 72px;
    flex: none;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: linear-gradient(180deg, #262f41 0%, var(--card) 100%);
    color: var(--ink);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .chip.on {
    border-color: transparent;
    background: linear-gradient(180deg, #5af0c6 0%, var(--mint-deep) 100%);
    color: #fff;
    box-shadow: 0 10px 22px rgba(46, 214, 168, 0.28);
  }

  .chip input {
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: 11px;
    background: transparent;
    color: inherit;
    caret-color: currentColor;
    text-align: center;
    font: inherit;
    font-weight: 650;
    padding: 0 8px;
  }

  .chip input:focus {
    outline: none;
  }

  .add {
    flex: none;
    width: 72px;
    height: 72px;
    border: 1.5px dashed rgba(255, 255, 255, 0.18);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.02);
    color: #9aa6ba;
    font-size: 32px;
    line-height: 1;
    cursor: pointer;
  }

  .add:hover {
    border-color: var(--mint);
    color: var(--mint);
    background: rgba(62, 224, 176, 0.06);
  }

  .hint {
    margin: 0 0 0 auto;
    flex: none;
    color: var(--muted);
    font-size: 13px;
    white-space: nowrap;
  }

  .perf {
    flex: none;
    height: 40px;
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: linear-gradient(180deg, #262f41 0%, var(--card) 100%);
    color: var(--ink);
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  .perf:hover:not(.on) {
    border-color: rgba(62, 224, 176, 0.45);
  }

  .perf.on {
    border-color: transparent;
    background: linear-gradient(180deg, #5af0c6 0%, var(--mint-deep) 100%);
    color: #fff;
  }

  .panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0;
    background: transparent;
    pointer-events: none;
  }

  .categories {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    flex: none;
    margin: 0 -18px;
    padding: 2px 22px 14px;
    background: #07080c;
    pointer-events: auto;
  }

  .cat {
    min-width: 104px;
    height: 64px;
    padding: 6px 12px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: linear-gradient(180deg, #262f41 0%, var(--card) 100%);
    color: var(--ink);
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.04);
    cursor: pointer;
    font: inherit;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
  }

  .chip:hover:not(.on),
  .cat:hover:not(.on) {
    border-color: rgba(62, 224, 176, 0.45);
  }

  .cat.on {
    border-color: transparent;
    background: linear-gradient(180deg, #5af0c6 0%, var(--mint-deep) 100%);
    color: #fff;
    box-shadow: 0 8px 18px rgba(46, 214, 168, 0.28);
  }

  .cat-label {
    font-weight: 650;
  }

  .cat-detail {
    max-width: 92px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 550;
    color: #93a0b5;
  }

  .cat.on .cat-detail {
    color: rgba(255, 255, 255, 0.82);
  }

  .add:focus-visible,
  .perf:focus-visible,
  .cat:focus-visible,
  .chip:focus-within {
    outline: 2px solid var(--mint);
    outline-offset: 2px;
  }

  .well {
    flex: 1;
    align-self: flex-start;
    width: min(38rem, 100%);
    min-height: 0;
    margin-top: 12px;
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 1.15rem 1.3rem 1.5rem;
    background: var(--card-2);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    pointer-events: auto;
  }

  .well::-webkit-scrollbar {
    width: 10px;
  }

  .well::-webkit-scrollbar-thumb {
    background: #2c3548;
    border-radius: 999px;
  }

  h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 650;
  }

  .note {
    margin: 0.25rem 0 1rem;
    max-width: 36rem;
    color: var(--muted);
  }

  .note.aside {
    margin-top: 0.2rem;
  }

  .group {
    max-width: 34rem;
    margin: 0 0 0.85rem;
    padding: 0.8rem 0.95rem 0.15rem;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: #101722;
  }

  .group > .note {
    margin: 0.15rem 0 0.7rem;
  }

  .group > .field,
  .group > .check {
    margin-bottom: 0.7rem;
  }

  .group-body {
    margin: 0 0 0.75rem;
    padding: 0.15rem 0 0.1rem 0.9rem;
    border-left: 2px solid rgba(62, 224, 176, 0.45);
  }

  .group .field,
  .group .check,
  .group .colors,
  .group-body .note {
    max-width: none;
  }

  .group-body .note {
    margin: 0 0 0.75rem;
  }

  .group-body > :last-child {
    margin-bottom: 0.2rem;
  }

  .field {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.15rem 0.75rem;
    max-width: 32rem;
    margin: 0 0 0.85rem;
  }

  .name {
    color: #c5cedd;
  }

  .readout {
    color: var(--mint);
    font-variant-numeric: tabular-nums;
  }

  input[type='range'],
  select {
    grid-column: 1 / -1;
    width: 100%;
  }

  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    height: 22px;
    margin: 0.35rem 0 0;
    background: transparent;
    cursor: pointer;
  }

  input[type='range']::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--mint) var(--fill), #3a4158 var(--fill));
  }

  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    margin-top: -5px;
    border: 3px solid var(--mint);
    border-radius: 50%;
    background: #f7fffb;
    box-shadow: 0 0 0 4px rgba(62, 224, 176, 0.16);
  }

  input[type='range']::-moz-range-track {
    height: 6px;
    border: 0;
    border-radius: 999px;
    background: #3a4158;
  }

  input[type='range']::-moz-range-progress {
    height: 6px;
    border-radius: 999px;
    background: var(--mint);
  }

  input[type='range']::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border: 3px solid var(--mint);
    border-radius: 50%;
    background: #f7fffb;
    box-shadow: 0 0 0 4px rgba(62, 224, 176, 0.16);
  }

  select {
    margin-top: 0.35rem;
    padding: 0.55rem 2rem 0.55rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--card-2) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%238e99ad' d='M1 1l5 5 5-5'/%3E%3C/svg%3E") no-repeat right 0.75rem center;
    color: var(--ink);
    font: inherit;
    appearance: none;
  }

  select:focus {
    outline: none;
    border-color: var(--mint);
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    max-width: 32rem;
    margin: 0 0 0.85rem;
  }

  .check input {
    accent-color: var(--mint);
  }

  .color input {
    grid-column: auto;
    width: 2.6rem;
    height: 1.7rem;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: transparent;
  }

  input.text {
    grid-column: 1 / -1;
    width: 100%;
    margin-top: 0.35rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: #101722;
    color: var(--ink);
    font: inherit;
  }

  input.text:focus {
    outline: none;
    border-color: var(--mint);
  }

  .source-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    max-width: 28rem;
    padding: 4px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: #141b27;
  }

  .source-switch button {
    border: 0;
    border-radius: 11px;
    background: transparent;
    color: var(--ink);
    padding: 0.55rem 0.7rem 0.45rem;
    cursor: pointer;
    font: inherit;
    font-weight: 650;
  }

  .source-switch button small {
    display: block;
    margin-top: 1px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 550;
  }

  .source-switch button.on {
    background: linear-gradient(180deg, #5af0c6 0%, var(--mint-deep) 100%);
    color: #fff;
  }

  .source-switch button.on small {
    color: rgba(255, 255, 255, 0.86);
  }

  .source-switch button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    max-width: 32rem;
  }

  .action {
    flex: 1 1 7rem;
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: #262f41;
    color: var(--ink);
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  .action:hover {
    border-color: var(--mint);
  }

  .action.danger:hover:not(:disabled) {
    border-color: #e05a6a;
    color: #ffb4be;
  }

  .action:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .note.warn {
    color: #ffb4be;
  }

  .meters {
    display: grid;
    gap: 0.35rem;
    max-width: 32rem;
    margin: 0.2rem 0 0.9rem;
  }

  .meter-row {
    display: grid;
    grid-template-columns: 3.2rem 1fr;
    align-items: center;
    gap: 0.6rem;
    color: var(--muted);
    font-size: 12px;
  }

  .meter {
    height: 6px;
    border-radius: 999px;
    background: #3a4158;
    overflow: hidden;
  }

  .meter > span {
    display: block;
    height: 100%;
    width: 0;
    border-radius: inherit;
    background: var(--mint);
  }

  .lamp {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #3a4158;
  }

  .lamp.on {
    background: var(--mint);
    box-shadow: 0 0 10px var(--mint);
  }

  .action:focus-visible {
    outline: 2px solid var(--mint);
    outline-offset: 2px;
  }

  .colors {
    max-width: 32rem;
    margin: 0 0 0.85rem;
  }

  .swatches {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.35rem;
  }

  .swatch {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .swatch.over {
    outline: 1px solid var(--mint);
    outline-offset: 3px;
    border-radius: 10px;
  }

  .swatch input[type='color'] {
    flex: 1;
    height: 32px;
    padding: 3px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: #101722;
    cursor: pointer;
  }

  .swatch input[type='color']::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .swatch input[type='color']::-webkit-color-swatch {
    border: 0;
    border-radius: 7px;
  }

  .swatch-delete,
  .swatch-handle {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #8e99ad;
  }

  .swatch-delete {
    opacity: 0;
    cursor: pointer;
  }

  .swatch:hover .swatch-delete,
  .swatch:focus-within .swatch-delete {
    opacity: 1;
  }

  .swatch-delete:hover {
    color: #ffb4be;
    background: rgba(224, 90, 106, 0.16);
  }

  .swatch-handle {
    cursor: grab;
  }

  .swatch-handle:active {
    cursor: grabbing;
  }

  .swatch-delete svg,
  .swatch-handle svg {
    width: 14px;
    height: 14px;
  }

  .swatch-delete svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }

  .swatch-handle svg {
    fill: currentColor;
  }

  .swatch-add {
    align-self: flex-start;
    margin-top: 0.15rem;
    padding: 0.35rem 0.7rem;
    border: 1px dashed rgba(255, 255, 255, 0.18);
    border-radius: 10px;
    background: transparent;
    color: #9aa6ba;
    font: inherit;
    cursor: pointer;
  }

  .swatch-add:hover {
    border-color: var(--mint);
    color: var(--mint);
  }

  .swatch-delete:focus-visible,
  .swatch-handle:focus-visible,
  .swatch-add:focus-visible {
    outline: 2px solid var(--mint);
    outline-offset: 2px;
  }
</style>
