import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorkstationFeishuConfig } from './config'

const originalEnv = { ...(import.meta as any).env }

describe('createWorkstationFeishuConfig', () => {
  afterEach(() => {
    ;(import.meta as any).env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  it('uses /login as secretary redirect path when no override is provided', () => {
    ;(import.meta as any).env = {
      ...originalEnv,
      DEV: false,
      VITE_FEISHU_APP_ID: 'cli_secretary',
      VITE_FEISHU_REDIRECT_BASE: '',
      VITE_FEISHU_REDIRECT_URI: '',
    }
    vi.stubGlobal('window', {
      location: { origin: 'https://v2.example.com' },
    })

    const config = createWorkstationFeishuConfig('secretary')

    expect(config.redirectUri).toBe('https://v2.example.com/login')
  })
})
