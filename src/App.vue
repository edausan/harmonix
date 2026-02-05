
<script setup>
import { ref, onMounted } from 'vue'
import MixerTopBar from './components/MixerTopBar.vue'
import MixerChannel from './components/MixerChannel.vue'
import MixerLegend from './components/MixerLegend.vue'
import CompressorUI from './components/CompressorUI.vue'
import ReverbUI from './components/ReverbUI.vue'
import HudOverlay from './components/HudOverlay.vue'
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
const toolbarTab = ref('Faders')

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

// 10 mixer channels, each with 1 fader + knobs (Gain, Pan, Sends A–D)
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
      { label: 'Send C', cc: 110 + i },
      { label: 'Send D', cc: 80 + i }
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
    knobs: [64, 64, 0, 0, 0, 0]
  }))
)
const channelRefs = vueRef([])

const compressorValues = ref({
  threshold: 64,
  attack: 64,
  release: 64,
  knee: 64,
  makeup: 64,
  ratio: 64
})
const fxModalOpen = ref(false)
const processingModalCompressors = ref([
  {
    id: 'modal-1',
    values: { threshold: 64, attack: 64, release: 64, knee: 64, makeup: 64, ratio: 64 }
  }
])
function toggleFxModal() {
  fxModalOpen.value = !fxModalOpen.value
}
const compressorVariantOptions = ['Basic', 'Basic + Filters', 'Side-chain']
const fxPluginsByChannel = ref(mixerChannels.map(() => []))
let nextFxId = 1
function addCompressorFromModal(id, layout) {
  const comp = processingModalCompressors.value.find(c => c.id === id)
  if (!comp) return
  fxPluginsByChannel.value[selectedChannelIndex.value].push({
    id: nextFxId++,
    type: 'compressor',
    values: { ...comp.values },
    layout: layout || 'Basic',
    enabled: true
  })
  fxModalOpen.value = false
}
const fxModalReverbs = ref([
  { id: 'rev-1', values: { mix: 64, decay: 64, lowCut: 64, highCut: 64 } }
])
const reverbVariantOptions = ['Basic', 'Basic + Filters', 'Side-chain']
function addReverbFromModal(id, layout) {
  const comp = fxModalReverbs.value.find(c => c.id === id)
  if (!comp) return
  fxPluginsByChannel.value[selectedChannelIndex.value].push({
    id: nextFxId++,
    type: 'reverb',
    values: { ...comp.values },
    layout: layout || 'Basic',
    enabled: true
  })
  fxModalOpen.value = false
}

function fxCc(pluginType, param, channelIdx, slotIdx) {
  const baseIdx = Number.isFinite(channelIdx) ? channelIdx : selectedChannelIndex.value
  const slot = Number.isFinite(slotIdx) ? slotIdx : 0
  const stride = 16 * slot
  if (pluginType === 'compressor') {
    if (param === 'threshold') return 40 + baseIdx + stride
    if (param === 'attack') return 41 + baseIdx + stride
    if (param === 'release') return 42 + baseIdx + stride
    if (param === 'knee') return 43 + baseIdx + stride
    if (param === 'makeup') return 44 + baseIdx + stride
    if (param === 'ratio') return 45 + baseIdx + stride
    if (param === 'lowCut') return 46 + baseIdx + stride
    if (param === 'highCut') return 47 + baseIdx + stride
  } else if (pluginType === 'reverb') {
    if (param === 'mix') return 50 + baseIdx + stride
    if (param === 'decay') return 51 + baseIdx + stride
    if (param === 'lowCut') return 52 + baseIdx + stride
    if (param === 'highCut') return 53 + baseIdx + stride
  }
  return 127
}
const hudVisible = ref(false)
const hudLabel = ref('')
const hudValue = ref('')
let hudTimer = 0
function showGlobalHud(label, value) {
  hudLabel.value = String(label || '')
  hudValue.value = String(value || '')
  hudVisible.value = true
  if (hudTimer) clearTimeout(hudTimer)
  hudTimer = setTimeout(() => {
    hudVisible.value = false
    hudTimer = 0
  }, 900)
}
function onHudEvent(e) {
  const detail = e && e.detail
  showGlobalHud(detail?.label, detail?.value)
}
onMounted(() => {
  window.addEventListener('harmonix:valueHud', onHudEvent)
})
// Per-channel send filter knobs (Low/High Cut per Send A–D)
const sendFilterValues = ref(
  mixerChannels.map(() => ({
    A: { low: 64, high: 64 },
    B: { low: 64, high: 64 },
    C: { low: 64, high: 64 },
    D: { low: 64, high: 64 }
  }))
)

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
  ensureDefaultPreset()
  refreshPresets()
  let last = ''
  try {
    last = localStorage.getItem('harmonix_last_preset') || ''
  } catch {}
  if (last && presetNames.value.includes(last)) {
    loadPreset(last)
  } else {
    loadPreset(DEFAULT_PRESET_NAME)
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

  // Send A filters: Low Cut (30–39), High Cut (31–40)
  if (cc >= 30 && cc < 30 + numChannels) {
    const index = cc - 30
    if (sendFilterValues.value[index]) sendFilterValues.value[index].A.low = value
    return true
  }
  if (cc >= 31 && cc < 31 + numChannels) {
    const index = cc - 31
    if (sendFilterValues.value[index]) sendFilterValues.value[index].A.high = value
    return true
  }

  // Send B filters: Low Cut (32–41), High Cut (33–42)
  if (cc >= 32 && cc < 32 + numChannels) {
    const index = cc - 32
    if (sendFilterValues.value[index]) sendFilterValues.value[index].B.low = value
    return true
  }
  if (cc >= 33 && cc < 33 + numChannels) {
    const index = cc - 33
    if (sendFilterValues.value[index]) sendFilterValues.value[index].B.high = value
    return true
  }

  // Send C filters: Low Cut (34–43), High Cut (35–44)
  if (cc >= 34 && cc < 34 + numChannels) {
    const index = cc - 34
    if (sendFilterValues.value[index]) sendFilterValues.value[index].C.low = value
    return true
  }
  if (cc >= 35 && cc < 35 + numChannels) {
    const index = cc - 35
    if (sendFilterValues.value[index]) sendFilterValues.value[index].C.high = value
    return true
  }

  // Send D filters: Low Cut (36–45), High Cut (37–46)
  if (cc >= 36 && cc < 36 + numChannels) {
    const index = cc - 36
    if (sendFilterValues.value[index]) sendFilterValues.value[index].D.low = value
    return true
  }
  if (cc >= 37 && cc < 37 + numChannels) {
    const index = cc - 37
    if (sendFilterValues.value[index]) sendFilterValues.value[index].D.high = value
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

  // Send D knobs: CC 80–89 (index 5)
  if (cc >= 80 && cc < 80 + numChannels) {
    const index = cc - 80
    if (channelValues.value[index]) channelValues.value[index].knobs[5] = value
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
    } else if (msg.type === 'preset') {
      const p = msg.data
      if (!p) return
      const name = typeof msg.name === 'string' ? msg.name : ''
      if (name) {
        currentPresetName.value = name
        try {
          localStorage.setItem('harmonix_last_preset', name)
        } catch {}
      }
      applyPresetData(p)
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
  currentPresetName.value = presetName
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
      },
      effects: (fxPluginsByChannel.value[i] || []).map(p => ({
        type: p.type,
        layout: p.layout,
        enabled: p.enabled !== false,
        values: { ...p.values }
      }))
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
  try {
    localStorage.setItem('harmonix_last_preset', presetName)
  } catch {}
  broadcast({ type: 'preset', name: presetName, data, clientId })
  refreshPresets()
}

const presetNames = ref([])
const currentPresetName = ref('')
const DEFAULT_PRESET_NAME = 'Default'

function ensureDefaultPreset() {
  let presets = {}
  try {
    presets = JSON.parse(localStorage.getItem('harmonix_presets') || '{}') || {}
  } catch {}
  if (!presets[DEFAULT_PRESET_NAME]) {
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
        },
        effects: []
      }))
    }
    presets[DEFAULT_PRESET_NAME] = data
    try {
      localStorage.setItem('harmonix_presets', JSON.stringify(presets))
    } catch {}
  }
}

function refreshPresets() {
  try {
    const presets = JSON.parse(localStorage.getItem('harmonix_presets') || '{}') || {}
    presetNames.value = Object.keys(presets)
  } catch {
    presetNames.value = []
  }
}

function applyPresetData(p) {
  if (!p) return
  if (typeof p.midiChannel === 'number') channel.value = p.midiChannel
  const count = mixerChannels.length
  for (let i = 0; i < count; i++) {
    const ch = p.channels?.[i]
    if (!ch) continue
    channelNames.value[i] = ch.name ?? channelNames.value[i]
    channelColors.value[i] = ch.color ?? channelColors.value[i]
    channelFaderCCOverrides.value[i] = ch.faderCcOverride == null ? null : Number(ch.faderCcOverride)
    const vals = ch.values
    if (vals) {
      channelValues.value[i].fader = Number(vals.fader ?? channelValues.value[i].fader)
      if (Array.isArray(vals.knobs)) {
        for (let k = 0; k < channelValues.value[i].knobs.length; k++) {
          const v = vals.knobs[k]
          if (Number.isFinite(Number(v))) channelValues.value[i].knobs[k] = Number(v)
        }
      }
    }
    const fx = Array.isArray(ch.effects) ? ch.effects : []
    fxPluginsByChannel.value[i] = fx.map(e => ({
      id: nextFxId++,
      type: e.type === 'reverb' ? 'reverb' : 'compressor',
      layout: e.layout || 'Basic',
      enabled: e.enabled !== false,
      values: { ...(e.values || {}) }
    }))
  }
}

function loadPreset(name) {
  try {
    const presets = JSON.parse(localStorage.getItem('harmonix_presets') || '{}') || {}
    const p = presets[name]
    if (!p) return
    currentPresetName.value = name
    try {
      localStorage.setItem('harmonix_last_preset', name)
    } catch {}
    applyPresetData(p)
    broadcast({ type: 'preset', name, data: p, clientId })
  } catch {}
}

function deletePreset(name) {
  try {
    const presets = JSON.parse(localStorage.getItem('harmonix_presets') || '{}') || {}
    if (presets[name]) {
      delete presets[name]
      localStorage.setItem('harmonix_presets', JSON.stringify(presets))
    }
  } catch {}
  refreshPresets()
  if (currentPresetName.value === name) currentPresetName.value = ''
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
      :preset-names="presetNames"
      :current-preset-name="currentPresetName"
      :on-load-preset="loadPreset"
      :on-delete-preset="deletePreset"
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
          <div class="flex-1 min-w-0 overflow-x-auto touch-pan-x">
            <div class="inline-flex rounded-lg overflow-hidden border border-slate-700">
            <button
              type="button"
              class="px-3 py-1.5 text-[11px] tracking-wide transition-colors touch-manipulation border-r border-slate-700 min-w-[5.5rem]"
              :class="toolbarTab === 'Faders' ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/60' : 'bg-slate-800 text-slate-200 hover:border-slate-600'"
              @click="toolbarTab = 'Faders'"
            >
              Faders
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-[11px] tracking-wide transition-colors touch-manipulation border-r border-slate-700 min-w-[5.5rem]"
              :class="toolbarTab === 'Effects' ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/60' : 'bg-slate-800 text-slate-200 hover:border-slate-600'"
              @click="toolbarTab = 'Effects'"
            >
              Effects
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-[11px] tracking-wide transition-colors touch-manipulation min-w-[5.5rem]"
              :class="toolbarTab === 'Sends' ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/60' : 'bg-slate-800 text-slate-200 hover:border-slate-600'"
              @click="toolbarTab = 'Sends'"
            >
              Sends
            </button>
            </div>
          </div>
          <button
            type="button"
            class="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 transition-colors hover:border-slate-500 flex items-center gap-2"
            title="Config"
            aria-label="Open config"
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
            <span class="text-[11px] font-semibold uppercase tracking-wide">Config</span>
          </button>
        </div>
        <div class="flex-1 overflow-x-auto overflow-y-hidden">
          <div v-if="toolbarTab === 'Faders'" class="h-full flex gap-4 px-6 py-6 pb-16 min-w-max bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
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
          <div v-else-if="toolbarTab === 'Effects'" class="h-full px-6 py-6 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
            <div v-if="fxPluginsByChannel[selectedChannelIndex].length === 0" class="h-full flex items-center justify-center">
              <button
                type="button"
                class="w-[200px] h-[200px] rounded-2xl border-2 border-dashed border-slate-600 text-slate-300 bg-slate-800/40 hover:border-slate-500 transition-colors flex items-center justify-center gap-2"
                title="Add Effect"
                aria-label="Add Effect"
                @click="toggleFxModal"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 5v14"></path>
                  <path d="M5 12h14"></path>
                </svg>
                <span class="text-[12px] font-semibold uppercase tracking-wide">Add Effect</span>
              </button>
            </div>
            <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 justify-start gap-4 items-stretch">
              <div
                v-for="(plugin, fxIndex) in fxPluginsByChannel[selectedChannelIndex]"
                :key="plugin.id"
                class="w-full relative min-w-0 h-[400px] flex items-stretch"
              >
                <CompressorUI
                  v-if="plugin.type === 'compressor'"
                  :values="plugin.values"
                  :color="'#FF5A1F'"
                  :label-color="'#273444'"
                  :knob-size="58"
                  :show-remove="true"
                  :layout="plugin.layout"
                  :enabled="plugin.enabled !== false"
                  :cc-threshold="fxCc('compressor','threshold', selectedChannelIndex, fxIndex)"
                  :cc-makeup="fxCc('compressor','makeup', selectedChannelIndex, fxIndex)"
                  :cc-attack="fxCc('compressor','attack', selectedChannelIndex, fxIndex)"
                  :cc-release="fxCc('compressor','release', selectedChannelIndex, fxIndex)"
                  :cc-ratio="fxCc('compressor','ratio', selectedChannelIndex, fxIndex)"
                  :cc-low-cut="fxCc('compressor','lowCut', selectedChannelIndex, fxIndex)"
                  :cc-high-cut="fxCc('compressor','highCut', selectedChannelIndex, fxIndex)"
                  @remove="
                    () => {
                      const list = fxPluginsByChannel[selectedChannelIndex]
                      const idx = list.findIndex(p => p.id === plugin.id)
                      if (idx >= 0) list.splice(idx, 1)
                    }
                  "
                  @update:layout="v => (plugin.layout = v)"
                  @update:enabled="v => (plugin.enabled = !!v)"
                  @update:threshold="v => { plugin.values.threshold = v; if (plugin.enabled !== false) sendCC(fxCc('compressor','threshold', selectedChannelIndex, fxIndex), v) }"
                  @update:attack="v => { plugin.values.attack = v; if (plugin.enabled !== false) sendCC(fxCc('compressor','attack', selectedChannelIndex, fxIndex), v) }"
                  @update:release="v => { plugin.values.release = v; if (plugin.enabled !== false) sendCC(fxCc('compressor','release', selectedChannelIndex, fxIndex), v) }"
                  @update:knee="v => { plugin.values.knee = v; if (plugin.enabled !== false) sendCC(fxCc('compressor','knee', selectedChannelIndex, fxIndex), v) }"
                  @update:makeup="v => { plugin.values.makeup = v; if (plugin.enabled !== false) sendCC(fxCc('compressor','makeup', selectedChannelIndex, fxIndex), v) }"
                  @update:ratio="v => { plugin.values.ratio = v; if (plugin.enabled !== false) sendCC(fxCc('compressor','ratio', selectedChannelIndex, fxIndex), v) }"
                  @update:lowCut="v => { plugin.values.lowCut = v; if (plugin.enabled !== false) sendCC(fxCc('compressor','lowCut', selectedChannelIndex, fxIndex), v) }"
                  @update:highCut="v => { plugin.values.highCut = v; if (plugin.enabled !== false) sendCC(fxCc('compressor','highCut', selectedChannelIndex, fxIndex), v) }"
                />
                <ReverbUI
                  v-else-if="plugin.type === 'reverb'"
                  :values="plugin.values"
                  :color="'#1c789f'"
                  :label-color="'#ffffff'"
                  :knob-size="58"
                  :show-remove="true"
                  :layout="plugin.layout"
                  :enabled="plugin.enabled !== false"
                  :cc-mix="fxCc('reverb','mix', selectedChannelIndex, fxIndex)"
                  :cc-decay="fxCc('reverb','decay', selectedChannelIndex, fxIndex)"
                  :cc-low-cut="fxCc('reverb','lowCut', selectedChannelIndex, fxIndex)"
                  :cc-high-cut="fxCc('reverb','highCut', selectedChannelIndex, fxIndex)"
                  @remove="
                    () => {
                      const list = fxPluginsByChannel[selectedChannelIndex]
                      const idx = list.findIndex(p => p.id === plugin.id)
                      if (idx >= 0) list.splice(idx, 1)
                    }
                  "
                  @update:layout="v => (plugin.layout = v)"
                  @update:enabled="v => (plugin.enabled = !!v)"
                  @update:mix="v => { plugin.values.mix = v; if (plugin.enabled !== false) sendCC(fxCc('reverb','mix', selectedChannelIndex, fxIndex), v) }"
                  @update:decay="v => { plugin.values.decay = v; if (plugin.enabled !== false) sendCC(fxCc('reverb','decay', selectedChannelIndex, fxIndex), v) }"
                  @update:lowCut="v => { plugin.values.lowCut = v; if (plugin.enabled !== false) sendCC(fxCc('reverb','lowCut', selectedChannelIndex, fxIndex), v) }"
                  @update:highCut="v => { plugin.values.highCut = v; if (plugin.enabled !== false) sendCC(fxCc('reverb','highCut', selectedChannelIndex, fxIndex), v) }"
                />
              </div>
              <div class="w-full relative min-w-0 h-[400px] flex items-center justify-center">
                <button
                  type="button"
                  class="w-[200px] h-[200px] rounded-2xl border-2 border-dashed border-slate-600 text-slate-300 bg-slate-800/40 hover:border-slate-500 transition-colors flex items-center justify-center"
                  title="Add Effect"
                  aria-label="Add Effect"
                  @click="toggleFxModal"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14"></path>
                    <path d="M5 12h14"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div v-else-if="toolbarTab === 'Sends'" class="h-full px-6 py-6 min-w-max bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
            <div class="h-full flex gap-4 pb-16">
              <MixerChannel
                :name="'Send A'"
                :subtitle="'CC ' + (90 + selectedChannelIndex)"
                :channel-config="{
                  id: 'sendA',
                  name: 'Send A',
                  faderCC: 90 + selectedChannelIndex,
                  knobs: [
                    { label: 'Low Cut', cc: 30 + selectedChannelIndex },
                    { label: 'High Cut', cc: 31 + selectedChannelIndex }
                  ]
                }"
                :values="{
                  fader: channelValues[selectedChannelIndex].knobs[2],
                  knobs: [
                    sendFilterValues[selectedChannelIndex].A.low,
                    sendFilterValues[selectedChannelIndex].A.high
                  ]
                }"
                :color="channelColors[selectedChannelIndex]"
                :fader-cc-override="90 + selectedChannelIndex"
                :send-cc="sendCC"
                @update:knob="p => {
                  if (p.index === 0) sendFilterValues[selectedChannelIndex].A.low = p.value
                  else if (p.index === 1) sendFilterValues[selectedChannelIndex].A.high = p.value
                }"
                @update:fader="val => (channelValues[selectedChannelIndex].knobs[2] = val)"
              />
              <MixerChannel
                :name="'Send B'"
                :subtitle="'CC ' + (100 + selectedChannelIndex)"
                :channel-config="{
                  id: 'sendB',
                  name: 'Send B',
                  faderCC: 100 + selectedChannelIndex,
                  knobs: [
                    { label: 'Low Cut', cc: 32 + selectedChannelIndex },
                    { label: 'High Cut', cc: 33 + selectedChannelIndex }
                  ]
                }"
                :values="{
                  fader: channelValues[selectedChannelIndex].knobs[3],
                  knobs: [
                    sendFilterValues[selectedChannelIndex].B.low,
                    sendFilterValues[selectedChannelIndex].B.high
                  ]
                }"
                :color="channelColors[selectedChannelIndex]"
                :fader-cc-override="100 + selectedChannelIndex"
                :send-cc="sendCC"
                @update:knob="p => {
                  if (p.index === 0) sendFilterValues[selectedChannelIndex].B.low = p.value
                  else if (p.index === 1) sendFilterValues[selectedChannelIndex].B.high = p.value
                }"
                @update:fader="val => (channelValues[selectedChannelIndex].knobs[3] = val)"
              />
              <MixerChannel
                :name="'Send C'"
                :subtitle="'CC ' + (110 + selectedChannelIndex)"
                :channel-config="{
                  id: 'sendC',
                  name: 'Send C',
                  faderCC: 110 + selectedChannelIndex,
                  knobs: [
                    { label: 'Low Cut', cc: 34 + selectedChannelIndex },
                    { label: 'High Cut', cc: 35 + selectedChannelIndex }
                  ]
                }"
                :values="{
                  fader: channelValues[selectedChannelIndex].knobs[4],
                  knobs: [
                    sendFilterValues[selectedChannelIndex].C.low,
                    sendFilterValues[selectedChannelIndex].C.high
                  ]
                }"
                :color="channelColors[selectedChannelIndex]"
                :fader-cc-override="110 + selectedChannelIndex"
                :send-cc="sendCC"
                @update:knob="p => {
                  if (p.index === 0) sendFilterValues[selectedChannelIndex].C.low = p.value
                  else if (p.index === 1) sendFilterValues[selectedChannelIndex].C.high = p.value
                }"
                @update:fader="val => (channelValues[selectedChannelIndex].knobs[4] = val)"
              />
              <MixerChannel
                :name="'Send D'"
                :subtitle="'CC ' + (80 + selectedChannelIndex)"
                :channel-config="{
                  id: 'sendD',
                  name: 'Send D',
                  faderCC: 80 + selectedChannelIndex,
                  knobs: [
                    { label: 'Low Cut', cc: 36 + selectedChannelIndex },
                    { label: 'High Cut', cc: 37 + selectedChannelIndex }
                  ]
                }"
                :values="{
                  fader: channelValues[selectedChannelIndex].knobs[5],
                  knobs: [
                    sendFilterValues[selectedChannelIndex].D.low,
                    sendFilterValues[selectedChannelIndex].D.high
                  ]
                }"
                :color="channelColors[selectedChannelIndex]"
                :fader-cc-override="80 + selectedChannelIndex"
                :send-cc="sendCC"
                @update:knob="p => {
                  if (p.index === 0) sendFilterValues[selectedChannelIndex].D.low = p.value
                  else if (p.index === 1) sendFilterValues[selectedChannelIndex].D.high = p.value
                }"
                @update:fader="val => (channelValues[selectedChannelIndex].knobs[5] = val)"
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>

<Teleport to="body">
  <Transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="opacity-0 -translate-y-1"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-1"
  >
    <HudOverlay :visible="false" :label="hudLabel" :value="hudValue" :top="-14" :fixed="true" :backdrop="true" :z="2147483647" :dark-text="true" />
  </Transition>
</Teleport>

<Teleport to="body">
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-show="fxModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center"
      @click="e => { if (e.target === e.currentTarget) toggleFxModal() }"
    >
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
      <div class="relative w-full max-w-5xl mx-auto px-6">
        <div class="rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl p-6 max-h-[80vh] overflow-y-auto">
          <div class="mb-4 flex items-center justify-between">
            <div class="text-[12px] font-semibold uppercase tracking-wider text-slate-200">Add Effects</div>
            <button
              type="button"
              class="px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700 text-slate-300 text-[11px]"
              @click="toggleFxModal"
            >
              Close
            </button>
          </div>
          <div class="space-y-8">
            <div>
              <div class="text-[11px] font-semibold uppercase tracking-wide text-slate-300 mb-2">Compressor</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div v-for="variant in compressorVariantOptions" :key="'comp-' + variant" class="relative">
                  <div
                    class="rounded-xl border border-slate-700 bg-slate-900/70 p-3 hover:border-slate-500 transition-colors cursor-pointer"
                    @click="addCompressorFromModal(processingModalCompressors[0].id, variant)"
                  >
                    <div class="transform scale-95 origin-top pointer-events-none">
                      <CompressorUI
                        :values="processingModalCompressors[0].values"
                        :color="'#FF5A1F'"
                        :label-color="'#273444'"
                        :knob-size="58"
                        :layout="variant"
                        title="Compressor"
                      />
                    </div>
                    <div class="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 text-center">{{ variant }}</div>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <div class="text-[11px] font-semibold uppercase tracking-wide text-slate-300 mb-2">Reverb</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div v-for="variant in reverbVariantOptions" :key="'rev-' + variant" class="relative">
                  <div
                    class="rounded-xl border border-slate-700 bg-slate-900/70 p-3 hover:border-slate-500 transition-colors cursor-pointer"
                    @click="addReverbFromModal(fxModalReverbs[0].id, variant)"
                  >
                    <div class="transform scale-95 origin-top pointer-events-none">
                      <ReverbUI
                        :values="fxModalReverbs[0].values"
                        :color="'#1c789f'"
                        :label-color="'#ffffff'"
                        :knob-size="58"
                        :layout="variant"
                        title="Reverb"
                      />
                    </div>
                    <div class="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-300 text-center">{{ variant }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</Teleport>
</template>
