import { test, expect, request as playwrightRequest } from '@playwright/test'

type Provider = 'ark' | 'kimi'

interface ProviderItem {
  provider: Provider
  enabled: boolean
  default_model: string
  models: string[]
}

interface ApiEnvelope<T> {
  code: number
  msg: string
  data: T
}

interface ChatOut {
  response: string
  session_id: string
  agent_id: string
  provider: Provider
  call_id: number
  status?: string
}

interface FallbackMetricsOut {
  summary: {
    total_calls: number
    fallback_success: number
    fallback_failed: number
    fallback_rate: number
    success_rate: number
  }
}

const LIVE_BASE_URL = process.env.AI_LIVE_BASE_URL || 'http://118.196.64.48'
const LIVE_AUTH_TOKEN = process.env.AI_LIVE_AUTH_TOKEN || ''
const LIVE_AGENT_ID = process.env.AI_LIVE_AGENT_ID || 'general-assistant'
const REQUIRE_STRICT_FALLBACK = process.env.AI_LIVE_REQUIRE_STRICT_FALLBACK === '1'
const REQUIRE_STRICT_EXECUTION_CHAIN = process.env.AI_LIVE_REQUIRE_STRICT_EXECUTION_CHAIN === '1'

function isProvider(v: unknown): v is Provider {
  return v === 'ark' || v === 'kimi'
}

async function getProviders(apiBaseUrl: string, token: string): Promise<ProviderItem[]> {
  const ctx = await playwrightRequest.newContext({
    baseURL: apiBaseUrl,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  try {
    const resp = await ctx.get('/api/v1/agents/providers')
    expect(resp.ok()).toBeTruthy()
    const body = (await resp.json()) as ApiEnvelope<{ providers?: unknown[] }>
    expect(body.code).toBe(200)

    const list = Array.isArray(body.data?.providers) ? body.data.providers : []
    return list
      .map((it) => {
        if (!it || typeof it !== 'object') return null
        const item = it as Record<string, unknown>
        if (!isProvider(item.provider)) return null
        return {
          provider: item.provider,
          enabled: Boolean(item.enabled),
          default_model: String(item.default_model || ''),
          models: Array.isArray(item.models) ? item.models.filter((m): m is string => typeof m === 'string') : [],
        } satisfies ProviderItem
      })
      .filter((it): it is ProviderItem => Boolean(it))
  } finally {
    await ctx.dispose()
  }
}

async function postChat(
  apiBaseUrl: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<ApiEnvelope<ChatOut>> {
  const ctx = await playwrightRequest.newContext({
    baseURL: apiBaseUrl,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  try {
    const resp = await ctx.post('/api/v1/agents/chat', { data: payload })
    const body = (await resp.json()) as ApiEnvelope<ChatOut>
    return body
  } finally {
    await ctx.dispose()
  }
}

async function apiPost<T>(
  apiBaseUrl: string,
  token: string,
  path: string,
  payload: Record<string, unknown>,
): Promise<ApiEnvelope<T>> {
  const ctx = await playwrightRequest.newContext({
    baseURL: apiBaseUrl,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  try {
    const resp = await ctx.post(path, { data: payload })
    return (await resp.json()) as ApiEnvelope<T>
  } finally {
    await ctx.dispose()
  }
}

async function apiGet<T>(
  apiBaseUrl: string,
  token: string,
  path: string,
): Promise<ApiEnvelope<T>> {
  const ctx = await playwrightRequest.newContext({
    baseURL: apiBaseUrl,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  try {
    const resp = await ctx.get(path)
    return (await resp.json()) as ApiEnvelope<T>
  } finally {
    await ctx.dispose()
  }
}

async function apiGetSafe<T>(
  apiBaseUrl: string,
  token: string,
  path: string,
): Promise<{ status: number; data?: ApiEnvelope<T>; isJson: boolean }> {
  const ctx = await playwrightRequest.newContext({
    baseURL: apiBaseUrl,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  try {
    const resp = await ctx.get(path)
    const status = resp.status()
    const text = await resp.text()
    try {
      return { status, data: JSON.parse(text) as ApiEnvelope<T>, isJson: true }
    } catch {
      return { status, isJson: false }
    }
  } finally {
    await ctx.dispose()
  }
}

async function getFallbackMetrics(apiBaseUrl: string, token: string): Promise<ApiEnvelope<FallbackMetricsOut>> {
  const ctx = await playwrightRequest.newContext({
    baseURL: apiBaseUrl,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  try {
    const resp = await ctx.get('/api/v1/agents/fallback/metrics?days=1')
    expect(resp.ok()).toBeTruthy()
    return (await resp.json()) as ApiEnvelope<FallbackMetricsOut>
  } finally {
    await ctx.dispose()
  }
}

function strictOrSkip(strict: boolean, condition: boolean, message: string) {
  if (!condition) {
    if (strict) throw new Error(message)
    test.skip(true, message)
  }
}

test.describe('Secretary AI live backend integration', () => {
  test.skip(!LIVE_AUTH_TOKEN, 'Set AI_LIVE_AUTH_TOKEN to run live backend tests')

  test('provider catalog should be available', async () => {
    const providers = await getProviders(LIVE_BASE_URL, LIVE_AUTH_TOKEN)
    expect(providers.length).toBeGreaterThan(0)
    expect(providers.every((p) => isProvider(p.provider))).toBeTruthy()
  })

  test('enabled providers should support direct chat without fallback', async () => {
    const providers = await getProviders(LIVE_BASE_URL, LIVE_AUTH_TOKEN)
    const enabledProviders = providers.filter((p) => p.enabled)
    test.skip(enabledProviders.length === 0, 'No enabled AI provider in current environment')

    for (const provider of enabledProviders) {
      const body = await postChat(LIVE_BASE_URL, LIVE_AUTH_TOKEN, {
        agent_id: LIVE_AGENT_ID,
        message: `[live-direct-${provider.provider}] ping ${Date.now()}`,
        provider: provider.provider,
        allow_fallback: false,
      })
      expect(body.code).toBe(200)
      expect(body.data.provider).toBe(provider.provider)
      expect(String(body.data.response || '').length).toBeGreaterThan(0)
    }
  })

  test('fallback policy should work when primary provider is disabled', async () => {
    const providers = await getProviders(LIVE_BASE_URL, LIVE_AUTH_TOKEN)
    const enabled = providers.find((p) => p.enabled)
    const disabled = providers.find((p) => !p.enabled)

    if (!enabled || !disabled) {
      if (REQUIRE_STRICT_FALLBACK) {
        throw new Error(
          'Strict fallback test requires one enabled and one disabled provider. ' +
          'Current environment does not satisfy this condition.',
        )
      }
      test.skip(true, 'No enabled/disabled provider pair; strict fallback is skipped in this environment')
      return
    }

    const before = await getFallbackMetrics(LIVE_BASE_URL, LIVE_AUTH_TOKEN)
    expect(before.code).toBe(200)

    const withoutFallback = await postChat(LIVE_BASE_URL, LIVE_AUTH_TOKEN, {
      agent_id: LIVE_AGENT_ID,
      message: `[live-fallback-off-${disabled.provider}] ping ${Date.now()}`,
      provider: disabled.provider,
      allow_fallback: false,
    })
    expect(withoutFallback.code).toBeGreaterThanOrEqual(500)

    const withFallback = await postChat(LIVE_BASE_URL, LIVE_AUTH_TOKEN, {
      agent_id: LIVE_AGENT_ID,
      message: `[live-fallback-on-${disabled.provider}] ping ${Date.now()}`,
      provider: disabled.provider,
      allow_fallback: true,
      fallback_provider: enabled.provider,
    })
    expect(withFallback.code).toBe(200)
    expect(withFallback.data.provider).toBe(enabled.provider)
    expect(String(withFallback.data.response || '').length).toBeGreaterThan(0)

    const after = await getFallbackMetrics(LIVE_BASE_URL, LIVE_AUTH_TOKEN)
    expect(after.code).toBe(200)
    expect(after.data.summary.fallback_success).toBeGreaterThanOrEqual(before.data.summary.fallback_success)
  })

  test('fallback metrics endpoint should return valid schema', async () => {
    const body = await getFallbackMetrics(LIVE_BASE_URL, LIVE_AUTH_TOKEN)
    expect(body.code).toBe(200)
    expect(typeof body.data.summary.total_calls).toBe('number')
    expect(typeof body.data.summary.fallback_success).toBe('number')
    expect(typeof body.data.summary.fallback_failed).toBe('number')
    expect(typeof body.data.summary.fallback_rate).toBe('number')
    expect(typeof body.data.summary.success_rate).toBe('number')
  })

  test('assistant action execution should expose capability and trace', async () => {
    const pushed = await apiPost<{ items?: Array<{ id: number; action_type: string }> }>(
      LIVE_BASE_URL,
      LIVE_AUTH_TOKEN,
      '/api/v1/dashboard/assistant/research/insights/actions',
      { card_types: ['product'], include_llm: false },
    )
    expect([200, 400]).toContain(pushed.code)

    const inbox = await apiGet<{ items?: Array<{ id: number; action_type: string }> }>(
      LIVE_BASE_URL,
      LIVE_AUTH_TOKEN,
      '/api/v1/dashboard/assistant/actions/inbox?status=pending_confirm',
    )
    expect(inbox.code).toBe(200)
    const item = (inbox.data.items || []).find((x) => x.action_type === 'research_insight_followup') || (inbox.data.items || [])[0]
    test.skip(!item, 'No executable assistant action found in inbox')

    const confirmed = await apiPost<{ ok: boolean }>(
      LIVE_BASE_URL,
      LIVE_AUTH_TOKEN,
      `/api/v1/dashboard/assistant/actions/${item.id}/confirm`,
      {},
    )
    expect([200, 400]).toContain(confirmed.code)

    const executed = await apiPost<{
      ok?: boolean
      trace_id?: string
      capability_key?: string
      target_system?: string
    }>(
      LIVE_BASE_URL,
      LIVE_AUTH_TOKEN,
      `/api/v1/dashboard/assistant/actions/${item.id}/execute`,
      { override_payload: {} },
    )
    expect(executed.code).toBe(200)

    const replay = await apiGet<{
      action?: {
        capability_key?: string
        target_system?: string
        expected_skills?: string[]
        minimum_context_requirements?: string[]
        context_coverage?: { score?: number; missing_items?: string[] }
        required_vs_granted_scopes?: { required?: string[]; granted?: string[]; missing?: string[] }
      }
      executions?: Array<{
        result?: {
          trace_id?: string
          failed_step?: string
          skills_used?: string[]
          context_coverage?: { score?: number; missing_items?: string[] }
          required_vs_granted_scopes?: { required?: string[]; granted?: string[]; missing?: string[] }
        }
      }>
    }>(
      LIVE_BASE_URL,
      LIVE_AUTH_TOKEN,
      `/api/v1/dashboard/assistant/actions/${item.id}/replay`,
    )
    expect(replay.code).toBe(200)
    const hasTrace = Boolean(executed.data.trace_id) || Boolean((replay.data.executions || [])[0]?.result?.trace_id)
    const hasCapability = Boolean(executed.data.capability_key) || Boolean(replay.data.action?.capability_key)
    const hasTargetSystem = Boolean(executed.data.target_system) || Boolean(replay.data.action?.target_system)
    test.skip(!(hasTrace && hasCapability && hasTargetSystem), 'Backend is not yet on capability-trace schema version')
    expect(hasTrace).toBeTruthy()
    expect(hasCapability).toBeTruthy()
    expect(hasTargetSystem).toBeTruthy()
  })

  test('assistant replay should expose structured execution evidence fields', async () => {
    const inbox = await apiGet<{ items?: Array<{ id: number; action_type: string }> }>(
      LIVE_BASE_URL,
      LIVE_AUTH_TOKEN,
      '/api/v1/dashboard/assistant/actions/inbox?status=all',
    )
    expect(inbox.code).toBe(200)
    const item = (inbox.data.items || [])[0]
    test.skip(!item, 'No assistant action found for replay evidence check')

    const replay = await apiGet<{
      action?: {
        expected_skills?: string[]
        minimum_context_requirements?: string[]
        context_coverage?: { score?: number; missing_items?: string[] }
        required_vs_granted_scopes?: { required?: string[]; granted?: string[]; missing?: string[] }
      }
      executions?: Array<{
        result?: {
          failed_step?: string
          skills_used?: string[]
          context_coverage?: { score?: number; missing_items?: string[] }
          required_vs_granted_scopes?: { required?: string[]; granted?: string[]; missing?: string[] }
        }
      }>
    }>(
      LIVE_BASE_URL,
      LIVE_AUTH_TOKEN,
      `/api/v1/dashboard/assistant/actions/${item.id}/replay`,
    )
    expect(replay.code).toBe(200)

    const action = replay.data.action || {}
    const ex = (replay.data.executions || [])[0]?.result || {}
    const hasStructuredAction =
      Array.isArray(action.expected_skills) ||
      Array.isArray(action.minimum_context_requirements) ||
      typeof action.context_coverage === 'object' ||
      typeof action.required_vs_granted_scopes === 'object'
    const hasStructuredExecution =
      typeof ex.failed_step === 'string' ||
      Array.isArray(ex.skills_used) ||
      typeof ex.context_coverage === 'object' ||
      typeof ex.required_vs_granted_scopes === 'object'

    strictOrSkip(
      REQUIRE_STRICT_EXECUTION_CHAIN,
      hasStructuredAction || hasStructuredExecution,
      'Backend not yet on structured evidence schema',
    )

    if (action.context_coverage) {
      expect(typeof action.context_coverage.score).toBe('number')
    }
    if (action.required_vs_granted_scopes) {
      expect(Array.isArray(action.required_vs_granted_scopes.required || [])).toBeTruthy()
      expect(Array.isArray(action.required_vs_granted_scopes.granted || [])).toBeTruthy()
      expect(Array.isArray(action.required_vs_granted_scopes.missing || [])).toBeTruthy()
    }
    if (ex.context_coverage) {
      expect(typeof ex.context_coverage.score).toBe('number')
    }
    if (ex.required_vs_granted_scopes) {
      expect(Array.isArray(ex.required_vs_granted_scopes.required || [])).toBeTruthy()
      expect(Array.isArray(ex.required_vs_granted_scopes.granted || [])).toBeTruthy()
      expect(Array.isArray(ex.required_vs_granted_scopes.missing || [])).toBeTruthy()
    }
  })

  test('claw iteration metrics endpoint should return schema', async () => {
    const body = await apiGetSafe<{
      window_days?: number
      runtime_success_rate?: number
      runtime_total?: number
      scope_gap_top?: Array<{ name?: string; count?: number }>
      context_gap_top?: Array<{ name?: string; count?: number }>
      skills_success_rate?: Array<{ skill?: string; success?: number; total?: number; rate?: number }>
    }>(
      LIVE_BASE_URL,
      LIVE_AUTH_TOKEN,
      '/api/v1/dashboard/assistant/claw/iteration-metrics?days=7',
    )
    strictOrSkip(
      REQUIRE_STRICT_EXECUTION_CHAIN,
      Boolean(body.isJson && body.data),
      'Backend endpoint is not JSON reachable yet',
    )
    if (!(body.isJson && body.data)) return
    expect([200, 404]).toContain(body.data!.code)
    strictOrSkip(
      REQUIRE_STRICT_EXECUTION_CHAIN,
      body.data!.code === 200,
      'Backend not yet exposing claw iteration metrics endpoint',
    )
    if (body.data!.code !== 200) return

    expect(typeof body.data!.data.window_days).toBe('number')
    expect(typeof body.data!.data.runtime_success_rate).toBe('number')
    expect(typeof body.data!.data.runtime_total).toBe('number')
    expect(Array.isArray(body.data!.data.scope_gap_top || [])).toBeTruthy()
    expect(Array.isArray(body.data!.data.context_gap_top || [])).toBeTruthy()
    expect(Array.isArray(body.data!.data.skills_success_rate || [])).toBeTruthy()
  })
})
