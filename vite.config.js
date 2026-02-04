
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    tailwindcss(),
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
  build: {
    outDir: 'dist/web',
    emptyOutDir: true
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  }
})
