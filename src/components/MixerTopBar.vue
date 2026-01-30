<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  outputs: {
    type: Array,
    required: true
  },
  outputId: {
    type: String,
    required: true
  },
  channel: {
    type: Number,
    required: true
  },
  mode: {
    type: String,
    default: 'host'
  },
  wsStatus: {
    type: String,
    default: 'disconnected'
  },
  bridgeUrl: {
    type: String,
    default: ''
  },
  syncListenToAbleton: {
    type: Boolean,
    default: false
  },
  onReconnect: {
    type: Function,
    default: null
  }
})

const emit = defineEmits(['update:outputId', 'update:channel', 'update:syncListenToAbleton'])

const popoverOpen = ref(false)
const popoverEl = ref(null)
const triggerEl = ref(null)

function togglePopover() {
  popoverOpen.value = !popoverOpen.value
}

function closePopover() {
  popoverOpen.value = false
}

function handleClickOutside(e) {
  if (
    popoverOpen.value &&
    popoverEl.value &&
    triggerEl.value &&
    !popoverEl.value.contains(e.target) &&
    !triggerEl.value.contains(e.target)
  ) {
    closePopover()
  }
}

function toggleSync() {
  emit('update:syncListenToAbleton', !props.syncListenToAbleton)
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <header
    class="relative z-[60] border-b border-slate-800 bg-slate-900/70 backdrop-blur flex items-center justify-between gap-4 px-4 sm:px-6 py-3 sm:py-4"
  >
    <div class="min-w-0">
      <h1 class="text-lg sm:text-xl font-semibold tracking-tight truncate">
        Harmonix
      </h1>
      <p class="text-[10px] sm:text-xs text-slate-400 truncate">
        Control Your Sound in Harmony
      </p>
    </div>

    <div class="relative flex-shrink-0" ref="triggerEl">
      <button
        type="button"
        class="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-400/70 transition-colors touch-manipulation"
        title="Settings"
        aria-label="Open settings"
        @click="togglePopover"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      </button>

      <!-- Popover -->
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-show="popoverOpen"
          ref="popoverEl"
          class="absolute right-0 top-full mt-2 z-[100] w-[min(320px,calc(100vw-2rem))] rounded-xl border border-slate-700 bg-slate-900 shadow-xl shadow-black/50 py-4 px-4"
          role="dialog"
          aria-label="Settings"
        >
          <div class="space-y-4">
            <!-- Status row: Mode, Link, Reconnect, Sync -->
            <div class="grid grid-cols-2 gap-2">
              <div class="px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700">
                <span class="text-[10px] uppercase tracking-wide text-slate-500 block">Mode</span>
                <span class="text-xs font-semibold text-slate-200">{{ mode }}</span>
              </div>
              <div class="px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700">
                <span class="text-[10px] uppercase tracking-wide text-slate-500 block">Link</span>
                <span class="text-xs font-semibold text-slate-200">{{ wsStatus }}</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="min-h-[44px] px-3 py-2 rounded-lg border bg-slate-800 border-slate-700 text-slate-200 text-sm hover:border-emerald-400/70 transition-colors touch-manipulation"
                @click="onReconnect && onReconnect(); closePopover()"
                title="Force WebSocket reconnect"
              >
                Reconnect
              </button>
              <button
                type="button"
                class="min-h-[44px] px-3 py-2 rounded-lg border text-sm transition-colors touch-manipulation"
                :class="
                  syncListenToAbleton
                    ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                    : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-600'
                "
                @click="toggleSync"
                title="Listen to Ableton fader/knob feedback"
              >
                Sync: {{ syncListenToAbleton ? 'ON' : 'OFF' }}
              </button>
            </div>
            <div class="px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700">
              <span class="text-[10px] uppercase tracking-wide text-slate-500 block">WebSocket</span>
              <span class="text-[11px] text-slate-300 break-all">{{ bridgeUrl }}</span>
            </div>

            <!-- MIDI Output & Channel - aligned -->
            <div class="border-t border-slate-700/80 pt-4 space-y-3">
              <div class="grid grid-cols-[1fr_auto] gap-3 items-end">
                <div class="min-w-0">
                  <label class="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1.5 block">
                    MIDI Output
                  </label>
                  <select
                    :value="outputId"
                    @change="emit('update:outputId', $event.target && $event.target.value)"
                    class="w-full h-10 rounded-lg bg-slate-800 border border-slate-700 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-400 touch-manipulation"
                  >
                    <option v-if="outputs.length === 0" disabled value="">
                      No MIDI outputs
                    </option>
                    <option v-for="o in outputs" :key="o.id" :value="o.id">
                      {{ o.name }}
                    </option>
                  </select>
                </div>
                <div class="w-20 flex-shrink-0">
                  <label class="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1.5 block">
                    Channel
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="15"
                    :value="channel"
                    @input="emit('update:channel', Number($event.target && $event.target.value))"
                    class="w-full h-10 rounded-lg bg-slate-800 border border-slate-700 px-3 text-sm text-center outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-400 touch-manipulation [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
              <p class="text-[10px] text-slate-500">
                MIDI channel 0–15 (1–16 in DAW)
              </p>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </header>
</template>
