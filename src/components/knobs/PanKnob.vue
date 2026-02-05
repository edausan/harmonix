<script setup>
import MixerKnob from '../MixerKnob.vue'
const props = defineProps({
  value: { type: Number, default: 64 },
  size: { type: Number, default: 64 },
  hudEnabled: { type: Boolean, default: false },
  resetValue: { type: Number, default: null }
})
const emit = defineEmits(['input'])
</script>

<template>
  <MixerKnob
    :value="value"
    :size="size"
    :hud-enabled="hudEnabled"
    :mode="'pan'"
    :reset-value="resetValue"
    @input="v => emit('input', v)"
  />
</template>
