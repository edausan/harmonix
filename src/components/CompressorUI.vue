<script setup>
import MixerKnob from './MixerKnob.vue'
import { computed } from 'vue'
import { ref } from 'vue'
import HudOverlay from './HudOverlay.vue'
const props = defineProps({
  values: {
    type: Object,
    default: () => ({
      threshold: 64,
      attack: 64,
      release: 64,
      knee: 64,
      makeup: 64,
      ratio: 64
    })
  },
  color: { type: String, default: '#254f93' },
  knobSize: { type: Number, default: 64 },
  title: { type: String, default: 'Compressor' },
  labelColor: { type: String, default: '#273444' },
  showRemove: { type: Boolean, default: false }
})
const emit = defineEmits([
  'update:threshold',
  'update:attack',
  'update:release',
  'update:makeup',
  'update:ratio',
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
  if (key === 'threshold') showLocalHud('Threshold', `${thresholdDb.value} dB`)
  else if (key === 'makeup') showLocalHud('Makeup Gain', `${makeupDb.value} dB`)
  else if (key === 'attack') showLocalHud('Attack', attackMsStr.value)
  else if (key === 'release') showLocalHud('Release', releaseMsStr.value)
}
function onPanelClick() {
  emit('panelClick')
}
function onRemoveClick(e) {
  e.stopPropagation()
  emit('remove')
}
const thresholdDb = computed(() => {
  const v = Number(props.values?.threshold ?? 0)
  const db = -60 + (v / 127) * 60
  return Math.round(db)
})
const makeupDb = computed(() => {
  const v = Number(props.values?.makeup ?? 0)
  const db = -20 + (v / 127) * 40
  return Math.round(db)
})
function formatMs(ms) {
  if (ms < 1) return ms.toFixed(3)
  if (ms < 10) return ms.toFixed(2)
  if (ms < 100) return ms.toFixed(1)
  return String(Math.round(ms))
}
const attackMsStr = computed(() => {
  const v = Number(props.values?.attack ?? 0)
  const ms = 0.005 + (v / 127) * (250 - 0.005)
  return `${formatMs(ms)} ms`
})
const releaseMsStr = computed(() => {
  const v = Number(props.values?.release ?? 0)
  const ms = 10 + (v / 127) * (2500 - 10)
  return `${formatMs(ms)} ms`
})
const ratioSteps = ['2:1', '4:1', '8:1', '10:1']
function ratioIndexFromValue(v) {
  const n = ratioSteps.length
  const idx = Math.round((Number(v ?? 0) / 127) * (n - 1))
  return Math.max(0, Math.min(n - 1, idx))
}
const ratioGroupName = Math.random().toString(36).slice(2)
function onRatioSelect(index) {
  const n = ratioSteps.length
  const i = Math.max(0, Math.min(n - 1, Number(index)))
  const quantized = Math.round((i / (n - 1)) * 127)
  onVal('ratio', quantized)
  showLocalHud('Ratio', ratioSteps[i])
}
</script>

<template>
  <div
    class="rounded-2xl p-4 md:p-6 w-full max-w-xl mx-auto compressor-wrap relative"
    :style="{
      '--channel-color': color,
      '--channel-color-glow': color,
      '--label-color': labelColor
    }"
    @click="onPanelClick"
  >
    <HudOverlay :visible="hudVisible" :label="hudLabel" :value="hudValue" :top="16" :fixed="false" :z="80" />
    <div class="mb-4 flex items-center justify-between">
      <div class="px-3 py-1 rounded-full text-[10px] font-semibold tracking-widest uppercase comp-title-label">
        {{ title }}
      </div>
      <button
        v-if="showRemove"
        type="button"
        class="px-2 py-1 rounded-md text-slate-700 text-[11px] hover:text-slate-900 transition-colors bg-transparent"
        title="Remove compressor"
        aria-label="Remove compressor"
        @click="onRemoveClick"
      >
        ✕
      </button>
    </div>
    <div class="mb-6 flex items-center justify-center gap-2">
      <span class="text-[10px] font-medium uppercase tracking-wide comp-label">Ratio</span>
      <div class="flex items-center justify-center gap-2">
        <label
          v-for="(lbl, i) in ratioSteps"
          :key="lbl"
          class="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-semibold cursor-pointer"
          :class="i === ratioIndexFromValue(values.ratio) ? 'bg-slate-200 border-slate-400 text-slate-900' : 'bg-slate-800/60 border-slate-700 text-slate-300'"
        >
          <input
            type="radio"
            :name="ratioGroupName"
            :value="i"
            class="sr-only"
            :checked="i === ratioIndexFromValue(values.ratio)"
            @change="onRatioSelect(i)"
          />
          <span>{{ lbl }}</span>
        </label>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-6">
      <div class="flex flex-col items-center gap-3">
        <MixerKnob
          :value="values.threshold"
          :size="knobSize"
          :hud-label="'Threshold'"
          :hud-value="thresholdDb + ' dB'"
          :hud-enabled="false"
          @input="v => onVal('threshold', v)"
        />
        <span class="text-[10px] font-medium uppercase tracking-wide comp-label">Threshold · {{ thresholdDb }} dB</span>
      </div>
      <div class="flex flex-col items-center gap-3">
        <MixerKnob
          :value="values.makeup"
          :size="knobSize"
          :hud-label="'Makeup Gain'"
          :hud-value="makeupDb + ' dB'"
          :highlight-from-center="true"
          :reset-value="64"
          :hud-enabled="false"
          @input="v => onVal('makeup', v)"
        />
        <span class="text-[10px] font-medium uppercase tracking-wide comp-label">Makeup Gain</span>
      </div>
      <div class="flex flex-col items-center gap-3">
        <MixerKnob :value="values.attack" :size="knobSize" :hud-label="'Attack'" :hud-value="attackMsStr" :invert-ticks="true" :hud-enabled="false" @input="v => onVal('attack', v)" />
        <span class="text-[10px] font-medium uppercase tracking-wide comp-label">Attack</span>
      </div>
      <div class="flex flex-col items-center gap-3">
        <MixerKnob :value="values.release" :size="knobSize" :hud-label="'Release'" :hud-value="releaseMsStr" :invert-ticks="true" :hud-enabled="false" @input="v => onVal('release', v)" />
        <span class="text-[10px] font-medium uppercase tracking-wide comp-label">Release</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compressor-wrap {
  background:
    linear-gradient(180deg, #e7edf2 0%, #d3d9df 30%, #c7ced6 60%, #dfe5ea 100%),
    repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 1px, rgba(0,0,0,0.04) 1px, rgba(0,0,0,0.04) 2px);
  border: 1px solid #bfc6ce;
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.35),
    inset 0 0 18px rgba(255,255,255,0.15),
    0 10px 20px rgb(0 0 0 / 0.35);
}
.comp-title-label {
  background: linear-gradient(180deg, #dfe4ea, #c9d0d7);
  border: 1px solid #b7bec6;
  color: var(--label-color);
}
.comp-label {
  color: var(--label-color);
}
</style>
