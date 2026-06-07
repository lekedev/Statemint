import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { JwtPayload, ApiResponse } from '../types'

export interface AuthRequest extends Request {
  user?: JwtPayload
}

export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Missing or malformed authorization header',
    } satisfies ApiResponse)
    return
  }

  const token = authHeader.slice(7)

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback_secret'
    ) as JwtPayload

    req.user = payload
    next()
  } catch {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    } satisfies ApiResponse)
  }
}