import 'dotenv/config'
import Bull from 'bull'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { prisma } from './lib/prisma'
import { parseQueue, categorizeQueue, embedQueue, closeQueues } from './lib/queues'
import { parsePdf, chunkText } from './services/parser.service'
import { generateEmbeddings } from './lib/hf'
import { categorizeBatchByRules } from './services/categorize.service'
import { ParseJobData, CategorizeJobData, EmbedJobData } from './types'

console.log('[Worker] Statemint pipeline worker starting...')

// ─── Parse Worker ─────────────────────────────────────────────────────────────

parseQueue.process(async (job: Bull.Job<ParseJobData>) => {
  const { documentId, fileBuffer } = job.data as ParseJobData
  console.log(`[Parse] Starting document ${documentId}`)

  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'PARSING' },
  })

  await prisma.jobLog.updateMany({
    where: { documentId, jobType: 'PARSE' },
    data: { status: 'RUNNING', startedAt: new Date() },
  })

  // The worker runs in a separate container from the api service, so the
  // upload's on-disk path isn't reachable here — the job carries the file
  // bytes instead, written out to a scratch file local to this container.
  const tempFilePath = path.join(
    os.tmpdir(),
    `${documentId}-${crypto.randomBytes(6).toString('hex')}.pdf`
  )

  try {
    fs.writeFileSync(tempFilePath, Buffer.from(fileBuffer, 'base64'))
    const { bankName, transactions } = await parsePdf(tempFilePath)

    if (transactions.length === 0) {
      throw new Error(
        "We couldn't read any transactions from this statement. Its layout may not be supported yet — try exporting it differently, or contact support with the file."
      )
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { bankName, parsedAt: new Date() },
    })

    const created = await prisma.$transaction(
      transactions.map((t: (typeof transactions)[number]) =>
        prisma.transaction.create({
          data: {
            documentId,
            date: t.date,
            description: t.description,
            amount: t.amount,
            type: t.type,
            rawText: t.rawText,
          },
        })
      )
    )

    console.log(
      `[Parse] Created ${created.length} transactions for ${documentId}`
    )

    await prisma.jobLog.updateMany({
      where: { documentId, jobType: 'PARSE' },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    })

    await categorizeQueue.add({
      documentId,
      transactionIds: created.map((t) => t.id),
    })

    await prisma.jobLog.create({
      data: { documentId, jobType: 'CATEGORIZE', status: 'PENDING' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Parse] Error for ${documentId}:`, message)

    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'FAILED', errorMessage: message },
    })

    await prisma.jobLog.updateMany({
      where: { documentId, jobType: 'PARSE' },
      data: { status: 'FAILED', error: message, finishedAt: new Date() },
    })

    throw err
  } finally {
    fs.rmSync(tempFilePath, { force: true })
  }
})

// ─── Categorize Worker ────────────────────────────────────────────────────────

categorizeQueue.process(async (job: Bull.Job<CategorizeJobData>) => {
  const { documentId, transactionIds } = job.data as CategorizeJobData
  console.log(
    `[Categorize] Processing ${transactionIds.length} transactions for ${documentId}`
  )

  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'CATEGORIZING' },
  })

  await prisma.jobLog.updateMany({
    where: { documentId, jobType: 'CATEGORIZE' },
    data: { status: 'RUNNING', startedAt: new Date() },
  })

  try {
    const transactions = await prisma.transaction.findMany({
      where: { id: { in: transactionIds } },
    })

    const descriptions = transactions.map((t) => t.description)
    const results = categorizeBatchByRules(descriptions)

    await prisma.$transaction(
      transactions.map((t: (typeof transactions)[number], i: number) => {
        const result = results[i]
        return prisma.transaction.update({
          where: { id: t.id },
          data: {
            category: result?.category ?? 'Other',
            confidence: result?.confidence ?? 0,
          },
        })
      })
    )

    console.log(`[Categorize] Done for ${documentId}`)

    await prisma.jobLog.updateMany({
      where: { documentId, jobType: 'CATEGORIZE' },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    })

    await embedQueue.add({ documentId })

    await prisma.jobLog.create({
      data: { documentId, jobType: 'EMBED', status: 'PENDING' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Categorize] Error for ${documentId}:`, message)

    await prisma.jobLog.updateMany({
      where: { documentId, jobType: 'CATEGORIZE' },
      data: { status: 'FAILED', error: message, finishedAt: new Date() },
    })

    throw err
  }
})

// ─── Embed Worker ─────────────────────────────────────────────────────────────

embedQueue.process(async (job: Bull.Job<EmbedJobData>) => {
  const { documentId } = job.data as EmbedJobData
  console.log(`[Embed] Starting embedding for ${documentId}`)

  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'EMBEDDING' },
  })

  await prisma.jobLog.updateMany({
    where: { documentId, jobType: 'EMBED' },
    data: { status: 'RUNNING', startedAt: new Date() },
  })

  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { transactions: true },
    })

    if (!document) throw new Error('Document not found')

    const docText = [
      `Bank Statement: ${document.bankName || 'Unknown Bank'}`,
      `Total transactions: ${document.transactions.length}`,
      '',
      ...document.transactions.map(
        (t: (typeof document.transactions)[number]) =>
          `${t.date.toISOString().slice(0, 10)} | ${t.type} | ₦${Number(
            t.amount
          ).toLocaleString()} | ${t.description} | ${
            t.category || 'Uncategorized'
          }`
      ),
    ].join('\n')

    const chunks = chunkText(docText, 400, 50)
    console.log(`[Embed] Generated ${chunks.length} chunks for ${documentId}`)

    const embeddings = await generateEmbeddings(chunks)

    for (let i = 0; i < chunks.length; i++) {
      const embedding = embeddings[i]

      if (embedding) {
        await prisma.$executeRaw`
          INSERT INTO document_chunks (id, document_id, content, chunk_index, embedding, created_at)
          VALUES (
            gen_random_uuid(),
            ${documentId},
            ${chunks[i]},
            ${i},
            ${`[${embedding.join(',')}]`}::vector,
            NOW()
          )
        `
      } else {
        await prisma.documentChunk.create({
          data: { documentId, content: chunks[i], chunkIndex: i },
        })
      }
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'COMPLETED' },
    })

    await prisma.jobLog.updateMany({
      where: { documentId, jobType: 'EMBED' },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    })

    console.log(`[Embed] Document ${documentId} fully processed ✓`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Embed] Error for ${documentId}:`, message)

    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'FAILED', errorMessage: message },
    })

    await prisma.jobLog.updateMany({
      where: { documentId, jobType: 'EMBED' },
      data: { status: 'FAILED', error: message, finishedAt: new Date() },
    })

    throw err
  }
})

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGTERM', async () => {
  console.log('[Worker] SIGTERM received, shutting down...')
  // Release any in-flight job's Bull lock cleanly — otherwise a redeploy
  // mid-job lets the lock expire on its own, and a job that stalls this
  // way more than once is permanently marked failed rather than retried.
  await closeQueues()
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('[Worker] SIGINT received, shutting down...')
  await closeQueues()
  await prisma.$disconnect()
  process.exit(0)
})