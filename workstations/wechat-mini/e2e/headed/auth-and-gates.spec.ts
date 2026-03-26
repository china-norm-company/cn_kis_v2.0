/**
 * 认证与门禁 E2E：L0/L1/L2 状态、实名页、知情同意门禁、礼金门禁
 * 需在 H5 模式下运行（pnpm dev:h5），可配合 mock 或真实后端。
 */
import { expect, test } from '@playwright/test'

test.describe('认证与门禁', () => {
  test('首页未登录时可访问且展示登录入口', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.home-login-panel__btn').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('微信快捷登录')).toBeVisible({ timeout: 15000 })
  })

  test('实名认证页可打开并展示标题', async ({ page }) => {
    await page.goto('/#/pages/identity-verify/index')
    await expect(page.getByText(/实名认证|微信快捷登录/)).toBeVisible({ timeout: 15000 })
  })

  test('知情同意页可打开', async ({ page }) => {
    await page.goto('/#/pages/consent/index')
    await expect(page.locator('.consent-page')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.consent-page')).toContainText('知情同意书', { timeout: 15000 })
  })

  test('礼金页在未 L2 时展示「请先完成实名认证」或列表', async ({ page }) => {
    await page.goto('/#/pages/payment/index')
    await expect(page.locator('.payment-page')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.payment-page')).toContainText(/我的礼金|请先完成实名认证|已到账/, { timeout: 15000 })
  })

  test('游客态首页入口应可点击跳转（项目浏览、参与流程）', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('浏览可参与项目')).toBeVisible({ timeout: 15000 })
    await page.getByText('浏览可参与项目').click()
    await expect(page).toHaveURL(/#\/pages\/projects\/index/, { timeout: 15000 })
    await expect(page.locator('.mini-page__title')).toContainText('招募项目', { timeout: 15000 })

    await page.goto('/')
    await page.getByText('查看参与流程').click()
    await expect(page).toHaveURL(/#\/pages\/visit\/index/, { timeout: 15000 })
    await expect(page.locator('.visit-page')).toBeVisible({ timeout: 15000 })
  })

  test('参与流程步骤点击应有响应', async ({ page }) => {
    await page.goto('/')
    await page.locator('.home-flow__item').nth(0).click()
    await expect(page).toHaveURL(/#\/pages\/register\/index/, { timeout: 15000 })

    await page.goto('/')
    await page.locator('.home-flow__item').nth(1).click()
    await expect(page).toHaveURL(/#\/pages\/screening-status\/index/, { timeout: 15000 })

    await page.goto('/')
    await page.locator('.home-flow__item').nth(2).click()
    await expect(page).toHaveURL(/#\/pages\/appointment\/index/, { timeout: 15000 })

    await page.goto('/')
    await page.locator('.home-flow__item').nth(3).click()
    await expect(page).toHaveURL(/#\/pages\/visit\/index/, { timeout: 15000 })

    await page.goto('/')
    await page.locator('.home-flow__item').nth(4).click()
    await expect(page).toHaveURL(/#\/pages\/support\/index/, { timeout: 15000 })
  })

  test('登录后打开知情同意与礼金页不应白屏', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'e2e-token')
      localStorage.setItem('userInfo', JSON.stringify({
        id: '1',
        name: '测试用户',
        subjectNo: 'SUB-E2E-001',
        enrollDate: '2026-02-01',
        projectName: 'E2E 项目',
      }))
    })

    await page.goto('/#/pages/consent/index')
    await expect(page.locator('.consent-page')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.consent-page')).toContainText('知情同意书', { timeout: 15000 })

    await page.goto('/#/pages/payment/index')
    await expect(page.locator('.payment-page')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.payment-page')).toContainText(/我的礼金|请先完成实名认证|已到账|处理中/, { timeout: 15000 })
  })
})
