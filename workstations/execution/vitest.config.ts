/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/__tests__/**', 'src/**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@cn-kis/api-client': resolve(__dirname, '../../packages/api-client/src'),
      '@cn-kis/ui-kit': resolve(__dirname, '../../packages/ui-kit/src'),
      '@cn-kis/consent-placeholders': resolve(
        __dirname,
        '../../packages/consent-placeholders/src/index.ts',
      ),
    },
  },
})
