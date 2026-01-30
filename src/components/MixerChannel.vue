<script setup>
import { ref, watch } from 'vue'

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
  }
})

const emit = defineEmits(['update:fader', 'update:knob', 'update:name'])

const isEditingName = ref(false)
const isFlipped = ref(false)
const localName = ref(props.name || props.channelConfig.name)

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
    props.sendCc(props.channelConfig.faderCC, value)
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
  <div class="channel-flip-wrapper w-28 sm:w-32 h-[320px]">
    <div
      class="channel-flip-inner rounded-2xl border border-slate-800 shadow-lg shadow-black/40"
      :class="{ 'channel-flipped': isFlipped }"
    >
      <!-- Front: label + fader + flip icon -->
      <div
        class="channel-face channel-face-front w-full h-full rounded-2xl bg-slate-900/70 flex flex-col items-center px-3 pt-3 pb-4 gap-1"
      >
        <div class="w-full mb-3 flex flex-col items-center gap-1">
          <button
            type="button"
            class="px-3 py-0.5 rounded-full bg-slate-800/80 border border-slate-700 text-[10px] font-semibold tracking-widest uppercase text-slate-200 text-center w-full truncate hover:border-emerald-400/70 transition-colors"
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
            CC {{ channelConfig.faderCC }}
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
          <div class="text-[10px] font-mono text-emerald-300 mb-1">
            {{ formatDb(values?.fader ?? 100) }}
          </div>
          <div
            class="px-2 py-0.5 rounded bg-slate-800/80 text-[10px] font-mono text-slate-300 border border-slate-700 mb-2"
          >
            Vol
          </div>
          <button
            type="button"
            class="flip-btn p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-400/70 transition-colors"
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

      <!-- Back: knobs + flip icon -->
      <div
        class="channel-face channel-face-back w-full h-full rounded-2xl bg-slate-900/90 flex flex-col items-center px-3 pt-3 pb-4 gap-1"
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
          class="flip-btn p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-400/70 transition-colors"
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
  background: linear-gradient(to bottom, rgb(52 211 153), rgb(34 197 94));
  border: 1px solid rgb(15 23 42);
  box-shadow:
    0 0 0 1px rgb(22 163 74 / 0.6),
    0 6px 10px rgb(0 0 0 / 0.75);
}

.mixer-fader::-moz-range-thumb {
  width: 24px;
  height: 36px;
  margin-top: -12px; /* center 36px thumb on 12px track */
  border-radius: 9999px;
  background: linear-gradient(to bottom, rgb(52 211 153), rgb(34 197 94));
  border: 1px solid rgb(15 23 42);
  box-shadow:
    0 0 0 1px rgb(22 163 74 / 0.6),
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
  background: rgb(52 211 153);
  box-shadow:
    0 0 0 2px rgb(15 23 42),
    0 0 0 4px rgb(22 163 74 / 0.6);
}

.mixer-knob::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 9999px;
  background: rgb(52 211 153);
  box-shadow:
    0 0 0 2px rgb(15 23 42),
    0 0 0 4px rgb(22 163 74 / 0.6);
}
</style>

