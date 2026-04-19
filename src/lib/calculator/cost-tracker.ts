import type { StockPosition, Market, Currency, Trade, AssetTransfer, CashFlow, ValidationWarning } from '../types'

export interface CostTrackerState {
  positions: Map<string, StockPosition>
  warnings: ValidationWarning[]
}

function posKey(symbol: string, market: Market): string {
  return `${symbol}:${market}`
}

const SYMBOL_ALIASES: Record<string, string> = {
  'LIZI:US': 'SOGP:US',
}

function resolveKey(symbol: string, market: Market): string {
  const key = posKey(symbol, market)
  return SYMBOL_ALIASES[key] || key
}

export { resolveKey }

export function createCostTracker(): CostTrackerState {
  return {
    positions: new Map(),
    warnings: [],
  }
}

export function addBuy(
  state: CostTrackerState,
  symbol: string,
  market: Market,
  currency: Currency,
  quantity: number,
  totalCost: number,
  options?: { isOptionStock?: boolean },
): CostTrackerState {
  const key = resolveKey(symbol, market)
  const existing = state.positions.get(key)

  if (existing) {
    const newTotalQty = existing.quantity + quantity
    const newTotalCost = existing.totalCost + totalCost
    const newAvgCost = newTotalQty > 0 ? newTotalCost / newTotalQty : 0

    return {
      ...state,
      positions: new Map(state.positions).set(key, {
        ...existing,
        quantity: newTotalQty,
        avgCost: newAvgCost,
        totalCost: newTotalCost,
        isOptionStock: existing.isOptionStock || options?.isOptionStock,
      }),
    }
  }

  const avgCost = quantity > 0 ? totalCost / quantity : 0
  return {
    ...state,
    positions: new Map(state.positions).set(key, {
      symbol: key.split(':')[0],
      market,
      currency,
      quantity,
      avgCost,
      totalCost,
      isOptionStock: options?.isOptionStock,
    }),
  }
}

export interface SellResult {
  state: CostTrackerState
  costBasis: number
}

export function processSell(
  state: CostTrackerState,
  symbol: string,
  market: Market,
  quantity: number,
): SellResult {
  const key = resolveKey(symbol, market)
  const existing = state.positions.get(key)

  if (!existing || existing.quantity <= 0) {
    return {
      state: {
        ...state,
        warnings: [
          ...state.warnings,
          {
            type: 'missing_cost',
            symbol,
            message: `卖出 ${symbol} 但找不到持仓成本记录`,
            year: 0,
          },
        ],
      },
      costBasis: 0,
    }
  }

  const costBasis = existing.avgCost * quantity
  const remainingQty = existing.quantity - quantity
  const remainingCost = existing.avgCost * remainingQty

  const newPositions = new Map(state.positions)
  if (remainingQty <= 0.0001) {
    newPositions.delete(key)
  } else {
    newPositions.set(key, {
      ...existing,
      quantity: remainingQty,
      totalCost: remainingCost,
    })
  }

  return {
    state: { ...state, positions: newPositions },
    costBasis,
  }
}

export function processIpoCost(
  cashFlows: CashFlow[],
  symbol: string,
  ipoDate: string,
): number {
  const stockCode = symbol.replace(/^0+/, '')
  const datePrefix = ipoDate.substring(0, 6)

  let applicationAmount = 0
  let refundAmount = 0
  let handlingFee = 0
  let financingInterest = 0

  for (const cf of cashFlows) {
    const remark = cf.remark.toUpperCase()
    if (!remark.includes(stockCode) && !remark.includes(`#${symbol}`)) continue

    const cfDatePrefix = cf.date.substring(0, 6)
    const monthDiff = Math.abs(Number(cfDatePrefix) - Number(datePrefix))
    if (monthDiff > 2) continue

    if (remark.includes('IPO APPLICATION AMOUNT') || remark.includes('DR. - IPO APPLICATION AMOUNT')) {
      applicationAmount += cf.amount
    } else if (remark.includes('IPO REFUND AMOUNT') || remark.includes('CR. - IPO REFUND AMOUNT')) {
      refundAmount += cf.amount
    } else if (remark.includes('IPO APPLICATION HANDLING FEE') || remark.includes('DR. - IPO APPLICATION HANDLING FEE')) {
      handlingFee += cf.amount
    } else if (remark.includes('IPO FINANCING INTEREST') || remark.includes('DR. - IPO FINANCING INTEREST')) {
      financingInterest += cf.amount
    }
  }

  return applicationAmount - refundAmount + handlingFee + financingInterest
}

export function processOptionExerciseCost(
  cashFlows: CashFlow[],
  symbol: string,
  exerciseDate: string,
): number {
  const datePrefix = exerciseDate.substring(0, 6)
  let totalCost = 0

  for (const cf of cashFlows) {
    const remark = cf.remark.toUpperCase()
    if (!remark.includes('OPTION EXERCISE')) continue
    if (!remark.includes(symbol.toUpperCase()) && !remark.includes(`#${symbol.toUpperCase()}`)) continue

    const cfDatePrefix = cf.date.substring(0, 6)
    const monthDiff = Math.abs(Number(cfDatePrefix) - Number(datePrefix))
    if (monthDiff > 2) continue

    if (cf.direction === 'Out') {
      totalCost += cf.amount
    }
  }

  return totalCost
}

export function isOptionExercise(transfer: AssetTransfer): boolean {
  return transfer.remark.toLowerCase().includes('option exercise')
}

export function isStockDividend(transfer: AssetTransfer): boolean {
  return transfer.remark.toLowerCase().includes('stock dividend')
}

export function isSymbolChange(transfer: AssetTransfer): boolean {
  return transfer.remark.toLowerCase().includes('symbol change')
}

export function isAccountUpgrade(transfer: AssetTransfer): boolean {
  return transfer.remark.toLowerCase().includes('account upgrade')
}

export function isIpoAllotment(transfer: AssetTransfer): boolean {
  return transfer.remark.toLowerCase().includes('ipo allotment')
}

export function processAssetTransfers(
  state: CostTrackerState,
  transfers: AssetTransfer[],
  cashFlows: CashFlow[],
  year: number,
): CostTrackerState {
  let currentState = state

  const sortedTransfers = [...transfers].sort((a, b) => a.date.localeCompare(b.date))

  for (const transfer of sortedTransfers) {
    if (isOptionExercise(transfer)) {
      if (transfer.direction === 'In') {
        const cost = processOptionExerciseCost(cashFlows, transfer.symbol, transfer.date)
        currentState = addBuy(
          currentState,
          transfer.symbol,
          transfer.market,
          transfer.currency,
          transfer.quantity,
          cost,
          { isOptionStock: true },
        )
      } else {
        const result = processSell(
          currentState,
          transfer.symbol,
          transfer.market,
          transfer.quantity,
        )
        currentState = result.state
      }
      currentState = {
        ...currentState,
        warnings: [
          ...currentState.warnings,
          {
            type: 'excluded_option',
            symbol: transfer.symbol,
            message: `期权行权股票 ${transfer.symbol} 已纳入对账追踪，税务计算时排除`,
            year,
          },
        ],
      }
      continue
    }

    if (isSymbolChange(transfer)) {
      if (transfer.direction === 'In') {
        const remarkMatch = transfer.remark.match(/(\w+)\s*->\s*(\w+)/)
        if (remarkMatch) {
          currentState = {
            ...currentState,
            warnings: [
              ...currentState.warnings,
              {
                type: 'symbol_change',
                symbol: transfer.symbol,
                message: `股票代码变更：${remarkMatch[1]} → ${remarkMatch[2]}`,
                year,
              },
            ],
          }
        }
      }
      continue
    }

    if (isAccountUpgrade(transfer)) {
      currentState = {
        ...currentState,
        warnings: [
          ...currentState.warnings,
          {
            type: 'account_migration',
            symbol: transfer.symbol,
            message: `账户升级迁移：${transfer.symbol} (${transfer.quantity}股)`,
            year,
          },
        ],
      }
      continue
    }

    if (isIpoAllotment(transfer) && transfer.direction === 'In') {
      const cost = processIpoCost(cashFlows, transfer.symbol, transfer.date)
      currentState = addBuy(
        currentState,
        transfer.symbol,
        transfer.market,
        transfer.currency,
        transfer.quantity,
        cost,
      )
      continue
    }

    if (isStockDividend(transfer) && transfer.direction === 'In') {
      currentState = addBuy(
        currentState,
        transfer.symbol,
        transfer.market,
        transfer.currency,
        transfer.quantity,
        0,
      )
      continue
    }
  }

  return currentState
}

export function processTrades(
  state: CostTrackerState,
  trades: Trade[],
): { state: CostTrackerState; sells: Array<Trade & { costBasis: number }> } {
  let currentState = state
  const sells: Array<Trade & { costBasis: number }> = []

  const sortedTrades = [...trades].sort((a, b) => a.time.localeCompare(b.time))

  for (const trade of sortedTrades) {
    if (trade.category === '基金') continue

    if (trade.direction === 'buy') {
      currentState = addBuy(
        currentState,
        trade.symbol,
        trade.market,
        trade.currency,
        trade.quantity,
        trade.amount,
      )
    } else {
      const result = processSell(
        currentState,
        trade.symbol,
        trade.market,
        trade.quantity,
      )
      currentState = result.state
      sells.push({ ...trade, costBasis: result.costBasis })
    }
  }

  return { state: currentState, sells }
}
