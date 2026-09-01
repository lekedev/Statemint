import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

const mockDocument = {
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
}
const mockJobLog = { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) }
const mockParseQueueAdd = vi.fn()

vi.mock('../lib/prisma', () => ({
  prisma: { document: mockDocument, jobLog: mockJobLog },
}))

vi.mock('../lib/queues', () => ({
  parseQueue: { add: mockParseQueueAdd },
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

describe('GET /api/documents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects requests with no auth token', async () => {
    const { default: app } = await import('../index')
    const res = await request(app).get('/api/documents')
    expect(res.status).toBe(401)
  })

  it('returns the current user\'s documents', async () => {
    mockDocument.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        fileName: 'statement.pdf',
        bankName: 'GTBank',
        status: 'COMPLETED',
        createdAt: new Date(),
        parsedAt: new Date(),
        _count: { transactions: 10 },
      },
    ])

    const { default: app } = await import('../index')
    const res = await request(app).get('/api/documents').set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].transactionCount).toBe(10)
  })
})

describe('GET /api/documents/:id/status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 for a document the user does not own', async () => {
    mockDocument.findFirst.mockResolvedValue(null)

    const { default: app } = await import('../index')
    const res = await request(app)
      .get('/api/documents/doc-999/status')
      .set('Authorization', authHeader())

    expect(res.status).toBe(404)
  })
})
