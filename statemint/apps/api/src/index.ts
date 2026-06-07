import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

import authRoutes from './routes/auth.routes'
import documentRoutes from './routes/document.routes'
import analyticsRoutes from './routes/analytics.routes'
import taxRoutes from './routes/tax.routes'
import { prisma } from './lib/prisma'
import { closeQueues } from './lib/queues'

const app = express()
const PORT = process.env.PORT || 4000

// ─── Security & middleware ────────────────────────────────────────────────────

app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
app.use(compression())
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many requests, please slow down.' },
  })
)

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/tax', taxRoutes)

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'statemint-api',
    timestamp: new Date().toISOString(),
  })
})

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' })
})

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[Server] Unhandled error:', err)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
)

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║         Statemint API                 ║
  ║  Running on http://localhost:${PORT}    ║
  ╚═══════════════════════════════════════╝
  `)
})

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGTERM', async () => {
  console.log('[Server] Shutting down gracefully...')
  await prisma.$disconnect()
  await closeQueues()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('[Server] Shutting down gracefully...')
  await prisma.$disconnect()
  await closeQueues()
  process.exit(0)
})

export default app