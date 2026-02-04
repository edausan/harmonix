<script setup>
import MixerKnob from './MixerKnob.vue'
import { computed } from 'vue'
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
  'update:knee',
  'update:makeup',
  'update:ratio',
  'panelClick',
  'remove'
])
function onVal(key, val) {
  emit(`update:${key}`, Number(val))
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
</script>

<template>
  <div
    class="rounded-2xl p-4 md:p-6 w-full max-w-xl mx-auto compressor-wrap"
    :style="{
      '--channel-color': color,
      '--channel-color-glow': color,
      '--label-color': labelColor
    }"
    @click="onPanelClick"
  >
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
    <div class="grid grid-cols-3 gap-6">
      <div class="flex flex-col items-center gap-3">
        <MixerKnob :value="values.threshold" :size="knobSize" @input="v => onVal('threshold', v)" />
        <span class="text-[10px] font-medium uppercase tracking-wide comp-label">Threshold · {{ thresholdDb }} dB</span>
      </div>
      <div class="flex flex-col items-center gap-3">
        <MixerKnob :value="values.attack" :size="knobSize" @input="v => onVal('attack', v)" />
        <span class="text-[10px] font-medium uppercase tracking-wide comp-label">Attack</span>
      </div>
      <div class="flex flex-col items-center gap-3">
        <MixerKnob :value="values.release" :size="knobSize" @input="v => onVal('release', v)" />
        <span class="text-[10px] font-medium uppercase tracking-wide comp-label">Release</span>
      </div>
      <div class="flex flex-col items-center gap-3">
        <MixerKnob :value="values.knee" :size="knobSize" @input="v => onVal('knee', v)" />
        <span class="text-[10px] font-medium uppercase tracking-wide comp-label">Knee</span>
      </div>
      <div class="flex flex-col items-center gap-3">
        <MixerKnob :value="values.makeup" :size="knobSize" @input="v => onVal('makeup', v)" />
        <span class="text-[10px] font-medium uppercase tracking-wide comp-label">Makeup Gain</span>
      </div>
      <div class="flex flex-col items-center gap-3">
        <MixerKnob :value="values.ratio" :size="knobSize" @input="v => onVal('ratio', v)" />
        <span class="text-[10px] font-medium uppercase tracking-wide comp-label">Ratio</span>
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
