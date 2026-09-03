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
    const fileBytes = fs.readFileSync(filePath)
    const fileHash = crypto.createHash('sha256').update(fileBytes).digest('hex')

    // Idempotency: same file hash = same document
    const existing = await prisma.document.findUnique({
      where: { fileHash },
      include: { _count: { select: { transactions: true } } },
    })

    // A prior attempt that errored out, or one that "completed" without
    // extracting a single transaction (e.g. an unrecognized statement
    // layout that's since been fixed), is worth retrying rather than
    // replaying the stale, empty result forever.
    const shouldRetry =
      existing &&
      (existing.status === 'FAILED' ||
        (existing.status === 'COMPLETED' && existing._count.transactions === 0))

    if (existing && !shouldRetry) {
      // Clean up duplicate file
      fs.unlinkSync(filePath)
      res.status(200).json({
        success: true,
        data: formatDocument(existing),
        message: 'This statement has already been uploaded',
      } satisfies ApiResponse<DocumentSummary>)
      return
    }

    if (existing) {
      fs.unlinkSync(filePath)

      const retried = await prisma.document.update({
        where: { id: existing.id },
        data: { status: 'PENDING', errorMessage: null, fileData: fileBytes },
      })

      await prisma.jobLog.create({
        data: { documentId: retried.id, jobType: 'PARSE', status: 'PENDING' },
      })

      await parseQueue.add({
        documentId: retried.id,
        filePath: existing.filePath,
        fileBuffer: fileBytes.toString('base64'),
        userId,
      })

      res.status(202).json({
        success: true,
        data: formatDocument(retried),
        message: 'Retrying statement processing.',
      } satisfies ApiResponse<DocumentSummary>)
      return
    }

    const document = await prisma.document.create({
      data: {
        userId,
        fileName: req.file.originalname,
        fileHash,
        filePath,
        fileData: fileBytes,
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
      fileBuffer: fileBytes.toString('base64'),
      userId,
    })

    res.status(202).json({
      success: true,
      data: formatDocument(document),
      message: 'Statement uploaded. Processing has started.',
    } satisfies ApiResponse<DocumentSummary>)
  }
)

// ─── POST /documents/:id/retry ─────────────────────────────────────────────────

router.post('/:id/retry', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId
  const { id } = req.params

  const document = await prisma.document.findFirst({ where: { id, userId } })

  if (!document) {
    res.status(404).json({
      success: false,
      error: 'Document not found',
    } satisfies ApiResponse)
    return
  }

  if (!document.fileData) {
    res.status(400).json({
      success: false,
      error: 'No stored file to retry — please re-upload the statement.',
    } satisfies ApiResponse)
    return
  }

  const retried = await prisma.document.update({
    where: { id: document.id },
    data: { status: 'PENDING', errorMessage: null },
  })

  await prisma.jobLog.create({
    data: { documentId: retried.id, jobType: 'PARSE', status: 'PENDING' },
  })

  await parseQueue.add({
    documentId: retried.id,
    filePath: document.filePath,
    fileBuffer: document.fileData.toString('base64'),
    userId,
  })

  res.status(202).json({
    success: true,
    data: formatDocument(retried),
    message: 'Retrying statement processing.',
  } satisfies ApiResponse<DocumentSummary>)
})

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
  errorMessage?: string | null
}): DocumentSummary {
  return {
    id: doc.id,
    fileName: doc.fileName,
    bankName: doc.bankName,
    status: doc.status as DocumentSummary['status'],
    createdAt: doc.createdAt.toISOString(),
    parsedAt: doc.parsedAt?.toISOString() ?? null,
    errorMessage: doc.errorMessage,
  }
}

export default router
