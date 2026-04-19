import * as XLSX from 'xlsx'
import type { DividendReport, DividendSummary, ExchangeRate, Currency } from '../types'

function cellVal(row: unknown[], idx: number): string {
  const v = row[idx]
  if (v == null) return ''
  return String(v).trim()
}

function cellNum(row: unknown[], idx: number): number {
  const v = row[idx]
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function parseCurrency(raw: string): Currency {
  const c = raw.trim().toUpperCase()
  if (c === 'USD') return 'USD'
  if (c === 'CNY' || c === 'RMB') return 'CNY'
  return 'HKD'
}

function sheetToRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
}

function parseDividendSummaries(wb: XLSX.WorkBook, year: number): DividendSummary[] {
  const rows = sheetToRows(wb, '股息、利息及其他收入')
  const result: DividendSummary[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !cellVal(r, 0)) continue
    result.push({
      accountName: cellVal(r, 2),
      year,
      dividends: cellNum(r, 3),
      interest: cellNum(r, 4),
      otherIncome: cellNum(r, 5),
      currency: parseCurrency(cellVal(r, 6)),
    })
  }
  return result
}

function parseExchangeRates(wb: XLSX.WorkBook, year: number): ExchangeRate[] {
  const rows = sheetToRows(wb, '参考汇率')
  const result: ExchangeRate[] = []

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i]
    const monthStr = cellVal(r, 0)
    if (!monthStr || monthStr.startsWith('*')) continue

    const usdToHkd = cellNum(r, 1)
    const hkdToCnyRaw = cellNum(r, 8)
    const hkdToCny = hkdToCnyRaw > 1 ? hkdToCnyRaw / 100 : hkdToCnyRaw

    if (usdToHkd > 0) {
      result.push({
        year,
        month: monthStr,
        usdToHkd,
        hkdToCny,
      })
    }
  }
  return result
}

export function parseDividendReport(buffer: ArrayBuffer, filename: string): DividendReport {
  const wb = XLSX.read(buffer, { type: 'array' })

  const yearMatch = filename.match(/^(\d{4})/)
  const year = yearMatch ? Number(yearMatch[1]) : 0

  const summaries = parseDividendSummaries(wb, year)
  const exchangeRates = parseExchangeRates(wb, year)

  return {
    year,
    summaries,
    exchangeRates,
  }
}
