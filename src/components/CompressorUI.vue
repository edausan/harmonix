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
      ratio: 64,
      lowCut: 64,
      highCut: 64
    })
  },
  color: { type: String, default: '#254f93' },
  knobSize: { type: Number, default: 64 },
  title: { type: String, default: 'Compressor' },
  labelColor: { type: String, default: '#273444' },
  showRemove: { type: Boolean, default: false },
  layout: { type: String, default: 'Basic' },
  ccThreshold: { type: Number, default: undefined },
  ccMakeup: { type: Number, default: undefined },
  ccAttack: { type: Number, default: undefined },
  ccRelease: { type: Number, default: undefined },
  ccRatio: { type: Number, default: undefined },
  ccLowCut: { type: Number, default: undefined },
  ccHighCut: { type: Number, default: undefined }
})
const emit = defineEmits([
  'update:threshold',
  'update:attack',
  'update:release',
  'update:makeup',
  'update:ratio',
  'update:lowCut',
  'update:highCut',
  'update:layout',
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
const layoutOpen = ref(false)
const drawerOpen = ref(false)
function toggleLayout(e) {
  e && e.stopPropagation && e.stopPropagation()
  layoutOpen.value = !layoutOpen.value
}
function selectLayout(val) {
  layoutOpen.value = false
  emit('update:layout', String(val))
}
const layoutOptions = ['Basic', 'Side-chain', 'Basic EQ']
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
    class="rounded-2xl p-4 md:p-6 w-full min-w-0 max-w-none h-[400px] mx-auto compressor-wrap relative flex flex-col"
    :style="{
      '--channel-color': color,
      '--channel-color-glow': color,
      '--label-color': labelColor
    }"
    @click="onPanelClick"
  >
    <HudOverlay :visible="hudVisible" :label="hudLabel" :value="hudValue" :top="16" :fixed="false" :z="80" />
    <div class="mb-4 flex items-center justify-between">
      <div class="relative">
        <button
          type="button"
          class="px-3 py-1 rounded-full text-[10px] font-semibold tracking-widest uppercase comp-title-label"
          @click.stop="toggleLayout"
          :aria-expanded="layoutOpen ? 'true' : 'false'"
        >
          {{ layout || 'Basic' }}
        </button>
        <div
          v-show="layoutOpen"
          class="absolute left-0 top-full mt-2 z-20 min-w-[12rem] rounded-xl border border-slate-700 bg-slate-900 shadow-xl shadow-black/40 py-2"
          role="menu"
          @click.stop
        >
          <button
            v-for="opt in layoutOptions"
            :key="opt"
            type="button"
            class="w-full text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-800/70"
            @click="selectLayout(opt)"
          >
            {{ opt }}
          </button>
        </div>
      </div>
      <button
        v-if="showRemove"
        type="button"
        class="px-2 py-1 rounded-md text-slate-600 hover:text-red-500 hover:bg-slate-800/20 transition-colors bg-transparent"
        title="Remove"
        aria-label="Remove"
        @click="onRemoveClick"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      </button>
    </div>
    <div class="absolute left-1/2 -translate-x-1/2 bottom-3 z-10">
      <button
        v-if="layout === 'Basic EQ'"
        type="button"
        class="p-2 rounded-md bg-slate-800/50 border border-slate-700 text-slate-300 hover:bg-slate-700/60"
        title="EQ"
        aria-label="EQ"
        @click.stop="drawerOpen = !drawerOpen"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12h18"></path>
          <path d="M12 5v14"></path>
        </svg>
      </button>
    </div>
    <div class="mb-6 flex items-center justify-center gap-2">
      <div class="flex flex-col items-center">
        <span class="text-[10px] font-medium uppercase tracking-wide comp-label">Ratio</span>
        <span v-if="ccRatio != null" class="text-[9px] font-semibold uppercase tracking-wide comp-label opacity-70">CC {{ ccRatio }}</span>
      </div>
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
    <div class="flex-1 flex items-center justify-center">
      <div class="grid grid-cols-2 gap-6 w-full place-items-center">
      <div class="flex flex-col items-center">
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
        <span v-if="ccThreshold != null" class="mt-0.5 text-[9px] font-semibold uppercase tracking-wide comp-label opacity-70">CC {{ ccThreshold }}</span>
      </div>
      <div class="flex flex-col items-center">
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
        <span v-if="ccMakeup != null" class="mt-0.5 text-[9px] font-semibold uppercase tracking-wide comp-label opacity-70">CC {{ ccMakeup }}</span>
      </div>
      <div class="flex flex-col items-center">
        <div class="flex flex-col items-center gap-3">
          <MixerKnob :value="values.attack" :size="knobSize" :hud-label="'Attack'" :hud-value="attackMsStr" :invert-ticks="true" :hud-enabled="false" @input="v => onVal('attack', v)" />
          <span class="text-[10px] font-medium uppercase tracking-wide comp-label">Attack</span>
        </div>
        <span v-if="ccAttack != null" class="mt-0.5 text-[9px] font-semibold uppercase tracking-wide comp-label opacity-70">CC {{ ccAttack }}</span>
      </div>
      <div class="flex flex-col items-center">
        <div class="flex flex-col items-center gap-3">
          <MixerKnob :value="values.release" :size="knobSize" :hud-label="'Release'" :hud-value="releaseMsStr" :invert-ticks="true" :hud-enabled="false" @input="v => onVal('release', v)" />
          <span class="text-[10px] font-medium uppercase tracking-wide comp-label">Release</span>
        </div>
        <span v-if="ccRelease != null" class="mt-0.5 text-[9px] font-semibold uppercase tracking-wide comp-label opacity-70">CC {{ ccRelease }}</span>
      </div>
      </div>
    </div>
    <div v-show="drawerOpen && layout === 'Basic EQ'" class="absolute inset-0 z-20" @click.self="drawerOpen = false">
      <div
        class="absolute left-0 right-0 bottom-0 border-t border-slate-700 bg-slate-900/95 backdrop-blur-sm"
        style="height: 75%"
        @click.stop
      >
        <div class="h-full flex flex-col items-center justify-center gap-6 px-4">
          <div class="grid grid-cols-2 gap-6 w-full place-items-center">
            <div class="flex flex-col items-center">
              <div class="flex flex-col items-center gap-3">
                <MixerKnob
                  :value="values.lowCut"
                  :size="knobSize"
                  :hud-label="'Low Cut'"
                  :hud-value="lowCutHz + ' Hz'"
                  :hud-enabled="false"
                  @input="v => onVal('lowCut', v)"
                />
                <span class="text-[10px] font-medium uppercase tracking-wide comp-label">Low Cut</span>
              </div>
              <span v-if="ccLowCut != null" class="mt-0.5 text-[9px] font-semibold uppercase tracking-wide comp-label opacity-70">CC {{ ccLowCut }}</span>
            </div>
            <div class="flex flex-col items-center">
              <div class="flex flex-col items-center gap-3">
                <MixerKnob
                  :value="values.highCut"
                  :size="knobSize"
                  :hud-label="'High Cut'"
                  :hud-value="highCutHz + ' Hz'"
                  :hud-enabled="false"
                  @input="v => onVal('highCut', v)"
                />
                <span class="text-[10px] font-medium uppercase tracking-wide comp-label">High Cut</span>
              </div>
              <span v-if="ccHighCut != null" class="mt-0.5 text-[9px] font-semibold uppercase tracking-wide comp-label opacity-70">CC {{ ccHighCut }}</span>
            </div>
          </div>
        </div>
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
