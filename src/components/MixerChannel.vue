<script setup>
import { ref, watch, computed, onUnmounted } from 'vue'

const props = defineProps({
  channelConfig: {
    type: Object,
    required: true
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
    default: '#22c55e'
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

const isEditingName = ref(false)
const isFlipped = ref(false)
const settingsOpen = ref(false)
const localName = ref(props.name || props.channelConfig.name)
const localFaderCc = ref(
  props.faderCcOverride != null && Number.isFinite(props.faderCcOverride)
    ? String(props.faderCcOverride)
    : ''
)

function toggleFlip() {
  isFlipped.value = !isFlipped.value
}

watch(
  () => props.name,
  newVal => {
    if (typeof newVal === 'string') {
      localName.value = newVal
    }
  }
)

watch(
  () => props.faderCcOverride,
  newVal => {
    localFaderCc.value =
      newVal != null && Number.isFinite(newVal) ? String(newVal) : ''
  }
)

watch(settingsOpen, isOpen => {
  if (isOpen) {
    document.addEventListener('keydown', onSettingsKeydown)
  } else {
    document.removeEventListener('keydown', onSettingsKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onSettingsKeydown)
})

function openSettings() {
  settingsOpen.value = true
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

function onKnobInput(index, cc, event) {
  const raw = event.target && event.target.value
  const value = Number(raw)
  if (Number.isNaN(value)) return

  emit('update:knob', { index, value })
  if (props.sendCc) {
    props.sendCc(cc, value)
  }
}

function onFaderInput(event) {
  const raw = event.target && event.target.value
  const value = Number(raw)
  if (Number.isNaN(value)) return

  emit('update:fader', value)
  if (props.sendCc) {
    props.sendCc(effectiveFaderCC.value, value)
  }
}

function startEditName() {
  isEditingName.value = true
}

function commitName() {
  const trimmed = (localName.value || '').trim()
  const finalName = trimmed || props.channelConfig.name
  emit('update:name', finalName)
  localName.value = finalName
  isEditingName.value = false
}

function onNameKeydown(event) {
  if (event.key === 'Enter') {
    commitName()
  } else if (event.key === 'Escape') {
    isEditingName.value = false
    localName.value = props.name || props.channelConfig.name
  }
}

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
    class="channel-flip-wrapper w-28 sm:w-32 h-[370px]"
    :style="{
      '--channel-color': color,
      '--channel-color-glow': color + '40',
      '--channel-bg': color + '18'
    }"
  >
    <div
      class="channel-flip-inner rounded-2xl border shadow-lg shadow-black/40 channel-border channel-bg-inner"
      :class="{ 'channel-flipped': isFlipped }"
    >
      <!-- Front: label + fader + settings + flip -->
      <div
        class="channel-face channel-face-front w-full h-full rounded-2xl channel-face-bg flex flex-col items-center px-3 pt-3 pb-4 gap-1"
      >
        <div class="w-full mb-3 flex flex-col items-center gap-1">
          <button
            type="button"
            class="channel-label w-full px-3 py-0.5 rounded-full bg-slate-800/80 border border-slate-700 text-[10px] font-semibold tracking-widest uppercase text-slate-200 text-center truncate transition-colors"
            @dblclick="startEditName"
          >
            <span v-if="!isEditingName">
              {{ name || channelConfig.name }}
            </span>
            <input
              v-else
              v-model="localName"
              class="w-full bg-transparent outline-none border-none text-center uppercase text-[10px]"
              @blur="commitName"
              @keydown="onNameKeydown"
            />
          </button>
          <div class="text-[10px] text-slate-500">
            CC {{ effectiveFaderCC }}
          </div>
        </div>

        <div class="flex-1 flex flex-col items-center justify-end w-full">
          <div class="h-44 flex items-center justify-center mb-2">
            <div class="relative h-full w-12 flex items-center justify-center">
              <div
                class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-2 bottom-2 w-3 rounded-full bg-slate-800/70 border border-slate-700/60"
              ></div>
              <input
                type="range"
                min="0"
                max="127"
                :value="values?.fader ?? 100"
                class="mixer-fader absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-40 -rotate-90"
                @input="onFaderInput($event)"
              />
            </div>
          </div>
          <div class="channel-db text-[10px] font-mono mb-1">
            {{ formatDb(values?.fader ?? 100) }}
          </div>
          <div
            class="px-2 py-0.5 rounded bg-slate-800/80 text-[10px] font-mono text-slate-300 border border-slate-700 mb-2"
          >
            Vol
          </div>
          <div class="flex items-center justify-center gap-2">
            <button
              type="button"
              class="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 transition-colors touch-manipulation hover:border-slate-500"
              title="Channel settings"
              aria-label="Channel settings"
              @click="openSettings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
            </button>
            <button
              type="button"
              class="flip-btn p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 transition-colors"
              title="Show knobs"
              @click="toggleFlip"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
          <div class="text-[9px] text-slate-500 uppercase tracking-wide">
            Knobs
          </div>
        </div>

        <div class="flex-1 flex flex-col items-center justify-center gap-3 w-full min-h-0">
          <div
            v-for="(k, index) in channelConfig.knobs"
            :key="k.cc"
            class="flex flex-col items-center gap-1 w-full"
          >
            <input
              type="range"
              min="0"
              max="127"
              :value="values?.knobs?.[index] ?? 64"
              class="mixer-knob w-full"
              @input="onKnobInput(index, k.cc, $event)"
            />
            <span class="text-[9px] font-medium text-slate-300 uppercase tracking-wide">
              {{ k.label }}
            </span>
          </div>
        </div>

        <button
          type="button"
          class="flip-btn p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 transition-colors"
          title="Show fader"
          @click="toggleFlip"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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

.channel-label:hover {
  border-color: var(--channel-color);
  box-shadow: 0 0 0 1px var(--channel-color-glow);
}

.channel-db {
  color: var(--channel-color);
}

.flip-btn:hover {
  color: var(--channel-color);
  border-color: var(--channel-color);
}

.mixer-fader {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  height: 12px; /* match track bar width so fader thumb is centered on it */
  width: 10rem; /* vertical travel when rotated */
  touch-action: none;
}

.mixer-fader::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 36px;
  margin-top: -12px; /* center 36px thumb on 12px track (before rotation = horizontal center on trackbar) */
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
  height: 12px;
  border-radius: 9999px;
  background: linear-gradient(to right, rgb(15 23 42), rgb(30 41 59));
}

.mixer-fader::-moz-range-track {
  height: 12px;
  border-radius: 9999px;
  background: linear-gradient(to right, rgb(15 23 42), rgb(30 41 59));
}

.mixer-knob {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 22px;
  border-radius: 9999px;
  background: linear-gradient(to right, rgb(15 23 42), rgb(30 64 175));
  touch-action: none;
}

.mixer-knob::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 9999px;
  background: var(--channel-color);
  box-shadow:
    0 0 0 2px rgb(15 23 42),
    0 0 0 4px var(--channel-color-glow);
}

.mixer-knob::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 9999px;
  background: var(--channel-color);
  box-shadow:
    0 0 0 2px rgb(15 23 42),
    0 0 0 4px var(--channel-color-glow);
}
</style>

