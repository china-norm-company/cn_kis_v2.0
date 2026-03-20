/**
 * 场景 7：CRF 内嵌填写工作流
 *
 * 验收项：
 * ✓ AC-1: 工单详情页可展开 CRF 表单，填写后可保存草稿和提交
 * ✓ AC-3: 未填必填项时提交按钮禁用，提交后显示错误提示
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景7: CRF 内嵌填写工作流', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc')
  })

  test('7.1 工单详情页应展示 CRF 填写区域', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('S-001 皮肤水分测试')).toBeVisible({ timeout: 10000 })

    const crfSection = page.locator('[data-section="crf-form"]')
    await expect(crfSection).toBeVisible()
    await expect(crfSection.getByText('皮肤水分含量检测 CRF')).toBeVisible()
  })

  test('7.2 点击展开后应显示 CRF 表单字段', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    const crfSection = page.locator('[data-section="crf-form"]')
    await crfSection.click()
    await page.waitForTimeout(500)

    await expect(page.getByText('环境温度(°C)')).toBeVisible()
    await expect(page.getByText('环境湿度(%)')).toBeVisible()
    await expect(page.getByText('皮肤状态')).toBeVisible()
    await expect(page.getByText('额部水分值')).toBeVisible()
    await expect(page.getByText('不良反应')).toBeVisible()
    await expect(page.getByText('备注')).toBeVisible()
  })

  test('7.3 必填项未填时提交按钮应禁用', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    const crfSection = page.locator('[data-section="crf-form"]')
    await crfSection.click()
    await page.waitForTimeout(500)

    const submitBtn = page.getByRole('button', { name: '提交' })
    await expect(submitBtn).toBeDisabled()
  })

  test('7.4 填写所有必填项后提交按钮应启用', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    const crfSection = page.locator('[data-section="crf-form"]')
    await crfSection.click()
    await page.waitForTimeout(500)

    await page.getByPlaceholder('请输入检测环境温度').fill('22.5')
    await page.getByPlaceholder('请输入检测环境湿度').fill('45')

    await page.locator('select').selectOption('normal')

    const measureInputs = page.locator('input[type="number"]')
    const firstMeasure = measureInputs.nth(2)
    const secondMeasure = measureInputs.nth(3)
    const thirdMeasure = measureInputs.nth(4)
    await firstMeasure.fill('42.1')
    await secondMeasure.fill('43.0')
    await thirdMeasure.fill('42.5')

    await page.getByLabel('无').check()

    const submitBtn = page.getByRole('button', { name: '提交' })
    await expect(submitBtn).toBeEnabled()
  })

  test('7.5 草稿保存按钮应可点击', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    const crfSection = page.locator('[data-section="crf-form"]')
    await crfSection.click()
    await page.waitForTimeout(500)

    await page.getByPlaceholder('请输入检测环境温度').fill('22.5')

    const saveBtn = page.getByRole('button', { name: '保存草稿' })
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    await expect(page.getByText('已保存')).toBeVisible({ timeout: 5000 })
  })

  test('7.6 CRF 提交成功后应显示已提交状态', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    const crfSection = page.locator('[data-section="crf-form"]')
    await crfSection.click()
    await page.waitForTimeout(500)

    await page.getByPlaceholder('请输入检测环境温度').fill('22.5')
    await page.getByPlaceholder('请输入检测环境湿度').fill('45')
    await page.locator('select').selectOption('normal')

    const measureInputs = page.locator('input[type="number"]')
    await measureInputs.nth(2).fill('42.1')
    await measureInputs.nth(3).fill('43.0')
    await measureInputs.nth(4).fill('42.5')
    await page.getByLabel('无').check()

    await page.getByRole('button', { name: '提交' }).click()

    await expect(page.getByText('已提交')).toBeVisible({ timeout: 5000 })
  })

  test('7.7 三次测量应自动计算平均值', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    const crfSection = page.locator('[data-section="crf-form"]')
    await crfSection.click()
    await page.waitForTimeout(500)

    const measureInputs = page.locator('input[type="number"]')
    await measureInputs.nth(2).fill('40')
    await measureInputs.nth(3).fill('42')
    await measureInputs.nth(4).fill('44')

    await expect(page.getByText('平均值:')).toBeVisible()
    await expect(page.getByText('42.00')).toBeVisible()
  })
})
