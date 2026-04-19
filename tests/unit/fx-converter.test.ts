import { describe, it, expect } from 'vitest'
import { convertToCny, convertToHkd, findExchangeRate } from '../../src/lib/calculator/fx-converter'
import type { ExchangeRate } from '../../src/lib/types'

const rates: ExchangeRate[] = [
  { year: 2024, month: 'Dec 2024', usdToHkd: 7.8035, hkdToCny: 0.912634 },
  { year: 2023, month: 'Dec 2023', usdToHkd: 7.8318, hkdToCny: 0.899609 },
]

describe('fx-converter', () => {
  describe('findExchangeRate', () => {
    it('should find rate by year', () => {
      const rate = findExchangeRate(rates, 2024)
      expect(rate).toBeDefined()
      expect(rate!.usdToHkd).toBe(7.8035)
    })

    it('should return undefined for missing year', () => {
      expect(findExchangeRate(rates, 2020)).toBeUndefined()
    })
  })

  describe('convertToCny', () => {
    it('should pass through CNY amounts', () => {
      expect(convertToCny(100, 'CNY', rates[0])).toBe(100)
    })

    it('should convert HKD to CNY', () => {
      const result = convertToCny(1000, 'HKD', rates[0])
      expect(result).toBeCloseTo(912.634)
    })

    it('should convert USD to CNY via HKD', () => {
      const result = convertToCny(100, 'USD', rates[0])
      const expected = 100 * 7.8035 * 0.912634
      expect(result).toBeCloseTo(expected)
    })

    it('should return original amount when no rate', () => {
      expect(convertToCny(100, 'HKD', undefined)).toBe(100)
    })
  })

  describe('convertToHkd', () => {
    it('should pass through HKD amounts', () => {
      expect(convertToHkd(100, 'HKD', rates[0])).toBe(100)
    })

    it('should convert USD to HKD', () => {
      expect(convertToHkd(100, 'USD', rates[0])).toBeCloseTo(780.35)
    })
  })
})
