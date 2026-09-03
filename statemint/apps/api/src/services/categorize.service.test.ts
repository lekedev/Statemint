import { describe, it, expect } from 'vitest'
import { categorizeByRules, categorizeBatchByRules } from './categorize.service'

describe('categorizeByRules', () => {
  it('matches bank fees ahead of generic transfer language', () => {
    expect(categorizeByRules('Stamp Duty')).toEqual({
      category: 'Bank Charges & Fees',
      confidence: 0.85,
    })
    expect(categorizeByRules('VAT on Transfer Fee')).toEqual({
      category: 'Bank Charges & Fees',
      confidence: 0.85,
    })
  })

  it('matches salary, airtime, and transport descriptions', () => {
    expect(categorizeByRules('SALARY PAYMENT XYZ LTD').category).toBe(
      'Salary & Income'
    )
    expect(categorizeByRules('MTN Airtime Recharge').category).toBe(
      'Airtime & Data'
    )
    expect(categorizeByRules('Uber Trip Lagos').category).toBe('Transportation')
  })

  it('falls back to a generic transfer for counterparty transfers', () => {
    expect(
      categorizeByRules('Transfer to ROTIMI OBADEYI | OPay | 7067217926')
        .category
    ).toBe('Transfer')
  })

  it('returns Other with zero confidence when nothing matches', () => {
    expect(categorizeByRules('XYZ123 UNKNOWN REFERENCE')).toEqual({
      category: 'Other',
      confidence: 0,
    })
  })
})

describe('categorizeBatchByRules', () => {
  it('categorizes every description in order', () => {
    const results = categorizeBatchByRules(['Stamp Duty', 'Netflix Subscription'])

    expect(results).toEqual([
      { category: 'Bank Charges & Fees', confidence: 0.85 },
      { category: 'Entertainment', confidence: 0.85 },
    ])
  })
})
