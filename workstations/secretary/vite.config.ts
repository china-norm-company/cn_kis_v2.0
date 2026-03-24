import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/** 开发时常见误用：直接打开 /login 而 Vite base 为 /secretary/。重定向到 /secretary/login（保留 ?code= 等 OAuth 参数） */
function devRedirectLoginToSecretaryBase() {
  return {
    name: 'dev-redirect-login-to-secretary-base',
    configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use((req: { url?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: () => void }, next: () => void) => {
        const u = req.url || ''
        if (u === '/login' || u.startsWith('/login?')) {
          const suffix = u === '/login' ? '' : u.slice('/login'.length)
          res.statusCode = 302
          res.setHeader('Location', `/secretary/login${suffix}`)
          res.end()
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devRedirectLoginToSecretaryBase()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
  base: '/secretary/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
