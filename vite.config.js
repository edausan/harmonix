
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Vue DAW MIDI Controller',
        short_name: 'MIDI CTRL',
        start_url: '/',
        display: 'standalone',
        theme_color: '#111827',
        background_color: '#111827'
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173
  }
})
