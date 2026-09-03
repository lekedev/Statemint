import Anthropic from '@anthropic-ai/sdk'
import { ParsedTransaction } from '../types'

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5'

// Real bank/fintech statement text is long — Claude's context window
// comfortably covers even large multi-page statements, but this caps how
// much we send per call to keep latency and cost predictable.
const MAX_INPUT_CHARS = 100_000

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'record_transactions',
  description: 'Record every transaction found in the bank statement text.',
  input_schema: {
    type: 'object',
    properties: {
      bankName: {
        type: 'string',
        description:
          "The bank or fintech's name if identifiable from the statement, otherwise \"Unknown Bank\".",
      },
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'ISO 8601 date (YYYY-MM-DD) the transaction occurred.',
            },
            description: {
              type: 'string',
              description: 'The transaction description/narration as it appears in the statement.',
            },
            amount: {
              type: 'number',
              description: 'The transaction amount as a positive number, in the statement currency.',
            },
            type: {
              type: 'string',
              enum: ['DEBIT', 'CREDIT'],
              description:
                'DEBIT if money left the account, CREDIT if money entered it. Base this on the statement\'s own Debit/Credit columns or balance movement, never on guessing from the description alone.',
            },
          },
          required: ['date', 'description', 'amount', 'type'],
        },
      },
    },
    required: ['bankName', 'transactions'],
  },
}

interface ExtractionResult {
  bankName: string
  transactions: ParsedTransaction[]
}

// Fallback for statement layouts no hand-written parser recognizes. Only
// invoked when every regex-based strategy extracts zero transactions —
// those stay the fast, free first attempt for already-supported formats.
export async function extractTransactionsWithClaude(
  rawText: string
): Promise<ExtractionResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.log('[Claude] ANTHROPIC_API_KEY not set, skipping LLM extraction fallback')
    return null
  }

  try {
    const client = new Anthropic({ apiKey })
    const text = rawText.slice(0, MAX_INPUT_CHARS)

    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: 'record_transactions' },
      messages: [
        {
          role: 'user',
          content:
            'This is the raw text extracted from a bank or fintech statement PDF. ' +
            'The original table layout may be flattened or have its columns run ' +
            'together — infer the real row boundaries and field values as a person ' +
            'reading the statement would. Record every transaction you find.\n\n' +
            text,
        },
      ],
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )
    if (!toolUse) {
      console.error('[Claude] No tool_use block in response')
      return null
    }

    const parsed = toolUse.input as {
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
      `[Claude] Extracted ${transactions.length} transactions (bank: ${parsed.bankName})`
    )

    return { bankName: parsed.bankName || 'Unknown Bank', transactions }
  } catch (err) {
    console.error('[Claude] Extraction failed:', err)
    return null
  }
}
