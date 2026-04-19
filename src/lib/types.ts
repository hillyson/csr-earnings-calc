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

export interface CashBalance {
  periodType: 'start' | 'end'
  date: string
  accountName: string
  accountId: string
  currency: Currency
  amount: number
}

export interface AnnualStatement {
  year: number
  accounts: AccountInfo[]
  holdings: Holding[]
  trades: Trade[]
  assetTransfers: AssetTransfer[]
  cashFlows: CashFlow[]
  cashBalances: CashBalance[]
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
  isOptionStock?: boolean
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
  isOptionStock?: boolean
} {
  year: number
  totalGainHkd: number
  totalGainUsd: number
  totalGainCny: number
  totalFeesCny: number
  netTaxableIncomeCny: number
  estimatedTax: number
  realizedGains: RealizedGain[]
  unrealizedPositions: StockPosition[]
  optionStockGains: RealizedGain[]
  optionStockTotalGainHkd: number
  optionStockTotalGainCny: number
}

export interface FundGain {
  symbol: string
  currency: Currency
  startValue: number
  endValue: number
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
  validation?: ValidationResult
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

export interface ValidationResult {
  year: number
  startTotalHkd: number
  endTotalHkd: number
  netAssetChangeHkd: number
  netCashFlowHkd: number
  startTotalCny: number
  endTotalCny: number
  netAssetChange: number
  calculatedIncome: number
  netCashFlowCny: number
  difference: number
  differenceRate: number
  isReasonable: boolean
  details: Array<{ label: string; valueCny: number; valueHkd?: number }>
  externalCashFlowCny?: number
  internalCashFlowCny?: number
  cashFlowCategoryCounts?: Record<string, number>
  unrealizedPnlHkd?: number
  unrealizedPnlCny?: number
  optionStockGainHkd?: number
  optionStockGainCny?: number
}
