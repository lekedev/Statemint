import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { ApiResponse, AuthTokens } from '../types'
import { requireEnv } from '../lib/env'

const router = Router()

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).optional(),
})

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

function signToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, requireEnv('JWT_SECRET'), {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'],
  })
}

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: parsed.error.errors[0].message,
    } satisfies ApiResponse)
    return
  }

  const { email, password, name } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({
      success: false,
      error: 'Email already registered',
    } satisfies ApiResponse)
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  })

  const accessToken = signToken(user.id, user.email)

  res.status(201).json({
    success: true,
    data: { accessToken } satisfies AuthTokens,
    message: 'Account created successfully',
  } satisfies ApiResponse<AuthTokens>)
})

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: parsed.error.errors[0].message,
    } satisfies ApiResponse)
    return
  }

  const { email, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    res.status(401).json({
      success: false,
      error: 'Invalid credentials',
    } satisfies ApiResponse)
    return
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    res.status(401).json({
      success: false,
      error: 'Invalid credentials',
    } satisfies ApiResponse)
    return
  }

  const accessToken = signToken(user.id, user.email)

  res.json({
    success: true,
    data: { accessToken } satisfies AuthTokens,
  } satisfies ApiResponse<AuthTokens>)
})

export default router