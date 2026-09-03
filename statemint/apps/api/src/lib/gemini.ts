import { GoogleGenAI, Type } from '@google/genai'
import { ParsedTransaction } from '../types'

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

// Real bank/fintech statement text is long — Gemini's context window
// comfortably covers even large multi-page statements, but this caps how
// much we send per call to keep latency and cost predictable.
const MAX_INPUT_CHARS = 100_000

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    bankName: {
      type: Type.STRING,
      description:
        "The bank or fintech's name if identifiable from the statement, otherwise \"Unknown Bank\".",
    },
    transactions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          date: {
            type: Type.STRING,
            description: 'ISO 8601 date (YYYY-MM-DD) the transaction occurred.',
          },
          description: {
            type: Type.STRING,
            description: 'The transaction description/narration as it appears in the statement.',
          },
          amount: {
            type: Type.NUMBER,
            description: 'The transaction amount as a positive number, in the statement currency.',
          },
          type: {
            type: Type.STRING,
            enum: ['DEBIT', 'CREDIT'],
            description:
              "DEBIT if money left the account, CREDIT if money entered it. Base this on the statement's own Debit/Credit columns or balance movement, never on guessing from the description alone.",
          },
        },
        required: ['date', 'description', 'amount', 'type'],
      },
    },
  },
  required: ['bankName', 'transactions'],
}

interface ExtractionResult {
  bankName: string
  transactions: ParsedTransaction[]
}

// Fallback for statement layouts no hand-written parser recognizes. Only
// invoked when every regex-based strategy extracts zero transactions —
// those stay the fast, free first attempt for already-supported formats.
export async function extractTransactionsWithGemini(
  rawText: string
): Promise<ExtractionResult | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.log('[Gemini] GEMINI_API_KEY not set, skipping LLM extraction fallback')
    return null
  }

  try {
    const ai = new GoogleGenAI({ apiKey })
    const text = rawText.slice(0, MAX_INPUT_CHARS)

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents:
        'This is the raw text extracted from a bank or fintech statement PDF. ' +
        'The original table layout may be flattened or have its columns run ' +
        'together — infer the real row boundaries and field values as a person ' +
        'reading the statement would. Record every transaction you find.\n\n' +
        text,
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    })

    const raw = response.text
    if (!raw) {
      console.error('[Gemini] Empty response')
      return null
    }

    const parsed = JSON.parse(raw) as {
      bankName: string
      transactions: Array<{
        date: string
        description: string
        amount: number
        type: 'DEBIT' | 'CREDIT'
      }>
    }

    const transactions: ParsedTransaction[] = parsed.transactions
      .filter((t) => t.amount > 0 && t.description?.length > 0)
      .map((t) => ({
        date: new Date(t.date),
        description: t.description.slice(0, 200),
        amount: t.amount,
        type: t.type,
      }))

    console.log(
      `[Gemini] Extracted ${transactions.length} transactions (bank: ${parsed.bankName})`
    )

    return { bankName: parsed.bankName || 'Unknown Bank', transactions }
  } catch (err) {
    console.error('[Gemini] Extraction failed:', err)
    return null
  }
}
