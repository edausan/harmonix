<script setup>
import { computed } from 'vue'
import MixerKnob from '../MixerKnob.vue'
const props = defineProps({
  value: { type: Number, default: 64 },
  size: { type: Number, default: 64 },
  hudEnabled: { type: Boolean, default: false }
})
const emit = defineEmits(['input'])
const hz = computed(() => {
  const v = Number(props.value ?? 0)
  const val = 10 + (v / 127) * (1500 - 10)
  return Math.round(val)
})
</script>

<template>
  <MixerKnob
    :value="value"
    :size="size"
    :hud-enabled="hudEnabled"
    :hud-label="'Low Cut'"
    :hud-value="hz + ' Hz'"
    :invert-ticks="false"
    @input="v => emit('input', v)"
  />
</template>
