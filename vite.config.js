import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to all interfaces so LAN devices can reach the dev server.
    // Without this Vite listens on 127.0.0.1 only.
    host: '0.0.0.0',
  },
  test: {
    environment: 'jsdom',
  },
})
