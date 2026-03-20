import { test, expect } from './fixtures'

test.describe('S06: 创新日历与商机联动', () => {
  test('S06.1: 商机列表页面加载', async ({ page }) => {
    await page.goto('/#/opportunities')
    await expect(page.getByRole('heading', { name: '商机跟踪' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('columnheader', { name: '商机名称' })).toBeVisible({ timeout: 10000 })
  })

  test('S06.2: 商机看板视图', async ({ page }) => {
    await page.goto('/#/opportunities/kanban')
    await expect(page.getByRole('heading', { name: '商机看板' })).toBeVisible({ timeout: 10000 })
    const stages = page.getByText('初步接触').or(page.getByText('需求确认'))
      .or(page.getByText('报价中')).or(page.getByText('谈判中'))
      .or(page.getByText('签约中')).or(page.getByText('已成交'))
    await expect(stages.first()).toBeVisible({ timeout: 10000 })
  })

  test('S06.3: 看板阶段列展示', async ({ page }) => {
    await page.goto('/#/opportunities/kanban')
    await expect(page.getByRole('heading', { name: '商机看板' })).toBeVisible({ timeout: 10000 })
    const stageLabels = ['初步接触', '需求确认', '报价中', '谈判中', '签约中', '已成交']
    let found = 0
    for (const label of stageLabels) {
      const el = page.getByText(label).first()
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) found++
    }
    expect(found).toBeGreaterThanOrEqual(1)
  })
})
