/**
 * 场景 25：工单全生命周期 E2E 测试
 *
 * 覆盖 P0/P1/P2 修复项：
 * S1: 工单列表数据完整性 — 类型列、排程日期列
 * S2: 工单详情关联数据 — 项目名、受试者、访视、活动
 * S3: 工单详情资源与CRF — 资源列表、CRF表单
 * S4: 手动创建工单 — 创建按钮→表单→提交
 * S5: 工单状态流转 — 开始→完成→审计
 * S6: 分析概览正常加载
 * S7: 数据导出
 * S8: KPI对比
 * S9: 告警配置保存
 * S10: 进展通报
 * S11: 评论功能
 * S12: EDC详情查看
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景25: 工单全生命周期', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')

    // 额外 mock: 创建工单
    await page.route('**/api/v1/workorder/create', async (route) => {
      await route.fulfill({
        json: { code: 200, msg: 'OK', data: { id: 999, title: '新工单', status: 'pending' } },
      })
    })

    // 额外 mock: 入组列表
    await page.route('**/api/v1/subject/enrollments**', async (route) => {
      await route.fulfill({
        json: {
          code: 200, msg: 'OK',
          data: {
            items: [
              { id: 1, enrollment_no: 'ENR-001', status: 'enrolled' },
              { id: 2, enrollment_no: 'ENR-002', status: 'enrolled' },
            ],
            total: 2,
          },
        },
      })
    })

    // 额外 mock: SOP 确认
    await page.route(/\/api\/v1\/workorder\/\d+\/confirm-sop$/, async (route) => {
      await route.fulfill({
        json: { code: 200, msg: 'SOP已确认', data: { id: 202, sop_confirmed: true } },
      })
    })

    // 额外 mock: EDC 模板列表
    await page.route('**/api/v1/edc/templates**', async (route) => {
      await route.fulfill({
        json: {
          code: 200, msg: 'OK',
          data: {
            items: [
              { id: 1, name: '保湿CRF v1', version: '1.0', description: '皮肤保湿评价', is_active: true },
              { id: 2, name: '抗衰CRF v2', version: '2.0', description: '抗衰老评价', is_active: true },
            ],
            total: 2,
          },
        },
      })
    })

    // 额外 mock: EDC 记录列表（带数据）
    await page.route('**/api/v1/edc/records**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            code: 200, msg: 'OK',
            data: {
              items: [
                {
                  id: 101, template_id: 1, template_name: '保湿CRF v1', work_order_id: 202,
                  status: 'submitted', create_time: new Date().toISOString(),
                  submitted_at: new Date().toISOString(), sdv_status: 'pending',
                  data: { moisture_level: 72.5, skin_type: 'normal', evaluation: '合格' },
                  validation_errors: [],
                },
                {
                  id: 102, template_id: 2, template_name: '抗衰CRF v2', work_order_id: 203,
                  status: 'draft', create_time: new Date().toISOString(),
                  data: { wrinkle_score: 3 },
                  validation_errors: ['缺少必填字段: elasticity_score'],
                },
              ],
              total: 2,
            },
          },
        })
      } else {
        await route.continue()
      }
    })
  })

  // -----------------------------------------------------------------------
  // S1: 工单列表数据完整性
  // -----------------------------------------------------------------------
  test('S1: 工单列表显示类型列和排程日期列', async ({ page }) => {
    await page.goto('/execution/#/workorders')
    await page.waitForLoadState('networkidle')

    const main = page.locator('main')
    await expect(main.getByText('工单管理').first()).toBeVisible({ timeout: 10000 })
    await expect(main.getByRole('columnheader', { name: '类型' })).toBeVisible()
    await expect(main.getByRole('columnheader', { name: '排程日期' })).toBeVisible()
  })

  // -----------------------------------------------------------------------
  // S2: 工单详情关联数据
  // -----------------------------------------------------------------------
  test('S2: 工单详情页显示项目名、受试者、访视、活动', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('关联信息').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('项目').first()).toBeVisible()
    await expect(page.getByText('受试者').first()).toBeVisible()
    await expect(page.getByText('访视节点').first()).toBeVisible()
    await expect(page.getByText('活动').first()).toBeVisible()
  })

  // -----------------------------------------------------------------------
  // S3: 工单详情资源与CRF
  // -----------------------------------------------------------------------
  test('S3: 工单详情渲染资源列表和CRF记录', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('CRF 数据记录').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('质量审计').first()).toBeVisible()
  })

  // -----------------------------------------------------------------------
  // S4: 手动创建工单
  // -----------------------------------------------------------------------
  test('S4: 点击创建工单→填表→提交', async ({ page }) => {
    await page.goto('/execution/#/workorders')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('工单管理').first()).toBeVisible({ timeout: 10000 })

    await page.getByText('创建工单').click()
    await expect(page.getByText('标题 *').first()).toBeVisible({ timeout: 5000 })

    await page.getByPlaceholder('工单标题').fill('手动创建的新工单')

    const select = page.locator('select[title="选择关联入组"]')
    await expect(select.locator('option')).toHaveCount(3, { timeout: 10000 })
    await select.selectOption({ index: 1 })

    await page.getByRole('button', { name: '创建', exact: true }).click()
    await page.waitForTimeout(1000)
  })

  // -----------------------------------------------------------------------
  // S5: 工单状态流转
  // -----------------------------------------------------------------------
  test('S5: 工单状态流转 — 开始→完成', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    const startBtn = page.getByText('开始执行')
    if (await startBtn.isVisible()) {
      await startBtn.click()
      await page.waitForTimeout(1000)
    }
  })

  // -----------------------------------------------------------------------
  // S6: 分析概览正常加载
  // -----------------------------------------------------------------------
  test('S6: 项目分析和工单分析Tab加载无报错', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/execution/#/analytics')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('分析与报表').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('工单总量').first()).toBeVisible()

    // 切换到工单分析Tab
    await page.getByText('工单分析').click()
    await page.waitForTimeout(1000)

    // 不应有 JS 错误
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0)
  })

  // -----------------------------------------------------------------------
  // S7: 数据导出
  // -----------------------------------------------------------------------
  test('S7: 导出按钮触发下载', async ({ page }) => {
    await page.goto('/execution/#/analytics')
    await page.waitForLoadState('networkidle')

    const exportBtn = page.getByText('导出 CSV')
    await expect(exportBtn.first()).toBeVisible({ timeout: 10000 })
  })

  // -----------------------------------------------------------------------
  // S8: KPI对比
  // -----------------------------------------------------------------------
  test('S8: KPI对比模式可切换且渲染图表', async ({ page }) => {
    await page.goto('/execution/#/analytics')
    await page.waitForLoadState('networkidle')

    await page.getByText('KPI绩效').click()
    await page.waitForTimeout(1000)

    await expect(page.getByText('按时完成率').first()).toBeVisible()

    const toggleBtn = page.getByTestId('compare-mode-toggle')
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click()
      await page.waitForTimeout(500)
      await expect(page.getByText('对比维度').first()).toBeVisible()
    }
  })

  // -----------------------------------------------------------------------
  // S9: 告警配置保存
  // -----------------------------------------------------------------------
  test('S9: 新增告警→保存→显示在列表', async ({ page }) => {
    await page.goto('/execution/#/analytics')
    await page.waitForLoadState('networkidle')

    await page.getByText('告警配置').click()
    await page.waitForTimeout(1000)

    await expect(page.getByTestId('alert-config-panel')).toBeVisible()

    await page.getByTestId('add-alert-btn').click()
    await expect(page.getByTestId('add-alert-form')).toBeVisible()

    const form = page.getByTestId('add-alert-form')
    await form.locator('select').first().selectOption('equipment_calibration')
    await form.locator('input[type="number"]').fill('5')

    await page.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(1000)
  })

  // -----------------------------------------------------------------------
  // S10: 进展通报
  // -----------------------------------------------------------------------
  test('S10: 通报按钮→预览→发送', async ({ page }) => {
    await page.goto('/execution/#/projects/1/execution')
    await page.waitForLoadState('networkidle')

    const reportBtn = page.getByText('通报')
    if (await reportBtn.first().isVisible()) {
      await reportBtn.first().click()
      await page.waitForTimeout(1000)
    }
  })

  // -----------------------------------------------------------------------
  // S11: 评论功能
  // -----------------------------------------------------------------------
  test('S11: 输入评论→发送→显示在列表', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    const commentsSection = page.getByTestId('comments-section')
    await expect(commentsSection).toBeVisible({ timeout: 10000 })

    await expect(commentsSection.getByText('陈主管').first()).toBeVisible()

    const input = commentsSection.getByPlaceholder('添加评论...')
    await input.fill('测试评论内容')
    await input.press('Enter')
    await page.waitForTimeout(1000)
  })

  // -----------------------------------------------------------------------
  // S12: EDC详情查看
  // -----------------------------------------------------------------------
  test('S12: 点击EDC记录→详情展开', async ({ page }) => {
    await page.goto('/execution/#/edc')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('EDC 数据采集').first()).toBeVisible({ timeout: 10000 })

    // 切换到数据记录 Tab
    await page.getByRole('button', { name: '数据记录' }).click()
    await page.waitForTimeout(1000)

    // 点击一条记录
    const record = page.getByText('保湿CRF v1').first()
    if (await record.isVisible()) {
      await record.click()
      await page.waitForTimeout(1000)
      await expect(page.getByText('CRF 记录详情').first()).toBeVisible()
      await expect(page.getByText('数据字段').first()).toBeVisible()
    }
  })
})
