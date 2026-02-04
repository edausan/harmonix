<script setup>
import { ref, onUnmounted } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 127 },
  size: { type: Number, default: 64 },
  dragSensitivity: { type: Number, default: 0.6 },
  mode: { type: String, default: 'default' },
  tickArcDeg: { type: Number, default: 150 },
  tickOffsetDeg: { type: Number, default: 10 }
})

const emit = defineEmits(['input'])

const dragging = ref(false)
let startY = 0
let startVal = 0
let lastTapTs = 0

const ticks = Array.from({ length: 13 }, (_, i) => i * 10)

function isTickActive(tick) {
  if (props.mode !== 'pan') return props.value >= tick
  const center = (props.min + props.max) / 2
  const sv = props.value - center
  const st = tick - center
  if (sv === 0) return false
  return Math.sign(sv) === Math.sign(st) && Math.abs(st) <= Math.abs(sv)
}

function clamp(v) {
  if (v < props.min) return props.min
  if (v > props.max) return props.max
  return Math.round(v)
}

function onPointerDown(e) {
  e.preventDefault()
  const now = performance.now ? performance.now() : Date.now()
  if (e.pointerType === 'touch' && now - lastTapTs < 300) {
    const center = Math.round((props.min + props.max) / 2)
    const defVal = props.mode === 'pan' ? center : 0
    emit('input', clamp(defVal))
    lastTapTs = 0
    return
  }
  lastTapTs = now
  dragging.value = true
  startY = e.clientY
  startVal = props.value
  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', onPointerUp, { passive: false })
}

function onDoubleClick() {
  const center = Math.round((props.min + props.max) / 2)
  emit('input', clamp(props.mode === 'pan' ? center : 0))
}

function onPointerMove(e) {
  if (!dragging.value) return
  e.preventDefault()
  const dy = startY - e.clientY
  const next = clamp(startVal + dy * props.dragSensitivity)
  emit('input', next)
}

function onPointerUp(e) {
  e.preventDefault()
  dragging.value = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})
</script>

<template>
  <div
    class="knob-wrap"
    :style="{
      '--knob-value': value,
      '--knob-size': size + 'px',
      '--knob-angle':
        (((value - (min + max) / 2) / ((max - min) / 2)) * tickArcDeg).toFixed(3) + 'deg',
      '--tick-offset-deg': tickOffsetDeg + 'deg',
      width: size + 'px',
      height: size + 'px'
    }"
    @pointerdown="onPointerDown"
    @dblclick="onDoubleClick"
  >
    <div class="knob-ticks-wrap">
      <div
        v-for="tick in ticks"
        :key="tick"
        class="knob-tick"
        :class="{ active: isTickActive(tick) }"
        :style="{
          '--tick-angle':
            (((tick - (min + max) / 2) / ((max - min) / 2)) * tickArcDeg).toFixed(3) + 'deg'
        }"
      ></div>
    </div>
    <div class="knob-visual">
      <div class="knob-indicator"></div>
    </div>
    <div v-if="mode === 'pan'" class="pan-labels">
      <span class="pan-label pan-label-left">L</span>
      <span class="pan-label pan-label-right">R</span>
    </div>
    <input
      type="range"
      :min="min"
      :max="max"
      :value="value"
      class="mixer-knob"
      @input="val => emit('input', Number(val.target && val.target.value))"
    />
  </div>
  </template>

<style scoped>
.mixer-knob {
  -webkit-appearance: none;
  appearance: none;
  position: absolute;
  inset: 0;
  opacity: 0;
  touch-action: none;
  cursor: pointer;
}

.mixer-knob::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 0;
  height: 0;
}

.mixer-knob::-moz-range-thumb {
  width: 0;
  height: 0;
}

.knob-wrap {
  position: relative;
  width: 64px;
  height: 64px;
  touch-action: none;
  user-select: none;
  cursor: ns-resize;
}

.knob-tick {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 8px;
  background: rgb(51 65 85); /* Slate 700 */
  border-radius: 2px;
  transform-origin: center;
  transform: translate(-50%, -50%) rotate(var(--tick-angle)) translateY(calc(var(--knob-size) * -0.65));
  transition: background-color 0.2s, box-shadow 0.2s;
  pointer-events: none;
}

.knob-tick.active {
  background: var(--channel-color);
  box-shadow: 0 0 6px var(--channel-color);
}

.knob-ticks-wrap {
  position: absolute;
  inset: 0;
  transform: rotate(var(--tick-offset-deg));
  pointer-events: none;
}

.knob-visual {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 55%, rgb(30 41 59), rgb(15 23 42));
  border: 2px solid color-mix(in srgb, var(--channel-color) 55%, rgb(51 65 85));
  box-shadow:
    inset 0 0 0 2px var(--channel-color-glow),
    0 8px 14px rgb(0 0 0 / 0.55);
}

.knob-indicator {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 2px;
  height: 26px;
  background: var(--channel-color);
  transform-origin: bottom center;
  transform: translate(-50%, -100%) rotate(var(--knob-angle));
  border-radius: 9999px;
  box-shadow:
    0 0 0 1px rgb(15 23 42),
    0 0 0 3px var(--channel-color-glow);
}
.pan-labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.pan-label {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--channel-color) 70%, rgb(203 213 225));
  text-shadow: 0 0 6px var(--channel-color-glow);
}

.pan-label-left {
  left: 6px;
}

.pan-label-right {
  right: 6px;
}

</style>
