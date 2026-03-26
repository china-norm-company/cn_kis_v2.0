/**
 * 排程 Excel 导入 - Headed 验证测试（跨日期 + 姓名复合匹配）
 */
import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import * as XLSX from 'xlsx'
import { injectAuth, setupApiMocks } from './helpers/setup'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function buildWideScheduleFixture(filePath: string) {
  const rows: unknown[][] = [
    [],
    ['组别', '设备编号', '设备', '2026-02-27', '', '', '', '', '2026-02-28', '', '', '', ''],
    ['', '', '', '星期四', '', '', '', '', '星期五', '', '', '', ''],
    ['', '', '', '项目编号', '样本量', '人员/岗位', '房间', '组别', '项目编号', '样本量', '人员/岗位', '房间', '组别'],
    ['行政', '', '探头-Corneometer 1', 'C25021007', 1, '林紫倩（王敏）/陈某', 'D04-2', '组1', 'C26030001', 1, '林紫倩', 'D04-3', '组2'],
    ['行政', '', '探头-Glossymeter 1', 'C26099999', 1, '王芳（林紫倩）', 'D04-1', '组1', 'C26021007', 1, '林紫倩（李某）', 'D04-2', '组3'],
    ['行政', '', '探头-Tewameter 1', 'C26041001', 1, '曹慧莉', 'D05-1', '组4', 'C26041002', 1, '王芳/曹慧莉', 'D05-2', '组5'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '设备&场地')

  const ws2 = XLSX.utils.aoa_to_sheet([
    ['日期', '人员姓名', '项目编号', '设备', '房间号'],
    ['2026-03-01', '林紫倩', 'C26030002', '探头-Tewameter 1', 'D05-1'],
    ['2026-03-01', '王芳', 'C26030003', '探头-Corneometer 2', 'D05-2'],
    ['2026-03-01', '曹慧莉', 'C26030004', '探头-Glossymeter 2', 'D05-3'],
  ])
  XLSX.utils.book_append_sheet(wb, ws2, '补充排班')
  XLSX.writeFile(wb, filePath)
}

test.describe.skip('排程 Excel 导入 - Headed 验证（已移除：我的排程改为实验室月历）', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('导入时应提取目标人员全部日期排班', async ({ page }) => {
    test.setTimeout(120_000)
    const tempXlsx = path.join(os.tmpdir(), `schedule-wide-${Date.now()}.xlsx`)
    buildWideScheduleFixture(tempXlsx)

    let importedRows: Array<Record<string, unknown>> = []
    let importedPerson = ''
    await page.route('**/api/v1/evaluator/schedule/import-notes', async (route) => {
      const body = route.request().postDataJSON() as { rows?: Array<Record<string, unknown>>; person_name?: string }
      importedRows = body?.rows ?? []
      importedPerson = body?.person_name ?? ''
      expect((body as any)?.replace_existing).toBeTruthy()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          msg: `成功导入 ${importedRows.length} 条`,
          data: { created: importedRows.length, errors: [] },
        }),
      })
    })

    await page.goto('/evaluator/schedule')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: '导入 Excel' }).click()
    await page.getByPlaceholder('如：林紫倩').fill('林紫倩')
    await page.locator('input[type=\"file\"]').setInputFiles(tempXlsx)
    await page.getByRole('button', { name: '确认导入' }).click()
    await expect(page.getByText(/成功导入 \d+ 条/)).toBeVisible({ timeout: 10000 })

    expect(importedPerson).toBe('林紫倩')
    expect(importedRows.length).toBeGreaterThanOrEqual(3)
    const dates = new Set(importedRows.map((r) => String(r['日期'] ?? '')))
    expect(dates.has('2026-02-27')).toBeTruthy()
    expect(dates.has('2026-02-28')).toBeTruthy()
    const allMatched = importedRows.every((r) => String(r['人员姓名'] ?? '').includes('林紫倩'))
    expect(allMatched).toBeTruthy()

    if (fs.existsSync(tempXlsx)) fs.unlinkSync(tempXlsx)
  })

  test('多技术员姓名筛选逻辑应一致', async ({ page }) => {
    test.setTimeout(120_000)
    const tempXlsx = path.join(os.tmpdir(), `schedule-wide-multi-${Date.now()}.xlsx`)
    buildWideScheduleFixture(tempXlsx)
    const targets = ['林紫倩', '王芳', '曹慧莉']

    for (const target of targets) {
      let importedRows: Array<Record<string, unknown>> = []
      await page.goto('/evaluator/schedule')
      await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: '导入 Excel' }).click()
      await page.unroute('**/api/v1/evaluator/schedule/import-notes')
      await page.route('**/api/v1/evaluator/schedule/import-notes', async (route) => {
        const body = route.request().postDataJSON() as { rows?: Array<Record<string, unknown>>; person_name?: string }
        importedRows = body?.rows ?? []
        expect(body?.person_name).toBe(target)
        expect((body as any)?.replace_existing).toBeTruthy()
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 0,
            msg: `成功导入 ${importedRows.length} 条`,
            data: { created: importedRows.length, errors: [] },
          }),
        })
      })

      await page.getByPlaceholder('如：林紫倩').fill(target)
      await page.locator('input[type=\"file\"]').setInputFiles(tempXlsx)
      await page.getByRole('button', { name: '确认导入' }).click()
      await expect(page.getByText(/成功导入 \d+ 条/)).toBeVisible({ timeout: 10000 })
      expect(importedRows.length).toBeGreaterThan(0)
      const allMatched = importedRows.every((r) => String(r['人员姓名'] ?? '').includes(target))
      expect(allMatched, JSON.stringify(importedRows.slice(0, 10))).toBeTruthy()
      await page.getByRole('button', { name: '取消' }).click()
    }

    if (fs.existsSync(tempXlsx)) fs.unlinkSync(tempXlsx)
  })
})
