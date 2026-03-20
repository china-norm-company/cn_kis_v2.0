/**
 * 场景 07：工单派发 — 5 项资质检查派工
 *
 * 钱子衿在派发工单时需要检查候选人员的 5 项资质：
 * GCP证书有效性、方法资质、设备授权、排班冲突、工作负荷。
 * 确保只有符合所有条件的人员才能被指派。
 *
 * 7 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('工单派发 — 5 项资质检查派工', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('7.1 打开工单派发页面，看到页面标题和 5 项检查描述', async ({ page }) => {
    await page.goto('/lab-personnel/dispatch')
    await expect(page.locator('main h2')).toContainText('工单派发')
    await expect(page.locator('main').getByText(/GCP证书|方法资质|设备授权|排班冲突|工时负荷/)).toBeVisible()
  })

  test('7.2 看到派发统计卡片（进行中3、待派发2、逾期1、今日完成5）', async ({ page }) => {
    await page.goto('/lab-personnel/dispatch')
    await expect(page.locator('[data-stat="in_progress"]')).toContainText('3')
    await expect(page.locator('[data-stat="pending"]')).toContainText('2')
    await expect(page.locator('[data-stat="overdue"]')).toContainText('1')
    await expect(page.locator('[data-stat="completed"]')).toContainText('5')
  })

  test('7.3 监控表格显示 3 条进行中的指派', async ({ page }) => {
    await page.goto('/lab-personnel/dispatch')
    const monitorTable = page.locator('[data-section="monitor"] table')
    await expect(monitorTable).toBeVisible()
    await expect(monitorTable.getByText('王皮测')).toBeVisible()
    await expect(monitorTable.getByText('李医评')).toBeVisible()
    await expect(monitorTable.getByText('张仪操')).toBeVisible()
    await expect(monitorTable.getByText('进行中').first()).toBeVisible()
  })

  test('7.4 点击"查看候选人"按钮，显示候选人区域', async ({ page }) => {
    await page.goto('/lab-personnel/dispatch')
    await page.locator('[data-section="monitor"]').getByText('查看候选人').first().click()
    await page.waitForTimeout(500)
    await expect(page.locator('[data-section="candidates"]')).toBeVisible()
  })

  test('7.5 候选人王皮测显示评分 92，L4 级别', async ({ page }) => {
    await page.goto('/lab-personnel/dispatch')
    await page.locator('[data-section="monitor"]').getByText('查看候选人').first().click()
    await page.waitForTimeout(500)
    const candidates = page.locator('[data-section="candidates"]')
    await expect(candidates.getByText('王皮测')).toBeVisible()
    await expect(candidates.getByText('92')).toBeVisible()
    await expect(candidates.getByText('L4')).toBeVisible()
  })

  test('7.6 候选人显示 5 项资质检查（绿色/红色图标）', async ({ page }) => {
    await page.goto('/lab-personnel/dispatch')
    await page.locator('[data-section="monitor"]').getByText('查看候选人').first().click()
    await page.waitForTimeout(500)
    const candidates = page.locator('[data-section="candidates"]')
    await expect(candidates.getByText('GCP证书').first()).toBeVisible()
    await expect(candidates.getByText('方法资质').first()).toBeVisible()
    await expect(candidates.getByText('设备授权').first()).toBeVisible()
    await expect(candidates.getByText('排班无冲突').first()).toBeVisible()
    await expect(candidates.getByText('工时负荷').first()).toBeVisible()
  })

  test('7.7 点击"指派"按钮，成功派发工单', async ({ page }) => {
    await page.goto('/lab-personnel/dispatch')
    await page.locator('[data-section="monitor"]').getByText('查看候选人').first().click()
    await page.waitForTimeout(500)
    await page.locator('[data-section="candidates"]').getByRole('button', { name: '指派' }).first().click()
    await page.waitForTimeout(500)
    await expect(page.getByText('派工成功')).toBeVisible()
  })
})
