<script setup>
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
  }
})

const emit = defineEmits(['update:outputId', 'update:channel'])
</script>

<template>
  <header
    class="border-b border-slate-800 bg-slate-900/70 backdrop-blur flex items-center justify-between px-6 py-4"
  >
    <div>
      <h1 class="text-xl font-semibold tracking-tight">
        DAW MIDI Mixer
      </h1>
      <p class="text-xs text-slate-400">
        10-channel mixer · 3 knobs + 1 fader per channel
      </p>
    </div>

    <div class="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
      <div class="flex flex-col">
        <label class="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">
          MIDI Output
        </label>
        <select
          :value="props.outputId"
          @change="emit('update:outputId', $event.target && $event.target.value)"
          class="h-9 rounded-md bg-slate-900 border border-slate-700 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-400"
        >
          <option v-if="props.outputs.length === 0" disabled value="">
            No MIDI outputs
          </option>
          <option v-for="o in props.outputs" :key="o.id" :value="o.id">
            {{ o.name }}
          </option>
        </select>
      </div>

      <div class="flex flex-col w-28">
        <label class="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">
          MIDI Channel
        </label>
        <input
          type="number"
          min="0"
          max="15"
          :value="props.channel"
          @input="emit('update:channel', Number($event.target && $event.target.value))"
          class="h-9 rounded-md bg-slate-900 border border-slate-700 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-400"
        />
        <p class="mt-1 text-[10px] text-slate-500">
          0–15 (MIDI channels 1–16)
        </p>
      </div>
    </div>
  </header>
</template>

