import { Router, Response } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../middleware/auth'
import { getAnalytics } from '../services/analytics.service'
import { answerQuestion } from '../services/qa.service'
import { ApiResponse, ChatRequest } from '../types'

const router = Router()

// ─── GET /api/analytics/:documentId ──────────────────────────────────────────

router.get(
  '/:documentId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId
    const { documentId } = req.params

    const analytics = await getAnalytics(documentId, userId)

    if (!analytics) {
      res.status(404).json({
        success: false,
        error: 'Document not found or you do not have access',
      } satisfies ApiResponse)
      return
    }

    res.json({
      success: true,
      data: analytics,
    } satisfies ApiResponse)
  }
)

// ─── POST /api/analytics/:documentId/chat ────────────────────────────────────

const ChatSchema = z.object({
  question: z.string().min(3, 'Question too short').max(500),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
})

router.post(
  '/:documentId/chat',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    const parsed = ChatSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors[0].message,
      } satisfies ApiResponse)
      return
    }

    const userId = req.user!.userId
    const { documentId } = req.params
    const { question, history } = parsed.data

    const chatReq: ChatRequest = { documentId, question, history }
    const response = await answerQuestion(userId, chatReq)

    res.json({
      success: true,
      data: response,
    } satisfies ApiResponse)
  }
)

export default router