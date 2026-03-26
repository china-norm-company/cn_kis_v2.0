/**
 * 仅验证 HeroBrandAnimation 组件 CSS 是否正确生成
 * 不依赖登录、API，仅访问 demo-hero 页面并截图
 */
import { expect, test } from '@playwright/test'

test.describe('HeroBrandAnimation 组件 CSS 验证（Headed）', () => {
  test('组件演示页：APNG/GIF 动画结构可见', async ({ page }) => {
    await page.goto('/#/pages/demo-hero/index')
    const hero = page.locator('.hero-brand').first()
    await expect(hero).toBeVisible()
    // 2 个 HeroBrandAnimation（大+紧凑），每个含 APNG+GIF，共 4 张图
    await expect(page.locator('.hero-brand__img')).toHaveCount(4)
    await page.screenshot({
      path: 'test-results/ui-audit/demo-hero-css-only.png',
      fullPage: true,
    })
  })
})
