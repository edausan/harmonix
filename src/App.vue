
<script setup>
import { ref, onMounted } from 'vue'
import MixerTopBar from './components/MixerTopBar.vue'
import MixerChannel from './components/MixerChannel.vue'
import MixerLegend from './components/MixerLegend.vue'

const params = new URLSearchParams(window.location.search)
const mode = ref(params.get('mode') === 'remote' ? 'remote' : 'host') // host on Mac, remote on phone

const bridgeHost = params.get('bridgeHost') || window.location.hostname || 'localhost'
const bridgePort = Number(params.get('bridgePort') || 5180)
const bridgeUrl = ref(`ws://${bridgeHost}:${bridgePort}`)

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

// Smooth incoming CC → UI updates (prevents jitter when DAW streams CC)
let incomingRaf = 0
const incomingCcQueue = new Map() // cc -> value

// Prevent feedback jitter: ignore Ableton "echo" right after we send
const lastSentCc = new Map() // cc -> { value, t }
const ECHO_IGNORE_MS = 80

// 10 mixer channels, each with 1 fader + 3 knobs
const mixerChannels = Array.from({ length: 10 }, (_, i) => {
  const index = i + 1
  const base = 20 + i // faders: 20–29
  return {
    id: index,
    name: `CH ${index}`,
    faderCC: base,
    knobs: [
      { label: 'Gain', cc: 40 + i },
      { label: 'Pan', cc: 60 + i },
      { label: 'Send', cc: 80 + i }
    ]
  }
})

// Reactive track names (can be renamed from the UI)
const channelNames = ref(mixerChannels.map(ch => ch.name))

// UI values for each channel, driven by both user interaction and incoming MIDI
const channelValues = ref(
  mixerChannels.map(() => ({
    fader: 100,
    knobs: [64, 64, 64]
  }))
)

onMounted(async () => {
  connectWs()

  // Only the host (Mac) owns MIDI ports
  if (mode.value === 'host') {
    midi.value = await navigator.requestMIDIAccess()
    outputs.value = [...midi.value.outputs.values()]
    outputId.value = outputs.value[0]?.id || ''

    // Listen to all MIDI inputs and update UI on incoming CC (then broadcast to remotes)
    for (const input of midi.value.inputs.values()) {
      input.onmidimessage = handleMIDIMessage
    }
  }
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

  // Faders: CC 20–29
  if (cc >= 20 && cc < 20 + numChannels) {
    const index = cc - 20
    if (channelValues.value[index]) channelValues.value[index].fader = value
    return true
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

  // Send knobs: CC 80–89 (index 2)
  if (cc >= 80 && cc < 80 + numChannels) {
    const index = cc - 80
    if (channelValues.value[index]) channelValues.value[index].knobs[2] = value
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

  // Only host actually outputs MIDI
  if (mode.value === 'host') {
    lastSentCc.set(cc, { value, t: performance.now() })
    send(0xB0, cc, value)
  }
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
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
    <MixerTopBar
      :outputs="outputs"
      :output-id="outputId"
      :channel="channel"
      :mode="mode"
      :ws-status="wsStatus"
      :bridge-url="bridgeUrl"
      :sync-listen-to-ableton="syncListenToAbleton"
      :on-reconnect="manualReconnect"
      @update:outputId="value => (outputId = value)"
      @update:channel="value => (channel = value)"
      @update:syncListenToAbleton="value => (syncListenToAbleton = value)"
    />

    <main class="flex-1 overflow-hidden">
      <div class="h-full flex flex-col">
        <div class="flex-1 overflow-x-auto overflow-y-hidden">
          <div
            class="h-full flex gap-4 px-6 py-6 min-w-max bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950"
          >
            <MixerChannel
              v-for="(ch, index) in mixerChannels"
              :key="ch.id"
              :channel-config="ch"
              :name="channelNames[index]"
              :values="channelValues[index]"
              :send-cc="sendCC"
              @update:fader="val => (channelValues[index].fader = val)"
              @update:knob="payload => (channelValues[index].knobs[payload.index] = payload.value)"
              @update:name="
                val => {
                  channelNames[index] = val
                  broadcast({ type: 'name', index, name: val, clientId })
                }
              "
            />
          </div>
        </div>

        <MixerLegend />
      </div>
    </main>
  </div>
</template>
