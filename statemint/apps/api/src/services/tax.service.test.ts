import { describe, it, expect } from 'vitest'
import { calculatePAYETax, calculateDeductions } from './tax.service'

describe('calculatePAYETax', () => {
  it('returns zero tax for income below the ₦800,000 threshold', () => {
    const result = calculatePAYETax(500_000)
    expect(result.totalTax).toBe(0)
    expect(result.breakdown).toEqual([])
  })

  it('returns zero tax for income exactly at the threshold', () => {
    const result = calculatePAYETax(800_000)
    expect(result.totalTax).toBe(0)
    expect(result.breakdown).toEqual([])
  })

  it('taxes only the first band for income within it', () => {
    const result = calculatePAYETax(1_000_000)
    expect(result.totalTax).toBe(30_000) // (1,000,000 - 800,000) * 0.15
    expect(result.breakdown).toHaveLength(1)
  })

  it('taxes across all four bands for high income', () => {
    const result = calculatePAYETax(5_000_000)
    // band1: (1,600,000-800,000)*0.15 = 120,000
    // band2: (3,200,000-1,600,000)*0.19 = 304,000
    // band3: (4,800,000-3,200,000)*0.21 = 336,000
    // band4: (5,000,000-4,800,000)*0.24 = 48,000
    expect(result.totalTax).toBe(808_000)
    expect(result.breakdown).toHaveLength(4)
  })
})

describe('calculateDeductions', () => {
  it('applies default pension/NHF/NHIS rates when the profile omits them', () => {
    const deductions = calculateDeductions(1_200_000, {
      userType: 'PAYE',
      stateOfResidence: 'lagos',
    })

    const pension = deductions.find((d) => d.name === 'Pension Contribution (PFA)')
    const nhf = deductions.find((d) => d.name === 'National Housing Fund (NHF)')
    const nhis = deductions.find((d) => d.name === 'National Health Insurance (NHIS)')

    expect(pension?.amount).toBe(1_200_000 * 0.08)
    expect(nhf?.amount).toBe(1_200_000 * 0.025)
    expect(nhis?.amount).toBe(1_200_000 * 0.05)
  })

  it('marks rent relief and life insurance as not applicable when omitted', () => {
    const deductions = calculateDeductions(1_200_000, {
      userType: 'PAYE',
      stateOfResidence: 'lagos',
    })

    const rent = deductions.find((d) => d.name === 'Rent Relief')
    const life = deductions.find((d) => d.name === 'Life Insurance Premium')

    expect(rent?.applicable).toBe(false)
    expect(rent?.amount).toBe(0)
    expect(life?.applicable).toBe(false)
    expect(life?.amount).toBe(0)
  })

  it('caps rent relief at ₦500,000', () => {
    const deductions = calculateDeductions(10_000_000, {
      userType: 'PAYE',
      stateOfResidence: 'lagos',
      monthlyRent: 1_000_000, // 12,000,000/yr * 20% = 2,400,000, capped to 500,000
    })

    const rent = deductions.find((d) => d.name === 'Rent Relief')
    expect(rent?.applicable).toBe(true)
    expect(rent?.amount).toBe(500_000)
  })

  it('caps life insurance deduction at ₦100,000', () => {
    const deductions = calculateDeductions(1_200_000, {
      userType: 'PAYE',
      stateOfResidence: 'lagos',
      lifeInsurance: 250_000,
    })

    const life = deductions.find((d) => d.name === 'Life Insurance Premium')
    expect(life?.applicable).toBe(true)
    expect(life?.amount).toBe(100_000)
  })
})
