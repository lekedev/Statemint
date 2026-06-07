import 'dotenv/config'
import { prisma } from './lib/prisma'
import { parseQueue, categorizeQueue, embedQueue } from './lib/queues'
import { parsePdf, chunkText } from './services/parser.service'
import { categorizeBatch } from './lib/hf'
import { generateEmbeddings } from './lib/hf'
import { ParseJobData, CategorizeJobData, EmbedJobData } from './types'

console.log('[Worker] Statemint pipeline worker starting...')

// ─── Parse Worker ─────────────────────────────────────────────────────────────

parseQueue.process(async (job) => {
  const { documentId, filePath } = job.data as ParseJobData
  console.log(`[Parse] Starting document ${documentId}`)

  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'PARSING' },
  })

  await prisma.jobLog.updateMany({
    where: { documentId, jobType: 'PARSE' },
    data: { status: 'RUNNING', startedAt: new Date() },
  })

  try {
    const { bankName, transactions } = await parsePdf(filePath)

    await prisma.document.update({
      where: { id: documentId },
      data: { bankName, parsedAt: new Date() },
    })

    // Persist transactions
    const created = await prisma.$transaction(
      transactions.map((t) =>
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

    console.log(`[Parse] Created ${created.length} transactions for ${documentId}`)

    await prisma.jobLog.updateMany({
      where: { documentId, jobType: 'PARSE' },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    })

    // Enqueue categorization
    await categorizeQueue.add({ documentId, transactionIds: created.map((t) => t.id) })
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

    throw err // Bull will retry
  }
})

// ─── Categorize Worker ────────────────────────────────────────────────────────

categorizeQueue.process(async (job) => {
  const { documentId, transactionIds } = job.data as CategorizeJobData
  console.log(`[Categorize] Processing ${transactionIds.length} transactions for ${documentId}`)

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
    const results = await categorizeBatch(descriptions)

    // Update each transaction with its category
    await prisma.$transaction(
      transactions.map((t, i) => {
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

    // Enqueue embedding
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

embedQueue.process(async (job) => {
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

    // Build a rich text representation of the document for embedding
    const docText = [
      `Bank Statement: ${document.bankName || 'Unknown Bank'}`,
      `Total transactions: ${document.transactions.length}`,
      '',
      ...document.transactions.map(
        (t) =>
          `${t.date.toISOString().slice(0, 10)} | ${t.type} | ₦${Number(t.amount).toLocaleString()} | ${t.description} | ${t.category || 'Uncategorized'}`
      ),
    ].join('\n')

    const chunks = chunkText(docText, 400, 50)
    console.log(`[Embed] Generated ${chunks.length} chunks for ${documentId}`)

    const embeddings = await generateEmbeddings(chunks)

    // Store chunks with embeddings using raw SQL for pgvector
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
        // Store chunk without embedding if HF failed for this chunk
        await prisma.documentChunk.create({
          data: { documentId, content: chunks[i], chunkIndex: i },
        })
      }
    }

    // Mark document as completed
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
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('[Worker] SIGINT received, shutting down...')
  await prisma.$disconnect()
  process.exit(0)
})
