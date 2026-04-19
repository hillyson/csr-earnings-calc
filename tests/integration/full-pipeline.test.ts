/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseAnnualStatement, parseDividendReport } from '../../src/lib/parser'
import { calculateYearlyReport } from '../../src/lib/calculator'
import type { ParsedData } from '../../src/lib/types'

const DATA_DIR = resolve(__dirname, '../../富途年度结单')

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

function loadAllData(): ParsedData {
  const years = [2021, 2022, 2023, 2024]
  const data: ParsedData = { annualStatements: [], dividendReports: [] }

  for (const year of years) {
    const annualFile = readFileSync(resolve(DATA_DIR, `${year}_年度账单_14621048.xlsx`))
    data.annualStatements.push(
      parseAnnualStatement(toArrayBuffer(annualFile), `${year}_年度账单_14621048.xlsx`)
    )

    const dividendFile = readFileSync(resolve(DATA_DIR, `${year}_利息股息及其他收入汇总_14621048.xlsx`))
    data.dividendReports.push(
      parseDividendReport(toArrayBuffer(dividendFile), `${year}_利息股息及其他收入汇总_14621048.xlsx`)
    )
  }

  data.annualStatements.sort((a, b) => a.year - b.year)
  data.dividendReports.sort((a, b) => a.year - b.year)

  return data
}

describe('full pipeline integration', () => {
  const data = loadAllData()

  it('should parse all 4 annual statements', () => {
    expect(data.annualStatements).toHaveLength(4)
    expect(data.annualStatements.map(s => s.year)).toEqual([2021, 2022, 2023, 2024])
  })

  it('should parse all 4 dividend reports', () => {
    expect(data.dividendReports).toHaveLength(4)
    expect(data.dividendReports.map(r => r.year)).toEqual([2021, 2022, 2023, 2024])
  })

  it('should have exchange rates in dividend reports', () => {
    for (const report of data.dividendReports) {
      expect(report.exchangeRates.length).toBeGreaterThan(0)
      for (const rate of report.exchangeRates) {
        expect(rate.usdToHkd).toBeGreaterThan(0)
        expect(rate.hkdToCny).toBeGreaterThan(0)
        expect(rate.hkdToCny).toBeLessThan(2)
      }
    }
  })

  it('should have trades in annual statements', () => {
    for (const stmt of data.annualStatements) {
      expect(stmt.trades.length).toBeGreaterThanOrEqual(0)
    }
    const totalTrades = data.annualStatements.reduce((sum, s) => sum + s.trades.length, 0)
    expect(totalTrades).toBeGreaterThan(0)
  })

  for (const year of [2021, 2022, 2023, 2024]) {
    describe(`year ${year} report`, () => {
      const report = calculateYearlyReport(data, year)

      it('should have correct year', () => {
        expect(report.year).toBe(year)
      })

      it('should have non-negative estimated tax', () => {
        expect(report.totalEstimatedTax).toBeGreaterThanOrEqual(0)
      })

      it('should have stock summary', () => {
        expect(report.stock).toBeDefined()
        expect(report.stock.year).toBe(year)
        expect(report.stock.netTaxableIncomeCny).toBeGreaterThanOrEqual(0)
        expect(report.stock.estimatedTax).toBeCloseTo(report.stock.netTaxableIncomeCny * 0.2)
        expect(report.stock.optionStockGains).toBeDefined()
        expect(Array.isArray(report.stock.optionStockGains)).toBe(true)
      })

      it('should have fund summary', () => {
        expect(report.fund).toBeDefined()
        expect(report.fund.year).toBe(year)
        for (const g of report.fund.gains) {
          expect(g.startValue).toBeGreaterThanOrEqual(0)
          expect(g.endValue).toBeGreaterThanOrEqual(0)
          expect(g.buyAmount).toBeGreaterThanOrEqual(0)
          expect(g.sellAmount).toBeGreaterThanOrEqual(0)
        }
      })

      it('should have dividend summary', () => {
        expect(report.dividend).toBeDefined()
        expect(report.dividend.year).toBe(year)
        expect(report.dividend.netTaxPayable).toBeGreaterThanOrEqual(0)
      })

      it('should have data sources', () => {
        expect(report.dataSources.length).toBeGreaterThan(0)
      })

      it('should compute totalTaxableIncomeCny correctly', () => {
        const expected = report.stock.netTaxableIncomeCny +
          Math.max(0, report.fund.totalGainCny) +
          report.dividend.totalDividendCny
        expect(report.totalTaxableIncomeCny).toBeCloseTo(expected)
      })

      it('should compute totalEstimatedTax correctly', () => {
        const expected = report.stock.estimatedTax +
          report.fund.estimatedTax +
          report.dividend.netTaxPayable
        expect(report.totalEstimatedTax).toBeCloseTo(expected)
      })

      it('should have validation result', () => {
        expect(report.validation).toBeDefined()
        expect(report.validation!.year).toBe(year)
        expect(report.validation!.differenceRate).toBeGreaterThanOrEqual(0)
        expect(typeof report.validation!.isReasonable).toBe('boolean')
        expect(report.validation!.details.length).toBeGreaterThan(0)
        expect(report.validation!.unrealizedPnlCny).toBeDefined()
        expect(typeof report.validation!.unrealizedPnlCny).toBe('number')
      })

      it('should have cash flow classification in validation', () => {
        expect(report.validation!.externalCashFlowCny).toBeDefined()
        expect(report.validation!.internalCashFlowCny).toBeDefined()
        expect(report.validation!.cashFlowCategoryCounts).toBeDefined()
        expect(typeof report.validation!.externalCashFlowCny).toBe('number')
        expect(typeof report.validation!.internalCashFlowCny).toBe('number')
      })
    })
  }

  describe('multi-year cost basis accuracy', () => {
    const report2024 = calculateYearlyReport(data, 2024)

    it('should have reasonable validation difference with all years loaded', () => {
      expect(report2024.validation!.differenceRate).toBeLessThan(0.15)
    })

    it('should track option stock gains separately', () => {
      expect(report2024.stock.optionStockGains).toBeDefined()
      expect(report2024.stock.optionStockTotalGainCny).toBeDefined()
    })

    it('should include unrealized P&L in validation', () => {
      expect(report2024.validation!.unrealizedPnlCny).toBeDefined()
      expect(report2024.validation!.unrealizedPnlHkd).toBeDefined()
    })
  })
})
