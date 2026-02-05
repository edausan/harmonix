<script setup>
import { ref, watch, computed, onUnmounted, onMounted } from 'vue'
import HudOverlay from './HudOverlay.vue'
import MixerKnob from './MixerKnob.vue'

const props = defineProps({
  channelConfig: {
    type: Object,
    required: true
  },
  subtitle: {
    type: String,
    required: false
  },
  sendCc: {
    type: Function,
    required: true
  },
  values: {
    type: Object,
    required: false
  },
  name: {
    type: String,
    required: false
  },
  color: {
    type: String,
    default: '#254f93'
  },
  faderCcOverride: {
    type: Number,
    default: undefined
  }
})

const emit = defineEmits(['update:fader', 'update:knob', 'update:name', 'update:color', 'update:faderCcOverride'])

const effectiveFaderCC = computed(() =>
  props.faderCcOverride != null && Number.isFinite(props.faderCcOverride)
    ? props.faderCcOverride
    : props.channelConfig.faderCC
)

const selected = defineModel('selected', { type: Boolean, default: false })

const isFlipped = ref(false)
const settingsOpen = ref(false)
const isActive = ref(false)
let activeTimer = 0
let faderLastTapTs = 0
const localFaderCc = ref(
  props.faderCcOverride != null && Number.isFinite(props.faderCcOverride)
    ? String(props.faderCcOverride)
    : ''
)
const localName = ref(props.name ?? props.channelConfig.name ?? '')

const visibleKnobs = computed(() =>
  (props.channelConfig.knobs || []).filter(k =>
    k.label === 'Gain' ||
    k.label === 'Pan' ||
    k.label === 'Send A' ||
    k.label === 'Low Cut' ||
    k.label === 'High Cut'
  )
)

const faderBgEl = ref(null)
const sliderWidthPx = ref('')
let faderResizeObserver = null
const wrapperEl = ref(null)
const knobSize = ref(58)
let wrapperResizeObserver = null
const hudVisible = ref(false)
const hudLabel = ref('')
const hudValue = ref('')
let hudTimer = 0
const hudTop = ref(16)
function showHud(label, value) {
  hudLabel.value = String(label || '')
  hudValue.value = String(value || '')
  hudVisible.value = true
  if (hudTimer) clearTimeout(hudTimer)
  hudTimer = setTimeout(() => {
    hudVisible.value = false
    hudTimer = 0
  }, 900)
}

function updateSliderWidth() {
  const el = faderBgEl.value
  if (!el) return
  sliderWidthPx.value = el.clientHeight + 'px'
}

function updateKnobSize() {
  const el = wrapperEl.value
  if (!el) return
  const h = el.clientHeight
  const s = Math.max(46, Math.min(72, Math.round(h * 0.065)))
  knobSize.value = s
}

onMounted(() => {
  updateSliderWidth()
  updateKnobSize()
  try {
    faderResizeObserver = new ResizeObserver(() => updateSliderWidth())
    if (faderBgEl.value) faderResizeObserver.observe(faderBgEl.value)
  } catch {}
  try {
    wrapperResizeObserver = new ResizeObserver(() => updateKnobSize())
    if (wrapperEl.value) wrapperResizeObserver.observe(wrapperEl.value)
  } catch {}
})

watch(
  () => props.name,
  v => {
    if (v != null) localName.value = v
  }
)

function toggleFlip() {
  isFlipped.value = !isFlipped.value
  selected.value = true
}

function activateChannel() {
  isActive.value = true
  if (activeTimer) {
    clearTimeout(activeTimer)
    activeTimer = 0
  }
  activeTimer = setTimeout(() => {
    isActive.value = false
    activeTimer = 0
  }, 600)
}

function onChannelInteract() {
  activateChannel()
  selected.value = true
}

// name display is label-only (editing moved to toolbar)

watch(
  () => props.faderCcOverride,
  newVal => {
    localFaderCc.value =
      newVal != null && Number.isFinite(newVal) ? String(newVal) : ''
  }
)

watch(
  () => [props.values?.fader, ...(props.values?.knobs || [])],
  () => {
    activateChannel()
  }
)

watch(selected, v => {
  if (v) activateChannel()
})

watch(settingsOpen, isOpen => {
  if (isOpen) {
    document.addEventListener('keydown', onSettingsKeydown)
  } else {
    document.removeEventListener('keydown', onSettingsKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onSettingsKeydown)
  try {
    if (faderResizeObserver) faderResizeObserver.disconnect()
  } catch {}
})

function openSettings() {
  settingsOpen.value = true
  selected.value = true
}

function closeSettings() {
  settingsOpen.value = false
}

function onModalBackdropClick(e) {
  if (e.target === e.currentTarget) closeSettings()
}

function commitFaderCc() {
  const s = (localFaderCc.value || '').trim()
  if (s === '') {
    emit('update:faderCcOverride', null)
    return
  }
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0 || n > 127) return
  emit('update:faderCcOverride', n)
}

function onSettingsKeydown(e) {
  if (e.key === 'Escape') closeSettings()
}

function onKnobInput(index, cc, valueOrEvent) {
  const raw =
    typeof valueOrEvent === 'number'
      ? valueOrEvent
      : valueOrEvent && valueOrEvent.target && valueOrEvent.target.value
  const value = Number(raw)
  if (Number.isNaN(value)) return

  emit('update:knob', { index, value })
  if (props.sendCc) {
    props.sendCc(cc, value)
  }
  activateChannel()
  selected.value = true
  const label = (props.channelConfig.knobs || [])[index]?.label || 'Knob'
  const center = Math.round((0 + 127) / 2)
  let hudVal = formatDb(value)
  if (label === 'Pan') {
    const left = value < center ? Math.min(50, Math.round(((center - value) / (center - 0 || 1)) * 50)) : 0
    const right = value > center ? Math.min(50, Math.round(((value - center) / (127 - center || 1)) * 50)) : 0
    hudVal = value === center ? 'Center' : (value < center ? `Left ${left}` : `Right ${right}`)
  }
  hudTop.value = -24
  showHud(label, hudVal)
}

function onFaderInput(event) {
  const raw = event.target && event.target.value
  const value = Number(raw)
  if (Number.isNaN(value)) return

  emit('update:fader', value)
  if (props.sendCc) {
    props.sendCc(effectiveFaderCC.value, value)
  }
  activateChannel()
  selected.value = true
  hudTop.value = -14
  showHud('Vol', formatDb(value))
}

function onFaderDoubleClick() {
  const value = 64
  emit('update:fader', value)
  if (props.sendCc) {
    props.sendCc(effectiveFaderCC.value, value)
  }
  activateChannel()
  selected.value = true
  hudTop.value = -14
  showHud('Vol', formatDb(value))
}

function onFaderPointerDown(e) {
  const now = performance.now ? performance.now() : Date.now()
  if (e.pointerType === 'touch' && now - faderLastTapTs < 300) {
    e.preventDefault()
    onFaderDoubleClick()
    faderLastTapTs = 0
    return
  }
  faderLastTapTs = now
}

// inline name editing removed
function commitName() {
  const s = (localName.value || '').trim()
  emit('update:name', s)
}

defineExpose({
  openSettings,
  closeSettings
})

function formatDb(value) {
  const v = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(v) || v <= 0) {
    // Slider fully down: show true mute
    return '-inf dB'
  }
  // Logarithmic-style curve, clamped to Ableton's fader range [-70 dB, +6 dB]
  let db = 20 * Math.log10(v / 127) + 6
  if (db < -70) db = -70
  if (db > 6) db = 6
  return `${db.toFixed(1)} dB`
}
</script>

<template>
  <div
    class="channel-flip-wrapper relative w-28 sm:w-32 h-[calc(100dvh-12rem)] sm:h-[calc(100dvh-14rem)] md:h-[calc(100dvh-16rem)]"
    ref="wrapperEl"
    :style="{
      '--channel-color': color,
      '--channel-color-glow': color + '40',
      '--channel-bg': color + '18',
      '--fader-thickness': 'clamp(8px, 1.8vh, 12px)'
    }"
    @pointerdown="onChannelInteract"
    @touchstart.passive="onChannelInteract"
    @mousedown="onChannelInteract"
  >
    <HudOverlay :visible="hudVisible" :label="hudLabel" :value="hudValue" :top="16" :fixed="false" :z="80" :dark-text="true" />
    <div
      class="channel-flip-inner rounded-2xl border shadow-lg shadow-black/40 channel-border channel-bg-inner"
      :class="{ 'channel-flipped': isFlipped, 'channel-active': isActive, 'channel-selected': selected }"
    >
      <!-- Front: label + fader + settings + flip -->
      <div
        class="channel-face channel-face-front w-full h-full rounded-2xl channel-face-bg flex flex-col items-center px-3 pt-3 pb-4 gap-1"
      >
        <div class="w-full mb-2 flex flex-col items-center">
          <div
            class="channel-label w-full px-3 py-0.5 text-[10px] font-semibold tracking-widest uppercase text-slate-200 text-center truncate transition-colors"
          >
            {{ name || channelConfig.name }}
          </div>
          <div v-if="subtitle" class="px-3 py-0.5 text-[9px] font-normal text-slate-500 text-center truncate">
            #{{ effectiveFaderCC }}
          </div>
          <div class="w-full border-t border-slate-700/60 mt-2"></div>
        </div>

        <div class="flex-1 flex flex-col items-center justify-end w-full">
          <div class="h-full flex items-center justify-center mb-2">
            <div class="relative h-full w-10 sm:w-12 flex items-center justify-center">
              <div
                class="mixer-fader-bg pointer-events-none absolute left-1/2 -translate-x-1/2 top-2 bottom-2 rounded-full bg-slate-800/70 border border-slate-700/60"
                ref="faderBgEl"
                :style="{ width: 'var(--fader-thickness)' }"
              ></div>
              <input
                type="range"
                min="0"
                max="127"
                :value="values?.fader ?? 64"
                class="mixer-fader absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[clamp(7rem,30vh,18rem)] sm:w-[clamp(8rem,36vh,20rem)] md:w-[clamp(9rem,40vh,22rem)] lg:w-[clamp(10rem,44vh,24rem)] -rotate-90"
                :style="{ height: 'var(--fader-thickness)', width: sliderWidthPx }"
                @pointerdown="onFaderPointerDown"
                @input="onFaderInput($event)"
                @dblclick="onFaderDoubleClick"
              />
            </div>
          </div>
          <div class="channel-db text-[10px] font-mono mb-1">
            {{ formatDb(values?.fader ?? 64) }}
          </div>
          <div
            class="px-2 py-0.5 rounded bg-slate-800/80 text-[14px] font-mono text-slate-300 border border-slate-700 mb-2"
          >
            Vol
          </div>
          <div class="flex items-center justify-center gap-2">
            <button
              type="button"
              class="flip-btn p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 transition-colors"
              title="Show knobs"
              @click="toggleFlip"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Back: knobs + flip icon -->
      <div
        class="channel-face channel-face-back w-full h-full rounded-2xl channel-face-bg flex flex-col items-center px-3 pt-3 pb-4 gap-1"
      >
        <div class="w-full mb-2 flex flex-col items-center gap-1">
          <div class="px-3 py-0.5 rounded-full bg-slate-800/80 border border-slate-700 text-[10px] font-semibold tracking-widest uppercase text-slate-300 text-center w-full truncate">
            {{ name || channelConfig.name }}
          </div>
        </div>

        <div class="flex-1 flex flex-col items-center justify-center gap-6 w-full min-h-0">
          <div
            v-for="(k, index) in visibleKnobs"
            :key="k.cc"
            class="flex flex-col items-center gap-3 w-full"
          >
            <MixerKnob
              :value="values?.knobs?.[index] ?? 64"
              :size="knobSize"
              :mode="k.label === 'Pan' ? 'pan' : 'default'"
              :hud-enabled="k.label === 'Pan'"
              :hud-label="k.label === 'Pan' ? 'Pan' : ''"
              @input="val => onKnobInput(index, k.cc, val)"
            />
            <span class="text-[9px] font-medium text-slate-300 uppercase tracking-wide">
              {{ k.label }} <span class="text-slate-500 font-normal">#{{ k.cc }}</span>
            </span>
          </div>
        </div>

        <button
          type="button"
          class="flip-btn p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 transition-colors"
          title="Show fader"
          @click="toggleFlip"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </div>
    </div>
  </div>

  <!-- Channel settings modal (centered) -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-show="settingsOpen"
        class="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50"
        role="dialog"
        aria-modal="true"
        aria-label="Channel settings"
        @click.self="onModalBackdropClick"
        >
        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-show="settingsOpen"
            class="channel-settings-modal w-full max-w-[280px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl shadow-black/50 py-4 px-4 space-y-4"
            @click.stop
          >
            <div class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Track settings
            </div>
            <div class="space-y-1.5">
              <label class="text-[10px] font-medium uppercase tracking-wide text-slate-400 block">
                Track name
              </label>
              <input
                type="text"
                v-model="localName"
                :placeholder="channelConfig.name"
                class="w-full h-9 rounded-lg bg-slate-800 border border-slate-700 px-3 text-sm text-slate-200 placeholder-slate-500 outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-400"
                @blur="commitName"
                @keydown.enter="commitName"
              />
            </div>
            <!-- 1. Color picker (prioritized first) -->
            <div class="space-y-1.5">
              <label class="text-[10px] font-medium uppercase tracking-wide text-slate-400 block">
                Track color
              </label>
              <input
                type="color"
                :value="color"
                @input="emit('update:color', ($event.target && $event.target.value) || color)"
                class="channel-color-input h-9 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-800/80 p-1 touch-manipulation [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-md"
                title="Track color"
              />
            </div>
            <!-- 2. Fader CC override -->
            <div class="space-y-1.5">
              <label class="text-[10px] font-medium uppercase tracking-wide text-slate-400 block">
                Fader CC (0–127)
              </label>
              <input
                type="number"
                min="0"
                max="127"
                v-model="localFaderCc"
                :placeholder="`Default: ${channelConfig.faderCC}`"
                class="w-full h-9 rounded-lg bg-slate-800 border border-slate-700 px-3 text-sm text-slate-200 placeholder-slate-500 outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                @blur="commitFaderCc"
                @keydown.enter="commitFaderCc"
              />
              <p class="text-[9px] text-slate-500">
                Leave empty for default ({{ channelConfig.faderCC }})
              </p>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.channel-flip-wrapper {
  perspective: 800px;
}

.channel-flip-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.5s ease;
}

.channel-flip-inner.channel-flipped {
  transform: rotateY(180deg);
}

.channel-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.channel-face-back {
  transform: rotateY(180deg);
}

.channel-border {
  border-color: color-mix(in srgb, var(--channel-color) 45%, rgb(71 85 105));
}

.channel-bg-inner {
  background: color-mix(in srgb, var(--channel-color) 6%, rgb(15 23 42));
}

.channel-face-bg {
  background: color-mix(in srgb, var(--channel-color) 5%, rgb(15 23 42));
}


.channel-db {
  color: var(--channel-color);
}

.flip-btn:hover {
  color: var(--channel-color);
  border-color: var(--channel-color);
}

.channel-flip-inner::before {
  content: "";
  position: absolute;
  inset: -8px;
  border-radius: inherit;
  background: radial-gradient(circle, var(--channel-color-glow), transparent 60%);
  opacity: 0;
  filter: blur(10px);
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.channel-flip-inner.channel-active::before {
  opacity: 1;
  animation: channelPulse 700ms ease-out;
}

@keyframes channelPulse {
  0% { opacity: 0.2; filter: blur(12px); }
  50% { opacity: 1; filter: blur(16px); }
  100% { opacity: 0.5; filter: blur(12px); }
}

.channel-active.channel-border,
.channel-active .channel-border {
  border-color: color-mix(in srgb, var(--channel-color) 85%, rgb(71 85 105 / 30%));
  box-shadow: 0 0 0 1px var(--channel-color-glow);
}

.channel-selected.channel-border,
.channel-selected .channel-border {
  border-color: color-mix(in srgb, var(--channel-color) 85%, rgb(71 85 105 / 30%));
  box-shadow: 0 0 0 2px var(--channel-color-glow);
}

.mixer-fader {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  height: var(--fader-thickness);
  touch-action: none;
}

.mixer-fader::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 40px;
  height: 60px;
  margin-top: -25px; /* center 36px thumb on 12px track (before rotation = horizontal center on trackbar) */
  border-radius: 9999px;
  background: linear-gradient(to bottom, var(--channel-color), color-mix(in srgb, var(--channel-color) 75%, black));
  border: 1px solid rgb(15 23 42);
  box-shadow:
    0 0 0 1px var(--channel-color-glow),
    0 6px 10px rgb(0 0 0 / 0.75);
}

.mixer-fader::-moz-range-thumb {
  width: 24px;
  height: 36px;
  margin-top: -12px; /* center 36px thumb on 12px track */
  border-radius: 9999px;
  background: linear-gradient(to bottom, var(--channel-color), color-mix(in srgb, var(--channel-color) 75%, black));
  border: 1px solid rgb(15 23 42);
  box-shadow:
    0 0 0 1px var(--channel-color-glow),
    0 6px 10px rgb(0 0 0 / 0.75);
}

.mixer-fader::-webkit-slider-runnable-track {
  height: var(--fader-thickness);
  border-radius: 9999px;
  background: linear-gradient(to right, rgb(15 23 42), rgb(30 41 59));
}

.mixer-fader::-moz-range-track {
  height: var(--fader-thickness);
  border-radius: 9999px;
  background: linear-gradient(to right, rgb(15 23 42), rgb(30 41 59));
}

</style>
