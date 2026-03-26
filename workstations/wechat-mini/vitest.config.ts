/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@cn-kis/subject-core': resolve(__dirname, '../../packages/subject-core/src/index.ts'),
      '@cn-kis/consent-placeholders': resolve(__dirname, '../../packages/consent-placeholders/src/index.ts'),
    },
  },
})
