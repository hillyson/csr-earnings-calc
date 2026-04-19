import type {
  ParsedData,
  YearlyTaxReport,
  StockSummary,
  FundSummary,
  DividendTaxSummary,
  RealizedGain,
  FundGain,
  ExchangeRate,
  ValidationWarning,
  ValidationResult,
  AnnualStatement,
  CashFlow,
} from '../types'
import {
  createCostTracker,
  processAssetTransfers,
  processTrades,
  isOptionExercise,
  resolveKey,
  type CostTrackerState,
} from './cost-tracker'
import { convertToCny, convertToHkd, findExchangeRate } from './fx-converter'

function getAllExchangeRates(data: ParsedData): ExchangeRate[] {
  return data.dividendReports.flatMap(r => r.exchangeRates)
}

function isOptionSymbol(symbol: string, transfers: AnnualStatement['assetTransfers'][]): boolean {
  return transfers.flat().some(
    t => t.symbol === symbol && isOptionExercise(t)
  )
}

function buildCostTrackerBeforeYear(
  data: ParsedData,
  targetYear: number,
): CostTrackerState {
  let state = createCostTracker()
  const priorStatements = [...data.annualStatements]
    .filter(s => s.year < targetYear)
    .sort((a, b) => a.year - b.year)

  for (const stmt of priorStatements) {
    state = processAssetTransfers(
      state,
      stmt.assetTransfers,
      stmt.cashFlows,
      stmt.year,
    )

    const { state: newState } = processTrades(state, stmt.trades)
    state = newState
  }

  return state
}

function calculateStockSummary(
  data: ParsedData,
  targetYear: number,
  rates: ExchangeRate[],
): { summary: StockSummary; costTrackerState: CostTrackerState; preYearCostState: CostTrackerState } {
  const rate = findExchangeRate(rates, targetYear)
  const targetStatement = data.annualStatements.find(s => s.year === targetYear)
  if (!targetStatement) {
    return {
      summary: {
        year: targetYear,
        totalGainHkd: 0,
        totalGainUsd: 0,
        totalGainCny: 0,
        totalFeesCny: 0,
        netTaxableIncomeCny: 0,
        estimatedTax: 0,
        realizedGains: [],
        unrealizedPositions: [],
        optionStockGains: [],
        optionStockTotalGainHkd: 0,
        optionStockTotalGainCny: 0,
      },
      costTrackerState: createCostTracker(),
      preYearCostState: createCostTracker(),
    }
  }

  const preYearCostState = buildCostTrackerBeforeYear(data, targetYear)
  let costState = preYearCostState

  costState = processAssetTransfers(
    costState,
    targetStatement.assetTransfers,
    targetStatement.cashFlows,
    targetYear,
  )

  const allTransfers = data.annualStatements.map(s => s.assetTransfers)

  const stockTrades = targetStatement.trades.filter(t => t.category !== '基金')

  const { state: finalState, sells } = processTrades(costState, stockTrades)

  const regularSells = sells.filter(s => !isOptionSymbol(s.symbol, allTransfers))
  const optionSells = sells.filter(s => isOptionSymbol(s.symbol, allTransfers))

  const realizedGains: RealizedGain[] = regularSells.map(sell => {
    const gain = sell.amount - sell.costBasis - sell.fees
    return {
      symbol: sell.symbol,
      market: sell.market,
      currency: sell.currency,
      sellDate: sell.time.split(' ')[0],
      sellQuantity: sell.quantity,
      sellPrice: sell.price,
      sellAmount: sell.amount,
      costBasis: sell.costBasis,
      fees: sell.fees,
      gain,
      gainCny: convertToCny(gain, sell.currency, rate),
    }
  })

  const optionStockGains: RealizedGain[] = optionSells.map(sell => {
    const gain = sell.amount - sell.costBasis - sell.fees
    return {
      symbol: sell.symbol,
      market: sell.market,
      currency: sell.currency,
      sellDate: sell.time.split(' ')[0],
      sellQuantity: sell.quantity,
      sellPrice: sell.price,
      sellAmount: sell.amount,
      costBasis: sell.costBasis,
      fees: sell.fees,
      gain,
      gainCny: convertToCny(gain, sell.currency, rate),
      isOptionStock: true,
    }
  })

  let totalGainHkd = 0
  let totalGainUsd = 0
  let totalGainCny = 0
  let totalFeesCny = 0

  for (const g of realizedGains) {
    if (g.currency === 'HKD') totalGainHkd += g.gain
    if (g.currency === 'USD') totalGainUsd += g.gain
    totalGainCny += g.gainCny
    totalFeesCny += convertToCny(g.fees, g.currency, rate)
  }

  let optionStockTotalGainHkd = 0
  let optionStockTotalGainCny = 0
  for (const g of optionStockGains) {
    if (g.currency === 'HKD') optionStockTotalGainHkd += g.gain
    optionStockTotalGainCny += g.gainCny
  }

  const netTaxableIncomeCny = Math.max(0, totalGainCny)
  const estimatedTax = netTaxableIncomeCny * 0.2

  return {
    summary: {
      year: targetYear,
      totalGainHkd,
      totalGainUsd,
      totalGainCny,
      totalFeesCny,
      netTaxableIncomeCny,
      estimatedTax,
      realizedGains,
      unrealizedPositions: Array.from(finalState.positions.values()),
      optionStockGains,
      optionStockTotalGainHkd,
      optionStockTotalGainCny,
    },
    costTrackerState: finalState,
    preYearCostState,
  }
}

function calculateFundSummary(
  data: ParsedData,
  targetYear: number,
  rates: ExchangeRate[],
): FundSummary {
  const rate = findExchangeRate(rates, targetYear)
  const targetStatement = data.annualStatements.find(s => s.year === targetYear)
  if (!targetStatement) {
    return { year: targetYear, totalGainHkd: 0, totalGainCny: 0, estimatedTax: 0, gains: [] }
  }

  const fundHoldings = targetStatement.holdings.filter(h => h.category === '基金')
  const holdingValues = new Map<string, { start: number; end: number }>()
  for (const h of fundHoldings) {
    const val = holdingValues.get(h.symbol) || { start: 0, end: 0 }
    const marketValue = h.quantity * h.price * h.multiplier
    if (h.periodType === 'start') {
      val.start += marketValue
    } else {
      val.end += marketValue
    }
    holdingValues.set(h.symbol, val)
  }

  const fundTrades = targetStatement.trades.filter(t => t.category === '基金')
  const tradeFlows = new Map<string, { totalBought: number; totalSold: number }>()
  for (const trade of fundTrades) {
    const existing = tradeFlows.get(trade.symbol) || { totalBought: 0, totalSold: 0 }
    if (trade.direction === 'buy') {
      existing.totalBought += trade.amount
    } else {
      existing.totalSold += trade.amount
    }
    tradeFlows.set(trade.symbol, existing)
  }

  const allSymbols = new Set([...holdingValues.keys(), ...tradeFlows.keys()])

  const gains: FundGain[] = []
  let totalGainHkd = 0

  for (const symbol of allSymbols) {
    const hv = holdingValues.get(symbol) || { start: 0, end: 0 }
    const tf = tradeFlows.get(symbol) || { totalBought: 0, totalSold: 0 }
    const gain = (tf.totalSold + hv.end) - (tf.totalBought + hv.start)
    totalGainHkd += gain
    gains.push({
      symbol,
      currency: 'HKD',
      startValue: hv.start,
      endValue: hv.end,
      buyAmount: tf.totalBought,
      sellAmount: tf.totalSold,
      gain,
      gainCny: convertToCny(gain, 'HKD', rate),
    })
  }

  const totalGainCny = convertToCny(totalGainHkd, 'HKD', rate)
  const estimatedTax = Math.max(0, totalGainCny) * 0.2

  return {
    year: targetYear,
    totalGainHkd,
    totalGainCny,
    estimatedTax,
    gains,
  }
}

function calculateDividendTaxSummary(
  data: ParsedData,
  targetYear: number,
  rates: ExchangeRate[],
): DividendTaxSummary {
  const rate = findExchangeRate(rates, targetYear)
  const dividendReport = data.dividendReports.find(r => r.year === targetYear)
  if (!dividendReport) {
    return {
      year: targetYear,
      totalDividendHkd: 0,
      totalDividendCny: 0,
      withheldTax: 0,
      taxDue: 0,
      netTaxPayable: 0,
      details: [],
    }
  }

  const details: DividendTaxSummary['details'] = []
  let totalDividendHkd = 0

  for (const summary of dividendReport.summaries) {
    const total = summary.dividends + summary.interest + summary.otherIncome
    if (total <= 0) continue

    const totalInHkd = summary.currency === 'HKD'
      ? total
      : summary.currency === 'USD' && rate
        ? total * rate.usdToHkd
        : total

    totalDividendHkd += totalInHkd

    let withheldRate = 0
    const accountLower = summary.accountName.toLowerCase()
    if (accountLower.includes('美股') || accountLower.includes('us')) {
      withheldRate = 0.10
    } else if (accountLower.includes('h股') || accountLower.includes('红筹')) {
      withheldRate = 0.10
    }

    const amountCny = convertToCny(totalInHkd, 'HKD', rate)
    const withheldAmount = amountCny * withheldRate
    const taxDue = amountCny * 0.20
    const netPayable = taxDue - withheldAmount

    details.push({
      source: summary.accountName,
      currency: summary.currency,
      amount: total,
      amountCny,
      withheldRate,
      withheldAmount,
      taxRate: 0.20,
      taxDue,
      netPayable: Math.max(0, netPayable),
    })
  }

  const totalDividendCny = convertToCny(totalDividendHkd, 'HKD', rate)
  const taxDue = totalDividendCny * 0.20
  const withheldTax = details.reduce((sum, d) => sum + d.withheldAmount, 0)
  const netTaxPayable = Math.max(0, taxDue - withheldTax)

  return {
    year: targetYear,
    totalDividendHkd,
    totalDividendCny,
    withheldTax,
    taxDue,
    netTaxPayable,
    details,
  }
}

export type CashFlowCategory =
  | 'DEPOSIT_WITHDRAWAL'
  | 'IPO'
  | 'DIVIDEND'
  | 'FEE'
  | 'INTEREST'
  | 'OPTION_FEE'
  | 'ACCOUNT_UPGRADE'
  | 'CURRENCY_EXCHANGE'
  | 'SETTLEMENT'
  | 'REFUND'

export function classifyCashFlow(cf: CashFlow): CashFlowCategory {
  if (cf.type === '账户升级') return 'ACCOUNT_UPGRADE'

  const r = cf.remark.toUpperCase()

  if (r.includes('IPO APPLICATION AMOUNT') || r.includes('IPO REFUND AMOUNT')
    || r.includes('IPO APPLICATION HANDLING FEE') || r.includes('IPO FINANCING INTEREST')) {
    return 'IPO'
  }
  if (/\d+\s+[FI]\/D-/.test(r)) return 'DIVIDEND'
  if (r.includes('OPTION EXERCISE')) return 'OPTION_FEE'
  if (r.startsWith('TRANSFER FROM') || r.startsWith('TRANSFER TO')) return 'CURRENCY_EXCHANGE'
  if (r.includes('UNIFIED SETTLEMENT')) return 'SETTLEMENT'
  if (r.includes('INTEREST FOR MONTH') || r === 'REFUND INTEREST') return 'INTEREST'
  if (r.includes('HANDLING CHARGE') || r.includes('SCRIP CHARGE') || r.includes('ADR FEE')
    || r.includes('REFUND OF ADR FEE') || r.includes('REFUND ADR FEE')
    || r.includes('CCASS SCRIP FEE') || r.includes('HANDING FEE')) {
    return 'FEE'
  }
  if (r.includes('ACCOUNT UPGRADE')) return 'ACCOUNT_UPGRADE'
  if (r.includes('REFUND')) return 'REFUND'

  return 'DEPOSIT_WITHDRAWAL'
}

function calculateValidation(
  data: ParsedData,
  targetYear: number,
  rates: ExchangeRate[],
  calculatedIncome: number,
  costTrackerState?: CostTrackerState,
  preYearCostState?: CostTrackerState,
  optionStockGainCny?: number,
  optionStockGainHkd?: number,
): ValidationResult {
  const rate = findExchangeRate(rates, targetYear)
  const targetStatement = data.annualStatements.find(s => s.year === targetYear)

  if (!targetStatement || targetStatement.holdings.length === 0) {
    return {
      year: targetYear,
      startTotalHkd: 0,
      endTotalHkd: 0,
      netAssetChangeHkd: 0,
      netCashFlowHkd: 0,
      startTotalCny: 0,
      endTotalCny: 0,
      netAssetChange: 0,
      calculatedIncome,
      netCashFlowCny: 0,
      difference: 0,
      differenceRate: 0,
      isReasonable: false,
      details: [],
    }
  }

  let startTotalCny = 0
  let endTotalCny = 0
  let startTotalHkd = 0
  let endTotalHkd = 0
  const details: ValidationResult['details'] = []

  for (const h of targetStatement.holdings) {
    const value = h.quantity * h.price * h.multiplier
    const valueCny = convertToCny(value, h.currency, rate)
    const valueHkd = convertToHkd(value, h.currency, rate)
    if (h.periodType === 'start') {
      startTotalCny += valueCny
      startTotalHkd += valueHkd
    } else {
      endTotalCny += valueCny
      endTotalHkd += valueHkd
    }
  }

  for (const cb of targetStatement.cashBalances) {
    const valueCny = convertToCny(cb.amount, cb.currency, rate)
    const valueHkd = convertToHkd(cb.amount, cb.currency, rate)
    if (cb.periodType === 'start') {
      startTotalCny += valueCny
      startTotalHkd += valueHkd
    } else {
      endTotalCny += valueCny
      endTotalHkd += valueHkd
    }
  }

  let netCashFlowCny = 0
  let netCashFlowHkd = 0
  let internalCashFlowCny = 0
  let internalCashFlowHkd = 0
  const categoryCounts: Record<string, number> = {}

  for (const cf of targetStatement.cashFlows) {
    const category = classifyCashFlow(cf)
    categoryCounts[category] = (categoryCounts[category] || 0) + 1

    const amountCny = convertToCny(cf.amount, cf.currency, rate)
    const amountHkd = convertToHkd(cf.amount, cf.currency, rate)
    const signedCny = cf.direction === 'In' ? amountCny : -amountCny
    const signedHkd = cf.direction === 'In' ? amountHkd : -amountHkd

    if (category === 'DEPOSIT_WITHDRAWAL') {
      netCashFlowCny += signedCny
      netCashFlowHkd += signedHkd
    } else {
      internalCashFlowCny += signedCny
      internalCashFlowHkd += signedHkd
    }
  }

  let endUnrealizedHkd = 0
  let endUnrealizedCny = 0
  let startUnrealizedHkd = 0
  let startUnrealizedCny = 0
  if (costTrackerState) {
    const endHoldings = targetStatement.holdings.filter(
      h => h.periodType === 'end' && h.category !== '基金',
    )
    for (const h of endHoldings) {
      const key = resolveKey(h.symbol, h.market)
      const position = costTrackerState.positions.get(key)
      const marketValue = h.quantity * h.price * h.multiplier
      const costBasis = position ? position.totalCost : 0
      const pnlLocal = marketValue - costBasis
      endUnrealizedHkd += convertToHkd(pnlLocal, h.currency, rate)
      endUnrealizedCny += convertToCny(pnlLocal, h.currency, rate)
    }
  }
  if (preYearCostState) {
    const startHoldings = targetStatement.holdings.filter(
      h => h.periodType === 'start' && h.category !== '基金',
    )
    for (const h of startHoldings) {
      const key = resolveKey(h.symbol, h.market)
      const position = preYearCostState.positions.get(key)
      const marketValue = h.quantity * h.price * h.multiplier
      const costBasis = position ? position.totalCost : 0
      const pnlLocal = marketValue - costBasis
      startUnrealizedHkd += convertToHkd(pnlLocal, h.currency, rate)
      startUnrealizedCny += convertToCny(pnlLocal, h.currency, rate)
    }
  }
  const unrealizedPnlHkd = endUnrealizedHkd - startUnrealizedHkd
  const unrealizedPnlCny = endUnrealizedCny - startUnrealizedCny

  const netAssetChange = endTotalCny - startTotalCny
  const netAssetChangeHkd = endTotalHkd - startTotalHkd
  const adjustedIncome = calculatedIncome + unrealizedPnlCny + (optionStockGainCny ?? 0)
  const difference = adjustedIncome - (netAssetChange - netCashFlowCny)
  const denominator = Math.max(Math.abs(netAssetChange), Math.abs(adjustedIncome), 1)
  const differenceRate = Math.abs(difference) / denominator

  details.push({ label: '期初总资产', valueCny: startTotalCny, valueHkd: startTotalHkd })
  details.push({ label: '期末总资产', valueCny: endTotalCny, valueHkd: endTotalHkd })
  details.push({ label: '账户净值变化', valueCny: netAssetChange, valueHkd: netAssetChangeHkd })
  details.push({ label: '净资金流入（外部）', valueCny: netCashFlowCny, valueHkd: netCashFlowHkd })
  details.push({ label: '内部资金流动（已排除）', valueCny: internalCashFlowCny, valueHkd: internalCashFlowHkd })
  details.push({ label: '计算总收益（已实现）', valueCny: calculatedIncome })
  details.push({ label: '未实现盈亏', valueCny: unrealizedPnlCny, valueHkd: unrealizedPnlHkd })
  if (optionStockGainCny) {
    details.push({ label: '期权股票收益（已单独完税）', valueCny: optionStockGainCny, valueHkd: optionStockGainHkd })
  }
  details.push({ label: '差额', valueCny: difference })

  return {
    year: targetYear,
    startTotalHkd,
    endTotalHkd,
    netAssetChangeHkd,
    netCashFlowHkd,
    startTotalCny,
    endTotalCny,
    netAssetChange,
    calculatedIncome,
    netCashFlowCny,
    difference,
    differenceRate,
    isReasonable: differenceRate < 0.3,
    details,
    externalCashFlowCny: netCashFlowCny,
    internalCashFlowCny,
    cashFlowCategoryCounts: categoryCounts,
    unrealizedPnlHkd,
    unrealizedPnlCny,
    optionStockGainHkd: optionStockGainHkd ?? 0,
    optionStockGainCny: optionStockGainCny ?? 0,
  }
}

export function calculateYearlyReport(
  data: ParsedData,
  targetYear: number,
): YearlyTaxReport {
  const rates = getAllExchangeRates(data)
  const { summary: stock, costTrackerState, preYearCostState } = calculateStockSummary(data, targetYear, rates)
  const fund = calculateFundSummary(data, targetYear, rates)
  const dividend = calculateDividendTaxSummary(data, targetYear, rates)

  const allWarnings: ValidationWarning[] = []
  const seenMessages = new Set<string>()
  for (const w of costTrackerState.warnings) {
    if (w.year !== targetYear && w.year !== 0) continue
    if (seenMessages.has(w.message)) continue
    seenMessages.add(w.message)
    allWarnings.push(w)
  }

  const dataSources: string[] = []
  for (const stmt of data.annualStatements) {
    dataSources.push(`${stmt.year}_年度账单`)
  }
  for (const report of data.dividendReports) {
    dataSources.push(`${report.year}_利息股息及其他收入汇总`)
  }

  const totalTaxableIncomeCny = stock.netTaxableIncomeCny +
    Math.max(0, fund.totalGainCny) +
    dividend.totalDividendCny

  const totalEstimatedTax = stock.estimatedTax +
    fund.estimatedTax +
    dividend.netTaxPayable

  return {
    year: targetYear,
    stock,
    fund,
    dividend,
    totalTaxableIncomeCny,
    totalEstimatedTax,
    dataSources,
    warnings: allWarnings,
    validation: calculateValidation(
      data, targetYear, rates,
      stock.totalGainCny + fund.totalGainCny + dividend.totalDividendCny,
      costTrackerState,
      preYearCostState,
      stock.optionStockTotalGainCny,
      stock.optionStockTotalGainHkd,
    ),
  }
}
