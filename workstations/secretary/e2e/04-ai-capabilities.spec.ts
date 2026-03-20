import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'test-token-secretary-ai'
const USER = { id: 1, name: '秘书-AI测试', role: 'manager' }

async function setupAiMocks(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({
      code: 200,
      msg: 'ok',
      data: { account: user, roles: [{ level: 1, display_name: '管理员' }] },
    }))
  }, { token: AUTH_TOKEN, user: USER })

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: USER, roles: [{ level: 1, display_name: '管理员' }] } } })
  })

  await page.route('**/api/v1/agents/list**', async (route) => {
    // 覆盖后端当前返回结构：data.items + agent_id
    await route.fulfill({
      json: {
        code: 200,
        msg: 'ok',
        data: {
          items: [
            {
              agent_id: 'general-assistant',
              name: 'general-assistant',
              description: '通用助手',
              provider: 'kimi',
              is_active: true,
            },
            {
              agent_id: 'analysis-agent',
              name: 'analysis-agent',
              description: '分析助手',
              provider: 'ark',
              is_active: true,
            },
          ],
        },
      },
    })
  })

  await page.route('**/api/v1/agents/providers**', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: 'ok',
        data: {
          providers: [
            { provider: 'ark', label: '火山引擎 ARK', enabled: true, default_model: 'ep-test', models: ['ep-test'] },
            { provider: 'kimi', label: 'Kimi', enabled: true, default_model: 'moonshot-v1-32k', models: ['moonshot-v1-32k'] },
          ],
        },
      },
    })
  })

  await page.route('**/api/v1/agents/chat**', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: 'ok',
        data: {
          response: '这是模拟AI回复',
          session_id: 'session-1',
          agent_id: 'general-assistant',
          provider: 'kimi',
          call_id: 1,
        },
      },
    })
  })

  await page.route('**/api/v1/dashboard/assistant/preferences**', async (route) => {
    if (route.request().method().toUpperCase() === 'POST') {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { saved: true } } })
      return
    }
    await route.fulfill({
      json: {
        code: 200,
        msg: 'ok',
        data: {
          preference_key: 'assistant_preferences',
          value: {
            summary_tone: 'ops',
            focus_action_types: [],
            blocked_action_types: [],
            daily_digest_hour: 18,
            chat_default_provider: 'auto',
            chat_allow_fallback: true,
            chat_fallback_provider: 'auto',
            route_governance_auto_execute_enabled: false,
            route_governance_auto_execute_max_risk: 'medium',
            route_governance_auto_execute_min_confidence: 75,
            route_governance_auto_execute_min_priority: 70,
            route_governance_auto_execute_approval_mode: 'graded',
          },
        },
      },
    })
  })

  await page.route('**/api/v1/dashboard/assistant/actions/inbox**', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: 'ok',
        data: {
          items: [
            {
              id: 1,
              action_type: 'crm_ticket_draft',
              title: '拟生成客户跟进工单',
              description: '建议本周进行一次客户跟进回访',
              risk_level: 'low',
              status: 'pending_confirm',
              requires_confirmation: true,
              can_delegate_to_claw: true,
              expected_skills: ['customer-success-manager', 'meeting-prep'],
              minimum_context_requirements: ['feishu.mail.recent', 'cn_kis.crm.client_link'],
              context_coverage: { score: 70, missing_items: ['feishu.mail.recent'], staleness_seconds: 120 },
              missing_context_items: ['feishu.mail.recent'],
              required_vs_granted_scopes: { required: [], granted: [], missing: [] },
            },
          ],
        },
      },
    })
  })

  await page.route('**/api/v1/dashboard/assistant/actions/1/replay**', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: 'ok',
        data: {
          ok: true,
          action: {
            id: 1,
            action_type: 'crm_ticket_draft',
            title: '拟生成客户跟进工单',
            status: 'pending_confirm',
            expected_skills: ['customer-success-manager', 'meeting-prep'],
            minimum_context_requirements: ['feishu.mail.recent', 'cn_kis.crm.client_link'],
            context_coverage: { score: 70, missing_items: ['feishu.mail.recent'] },
            required_vs_granted_scopes: { required: [], granted: [], missing: [] },
          },
          executions: [
            {
              execution_id: 101,
              result: {
                status: 'failed',
                message: '上下文完整性不足',
                failed_step: 'context',
                skills_used: ['customer-success-manager'],
                context_coverage: { score: 50, missing_items: ['feishu.mail.recent'] },
                required_vs_granted_scopes: { required: [], granted: [], missing: [] },
                output_artifact_count: 0,
                screenshot_count: 0,
              },
              target_refs: [],
            },
          ],
        },
      },
    })
  })

  await page.route('**/api/v1/dashboard/assistant/policies**', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: 'ok',
        data: {
          items: [
            {
              action_type: 'crm_ticket_draft',
              enabled: true,
              requires_confirmation: true,
              allowed_risk_levels: ['low', 'medium'],
              min_priority_score: 50,
              min_confidence_score: 50,
              source: 'default',
              expected_skills: ['customer-success-manager', 'meeting-prep'],
              minimum_context_requirements: ['feishu.mail.recent', 'cn_kis.crm.client_link'],
            },
          ],
        },
      },
    })
  })

  await page.route('**/api/v1/dashboard/assistant/claw/templates**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { categories: [], templates: [], delegable_action_types: [] } } })
  })
  await page.route('**/api/v1/dashboard/assistant/claw/presets**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { detected_preset: 'auto', items: [] } } })
  })
  await page.route('**/api/v1/dashboard/assistant/claw/skills/bundles**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { detected_role: 'manager', installed_skill_slugs: [], bundles: [], recommended_install_command: '' } } })
  })
  await page.route('**/api/v1/dashboard/assistant/claw/iteration-metrics**', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: 'ok',
        data: {
          window_days: 7,
          runtime_success_rate: 0.82,
          runtime_total: 11,
          scope_gap_top: [{ name: 'im:message:read_as_user', count: 2 }],
          context_gap_top: [{ name: 'feishu.mail.recent', count: 3 }],
          skills_success_rate: [{ skill: 'customer-success-manager', success: 8, total: 10, rate: 0.8 }],
        },
      },
    })
  })
  await page.route('**/api/v1/dashboard/assistant/route-governance/presets**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { detected_preset: 'auto', items: [] } } })
  })
  await page.route('**/api/v1/dashboard/assistant/route-governance-alert/thresholds**', async (route) => {
    if (route.request().method().toUpperCase() === 'POST') {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { saved: true } } })
      return
    }
    await route.fulfill({
      json: {
        code: 200,
        msg: 'ok',
        data: {
          thresholds: {
            coverage_rate_min: 0.5,
            applied_7d_min: 1,
            alert_days: 30,
            override_hit_rate_threshold: 0.6,
            override_success_rate_threshold: 0.5,
            fallback_rate_threshold: 0.25,
            min_applied_threshold: 5,
            cooldown_hours: 12,
          },
        },
      },
    })
  })

}

test.describe('秘书台 AI 能力回归', () => {
  test.beforeEach(async ({ page }) => {
    await setupAiMocks(page)
  })

  test('AI 对话页可加载并正常收发消息', async ({ page }) => {
    await page.goto('/secretary/#/chat')
    await expect(page.getByRole('heading', { name: 'AI 助手' })).toBeVisible()

    const input = page.locator('textarea[placeholder*="输入消息"]')
    await input.fill('请给出今日工作建议')
    await page.getByRole('button', { name: '发送' }).click()

    await expect(page.getByText('这是模拟AI回复')).toBeVisible()
    await expect(page.getByText('页面出现异常')).toHaveCount(0)
  })

  test('AI 策略/偏好/动作回放页面可访问', async ({ page }) => {
    await page.goto('/secretary/#/assistant/policies')
    await expect(page.getByRole('heading', { name: '子衿策略中心' })).toBeVisible()
    await expect(page.getByText('crm_ticket_draft')).toBeVisible()

    await page.goto('/secretary/#/assistant/preferences')
    await expect(page.getByRole('heading', { name: '个人偏好中心' })).toBeVisible()
    await expect(page.getByText('Kimi Claw 角色模板')).toBeVisible()

    await page.goto('/secretary/#/assistant/actions')
    await expect(page.getByRole('heading', { name: '子衿动作箱' })).toBeVisible()
    await page.getByRole('button', { name: '查看回放' }).first().click()
    await expect(page.getByRole('heading', { name: '执行回放' })).toBeVisible()
  })
})
