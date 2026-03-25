import { expect, test, type Page } from '@playwright/test'

const USER_INFO = {
  id: '1',
  name: '验收用户',
  subjectNo: 'SUB-ACC-0001',
  enrollDate: '2026-02-01',
  projectName: '受试者全生命周期验证项目',
  subjectId: 1,
  enrollmentId: 1,
  planId: 1,
  protocolId: 1,
}

async function bootstrapLogin(page: Page) {
  await page.addInitScript((userInfo) => {
    localStorage.setItem('token', 'e2e-token')
    localStorage.setItem('userInfo', JSON.stringify(userInfo))
  }, USER_INFO)
}

async function mockApis(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()

    if (url.includes('/api/v1/visit/nodes')) {
      return route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            items: [
              { id: 1, name: 'V1 首访', plan_id: 1, baseline_day: 0, window_before: 0, window_after: 1, status: 'completed', order: 1 },
              { id: 2, name: 'V2 复访', plan_id: 1, baseline_day: 7, window_before: 1, window_after: 2, status: 'active', order: 2 },
            ],
          },
        },
      })
    }
    if (url.includes('/api/v1/my/queue-position')) {
      return route.fulfill({
        json: { code: 200, msg: 'OK', data: { position: 3, ahead_count: 2, wait_minutes: 15, status: 'waiting', checkin_time: '10:30' } },
      })
    }
    if (url.includes('/api/v1/my/upcoming-visits')) {
      return route.fulfill({
        json: { code: 200, msg: 'OK', data: { items: [{ id: 11, date: '2026-03-01', time: '09:30:00', purpose: '复访', status: 'confirmed' }] } },
      })
    }
    if (url.includes('/api/v1/my/schedule')) {
      return route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: { items: [{ id: 21, title: 'V2 采样', status: 'in_progress', visit_name: 'V2 复访', activity_name: '血样采集', scheduled_date: '2026-03-01', start_time: '09:30:00' }] },
        },
      })
    }
    if (url.includes('/api/v1/my/appointments')) {
      return route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            items: [{ id: 31, appointment_date: '2026-03-01', appointment_time: '09:30:00', purpose: '复访', status: 'confirmed' }],
          },
        },
      })
    }
    if (url.includes('/api/v1/my/screening-status')) {
      return route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            items: [{
              registration_id: 1,
              registration_no: 'REG-2026-0001',
              plan_id: 1,
              reg_status: 'confirmed',
              reg_date: '2026-02-01T09:00:00',
              pre_screening: { id: 1, result: 'pass', date: '2026-02-02', notes: '' },
              screening: { id: 2, result: 'pass', date: '2026-02-03', notes: '' },
              enrollment: { id: 3, status: 'enrolled', enrollment_no: 'ENR-001', date: '2026-02-04' },
            }],
          },
        },
      })
    }
    if (url.includes('/api/v1/my/compliance')) {
      return route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            latest_score: 92,
            latest_rating: '良好',
            history: [{ id: 1, overall_score: 92, rating: '良好', evaluation_date: '2026-02-22' }],
          },
        },
      })
    }

    return route.fulfill({ json: { code: 200, msg: 'OK', data: { items: [] } } })
  })
}

async function assertNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(() => {
    const doc = document.documentElement
    return doc.scrollWidth > window.innerWidth + 1
  })
  expect(hasOverflow).toBeFalsy()
}

async function assertTapTargetMinHeight(page: Page, selector: string, minPx = 44) {
  const el = page.locator(selector).first()
  await expect(el).toBeVisible()
  const box = await el.boundingBox()
  expect(box).not.toBeNull()
  expect((box?.height || 0) >= minPx).toBeTruthy()
}

async function assertTypographyConsistency(page: Page) {
  const baseStyle = await page.evaluate(() => {
    const style = window.getComputedStyle(document.documentElement)
    return {
      fontFamily: style.fontFamily || '',
      lineHeight: style.lineHeight || '',
    }
  })
  expect(baseStyle.fontFamily.length > 0).toBeTruthy()
  // 页面基础行高不能退化到过小值，避免可读性回退
  const lineHeight = Number.parseFloat(baseStyle.lineHeight)
  expect(Number.isNaN(lineHeight) || lineHeight >= 1.4).toBeTruthy()
}

test.describe('UI 质量综合验收（Headed）', () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapLogin(page)
    await mockApis(page)
  })

  test('六个核心页面：布局不溢出 + 关键信息可见 + 触控热区达标', async ({ page }) => {
    // 1) 首页
    await page.goto('/#/pages/index/index')
    await expect(page.locator('.hero-title').first()).toBeVisible()
    const hasQuickActions = await page.getByText('快捷操作').count()
    if (hasQuickActions > 0) {
      await expect(page.getByText('快捷操作')).toBeVisible()
    } else {
      await expect(page.locator('.login-btn').first()).toBeVisible()
    }
    await assertNoHorizontalOverflow(page)
    await assertTypographyConsistency(page)
    if (hasQuickActions > 0) {
      await assertTapTargetMinHeight(page, '.action-item')
    } else {
      await assertTapTargetMinHeight(page, '.login-btn')
    }
    await page.screenshot({ path: 'test-results/ui-audit/index-page.png', fullPage: true })

    // 2) 访视页
    await page.goto('/#/pages/visit/index')
    await expect(page.locator('.page-title').first()).toBeVisible()
    await expect(page.getByText('时间线', { exact: true }).first()).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await assertTypographyConsistency(page)
    await assertTapTargetMinHeight(page, '.tab-item')
    await page.screenshot({ path: 'test-results/ui-audit/visit-page.png', fullPage: true })

    // 3) 预约页
    await page.goto('/#/pages/appointment/index')
    await expect(page.locator('.page-title').first()).toBeVisible()
    await expect(page.getByText('新建预约').first()).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await assertTypographyConsistency(page)
    await assertTapTargetMinHeight(page, '.create-btn')
    await page.screenshot({ path: 'test-results/ui-audit/appointment-page.png', fullPage: true })

    // 4) 排队页
    await page.goto('/#/pages/queue/index')
    await expect(page.locator('.mini-page__title').first()).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await assertTypographyConsistency(page)
    await assertTapTargetMinHeight(page, '.mini-btn')
    await page.screenshot({ path: 'test-results/ui-audit/queue-page.png', fullPage: true })

    // 5) 筛选进度页（先等加载结束，有数据时 .step-item，无数据时 .mini-empty__action）
    await page.goto('/#/pages/screening-status/index')
    await expect(page.locator('.ss-page__title').first()).toBeVisible()
    await expect(page.locator('.ss-loading')).toBeHidden({ timeout: 10000 })
    await assertNoHorizontalOverflow(page)
    await assertTypographyConsistency(page)
    await assertTapTargetMinHeight(page, '.step-item, .mini-empty__action')
    await page.screenshot({ path: 'test-results/ui-audit/screening-status-page.png', fullPage: true })

    // 6) 依从页
    await page.goto('/#/pages/compliance/index')
    await expect(page.locator('.mini-page__title').first()).toBeVisible()
    await expect(page.getByText('历史评估').first()).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await assertTypographyConsistency(page)
    await assertTapTargetMinHeight(page, '.mini-card')
    await page.screenshot({ path: 'test-results/ui-audit/compliance-page.png', fullPage: true })
  })
})
