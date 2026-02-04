
<script setup>
import { ref, onMounted } from 'vue'
import MixerTopBar from './components/MixerTopBar.vue'
import MixerChannel from './components/MixerChannel.vue'
import MixerLegend from './components/MixerLegend.vue'
import { ref as vueRef } from 'vue'

const params = new URLSearchParams(window.location.search)
const mode = ref(params.get('mode') === 'remote' ? 'remote' : 'host') // host on Mac, remote on phone

const bridgeHost = params.get('bridgeHost') || window.location.hostname || 'localhost'
const bridgePort = Number(params.get('bridgePort') || 5180)
const isSecure = window.location.protocol === 'https:'
const wsScheme = isSecure ? 'wss' : 'ws'
const bridgeUrl = ref(`${wsScheme}://${bridgeHost}:${bridgePort}`)

const clientId =
  (globalThis.crypto && crypto.randomUUID && crypto.randomUUID()) ||
  `${Date.now()}-${Math.random().toString(16).slice(2)}`

const wsStatus = ref('disconnected')
let ws = null

// When enabled, we listen to Ableton feedback (incoming MIDI CC updates UI)
const syncListenToAbleton = ref(false)

const midi = ref(null)
const outputs = ref([])
const outputId = ref('')
const channel = ref(0)
const selectedChannelIndex = ref(0)
const showToolbar = ref(true)

// Smooth incoming CC → UI updates (prevents jitter when DAW streams CC)
let incomingRaf = 0
const incomingCcQueue = new Map() // cc -> value

// Prevent feedback jitter: ignore Ableton "echo" right after we send
const lastSentCc = new Map() // cc -> { value, t }
const ECHO_IGNORE_MS = 80

const DEFAULT_CHANNEL_NAMES = [
  "Drums",
  "Bass",
  "Gtr",
  "Acoustic",
  "Keys",
  "Vocals",
  "CH 7",
  "CH 8",
  "CH 9",
  "CH 10",
]

// 10 mixer channels, each with 1 fader + 5 knobs
const mixerChannels = Array.from({ length: 10 }, (_, i) => {
  const index = i + 1
  const base = 20 + i // faders: 20–29
  return {
    id: index,
    name: DEFAULT_CHANNEL_NAMES[i],
    faderCC: base,
    knobs: [
      { label: 'Gain', cc: 40 + i },
      { label: 'Pan', cc: 60 + i },
      { label: 'Send A', cc: 90 + i },
      { label: 'Send B', cc: 100 + i },
      { label: 'Send C', cc: 110 + i }
    ]
  }
})

// Reactive track names (can be renamed from the UI)
const channelNames = ref(mixerChannels.map(ch => ch.name))

// Per-channel accent colors (hex)
const DEFAULT_CHANNEL_COLORS = [
  '#254f93', '#254f93', '#254f93', '#254f93', '#254f93',
  '#254f93', '#254f93', '#254f93', '#254f93', '#254f93'
]
const channelColors = ref([...DEFAULT_CHANNEL_COLORS])

// Per-channel fader CC override (null = use default from mixerChannels)
const channelFaderCCOverrides = ref(mixerChannels.map(() => null))

function getFaderCC(index) {
  const over = channelFaderCCOverrides.value[index]
  if (over != null && Number.isFinite(over)) return over
  return mixerChannels[index].faderCC
}

// UI values for each channel, driven by both user interaction and incoming MIDI
const channelValues = ref(
  mixerChannels.map(() => ({
    fader: 64,
    knobs: [64, 64, 64, 64, 64]
  }))
)
const channelRefs = vueRef([])

onMounted(async () => {
  connectWs()
  try {
    midi.value = await navigator.requestMIDIAccess()
    outputs.value = [...midi.value.outputs.values()]
    outputId.value = outputs.value[0]?.id || ''
    if (mode.value === 'host') {
      for (const input of midi.value.inputs.values()) {
        input.onmidimessage = handleMIDIMessage
      }
    }
  } catch {}
})

function send(status, d1, d2) {
  const out = outputs.value.find(o => o.id === outputId.value)
  if (!out) return
  out.send([status + channel.value, d1, d2])
}

function broadcast(msg) {
  if (!ws || ws.readyState !== 1) return
  ws.send(JSON.stringify(msg))
}

function applyCCToState(cc, value) {
  const numChannels = mixerChannels.length

  // Faders: match by effective fader CC per channel (default or override)
  for (let i = 0; i < numChannels; i++) {
    if (getFaderCC(i) === cc && channelValues.value[i]) {
      channelValues.value[i].fader = value
      return true
    }
  }

  // Gain knobs: CC 40–49 (index 0)
  if (cc >= 40 && cc < 40 + numChannels) {
    const index = cc - 40
    if (channelValues.value[index]) channelValues.value[index].knobs[0] = value
    return true
  }

  // Pan knobs: CC 60–69 (index 1)
  if (cc >= 60 && cc < 60 + numChannels) {
    const index = cc - 60
    if (channelValues.value[index]) channelValues.value[index].knobs[1] = value
    return true
  }

  // Send A knobs: CC 90–99 (index 2)
  if (cc >= 90 && cc < 90 + numChannels) {
    const index = cc - 90
    if (channelValues.value[index]) channelValues.value[index].knobs[2] = value
    return true
  }

  // Send B knobs: CC 100–109 (index 3)
  if (cc >= 100 && cc < 100 + numChannels) {
    const index = cc - 100
    if (channelValues.value[index]) channelValues.value[index].knobs[3] = value
    return true
  }

  // Send C knobs: CC 110–119 (index 4)
  if (cc >= 110 && cc < 110 + numChannels) {
    const index = cc - 110
    if (channelValues.value[index]) channelValues.value[index].knobs[4] = value
    return true
  }

  return false
}

function queueIncomingCc(cc, value) {
  incomingCcQueue.set(cc, value)
  if (incomingRaf) return

  incomingRaf = requestAnimationFrame(() => {
    incomingRaf = 0
    for (const [queuedCc, queuedValue] of incomingCcQueue.entries()) {
      applyCCToState(queuedCc, queuedValue)
    }
    incomingCcQueue.clear()
  })
}

function sendCC(cc, val) {
  const value = typeof val === 'number' ? val : Number(val)
  if (Number.isNaN(value)) return

  // Update UI locally in both modes
  applyCCToState(cc, value)

  // Broadcast to other clients
  broadcast({ type: 'cc', cc, value, midiChannel: channel.value, clientId })

  lastSentCc.set(cc, { value, t: performance.now() })
  send(0xB0, cc, value)
}

function handleMIDIMessage(event) {
  // If sync is OFF, do not listen to Ableton feedback.
  if (!syncListenToAbleton.value) return

  const [status, d1, d2] = event.data || []
  if ((status & 0xf0) !== 0xb0) return // only CC

  const msgChannel = status & 0x0f
  if (msgChannel !== channel.value) return

  const cc = d1
  const value = d2

  // Ignore short-term "echo" feedback that matches what we just sent
  const last = lastSentCc.get(cc)
  if (last) {
    const age = performance.now() - last.t
    if (age >= 0 && age < ECHO_IGNORE_MS && last.value === value) {
      return
    }
  }

  // Update host UI (smoothed only — avoid double-applying)
  queueIncomingCc(cc, value)

  // Broadcast DAW feedback to remotes (host is source)
  broadcast({ type: 'cc', cc, value, midiChannel: channel.value, clientId })
}

function connectWs() {
  const url = bridgeUrl.value
  wsStatus.value = 'connecting'
  ws = new WebSocket(url)

  ws.addEventListener('open', () => {
    wsStatus.value = 'connected'
    broadcast({
      type: 'hello',
      mode: mode.value,
      clientId
    })
  })

  ws.addEventListener('close', () => {
    wsStatus.value = 'disconnected'
    // Simple reconnect
    setTimeout(() => connectWs(), 1000)
  })

  ws.addEventListener('error', () => {
    wsStatus.value = 'error'
  })

  ws.addEventListener('message', evt => {
    let msg
    try {
      msg = JSON.parse(evt.data)
    } catch {
      return
    }

    // Ignore our own broadcasts
    if (msg && msg.clientId === clientId) return

    if (msg.type === 'cc') {
      // Only apply if it matches current MIDI channel view
      if (typeof msg.midiChannel === 'number' && msg.midiChannel !== channel.value) return

      const cc = Number(msg.cc)
      const value = Number(msg.value)
      if (!Number.isFinite(cc) || !Number.isFinite(value)) return

      // Smooth remote/host sync updates too (avoid jitter on fast streams)
      queueIncomingCc(cc, value)

      // Host should forward remote CC -> MIDI
      if (mode.value === 'host') {
        send(0xB0, cc, value)
      }
    } else if (msg.type === 'name') {
      const index = Number(msg.index)
      const name = typeof msg.name === 'string' ? msg.name : ''
      if (!Number.isFinite(index) || index < 0 || index >= channelNames.value.length) return
      channelNames.value[index] = name || channelNames.value[index]
    } else if (msg.type === 'color') {
      const index = Number(msg.index)
      const color = typeof msg.color === 'string' ? msg.color : ''
      if (!Number.isFinite(index) || index < 0 || index >= channelColors.value.length || !color) return
      channelColors.value[index] = color
    } else if (msg.type === 'faderCcOverride') {
      const index = Number(msg.index)
      const val = msg.value
      if (!Number.isFinite(index) || index < 0 || index >= channelFaderCCOverrides.value.length) return
      channelFaderCCOverrides.value[index] = val == null || val === '' ? null : Number(val)
    }
  })
}

function manualReconnect() {
  wsStatus.value = 'connecting'
  if (ws && ws.readyState === 1) {
    try {
      ws.close()
    } catch (e) {
      // ignore
    }
  }
  setTimeout(() => connectWs(), 100)
}

function savePreset(name) {
  const presetName =
    typeof name === 'string' && name.trim()
      ? name.trim()
      : `Preset ${new Date().toISOString().replace(/[:.]/g, '-')}`
  const data = {
    version: 1,
    midiChannel: channel.value,
    channels: mixerChannels.map((ch, i) => ({
      id: ch.id,
      name: channelNames.value[i],
      color: channelColors.value[i],
      faderCc: getFaderCC(i),
      faderCcOverride: channelFaderCCOverrides.value[i],
      values: {
        fader: channelValues.value[i].fader,
        knobs: [...channelValues.value[i].knobs]
      }
    }))
  }
  let presets = {}
  try {
    presets = JSON.parse(localStorage.getItem('harmonix_presets') || '{}') || {}
  } catch {}
  presets[presetName] = data
  try {
    localStorage.setItem('harmonix_presets', JSON.stringify(presets))
  } catch {}
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-50 flex flex-col pt-14 sm:pt-16">
    <MixerTopBar
      :outputs="outputs"
      :output-id="outputId"
      :channel="channel"
      :mode="mode"
      :ws-status="wsStatus"
      :bridge-url="bridgeUrl"
      :sync-listen-to-ableton="syncListenToAbleton"
      :on-reconnect="manualReconnect"
      :on-save-preset="savePreset"
      @update:outputId="value => (outputId = value)"
      @update:channel="value => (channel = value)"
      @update:syncListenToAbleton="value => (syncListenToAbleton = value)"
    />

    <main class="flex-1 overflow-hidden">
      <div class="h-full flex flex-col">
        <div class="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3 flex items-center gap-4">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            {{ channelNames[selectedChannelIndex] }} • CC {{ getFaderCC(selectedChannelIndex) }}
          </div>
          <div class="ml-auto">
            <button
              type="button"
              class="px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700 text-slate-300 text-[11px]"
              @click="showToolbar = !showToolbar"
            >
              {{ showToolbar ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>
        <div v-show="showToolbar" class="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3 flex items-center gap-4">
          <button
            type="button"
            class="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 transition-colors hover:border-slate-500 flex items-center gap-2"
            title="Customize track"
            aria-label="Customize track"
            @click="channelRefs[selectedChannelIndex]?.openSettings()"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="21" y1="4" x2="14" y2="4" />
              <line x1="10" y1="4" x2="3" y2="4" />
              <line x1="21" y1="12" x2="12" y2="12" />
              <line x1="8" y1="12" x2="3" y2="12" />
              <line x1="21" y1="20" x2="16" y2="20" />
              <line x1="12" y1="20" x2="3" y2="20" />
              <circle cx="12" cy="4" r="2" />
              <circle cx="8" cy="12" r="2" />
              <circle cx="16" cy="20" r="2" />
            </svg>
            <span class="text-[11px] font-semibold uppercase tracking-wide">Customize</span>
          </button>
        </div>
        <div class="flex-1 overflow-x-auto overflow-y-hidden">
          <div
            class="h-full flex gap-4 px-6 py-6 pb-16 min-w-max bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950"
          >
            <MixerChannel
              v-for="(ch, index) in mixerChannels"
              :key="ch.id"
              :channel-config="ch"
              :name="channelNames[index]"
              :values="channelValues[index]"
              :color="channelColors[index]"
              :fader-cc-override="channelFaderCCOverrides[index]"
              :send-cc="sendCC"
              :selected="selectedChannelIndex === index"
              :ref="el => (channelRefs[index] = el)"
              @update:selected="val => { if (val) selectedChannelIndex = index }"
              @update:fader="val => (channelValues[index].fader = val)"
              @update:knob="payload => (channelValues[index].knobs[payload.index] = payload.value)"
              @update:name="
                val => {
                  channelNames[index] = val
                  broadcast({ type: 'name', index, name: val, clientId })
                }
              "
              @update:color="
                val => {
                  channelColors[index] = val
                  broadcast({ type: 'color', index, color: val, clientId })
                }
              "
              @update:fader-cc-override="
                val => {
                  channelFaderCCOverrides[index] = val
                  broadcast({ type: 'faderCcOverride', index, value: val, clientId })
                }
              "
            />
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
