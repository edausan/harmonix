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
  const val = 100 + (v / 127) * (20000 - 100)
  return Math.round(val)
})
</script>

<template>
  <MixerKnob
    :value="value"
    :size="size"
    :hud-enabled="hudEnabled"
    :hud-label="'High Cut'"
    :hud-value="hz + ' Hz'"
    :invert-ticks="true"
    @input="v => emit('input', v)"
  />
</template>
