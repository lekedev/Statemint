import { prisma } from '../lib/prisma'
import { generateEmbedding } from '../lib/hf'
import { ChatRequest, ChatResponse } from '../types'

const QA_MODEL = 'deepset/roberta-base-squad2'
const HF_API_BASE = 'https://api-inference.huggingface.co/models'
const HF_API_TOKEN = process.env.HF_API_TOKEN || ''
const TOP_K_CHUNKS = 5

async function findSimilarChunks(
  documentId: string,
  embedding: number[]
): Promise<string[]> {
  const vectorLiteral = `[${embedding.join(',')}]`

  const results = await prisma.$queryRaw
    { content: string; similarity: number }[]
  >`
    SELECT content, 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM document_chunks
    WHERE document_id = ${documentId}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${TOP_K_CHUNKS}
  `

  return results.map((r) => r.content)
}

async function answerWithHF(
  question: string,
  context: string
): Promise<string> {
  try {
    const res = await fetch(`${HF_API_BASE}/${QA_MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: { question, context },
      }),
    })

    if (!res.ok) {
      console.error('[QA] HF error:', await res.json())
      return buildFallbackAnswer(context)
    }

    const result = (await res.json()) as { answer: string; score: number }

    if (result.score < 0.1) {
      return buildFallbackAnswer(context)
    }

    return result.answer
  } catch (err) {
    console.error('[QA] Error calling HF:', err)
    return buildFallbackAnswer(context)
  }
}

function buildFallbackAnswer(context: string): string {
  const snippet = context.slice(0, 300)
  return `Based on your statement: "${snippet}..." — I found relevant information but couldn't extract a precise answer. Try rephrasing your question.`
}

export async function answerQuestion(
  userId: string,
  req: ChatRequest
): Promise<ChatResponse> {
  const { documentId, question } = req

  const document = await prisma.document.findFirst({
    where: { id: documentId, userId, status: 'COMPLETED' },
  })

  if (!document) {
    return {
      answer:
        "I couldn't find that document. Make sure the statement has been fully processed before asking questions.",
    }
  }

  const chunkCount = await prisma.documentChunk.count({
    where: { documentId },
  })

  if (chunkCount === 0) {
    return {
      answer:
        'This document has not been embedded yet. Please wait for processing to complete.',
    }
  }

  const questionEmbedding = await generateEmbedding(question)

  if (!questionEmbedding) {
    return {
      answer:
        'I had trouble processing your question right now. Please try again in a moment.',
    }
  }

  const chunks = await findSimilarChunks(documentId, questionEmbedding)

  if (chunks.length === 0) {
    return {
      answer:
        "I couldn't find relevant information in your statement to answer that question.",
    }
  }

  const context = chunks.join('\n\n')
  const answer = await answerWithHF(question, context)

  return {
    answer,
    sources: chunks.slice(0, 2),
  }
}