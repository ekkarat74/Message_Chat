import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      protocolImports: true,
    }),
  ],
  // ✅ เพิ่มส่วนนี้เข้าไปเพื่อแก้ปัญหา simple-peer หา global ไม่เจอ
  define: {
    global: 'window', 
  },
})