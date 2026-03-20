import { test, expect } from '@playwright/test'

const LIVE_TOKEN = process.env.AI_LIVE_AUTH_TOKEN || ''

test.describe('秘书台 Chat Headed Live 验证', () => {
  test.skip(!LIVE_TOKEN, '缺少 AI_LIVE_AUTH_TOKEN，跳过 live headed 验证')

  test('滚轮可滚动且飞书分析不拒答', async ({ page }) => {
    await page.addInitScript(({ token }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify({ id: 1, name: 'Live验证用户', role: 'admin' }))
      localStorage.setItem('auth_profile', JSON.stringify({
        code: 200,
        msg: 'ok',
        data: { account: { id: 1, name: 'Live验证用户' }, roles: [{ level: 1, display_name: '管理员' }] },
      }))
    }, { token: LIVE_TOKEN })

    await page.goto('/secretary/#/chat')
    await expect(page.getByRole('heading', { name: 'AI 助手' })).toBeVisible()

    const input = page.locator('textarea[placeholder*="输入消息"]')
    await input.fill('请根据我最近7天飞书内容做风险分析，并给出3条可执行建议。')
    await page.getByRole('button', { name: '发送' }).click()

    const assistantReply = page.locator('.chat-scroll-area .bg-slate-100 p.text-sm').last()
    await expect(assistantReply).toBeVisible({ timeout: 60_000 })
    const replyText = (await assistantReply.textContent()) || ''
    expect(replyText).not.toMatch(/无法访问|不能访问|请提供.*飞书|请上传/i)

    // 多次提问，制造足够消息高度以验证滚轮滚动
    for (let i = 0; i < 4; i++) {
      await input.fill(`继续补充第${i + 1}条执行建议，并给出负责人与截止时间。`)
      await page.getByRole('button', { name: '发送' }).click()
      await expect(page.locator('.chat-scroll-area .bg-slate-100 p.text-sm').last()).toBeVisible({ timeout: 60_000 })
    }

    const scrollArea = page.locator('.chat-scroll-area')
    await expect(scrollArea).toBeVisible()
    const metrics = await scrollArea.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY: getComputedStyle(el).overflowY,
    }))
    expect(metrics.overflowY).toBe('scroll')
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight)

    await scrollArea.evaluate((el) => {
      el.scrollTop = 0
    })
    await scrollArea.hover()
    await page.mouse.wheel(0, 900)

    const afterWheelTop = await scrollArea.evaluate((el) => el.scrollTop)
    expect(afterWheelTop).toBeGreaterThan(0)
  })
})
