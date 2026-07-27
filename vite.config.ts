import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['pdf-oxide-wasm'],
  },
  build: {
    outDir: 'website',
    emptyOutDir: true,
    target: 'esnext',
    assetsInlineLimit: 4096,
  },
})
