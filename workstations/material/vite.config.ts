import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3011,
    host: true,
    proxy: {
      '/v2/api': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
    },
  },
  base: '/material/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
