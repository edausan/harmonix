<script setup>
import { computed } from 'vue'
import MixerKnob from '../MixerKnob.vue'
const props = defineProps({
  value: { type: Number, default: 64 },
  size: { type: Number, default: 64 },
  hudEnabled: { type: Boolean, default: false }
})
const emit = defineEmits(['input'])
const pct = computed(() => {
  const v = Number(props.value ?? 0)
  const val = (v / 127) * 100
  return Math.round(val)
})
</script>

<template>
  <MixerKnob
    :value="value"
    :size="size"
    :hud-enabled="hudEnabled"
    :hud-label="'Mix'"
    :hud-value="pct + '%'"
    @input="v => emit('input', v)"
  />
</template>
