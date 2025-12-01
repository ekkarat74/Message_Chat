import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // บังคับให้ Polyfill ทำงานเพื่อแก้ปัญหา process และ util ของ simple-peer
      protocolImports: true,
    }),
  ],
})