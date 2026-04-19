import { describe, it, expect } from 'vitest'
import { classifyCashFlow, type CashFlowCategory } from '../../src/lib/calculator/tax-engine'
import type { CashFlow } from '../../src/lib/types'

function makeCashFlow(overrides: Partial<CashFlow> = {}): CashFlow {
  return {
    date: '20240101',
    accountName: 'Test',
    accountId: '123',
    type: '资金进出',
    direction: 'In',
    currency: 'HKD',
    amount: 100,
    remark: '',
    ...overrides,
  }
}

describe('classifyCashFlow', () => {
  it('classifies empty remark as DEPOSIT_WITHDRAWAL', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: '' }))).toBe('DEPOSIT_WITHDRAWAL')
  })

  it('classifies "Deposit from" as DEPOSIT_WITHDRAWAL', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'Deposit from Futu Inc' }))).toBe('DEPOSIT_WITHDRAWAL')
  })

  it('classifies "Withdrawal to" as DEPOSIT_WITHDRAWAL', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'Withdrawal to Futu Inc' }))).toBe('DEPOSIT_WITHDRAWAL')
  })

  it('classifies IPO Application Amount', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'Dr. - IPO Application Amount - #02549' }))).toBe('IPO')
  })

  it('classifies IPO Refund Amount', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'Cr. - IPO Refund Amount - #02549' }))).toBe('IPO')
  })

  it('classifies IPO Application Handling Fee', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'Dr. - IPO Application Handling Fee - #02549' }))).toBe('IPO')
  })

  it('classifies IPO Financing Interest', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'Dr. - IPO Financing Interest - #02158' }))).toBe('IPO')
  })

  it('classifies final dividend (F/D-)', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: '23 F/D-HKD3.4/SH <SEHK 700 TENCENT> 400 shares' }))).toBe('DIVIDEND')
  })

  it('classifies interim dividend (I/D-)', () => {
    expect(classifyCashFlow(makeCashFlow({
      remark: '24 I/D-RMB0.24/SH(-10%), PAY IN HKD0.235764(NET) <SEHK 6030 CITIC SEC> 3000 shares',
    }))).toBe('DIVIDEND')
  })

  it('classifies Option exercise fee', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'Handling Charges for #SOGP Sound Group Option exercise' }))).toBe('OPTION_FEE')
  })

  it('classifies TRANSFER FROM as CURRENCY_EXCHANGE', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'TRANSFER FROM HKD STOCKS(HKD 7.774910000000000)' }))).toBe('CURRENCY_EXCHANGE')
  })

  it('classifies TRANSFER TO as CURRENCY_EXCHANGE', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'TRANSFER TO USD STOCKS(USD 7.774910000000000)' }))).toBe('CURRENCY_EXCHANGE')
  })

  it('classifies unified settlement as SETTLEMENT', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'amount of unified settlement（#LIZI）' }))).toBe('SETTLEMENT')
  })

  it('classifies Interest for Month as INTEREST', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'Interest for Month' }))).toBe('INTEREST')
  })

  it('classifies Refund Interest as INTEREST', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'Refund Interest' }))).toBe('INTEREST')
  })

  it('classifies Handling Charge as FEE', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'Handling Charge 400 shares <SEHK 700 TENCENT>' }))).toBe('FEE')
  })

  it('classifies Scrip Charge as FEE', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'Scrip Charge 3000 shares <SEHK 6030 CITIC SEC>' }))).toBe('FEE')
  })

  it('classifies ADR FEE as FEE', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'LIZI(SOGP) ADR FEE -0.04 USD PER SHARE' }))).toBe('FEE')
  })

  it('classifies Refund ADR Fee as FEE', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'Refund ADR Fee of 20240213' }))).toBe('FEE')
  })

  it('classifies CCASS SCRIP FEE as FEE', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'CCASS SCRIP FEE# 700' }))).toBe('FEE')
  })

  it('classifies HANDING FEE as FEE', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'HANDING FEE# 700' }))).toBe('FEE')
  })

  it('classifies Refund of ADR Fee as FEE', () => {
    expect(classifyCashFlow(makeCashFlow({ remark: 'Refund of ADR Fee' }))).toBe('FEE')
  })

  it('classifies Account Upgrade by type field', () => {
    expect(classifyCashFlow(makeCashFlow({ type: '账户升级', remark: 'Account Upgrade' }))).toBe('ACCOUNT_UPGRADE')
  })

  it('classifies Account Upgrade by remark when type is 资金进出', () => {
    expect(classifyCashFlow(makeCashFlow({ type: '资金进出', remark: 'Account Upgrade' }))).toBe('ACCOUNT_UPGRADE')
  })
})
