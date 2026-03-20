/**
 * 场景 3：异常处理与应变能力
 *
 * 业务目标对照（来自设计规划）：
 * ✓ 评估员可在任何时刻上报异常
 * ✓ 异常上报表单包含类型、严重程度、描述
 * ✓ 异常类型覆盖化妆品 CRO 常见场景（设备故障、环境异常、受试者问题等）
 * ✓ 工单可暂停和恢复，确保操作可追溯
 * ✓ 异常记录在工单完成阶段可查看，为合规审计提供证据
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景3: 异常处理与工单应变', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('3.1 【设计目标】异常上报入口应始终可见', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    // 在工单详情页，异常上报按钮应始终可见
    const reportBtn = page.getByRole('button', { name: /上报异常/ })
    await expect(reportBtn).toBeVisible()

    // 业务验证：任何时刻发现异常都能立即上报
  })

  test('3.2 【设计目标】异常上报表单应包含完整的分类和严重程度', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    // 打开异常上报对话框
    await page.getByRole('button', { name: /上报异常/ }).click()

    // 验证对话框标题
    await expect(page.locator('.fixed').getByText('上报异常')).toBeVisible()

    // 验证异常类型选择 — 覆盖化妆品 CRO 常见场景
    const typeSelect = page.locator('select')
    await expect(typeSelect).toBeVisible()

    // 验证类型选项
    const options = typeSelect.locator('option')
    const optionTexts = await options.allTextContents()
    expect(optionTexts).toContain('技术问题')
    expect(optionTexts).toContain('设备故障')
    expect(optionTexts).toContain('环境异常')
    expect(optionTexts).toContain('受试者问题')
    expect(optionTexts).toContain('质量问题')
    expect(optionTexts).toContain('资源不可用')
    expect(optionTexts).toContain('延迟')
    expect(optionTexts).toContain('其他')

    // 验证严重程度选择（低/中/高/严重）
    await expect(page.getByRole('button', { name: '低' })).toBeVisible()
    await expect(page.getByRole('button', { name: '中' })).toBeVisible()
    await expect(page.getByRole('button', { name: '高' })).toBeVisible()
    await expect(page.getByRole('button', { name: '严重' })).toBeVisible()

    // 验证描述输入区域
    await expect(page.getByPlaceholder('请详细描述异常情况...')).toBeVisible()

    // 业务验证：分类完整有助于后续 CAPA 追踪
  })

  test('3.3 【设计目标】异常上报需要填写描述才能提交', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /上报异常/ }).click()

    // 不填描述，提交按钮应禁用
    const submitBtn = page.getByRole('button', { name: /确认上报/ })
    await expect(submitBtn).toBeDisabled()

    // 填写描述后应启用
    await page.getByPlaceholder('请详细描述异常情况...').fill(
      'Corneometer CM825 在第3次测量时探头读数不稳定，波动范围超过 ±5 AU'
    )
    await expect(submitBtn).toBeEnabled()

    // 业务验证：强制填写描述确保异常记录有据可查
  })

  test('3.4 【设计目标】完成异常上报全流程', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /上报异常/ }).click()

    // 选择异常类型 — 设备故障
    await page.locator('select').selectOption('equipment_failure')

    // 选择严重程度 — 高
    await page.getByRole('button', { name: '高' }).click()

    // 填写详细描述
    await page.getByPlaceholder('请详细描述异常情况...').fill(
      'Corneometer CM825 探头读数不稳定，第3点位连续3次测量值分别为 28.5、42.1、15.3，' +
      '偏差远超允许范围（±10%）。已更换探头保护膜但问题未解决。建议暂停使用并联系工程师检查。'
    )

    // 提交异常
    await page.getByRole('button', { name: /确认上报/ }).click()

    // 对话框应关闭（上报成功）
    await expect(page.locator('.fixed').getByText('上报异常')).not.toBeVisible({ timeout: 5000 })

    // 业务验证：异常记录保存后可供质量部门 CAPA 追踪
  })

  test('3.5 【设计目标】工单暂停功能应在执行中可用', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    // 接受工单使其进入 in_progress 状态
    await page.getByRole('button', { name: /接受工单/ }).click()
    await expect(page.getByText('执行前准备')).toBeVisible({ timeout: 5000 })

    // 验证暂停按钮在进行中状态可见
    const pauseBtn = page.getByRole('button', { name: /暂停工单/ })
    await expect(pauseBtn).toBeVisible()

    // 业务验证：暂停功能应对突发情况（如受试者不适、设备故障）
  })

  test('3.6 【设计目标】可以取消异常上报', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /上报异常/ }).click()
    await expect(page.locator('.fixed').getByText('上报异常')).toBeVisible()

    // 点击取消
    await page.getByRole('button', { name: '取消' }).click()

    // 对话框应关闭
    await expect(page.locator('.fixed').getByText('上报异常')).not.toBeVisible({ timeout: 3000 })

    // 业务验证：误操作可取消，不产生无效记录
  })

  test('3.7 【设计目标】完成阶段应展示执行总结包含异常记录', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    // 切换到完成阶段查看
    await page.getByText('4.完成').click()

    // 验证完成阶段存在
    await expect(page.getByText('执行完成')).toBeVisible()

    // 验证统计卡片
    await expect(page.getByText('完成步骤')).toBeVisible()
    await expect(page.getByText('跳过步骤')).toBeVisible()
    await expect(page.getByText('总耗时')).toBeVisible()
    await expect(page.getByText('异常记录')).toBeVisible()

    // 验证数据完整度
    await expect(page.getByText('数据完整度')).toBeVisible()

    // 业务验证：完成阶段为质量审计提供完整的执行证据链
  })
})
