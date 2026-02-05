<script setup>
import MixerKnob from '../MixerKnob.vue'
const props = defineProps({
  value: { type: Number, default: 64 },
  size: { type: Number, default: 64 },
  hudEnabled: { type: Boolean, default: false },
  resetValue: { type: Number, default: 64 }
})
const emit = defineEmits(['input'])
</script>

<template>
  <MixerKnob
    :value="value"
    :size="size"
    :hud-enabled="hudEnabled"
    :hud-label="'Gain'"
    :hud-value="String(value)"
    :highlight-from-center="true"
    :reset-value="resetValue"
    @input="v => emit('input', v)"
  />
</template>
