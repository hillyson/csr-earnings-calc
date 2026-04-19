import { describe, it, expect } from 'vitest'
import {
  createCostTracker,
  addBuy,
  processSell,
  processIpoCost,
} from '../../src/lib/calculator/cost-tracker'
import type { CashFlow } from '../../src/lib/types'

describe('cost-tracker', () => {
  describe('addBuy', () => {
    it('should add a new position', () => {
      const state = createCostTracker()
      const result = addBuy(state, '700', 'SEHK', 'HKD', 100, 39980)
      const pos = result.positions.get('700:SEHK')
      expect(pos).toBeDefined()
      expect(pos!.quantity).toBe(100)
      expect(pos!.avgCost).toBeCloseTo(399.8)
      expect(pos!.totalCost).toBe(39980)
    })

    it('should update weighted average cost on multiple buys', () => {
      let state = createCostTracker()
      state = addBuy(state, '700', 'SEHK', 'HKD', 100, 39980)
      state = addBuy(state, '700', 'SEHK', 'HKD', 100, 36000)
      const pos = state.positions.get('700:SEHK')
      expect(pos!.quantity).toBe(200)
      expect(pos!.avgCost).toBeCloseTo(379.9)
      expect(pos!.totalCost).toBe(75980)
    })

    it('should handle symbol alias LIZI -> SOGP', () => {
      let state = createCostTracker()
      state = addBuy(state, 'LIZI', 'US', 'USD', 100, 500)
      state = addBuy(state, 'SOGP', 'US', 'USD', 50, 200)
      const pos = state.positions.get('SOGP:US')
      expect(pos).toBeDefined()
      expect(pos!.quantity).toBe(150)
      expect(pos!.totalCost).toBe(700)
    })
  })

  describe('processSell', () => {
    it('should calculate cost basis using average cost', () => {
      let state = createCostTracker()
      state = addBuy(state, '700', 'SEHK', 'HKD', 200, 75980)
      const result = processSell(state, '700', 'SEHK', 100)
      expect(result.costBasis).toBeCloseTo(37990)
      const remaining = result.state.positions.get('700:SEHK')
      expect(remaining!.quantity).toBe(100)
    })

    it('should remove position when fully sold', () => {
      let state = createCostTracker()
      state = addBuy(state, '700', 'SEHK', 'HKD', 100, 39980)
      const result = processSell(state, '700', 'SEHK', 100)
      expect(result.state.positions.has('700:SEHK')).toBe(false)
    })

    it('should add warning when selling without position', () => {
      const state = createCostTracker()
      const result = processSell(state, 'UNKNOWN', 'SEHK', 100)
      expect(result.costBasis).toBe(0)
      expect(result.state.warnings).toHaveLength(1)
      expect(result.state.warnings[0].type).toBe('missing_cost')
    })
  })

  describe('processIpoCost', () => {
    it('should calculate IPO cost from cash flows', () => {
      const cashFlows: CashFlow[] = [
        { date: '20210302', accountName: 'test', accountId: '1', type: '资金进出', direction: 'Out', currency: 'HKD', amount: 23231.78, remark: 'Dr. - IPO Application Amount - #06601' },
        { date: '20210302', accountName: 'test', accountId: '1', type: '资金进出', direction: 'Out', currency: 'HKD', amount: 100, remark: 'Dr. - IPO Application Handling Fee - #06601' },
        { date: '20210309', accountName: 'test', accountId: '1', type: '资金进出', direction: 'Out', currency: 'HKD', amount: 136.79, remark: 'Dr. - IPO Financing Interest - #06601' },
        { date: '20210309', accountName: 'test', accountId: '1', type: '资金进出', direction: 'In', currency: 'HKD', amount: 18585.43, remark: 'Cr. - IPO Refund Amount - #06601' },
      ]
      const cost = processIpoCost(cashFlows, '6601', '20210309')
      expect(cost).toBeCloseTo(23231.78 - 18585.43 + 100 + 136.79)
    })
  })
})
