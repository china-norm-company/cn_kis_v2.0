/**
 * 场景 01：早晨概览 — 人员管理看板
 *
 * 钱子衿每天 7:30 到岗，第一件事是打开人员管理台，快速掌握：
 * - 在册人员总数和在岗情况
 * - 证书即将到期预警
 * - 待处理风险数量
 * - 各模块快速入口
 *
 * 9 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('早晨概览 — 人员管理看板', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('1.1 打开工作台首页，看到仪表盘标题和描述', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await expect(page.locator('main h2')).toContainText('人员管理看板')
    await expect(page.locator('main').getByText(/实验室人员/)).toBeVisible()
  })

  test('1.2 看到 4 个统计卡片：在册人员、在岗、证书即将到期、待处理风险', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await expect(page.locator('[data-stat="total"]')).toContainText('12')
    await expect(page.locator('[data-stat="active"]')).toContainText('10')
    await expect(page.locator('[data-stat="cert_expiring"]')).toContainText('4')
    await expect(page.locator('[data-stat="risks_open"]')).toContainText('8')
  })

  test('1.3 看到 4 个模块卡片：资质概览、本周排班、工时效率、工单执行', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await expect(page.locator('main').getByText('资质概览')).toBeVisible()
    await expect(page.locator('main').getByText('本周排班')).toBeVisible()
    await expect(page.locator('main').getByText('工时效率')).toBeVisible()
    await expect(page.locator('main').getByText('工单执行')).toBeVisible()
  })

  test('1.4 点击资质概览模块卡片，导航到资质矩阵页面', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await page.locator('[data-module="qualifications"]').click()
    await expect(page).toHaveURL(/\/qualifications/)
    await expect(page.locator('main h2')).toContainText('资质矩阵')
  })

  test('1.5 看到风险摘要区域，包含红色、黄色、蓝色风险标识', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await expect(page.locator('[data-section="risk-summary"]')).toBeVisible()
    const riskSection = page.locator('[data-section="risk-summary"]')
    await expect(riskSection.getByText(/红色风险/)).toBeVisible()
  })

  test('1.6 通过侧边栏导航到人员档案页面', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await page.getByRole('link', { name: '人员档案' }).click()
    await expect(page).toHaveURL(/\/staff/)
    await expect(page.locator('main h2')).toContainText('人员档案')
  })

  test('1.7 通过侧边栏导航到排班管理页面', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await page.getByRole('link', { name: '排班管理' }).click()
    await expect(page).toHaveURL(/\/schedules/)
    await expect(page.locator('main h2')).toContainText('排班管理')
  })

  test('1.8 通过侧边栏导航到工时统计页面', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await page.getByRole('link', { name: '工时统计' }).click()
    await expect(page).toHaveURL(/\/worktime/)
    await expect(page.locator('main h2')).toContainText('工时统计')
  })

  test('1.9 通过侧边栏导航到风险预警页面，看到"风险预警"标题', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await page.getByRole('link', { name: '风险预警' }).click()
    await expect(page).toHaveURL(/\/risks/)
    await expect(page.locator('main h2')).toContainText('风险预警')
  })
})
