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
    host: true,
    port: 3009,
    proxy: {
      '/v2/api': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
    },
  },
  base: '/recruitment/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
