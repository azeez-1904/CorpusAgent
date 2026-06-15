import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// In dev, proxy the API + WebSocket to the FastAPI backend on :8000 so that
// relative calls (`/upload`, `/query`, `/ws`) work the same as in production,
// where FastAPI serves the built app. Without this, dev-mode uploads 404.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/upload': 'http://127.0.0.1:8000',
      '/query': 'http://127.0.0.1:8000',
      '/documents': 'http://127.0.0.1:8000',
      '/persona': 'http://127.0.0.1:8000',
      '/alerts': 'http://127.0.0.1:8000',
      '/status': 'http://127.0.0.1:8000',
      '/ws': { target: 'ws://127.0.0.1:8000', ws: true },
    },
  },
})
