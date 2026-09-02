import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'

vi.mock('./lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockRejectedValue(new Error('boom')),
    },
    $disconnect: vi.fn(),
  },
}))

vi.mock('./lib/queues', () => ({
  parseQueue: { add: vi.fn() },
  categorizeQueue: { add: vi.fn() },
  embedQueue: { add: vi.fn() },
  closeQueues: vi.fn(),
}))

describe('async error handling', () => {
  it('returns a clean 500 instead of hanging when a route handler rejects', async () => {
    const { default: app } = await import('./index')

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, error: 'Internal server error' })
  })
})
