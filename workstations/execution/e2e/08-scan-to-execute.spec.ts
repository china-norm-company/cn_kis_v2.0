/**
 * 场景 8：扫码快捷执行
 *
 * 验收项：
 * ✓ AC-4: 扫描/输入二维码后正确识别受试者并跳转工单
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景8: 扫码快捷执行', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc')
  })

  test('8.1 扫码页面应正确展示', async ({ page }) => {
    await page.goto('/execution/#/scan')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('扫码快捷执行')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('打开摄像头扫码')).toBeVisible()
    await expect(page.getByPlaceholder('手动输入二维码内容或哈希值')).toBeVisible()
  })

  test('8.2 手动输入哈希值应识别受试者', async ({ page }) => {
    await page.goto('/execution/#/scan')
    await page.waitForLoadState('networkidle')

    await page.getByPlaceholder('手动输入二维码内容或哈希值').fill('abc123def456')
    await page.getByRole('button', { name: '查询' }).click()

    await expect(page.getByText('识别成功')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('S-001 王丽', { exact: true }).first()).toBeVisible()
  })

  test('8.3 识别受试者后应显示今日关联工单', async ({ page }) => {
    await page.goto('/execution/#/scan')
    await page.waitForLoadState('networkidle')

    await page.getByPlaceholder('手动输入二维码内容或哈希值').fill('abc123def456')
    await page.getByRole('button', { name: '查询' }).click()

    await expect(page.getByRole('heading', { name: /今日关联工单/ })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /S-001 皮肤水分测试/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /S-001 TEWL 检测/ })).toBeVisible()
  })

  test('8.4 点击工单应跳转到工单详情', async ({ page }) => {
    await page.goto('/execution/#/scan')
    await page.waitForLoadState('networkidle')

    await page.getByPlaceholder('手动输入二维码内容或哈希值').fill('abc123def456')
    await page.getByRole('button', { name: '查询' }).click()

    await expect(page.getByRole('heading', { name: /今日关联工单/ })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /S-001 皮肤水分测试/ }).click()

    await expect(page.getByText('WO#202')).toBeVisible({ timeout: 10000 })
  })

  test('8.5 重新扫码按钮应清空结果', async ({ page }) => {
    await page.goto('/execution/#/scan')
    await page.waitForLoadState('networkidle')

    await page.getByPlaceholder('手动输入二维码内容或哈希值').fill('abc123def456')
    await page.getByRole('button', { name: '查询' }).click()
    await expect(page.getByText('识别成功')).toBeVisible({ timeout: 5000 })

    await page.getByText('重新扫码').click()

    await expect(page.getByText('打开摄像头扫码')).toBeVisible()
    await expect(page.getByText('识别成功')).not.toBeVisible()
  })
})
