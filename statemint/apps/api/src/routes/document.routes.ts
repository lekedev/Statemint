import { Router, Response } from 'express'
import multer from 'multer'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs'
import { prisma } from '../lib/prisma'
import { parseQueue } from '../lib/queues'
import { authenticate, AuthRequest } from '../middleware/auth'
import { ApiResponse, DocumentSummary } from '../types'

const router = Router()

// ─── Multer setup ─────────────────────────────────────────────────────────────

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`
    cb(null, `${unique}${path.extname(file.originalname)}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(new Error('Only PDF files are accepted'))
  },
})

// ─── File hash helper ─────────────────────────────────────────────────────────

function hashFile(filePath: string): string {
  const buffer = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

// ─── POST /documents/upload ───────────────────────────────────────────────────

router.post(
  '/upload',
  authenticate,
  upload.single('statement'),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded',
      } satisfies ApiResponse)
      return
    }

    const userId = req.user!.userId
    const filePath = req.file.path
    const fileHash = hashFile(filePath)

    // Idempotency: same file hash = same document
    const existing = await prisma.document.findUnique({
      where: { fileHash },
    })

    if (existing) {
      // Clean up duplicate file
      fs.unlinkSync(filePath)
      res.status(200).json({
        success: true,
        data: formatDocument(existing),
        message: 'This statement has already been uploaded',
      } satisfies ApiResponse<DocumentSummary>)
      return
    }

    const document = await prisma.document.create({
      data: {
        userId,
        fileName: req.file.originalname,
        fileHash,
        filePath,
        status: 'PENDING',
      },
    })

    // Log and enqueue
    await prisma.jobLog.create({
      data: { documentId: document.id, jobType: 'PARSE', status: 'PENDING' },
    })

    await parseQueue.add({
      documentId: document.id,
      filePath,
      userId,
    })

    res.status(202).json({
      success: true,
      data: formatDocument(document),
      message: 'Statement uploaded. Processing has started.',
    } satisfies ApiResponse<DocumentSummary>)
  }
)

// ─── GET /documents ───────────────────────────────────────────────────────────

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId

  const documents = await prisma.document.findMany({
    where: { userId },
    include: { _count: { select: { transactions: true } } },
    orderBy: { createdAt: 'desc' },
  })

  res.json({
    success: true,
    data: documents.map((d) => ({
      ...formatDocument(d),
      transactionCount: d._count.transactions,
    })),
  } satisfies ApiResponse<DocumentSummary[]>)
})

// ─── GET /documents/:id/status ────────────────────────────────────────────────

router.get('/:id/status', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId
  const { id } = req.params

  const document = await prisma.document.findFirst({
    where: { id, userId },
    include: {
      _count: { select: { transactions: true } },
    },
  })

  if (!document) {
    res.status(404).json({
      success: false,
      error: 'Document not found',
    } satisfies ApiResponse)
    return
  }

  const jobLogs = await prisma.jobLog.findMany({
    where: { documentId: id },
    orderBy: { createdAt: 'asc' },
  })

  res.json({
    success: true,
    data: {
      ...formatDocument(document),
      transactionCount: document._count.transactions,
      pipeline: jobLogs.map((j) => ({
        step: j.jobType,
        status: j.status,
        error: j.error,
        startedAt: j.startedAt,
        finishedAt: j.finishedAt,
      })),
    },
  } satisfies ApiResponse)
})

// ─── DELETE /documents/:id ────────────────────────────────────────────────────

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId
  const { id } = req.params

  const document = await prisma.document.findFirst({
    where: { id, userId },
  })

  if (!document) {
    res.status(404).json({
      success: false,
      error: 'Document not found',
    } satisfies ApiResponse)
    return
  }

  // Clean up file from disk
  if (fs.existsSync(document.filePath)) {
    fs.unlinkSync(document.filePath)
  }

  await prisma.document.delete({ where: { id } })

  res.json({
    success: true,
    message: 'Document deleted',
  } satisfies ApiResponse)
})

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatDocument(doc: {
  id: string
  fileName: string
  bankName: string | null
  status: string
  createdAt: Date
  parsedAt: Date | null
}): DocumentSummary {
  return {
    id: doc.id,
    fileName: doc.fileName,
    bankName: doc.bankName,
    status: doc.status as DocumentSummary['status'],
    createdAt: doc.createdAt.toISOString(),
    parsedAt: doc.parsedAt?.toISOString() ?? null,
  }
}

export default router
