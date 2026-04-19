import type { Currency, ExchangeRate } from '../types'

export function findExchangeRate(rates: ExchangeRate[], year: number): ExchangeRate | undefined {
  return rates.find(r => r.year === year)
}

export function convertToCny(
  amount: number,
  currency: Currency,
  rate: ExchangeRate | undefined,
): number {
  if (currency === 'CNY') return amount
  if (!rate) return amount

  if (currency === 'HKD') {
    return amount * rate.hkdToCny
  }

  if (currency === 'USD') {
    const hkdAmount = amount * rate.usdToHkd
    return hkdAmount * rate.hkdToCny
  }

  return amount
}

export function convertToHkd(
  amount: number,
  currency: Currency,
  rate: ExchangeRate | undefined,
): number {
  if (currency === 'HKD') return amount
  if (!rate) return amount

  if (currency === 'USD') {
    return amount * rate.usdToHkd
  }

  if (currency === 'CNY' && rate.hkdToCny > 0) {
    return amount / rate.hkdToCny
  }

  return amount
}
