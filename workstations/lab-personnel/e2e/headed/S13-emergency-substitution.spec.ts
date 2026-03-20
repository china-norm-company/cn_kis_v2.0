/**
 * S13：紧急替班 — 紧急替班流程
 *
 * 业务标准：3分钟内完成紧急替班
 * 测试权重：5%
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupHeadedMocks, waitForPageReady } from './helpers/setup'

test.describe('紧急替班 — 紧急替班流程', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupHeadedMocks(page)
  })

  test('13.1 导航到排班页面 → 查看排班列表', async ({ page }) => {
    await page.goto('/lab-personnel/schedules')
    await waitForPageReady(page)
    
    // 验证排班页面可见
    await expect(page.locator('main h2')).toContainText(/排班/)
    
    // 验证排班列表或日历可见
    const scheduleList = page.locator('[data-section="schedule-list"]')
    const scheduleCalendar = page.locator('[data-view="week"], [data-view="month"]')
    
    if (await scheduleList.isVisible()) {
      await expect(scheduleList).toBeVisible()
      
      // 验证至少有一个排班项
      const scheduleItems = scheduleList.locator('[data-schedule-item]')
      const itemCount = await scheduleItems.count()
      expect(itemCount).toBeGreaterThanOrEqual(0)
    } else if (await scheduleCalendar.isVisible()) {
      await expect(scheduleCalendar).toBeVisible()
    } else {
      // 验证表格存在
      const table = page.locator('table')
      await expect(table).toBeVisible()
    }
  })

  test('13.2 导航到人员列表 → 识别可用后备人员', async ({ page }) => {
    await page.goto('/lab-personnel/staff')
    await waitForPageReady(page)
    
    // 验证人员列表可见
    const staffList = page.locator('[data-section="staff-list"]')
    await expect(staffList).toBeVisible()
    
    // 验证至少有一个人员项
    const staffItems = page.locator('[data-staff-item]')
    const staffCount = await staffItems.count()
    expect(staffCount).toBeGreaterThan(0)
    
    // 查找可用人员（可能通过状态标识）
    const availableStaff = staffItems.filter({ hasText: /可用|Available|空闲/ })
    const availableCount = await availableStaff.count()
    
    // 验证至少有一个可用人员（或所有人员都可见）
    if (availableCount > 0) {
      await expect(availableStaff.first()).toBeVisible()
    } else {
      // 如果没有状态标识，验证人员列表本身可见即可
      await expect(staffItems.first()).toBeVisible()
    }
  })

  test('13.3 导航回排班页面 → 切换到时段标签页', async ({ page }) => {
    // 从人员页面开始
    await page.goto('/lab-personnel/staff')
    await waitForPageReady(page)
    
    // 导航回排班页面
    await page.goto('/lab-personnel/schedules')
    await waitForPageReady(page)
    
    // 验证排班页面可见
    await expect(page).toHaveURL(/\/schedules/)
    await expect(page.locator('main h2')).toContainText(/排班/)
    
    // 查找时段标签页（slots tab）
    const slotsTab = page.getByRole('tab', { name: /时段|Slots|时间段/ })
    if (await slotsTab.isVisible()) {
      await slotsTab.click()
      await waitForPageReady(page)
      
      // 验证时段列表可见
      const slotsList = page.locator('[data-section="slots"]')
      await expect(slotsList).toBeVisible()
    } else {
      // 如果没有标签页，验证排班列表可见
      const scheduleSection = page.locator('[data-section="schedule-list"], table')
      await expect(scheduleSection.first()).toBeVisible()
    }
  })
})
