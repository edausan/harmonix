<script setup>
import { computed } from 'vue'
const props = defineProps({
  visible: { type: Boolean, default: false },
  label: { type: String, default: '' },
  value: { type: String, default: '' },
  top: { type: Number, default: 30 },
  fixed: { type: Boolean, default: false },
  backdrop: { type: Boolean, default: false },
  z: { type: Number, default: 80 },
  darkText: { type: Boolean, default: false }
})
const textClass = computed(() => (props.darkText ? 'text-slate-100' : 'text-slate-900'))
const containerClass = computed(() => {
  if (props.fixed) return `fixed inset-0 z-[${props.z}]`
  return `absolute left-1/2 -translate-x-1/2 top-[${props.top}px] z-[${props.z}] px-3 py-2 rounded-lg bg-white/20 backdrop-blur-md ${textClass.value} border border-white/30 shadow-xl min-w-[100px] text-center`
})
const panelClass = computed(() => {
  return `absolute left-1/2 -translate-x-1/2 top-[${props.top}px] px-3 py-2 rounded-lg bg-white/20 backdrop-blur-md ${textClass.value} border border-white/30 shadow-xl min-w-[100px] text-center`
})
</script>

<template>
  <div v-show="visible" :class="containerClass">
    <div v-if="fixed && backdrop" class="absolute inset-0 bg-black/10"></div>
    <div v-if="fixed" :class="panelClass">
      <div class="text-[11px] font-semibold tracking-wide">{{ label }}</div>
      <div class="text-[14px] font-bold">{{ value }}</div>
    </div>
    <template v-else>
      <div class="text-[11px] font-semibold tracking-wide">{{ label }}</div>
      <div class="text-[14px] font-bold">{{ value }}</div>
    </template>
  </div>
</template>
