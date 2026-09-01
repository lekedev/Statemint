import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

const mockGetAnalytics = vi.fn()
const mockAnswerQuestion = vi.fn()

vi.mock('../services/analytics.service', () => ({
  getAnalytics: mockGetAnalytics,
}))

vi.mock('../services/qa.service', () => ({
  answerQuestion: mockAnswerQuestion,
}))

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

describe('GET /api/analytics/:documentId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when the document is not found or not owned', async () => {
    mockGetAnalytics.mockResolvedValue(null)

    const { default: app } = await import('../index')
    const res = await request(app)
      .get('/api/analytics/doc-1')
      .set('Authorization', authHeader())

    expect(res.status).toBe(404)
  })

  it('returns analytics for an owned document', async () => {
    mockGetAnalytics.mockResolvedValue({
      documentId: 'doc-1',
      totalCredits: 100_000,
      totalDebits: 40_000,
      netFlow: 60_000,
      transactionCount: 5,
      spendingByCategory: [],
      monthlyFlow: [],
      topMerchants: [],
    })

    const { default: app } = await import('../index')
    const res = await request(app)
      .get('/api/analytics/doc-1')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(res.body.data.netFlow).toBe(60_000)
  })
})

describe('POST /api/analytics/:documentId/chat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects a too-short question with 400', async () => {
    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/analytics/doc-1/chat')
      .set('Authorization', authHeader())
      .send({ question: 'hi' })

    expect(res.status).toBe(400)
  })

  it('returns the answer for a valid question', async () => {
    mockAnswerQuestion.mockResolvedValue({ answer: 'You spent ₦40,000.' })

    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/analytics/doc-1/chat')
      .set('Authorization', authHeader())
      .send({ question: 'How much did I spend?' })

    expect(res.status).toBe(200)
    expect(res.body.data.answer).toContain('40,000')
  })
})
