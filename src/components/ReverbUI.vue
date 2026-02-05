<script setup>
import MixerKnob from './MixerKnob.vue'
import { computed } from 'vue'
import { ref } from 'vue'
import HudOverlay from './HudOverlay.vue'
const props = defineProps({
  values: {
    type: Object,
    default: () => ({
      mix: 64,
      decay: 64,
      lowCut: 64,
      highCut: 64
    })
  },
  color: { type: String, default: '#1c789f' },
  knobSize: { type: Number, default: 64 },
  title: { type: String, default: 'Reverb' },
  labelColor: { type: String, default: '#ffffff' },
  showRemove: { type: Boolean, default: false }
})
const emit = defineEmits([
  'update:mix',
  'update:decay',
  'update:lowCut',
  'update:highCut',
  'panelClick',
  'remove'
])
const hudVisible = ref(false)
const hudLabel = ref('')
const hudValue = ref('')
let hudTimer = 0
function showLocalHud(label, value) {
  hudLabel.value = String(label || '')
  hudValue.value = String(value || '')
  hudVisible.value = true
  if (hudTimer) clearTimeout(hudTimer)
  hudTimer = setTimeout(() => {
    hudVisible.value = false
    hudTimer = 0
  }, 900)
}
function onVal(key, val) {
  emit(`update:${key}`, Number(val))
  if (key === 'mix') showLocalHud('Mix', `${mixPct.value}%`)
  else if (key === 'decay') showLocalHud('Decay', decaySecStr.value)
  else if (key === 'lowCut') showLocalHud('Low Cut', `${lowCutHz.value} Hz`)
  else if (key === 'highCut') showLocalHud('High Cut', `${highCutHz.value} Hz`)
}
function onPanelClick() {
  emit('panelClick')
}
function onRemoveClick(e) {
  e.stopPropagation()
  emit('remove')
}
const mixPct = computed(() => {
  const v = Number(props.values?.mix ?? 0)
  const pct = (v / 127) * 100
  return Math.round(pct)
})
function formatSec(s) {
  if (s < 0.1) return s.toFixed(3) + ' s'
  if (s < 1) return s.toFixed(2) + ' s'
  if (s < 10) return s.toFixed(1) + ' s'
  return Math.round(s) + ' s'
}
const decaySecStr = computed(() => {
  const v = Number(props.values?.decay ?? 0)
  const s = 0.02 + (v / 127) * (70 - 0.02)
  return formatSec(s)
})
const lowCutHz = computed(() => {
  const v = Number(props.values?.lowCut ?? 0)
  const hz = 10 + (v / 127) * (1500 - 10)
  return Math.round(hz)
})
const highCutHz = computed(() => {
  const v = Number(props.values?.highCut ?? 0)
  const hz = 100 + (v / 127) * (20000 - 100)
  return Math.round(hz)
})
</script>

<template>
  <div
    class="rounded-2xl p-4 md:p-6 w-[400px] min-w-[400px] max-w-[400px] h-[400px] mx-auto reverb-wrap relative"
    :style="{
      '--channel-color': '#ffffff',
      '--channel-color-glow': '#ffffff',
      '--label-color': labelColor
    }"
    @click="onPanelClick"
  >
    <HudOverlay :visible="hudVisible" :label="hudLabel" :value="hudValue" :top="16" :fixed="false" :z="80" />
    <div class="mb-4 flex items-center justify-between">
      <div class="px-3 py-1 rounded-full text-[10px] font-semibold tracking-widest uppercase reverb-title-label">
        {{ title }}
      </div>
      <button
        v-if="showRemove"
        type="button"
        class="px-2 py-1 rounded-md text-slate-900 text-[11px] hover:text-black transition-colors bg-transparent"
        title="Remove reverb"
        aria-label="Remove reverb"
        @click="onRemoveClick"
      >
        ✕
      </button>
    </div>
    <div class="grid grid-cols-2 gap-6">
      <div class="flex flex-col items-center gap-3">
        <MixerKnob
          :value="values.mix"
          :size="knobSize"
          :hud-label="'Mix'"
          :hud-value="mixPct + '%'"
          :hud-enabled="false"
          @input="v => onVal('mix', v)"
        />
        <span class="text-[10px] font-medium uppercase tracking-wide reverb-label">Mix · {{ mixPct }}%</span>
      </div>
      <div class="flex flex-col items-center gap-3">
        <MixerKnob
          :value="values.decay"
          :size="knobSize"
          :hud-label="'Decay'"
          :hud-value="decaySecStr"
          :hud-enabled="false"
          @input="v => onVal('decay', v)"
        />
        <span class="text-[10px] font-medium uppercase tracking-wide reverb-label">Decay</span>
      </div>
      <div class="flex flex-col items-center gap-3">
        <MixerKnob
          :value="values.lowCut"
          :size="knobSize"
          :hud-label="'Low Cut'"
          :hud-value="lowCutHz + ' Hz'"
          :hud-enabled="false"
          @input="v => onVal('lowCut', v)"
        />
        <span class="text-[10px] font-medium uppercase tracking-wide reverb-label">Low Cut</span>
      </div>
      <div class="flex flex-col items-center gap-3">
        <MixerKnob
          :value="values.highCut"
          :size="knobSize"
          :hud-label="'High Cut'"
          :hud-value="highCutHz + ' Hz'"
          :hud-enabled="false"
          @input="v => onVal('highCut', v)"
        />
        <span class="text-[10px] font-medium uppercase tracking-wide reverb-label">High Cut</span>
      </div>
    </div>
  </div>
  </template>

<style scoped>
.reverb-wrap {
  background: #1c789f;
  border: 1px solid color-mix(in srgb, #1c789f 80%, #000000);
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.25),
    inset 0 0 18px rgba(0,0,0,0.08),
    0 10px 20px rgb(0 0 0 / 0.35);
}
.reverb-title-label {
  background: color-mix(in srgb, #1c789f 25%, #ffffff);
  border: 1px solid color-mix(in srgb, #1c789f 70%, #000000);
  color: var(--label-color);
}
.reverb-label {
  color: var(--label-color);
}
</style>
