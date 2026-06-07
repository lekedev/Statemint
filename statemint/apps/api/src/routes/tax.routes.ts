import { Router, Response } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../middleware/auth'
import {
  calculateTax,
  detectIncomeProfile,
  getLatestTaxCalculation,
  NIGERIAN_STATES,
  TaxProfileInput,
} from '../services/tax.service'
import { ApiResponse } from '../types'
import { TaxUserType } from '@prisma/client'

const router = Router()

// ─── GET /api/tax/states ──────────────────────────────────────────────────────

router.get('/states', (_req, res: Response) => {
  const states = Object.entries(NIGERIAN_STATES).map(([key, value]) => ({
    key,
    ...value,
  }))
  res.json({ success: true, data: states } satisfies ApiResponse)
})

// ─── GET /api/tax/:documentId/detect ─────────────────────────────────────────

router.get(
  '/:documentId/detect',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId
    const { documentId } = req.params

    const detection = await detectIncomeProfile(documentId, userId)

    res.json({ success: true, data: detection } satisfies ApiResponse)
  }
)

// ─── POST /api/tax/:documentId/calculate ─────────────────────────────────────

const CalculateSchema = z.object({
  userType: z.enum(['PAYE', 'SELF_EMPLOYED', 'BUSINESS']),
  stateOfResidence: z.string().min(2),
  monthlyRent: z.number().min(0).optional(),
  pensionRate: z.number().min(0).max(1).optional(),
  nhfRate: z.number().min(0).max(1).optional(),
  nhisRate: z.number().min(0).max(1).optional(),
  lifeInsurance: z.number().min(0).optional(),
})

router.post(
  '/:documentId/calculate',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    const parsed = CalculateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors[0].message,
      } satisfies ApiResponse)
      return
    }

    const userId = req.user!.userId
    const { documentId } = req.params
    const profile: TaxProfileInput = {
      ...parsed.data,
      userType: parsed.data.userType as TaxUserType,
    }

    const result = await calculateTax(documentId, userId, profile)

    res.json({ success: true, data: result } satisfies ApiResponse)
  }
)

// ─── GET /api/tax/:documentId/summary ────────────────────────────────────────

router.get(
  '/:documentId/summary',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId
    const { documentId } = req.params

    const calculation = await getLatestTaxCalculation(documentId, userId)

    if (!calculation) {
      res.status(404).json({
        success: false,
        error: 'No tax calculation found. Run /calculate first.',
      } satisfies ApiResponse)
      return
    }

    res.json({ success: true, data: calculation } satisfies ApiResponse)
  }
)

// ─── GET /api/tax/guide/:stateKey ─────────────────────────────────────────────

router.get('/guide/:stateKey', (_req, res: Response) => {
  const { stateKey } = _req.params
  const state = NIGERIAN_STATES[stateKey.toLowerCase()]

  if (!state) {
    res.status(404).json({
      success: false,
      error: 'State not found. Use GET /api/tax/states for valid state keys.',
    } satisfies ApiResponse)
    return
  }

  res.json({
    success: true,
    data: {
      ...state,
      deadline: 'March 31, 2027 (for 2026 income)',
      penaltyInfo: {
        firstMonth: 100_000,
        subsequentMonths: 50_000,
        description:
          'Filing after March 31 attracts ₦100,000 penalty for the first month, then ₦50,000 for every subsequent month.',
      },
    },
  } satisfies ApiResponse)
})

export default router