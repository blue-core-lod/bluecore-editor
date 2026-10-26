/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    // Served at /editor/ behind bluecore-stack's Nginx, which passes the prefix
    // through unchanged; the HMR websocket uses the same path.
    base: '/editor/',
    plugins: [react()],
    server: {
      // Behind Nginx the browser reaches the dev server on port 80, not 5173.
      hmr: env.VITE_HMR_CLIENT_PORT
        ? { clientPort: Number(env.VITE_HMR_CLIENT_PORT) }
        : undefined,
    },
    test: {
      environment: 'jsdom',
    },
  }
})
