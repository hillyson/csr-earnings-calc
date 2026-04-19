import * as XLSX from 'xlsx'
import type {
  AnnualStatement,
  AccountInfo,
  Holding,
  Trade,
  AssetTransfer,
  CashFlow,
  Market,
  Currency,
  TradeDirection,
} from '../types'

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

function parseMarket(raw: string): Market {
  const m = raw.trim().toUpperCase()
  if (m === 'SEHK' || m === 'HK') return 'SEHK'
  if (m === 'US') return 'US'
  if (m === 'FD') return 'FD'
  return '-'
}

function parseCurrency(raw: string): Currency {
  const c = raw.trim().toUpperCase()
  if (c === 'USD') return 'USD'
  if (c === 'CNY' || c === 'RMB') return 'CNY'
  return 'HKD'
}

function parseDirection(raw: string): TradeDirection {
  const d = raw.trim()
  if (d.includes('买入') || d.toLowerCase().includes('buy')) return 'buy'
  return 'sell'
}

function sheetToRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
}

function parseAccounts(wb: XLSX.WorkBook): AccountInfo[] {
  const rows = sheetToRows(wb, '账户信息')
  const result: AccountInfo[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !cellVal(r, 0)) continue
    result.push({
      name: cellVal(r, 0),
      accountId: cellVal(r, 2) || cellVal(r, 1),
      accountName: cellVal(r, 3) || cellVal(r, 2),
      year: Number(cellVal(r, 4) || cellVal(r, 3)) || 0,
    })
  }
  return result
}

function parseHoldings(wb: XLSX.WorkBook): Holding[] {
  const rows = sheetToRows(wb, '证券-持仓总览')
  const result: Holding[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !cellVal(r, 0)) continue
    result.push({
      periodType: cellVal(r, 0).includes('期初') ? 'start' : 'end',
      date: cellVal(r, 1),
      category: cellVal(r, 2),
      accountName: cellVal(r, 3),
      accountId: cellVal(r, 4),
      symbol: cellVal(r, 5),
      market: parseMarket(cellVal(r, 6)),
      currency: parseCurrency(cellVal(r, 7)),
      quantity: Math.abs(cellNum(r, 8)),
      price: cellNum(r, 9),
      multiplier: cellNum(r, 10) || 1,
    })
  }
  return result
}

function parseTrades(wb: XLSX.WorkBook): Trade[] {
  const rows = sheetToRows(wb, '证券-交易流水')
  const result: Trade[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !cellVal(r, 0)) continue
    const amount = cellNum(r, 11)
    const fees = Math.abs(cellNum(r, 12))
    const netAmount = cellNum(r, 13) || (amount - fees)
    result.push({
      time: cellVal(r, 0),
      accountName: cellVal(r, 1),
      accountId: cellVal(r, 2),
      category: cellVal(r, 3),
      symbol: cellVal(r, 4),
      market: parseMarket(cellVal(r, 5)),
      direction: parseDirection(cellVal(r, 6)),
      settlementDate: cellVal(r, 7),
      currency: parseCurrency(cellVal(r, 8)),
      quantity: Math.abs(cellNum(r, 9)),
      price: cellNum(r, 10),
      amount: Math.abs(amount),
      fees,
      netAmount,
    })
  }
  return result
}

function parseAssetTransfers(wb: XLSX.WorkBook): AssetTransfer[] {
  const rows = sheetToRows(wb, '证券-资产进出')
  const result: AssetTransfer[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !cellVal(r, 0)) continue
    result.push({
      date: cellVal(r, 0),
      accountName: cellVal(r, 1),
      accountId: cellVal(r, 2),
      category: cellVal(r, 3),
      symbol: cellVal(r, 4),
      market: parseMarket(cellVal(r, 5)),
      direction: cellVal(r, 6) === 'In' ? 'In' : 'Out',
      type: cellVal(r, 7),
      currency: parseCurrency(cellVal(r, 8)),
      quantity: Math.abs(cellNum(r, 9)),
      remark: cellVal(r, 10),
    })
  }
  return result
}

function parseCashFlows(wb: XLSX.WorkBook): CashFlow[] {
  const rows = sheetToRows(wb, '证券-资金进出')
  const result: CashFlow[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !cellVal(r, 0)) continue
    result.push({
      date: cellVal(r, 0),
      accountName: cellVal(r, 1),
      accountId: cellVal(r, 2),
      type: cellVal(r, 3),
      direction: cellVal(r, 4) === 'In' ? 'In' : 'Out',
      currency: parseCurrency(cellVal(r, 5)),
      amount: Math.abs(cellNum(r, 6)),
      remark: cellVal(r, 7),
    })
  }
  return result
}

export function parseAnnualStatement(buffer: ArrayBuffer, filename: string): AnnualStatement {
  const wb = XLSX.read(buffer, { type: 'array' })

  const yearMatch = filename.match(/^(\d{4})/)
  const year = yearMatch ? Number(yearMatch[1]) : 0

  const accounts = parseAccounts(wb)
  const holdings = parseHoldings(wb)
  const trades = parseTrades(wb)
  const assetTransfers = parseAssetTransfers(wb)
  const cashFlows = parseCashFlows(wb)

  return {
    year,
    accounts,
    holdings,
    trades,
    assetTransfers,
    cashFlows,
    fundBalanceStart: {},
    fundBalanceEnd: {},
  }
}
