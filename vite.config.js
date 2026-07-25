import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // es2019 + safari13 is mandatory. Without it, packaged output can contain `??`
    // or `?.[` and older iOS Safari renders nothing at all.
    target: ['es2019', 'safari13'],
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100000,
    // The repo's index.html is the GENERATED artifact, so it must never be vite's
    // entry — pointing at it makes vite try to process the shipped bundle.
    rollupOptions: { input: 'build/vite-entry.html' },
  },
})
