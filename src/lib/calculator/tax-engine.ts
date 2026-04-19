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
  AnnualStatement,
} from '../types'
import {
  createCostTracker,
  processAssetTransfers,
  processTrades,
  isOptionExercise,
  type CostTrackerState,
} from './cost-tracker'
import { convertToCny, findExchangeRate } from './fx-converter'

function getAllExchangeRates(data: ParsedData): ExchangeRate[] {
  return data.dividendReports.flatMap(r => r.exchangeRates)
}

function isOptionSymbol(symbol: string, transfers: AnnualStatement['assetTransfers'][]): boolean {
  return transfers.flat().some(
    t => t.symbol === symbol && isOptionExercise(t)
  )
}

function buildCostTrackerFromHistory(
  data: ParsedData,
  targetYear: number,
): CostTrackerState {
  let state = createCostTracker()
  const allStatements = [...data.annualStatements].sort((a, b) => a.year - b.year)

  for (const stmt of allStatements) {
    if (stmt.year > targetYear) break

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
): StockSummary {
  const rate = findExchangeRate(rates, targetYear)
  const targetStatement = data.annualStatements.find(s => s.year === targetYear)
  if (!targetStatement) {
    return {
      year: targetYear,
      totalGainHkd: 0,
      totalGainUsd: 0,
      totalGainCny: 0,
      totalFeesCny: 0,
      netTaxableIncomeCny: 0,
      estimatedTax: 0,
      realizedGains: [],
      unrealizedPositions: [],
    }
  }

  let costState = buildCostTrackerBeforeYear(data, targetYear)

  costState = processAssetTransfers(
    costState,
    targetStatement.assetTransfers,
    targetStatement.cashFlows,
    targetYear,
  )

  const allTransfers = data.annualStatements.map(s => s.assetTransfers)

  const stockTrades = targetStatement.trades.filter(t => {
    if (t.category === '基金') return false
    if (isOptionSymbol(t.symbol, allTransfers)) return false
    return true
  })

  const { state: finalState, sells } = processTrades(costState, stockTrades)

  const realizedGains: RealizedGain[] = sells.map(sell => {
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

  const netTaxableIncomeCny = Math.max(0, totalGainCny)
  const estimatedTax = netTaxableIncomeCny * 0.2

  return {
    year: targetYear,
    totalGainHkd,
    totalGainUsd,
    totalGainCny,
    totalFeesCny,
    netTaxableIncomeCny,
    estimatedTax,
    realizedGains,
    unrealizedPositions: Array.from(finalState.positions.values()),
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

  const fundTrades = targetStatement.trades.filter(t => t.category === '基金')

  const fundPositions = new Map<string, { totalBought: number; totalSold: number }>()

  for (const trade of fundTrades) {
    const key = trade.symbol
    const existing = fundPositions.get(key) || { totalBought: 0, totalSold: 0 }
    if (trade.direction === 'buy') {
      existing.totalBought += trade.amount
    } else {
      existing.totalSold += trade.amount
    }
    fundPositions.set(key, existing)
  }

  const gains: FundGain[] = []
  let totalGainHkd = 0

  for (const [symbol, pos] of fundPositions) {
    const gain = pos.totalSold - pos.totalBought
    if (Math.abs(gain) > 0.01) {
      totalGainHkd += gain
      gains.push({
        symbol,
        currency: 'HKD',
        buyDate: '',
        sellDate: '',
        buyAmount: pos.totalBought,
        sellAmount: pos.totalSold,
        gain,
        gainCny: convertToCny(gain, 'HKD', rate),
      })
    }
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

export function calculateYearlyReport(
  data: ParsedData,
  targetYear: number,
): YearlyTaxReport {
  const rates = getAllExchangeRates(data)
  const stock = calculateStockSummary(data, targetYear, rates)
  const fund = calculateFundSummary(data, targetYear, rates)
  const dividend = calculateDividendTaxSummary(data, targetYear, rates)

  const allWarnings: ValidationWarning[] = []
  const costState = buildCostTrackerFromHistory(data, targetYear)
  allWarnings.push(...costState.warnings.filter(w => w.year === targetYear || w.year === 0))

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
  }
}
