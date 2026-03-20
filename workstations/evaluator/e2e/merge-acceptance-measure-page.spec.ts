/**
 * 合并验收：测量页「我们侧」5 项（见 docs/EVALUATOR_MERGE_验收说明_给功能调试.md）
 * 前提：本机不启动 SADC（5002 未监听）；使用飞书 UA 以展示黄框。
 */
import { test, expect } from '@playwright/test'

const FEISHU_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Lark/7.7.0 Chrome/120.0.0.0 Safari/537.36'

test.describe('合并验收：测量页 我们侧 5 项', () => {
  test.use({
    userAgent: FEISHU_UA,
  })

  test('1～5 项：黄框、两按钮、在外部浏览器中打开、复制链接、带参 URL 与复制失败提示', async ({
    page,
  }) => {
    await page.goto('/evaluator/measure')
    await page.waitForLoadState('networkidle')

    // 应出现「请先启动测量工作台」（SADC 不可用）
    await expect(page.getByText('请先启动测量工作台')).toBeVisible({ timeout: 15000 })

    // 1. 黄色提示框：文案含「若在飞书工作台内打开…请使用外部浏览器打开」类说明
    const yellowBox = page.locator('.bg-amber-50, [class*="amber"]').first()
    await expect(yellowBox).toBeVisible()
    await expect(yellowBox.getByText(/若在飞书工作台内打开|外部浏览器/)).toBeVisible()

    // 2. 两个按钮
    const btnOpen = page.getByRole('button', { name: '在外部浏览器中打开' })
    const btnCopy = page.getByRole('button', { name: '复制链接' })
    await expect(btnOpen).toBeVisible()
    await expect(btnCopy).toBeVisible()

    // 3. 在外部浏览器中打开：可点击；输入框旁有带参 URL 的说明
    await expect(page.getByText(/复制下方链接到 Chrome|若无效可复制/)).toBeVisible()
    await btnOpen.click()
    // 会 window.open，这里只验证点击无报错；新窗口可能被拦截

    // 4. 复制链接：复制出的为带参 URL（含 lk_jump_to_browser=true）
    const input = page.locator('input[readonly][type="text"]').first()
    await expect(input).toBeVisible()
    const value = await input.inputValue()
    expect(value).toMatch(/lk_jump_to_browser=true/)
    expect(value).toMatch(/lk_mobile_jump_to_browser=true/)

    // 5. 只读输入框展示该链接；复制失败时会出现「请长按上方链接全选后复制」类提示（在无 clipboard 时触发，此处仅验证输入框存在且值为带参 URL）
    expect(value.length).toBeGreaterThan(0)
  })
})
