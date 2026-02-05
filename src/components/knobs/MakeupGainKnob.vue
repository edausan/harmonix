<script setup>
import { computed } from 'vue'
import MixerKnob from '../MixerKnob.vue'
const props = defineProps({
  value: { type: Number, default: 64 },
  size: { type: Number, default: 64 },
  hudEnabled: { type: Boolean, default: false }
})
const emit = defineEmits(['input'])
const display = computed(() => {
  const v = Number(props.value ?? 64)
  if (v === 64) return '0 dB'
  if (v < 64) {
    const frac = (64 - v) / 64
    const db = Math.round(frac * 100)
    return `-${db} dB`
  }
  const frac = (v - 64) / 63
  const db = Math.round(frac * 36)
  return `${db} dB`
})
</script>

<template>
  <MixerKnob
    :value="value"
    :size="size"
    :hud-enabled="hudEnabled"
    :hud-label="'Makeup Gain'"
    :hud-value="display"
    :pan-style-ticks="true"
    :highlight-from-center="true"
    :reset-value="64"
    @input="v => emit('input', v)"
  />
</template>
