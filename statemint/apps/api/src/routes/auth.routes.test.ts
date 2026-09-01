import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'

const mockUser = {
  findUnique: vi.fn(),
  create: vi.fn(),
}

vi.mock('../lib/prisma', () => ({
  prisma: { user: mockUser },
}))

vi.mock('../lib/queues', () => ({
  parseQueue: { add: vi.fn() },
  categorizeQueue: { add: vi.fn() },
  embedQueue: { add: vi.fn() },
  closeQueues: vi.fn(),
}))

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a user and returns a token', async () => {
    mockUser.findUnique.mockResolvedValue(null)
    mockUser.create.mockResolvedValue({
      id: 'user-1',
      email: 'new@example.com',
      passwordHash: 'hashed',
      name: null,
    })

    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'password123' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.accessToken).toEqual(expect.any(String))
  })

  it('rejects a duplicate email with 409', async () => {
    mockUser.findUnique.mockResolvedValue({ id: 'existing-user' })

    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'existing@example.com', password: 'password123' })

    expect(res.status).toBe(409)
    expect(res.body.success).toBe(false)
  })

  it('rejects an invalid payload with 400', async () => {
    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short' })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs in with correct credentials', async () => {
    const passwordHash = await bcrypt.hash('password123', 12)
    mockUser.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash,
    })

    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body.data.accessToken).toEqual(expect.any(String))
  })

  it('rejects a wrong password with 401', async () => {
    const passwordHash = await bcrypt.hash('password123', 12)
    mockUser.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash,
    })

    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'wrong-password' })

    expect(res.status).toBe(401)
  })

  it('rejects an unknown email with 401', async () => {
    mockUser.findUnique.mockResolvedValue(null)

    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' })

    expect(res.status).toBe(401)
  })
})
