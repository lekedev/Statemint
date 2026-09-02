import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

const mockDetectIncomeProfile = vi.fn()
const mockCalculateTax = vi.fn()
const mockGetLatestTaxCalculation = vi.fn()

vi.mock('../services/tax.service', async () => {
  const actual = await vi.importActual<typeof import('../services/tax.service')>(
    '../services/tax.service'
  )
  return {
    ...actual,
    detectIncomeProfile: mockDetectIncomeProfile,
    calculateTax: mockCalculateTax,
    getLatestTaxCalculation: mockGetLatestTaxCalculation,
  }
})

vi.mock('../lib/prisma', () => ({ prisma: {} }))
vi.mock('../lib/queues', () => ({
  parseQueue: { add: vi.fn() },
  categorizeQueue: { add: vi.fn() },
  embedQueue: { add: vi.fn() },
  closeQueues: vi.fn(),
}))

function authHeader(): string {
  const token = jwt.sign(
    { userId: 'user-1', email: 'a@b.com' },
    process.env.JWT_SECRET!
  )
  return `Bearer ${token}`
}

describe('GET /api/tax/states', () => {
  it('returns the Nigerian states directory without auth', async () => {
    const { default: app } = await import('../index')
    const res = await request(app).get('/api/tax/states')

    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThan(30)
    expect(res.body.data.find((s: { key: string }) => s.key === 'lagos')).toBeDefined()
  })
})

describe('POST /api/tax/:documentId/calculate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an invalid userType with 400', async () => {
    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/tax/doc-1/calculate')
      .set('Authorization', authHeader())
      .send({ userType: 'NOT_A_TYPE', stateOfResidence: 'lagos' })

    expect(res.status).toBe(400)
  })

  it('returns a calculation for a valid payload', async () => {
    mockCalculateTax.mockResolvedValue({
      userType: 'PAYE',
      taxYear: 2026,
      grossIncome: 2_000_000,
      totalDeductions: 300_000,
      chargeableIncome: 1_700_000,
      totalTax: 165_000,
      monthlyTax: 13_750,
      effectiveRate: 8.25,
      isTaxFree: false,
      breakdown: [],
      deductions: [],
      checklist: [],
      paymentGuide: {
        stateName: 'Lagos State',
        irsName: 'Lagos IRS (LIRS)',
        portal: 'https://etax.lirs.net',
        deadline: 'March 31, 2027 (for 2026 income)',
        steps: [],
      },
    })

    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/tax/doc-1/calculate')
      .set('Authorization', authHeader())
      .send({ userType: 'PAYE', stateOfResidence: 'lagos' })

    expect(res.status).toBe(200)
    expect(res.body.data.totalTax).toBe(165_000)
  })
})

describe('GET /api/tax/:documentId/summary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when no calculation exists yet', async () => {
    mockGetLatestTaxCalculation.mockResolvedValue(null)

    const { default: app } = await import('../index')
    const res = await request(app)
      .get('/api/tax/doc-1/summary')
      .set('Authorization', authHeader())

    expect(res.status).toBe(404)
  })
})

describe('GET /api/tax/guide/:stateKey', () => {
  it('returns 404 for an unknown state key', async () => {
    const { default: app } = await import('../index')
    const res = await request(app).get('/api/tax/guide/not-a-real-state')

    expect(res.status).toBe(404)
  })

  it('returns the payment guide for a known state', async () => {
    const { default: app } = await import('../index')
    const res = await request(app).get('/api/tax/guide/lagos')

    expect(res.status).toBe(200)
    expect(res.body.data.irsName).toBe('Lagos IRS (LIRS)')
  })
})
