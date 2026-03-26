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
    port: 3006,
    host: true,
    proxy: {
      '/api': {
        // 与 v2 其余工作台及本地 `manage.py runserver 0.0.0.0:8001` 一致
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
  base: '/crm/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
