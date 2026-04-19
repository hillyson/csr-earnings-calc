import { test, expect } from '@playwright/test'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '../../富途年度结单')

test.describe('Tax Calculator E2E', () => {
  test('page loads with correct title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('境外证券收益个税计算器')
    await expect(page.locator('h1')).toContainText('境外证券收益个税计算器')
  })

  test('file uploader is visible on load', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=拖拽文件到此处')).toBeVisible()
  })

  test('upload Excel files and see results', async ({ page }) => {
    await page.goto('/')

    const files = [
      resolve(DATA_DIR, '2021_年度账单_14621048.xlsx'),
      resolve(DATA_DIR, '2021_利息股息及其他收入汇总_14621048.xlsx'),
      resolve(DATA_DIR, '2022_年度账单_14621048.xlsx'),
      resolve(DATA_DIR, '2022_利息股息及其他收入汇总_14621048.xlsx'),
      resolve(DATA_DIR, '2023_年度账单_14621048.xlsx'),
      resolve(DATA_DIR, '2023_利息股息及其他收入汇总_14621048.xlsx'),
      resolve(DATA_DIR, '2024_年度账单_14621048.xlsx'),
      resolve(DATA_DIR, '2024_利息股息及其他收入汇总_14621048.xlsx'),
    ]

    const input = page.locator('input[type="file"]')
    await input.setInputFiles(files)

    await expect(page.locator('text=股票已实现收益')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=预估应缴税额')).toBeVisible()
    await expect(page.locator('text=股票交易明细')).toBeVisible()
  })

  test('year selector switches between years', async ({ page }) => {
    await page.goto('/')

    const files = [
      resolve(DATA_DIR, '2023_年度账单_14621048.xlsx'),
      resolve(DATA_DIR, '2023_利息股息及其他收入汇总_14621048.xlsx'),
      resolve(DATA_DIR, '2024_年度账单_14621048.xlsx'),
      resolve(DATA_DIR, '2024_利息股息及其他收入汇总_14621048.xlsx'),
    ]

    const input = page.locator('input[type="file"]')
    await input.setInputFiles(files)

    await expect(page.locator('text=股票已实现收益')).toBeVisible({ timeout: 10000 })

    await page.locator('button:has-text("2023")').click()
    await expect(page.locator('text=股票已实现收益')).toBeVisible()
  })

  test('export report button is visible after upload', async ({ page }) => {
    await page.goto('/')

    const files = [
      resolve(DATA_DIR, '2024_年度账单_14621048.xlsx'),
      resolve(DATA_DIR, '2024_利息股息及其他收入汇总_14621048.xlsx'),
    ]

    const input = page.locator('input[type="file"]')
    await input.setInputFiles(files)

    await expect(page.locator('text=股票已实现收益')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('button:has-text("导出报告")')).toBeVisible()
  })

  test('stock trades are grouped by symbol with collapsible sections', async ({ page }) => {
    await page.goto('/')

    const files = [
      resolve(DATA_DIR, '2024_年度账单_14621048.xlsx'),
      resolve(DATA_DIR, '2024_利息股息及其他收入汇总_14621048.xlsx'),
    ]

    const input = page.locator('input[type="file"]')
    await input.setInputFiles(files)

    await expect(page.locator('text=股票已实现收益')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=股票交易明细')).toBeVisible()

    const groupButtons = page.locator('button:has-text("笔交易")')
    const count = await groupButtons.count()
    expect(count).toBeGreaterThan(0)

    await groupButtons.first().click()
    await expect(page.locator('th:has-text("卖出日期")')).toBeVisible()
  })

  test('validation card is displayed after upload', async ({ page }) => {
    await page.goto('/')

    const files = [
      resolve(DATA_DIR, '2024_年度账单_14621048.xlsx'),
      resolve(DATA_DIR, '2024_利息股息及其他收入汇总_14621048.xlsx'),
    ]

    const input = page.locator('input[type="file"]')
    await input.setInputFiles(files)

    await expect(page.locator('text=股票已实现收益')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=期初期末对账验证')).toBeVisible({ timeout: 5000 })
    await page.locator('text=期初期末对账验证').scrollIntoViewIfNeeded()
    await expect(page.getByText('期初总资产')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('计算总收益')).toBeVisible()
  })
})
