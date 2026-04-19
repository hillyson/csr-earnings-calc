export type Currency = 'HKD' | 'USD' | 'CNY'
export type Market = 'SEHK' | 'US' | 'FD' | '-'
export type AssetType = 'stock' | 'fund'
export type TradeDirection = 'buy' | 'sell'

export interface AccountInfo {
  name: string
  accountId: string
  accountName: string
  year: number
}

export interface Holding {
  periodType: 'start' | 'end'
  date: string
  category: string
  accountName: string
  accountId: string
  symbol: string
  market: Market
  currency: Currency
  quantity: number
  price: number
  multiplier: number
}

export interface Trade {
  time: string
  accountName: string
  accountId: string
  category: string
  symbol: string
  market: Market
  direction: TradeDirection
  settlementDate: string
  currency: Currency
  quantity: number
  price: number
  amount: number
  fees: number
  netAmount: number
}

export interface AssetTransfer {
  date: string
  accountName: string
  accountId: string
  category: string
  symbol: string
  market: Market
  direction: 'In' | 'Out'
  type: string
  currency: Currency
  quantity: number
  remark: string
}

export interface CashFlow {
  date: string
  accountName: string
  accountId: string
  type: string
  direction: 'In' | 'Out'
  currency: Currency
  amount: number
  remark: string
}

export interface DividendSummary {
  accountName: string
  year: number
  dividends: number
  interest: number
  otherIncome: number
  currency: Currency
}

export interface ExchangeRate {
  year: number
  month: string
  usdToHkd: number
  hkdToCny: number
}

export interface AnnualStatement {
  year: number
  accounts: AccountInfo[]
  holdings: Holding[]
  trades: Trade[]
  assetTransfers: AssetTransfer[]
  cashFlows: CashFlow[]
  fundBalanceStart: Record<string, number>
  fundBalanceEnd: Record<string, number>
}

export interface DividendReport {
  year: number
  summaries: DividendSummary[]
  exchangeRates: ExchangeRate[]
}

export interface ParsedData {
  annualStatements: AnnualStatement[]
  dividendReports: DividendReport[]
}

export interface StockPosition {
  symbol: string
  market: Market
  currency: Currency
  quantity: number
  avgCost: number
  totalCost: number
}

export interface RealizedGain {
  symbol: string
  market: Market
  currency: Currency
  sellDate: string
  sellQuantity: number
  sellPrice: number
  sellAmount: number
  costBasis: number
  fees: number
  gain: number
  gainCny: number
}

export interface StockSummary {
  year: number
  totalGainHkd: number
  totalGainUsd: number
  totalGainCny: number
  totalFeesCny: number
  netTaxableIncomeCny: number
  estimatedTax: number
  realizedGains: RealizedGain[]
  unrealizedPositions: StockPosition[]
}

export interface FundGain {
  symbol: string
  currency: Currency
  buyDate: string
  sellDate: string
  buyAmount: number
  sellAmount: number
  gain: number
  gainCny: number
}

export interface FundSummary {
  year: number
  totalGainHkd: number
  totalGainCny: number
  estimatedTax: number
  gains: FundGain[]
}

export interface DividendTaxSummary {
  year: number
  totalDividendHkd: number
  totalDividendCny: number
  withheldTax: number
  taxDue: number
  netTaxPayable: number
  details: Array<{
    source: string
    currency: Currency
    amount: number
    amountCny: number
    withheldRate: number
    withheldAmount: number
    taxRate: number
    taxDue: number
    netPayable: number
  }>
}

export interface YearlyTaxReport {
  year: number
  stock: StockSummary
  fund: FundSummary
  dividend: DividendTaxSummary
  totalTaxableIncomeCny: number
  totalEstimatedTax: number
  dataSources: string[]
  warnings: ValidationWarning[]
}

export interface ValidationWarning {
  type: 'missing_cost' | 'unmatched_ipo' | 'symbol_change' | 'account_migration' | 'excluded_option'
  symbol: string
  message: string
  year: number
}

export interface YearComparison {
  years: number[]
  stockGains: number[]
  fundGains: number[]
  dividends: number[]
  totalTax: number[]
}
