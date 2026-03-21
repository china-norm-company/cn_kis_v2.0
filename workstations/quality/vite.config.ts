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
    port: 3003,
    host: true,
    proxy: {
      '/v2/api': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
    },
  },
  base: '/quality/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
