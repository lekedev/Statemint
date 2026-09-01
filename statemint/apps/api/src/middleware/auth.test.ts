import { describe, it, expect, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { Response } from 'express'
import { authenticate, AuthRequest } from './auth'

function mockRes(): Response {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('authenticate middleware', () => {
  it('rejects a missing authorization header', () => {
    const req = { headers: {} } as AuthRequest
    const res = mockRes()
    const next = vi.fn()

    authenticate(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a malformed authorization header', () => {
    const req = { headers: { authorization: 'NotBearer xyz' } } as AuthRequest
    const res = mockRes()
    const next = vi.fn()

    authenticate(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects an invalid token', () => {
    const req = {
      headers: { authorization: 'Bearer not-a-real-token' },
    } as AuthRequest
    const res = mockRes()
    const next = vi.fn()

    authenticate(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('accepts a valid token and attaches the payload to req.user', () => {
    const token = jwt.sign(
      { userId: 'user-1', email: 'a@b.com' },
      process.env.JWT_SECRET!
    )
    const req = { headers: { authorization: `Bearer ${token}` } } as AuthRequest
    const res = mockRes()
    const next = vi.fn()

    authenticate(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.user).toMatchObject({ userId: 'user-1', email: 'a@b.com' })
  })
})
