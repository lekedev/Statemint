import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('extractTransactionsWithClaude', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey
    vi.resetModules()
    vi.doUnmock('@anthropic-ai/sdk')
  })

  it('returns null immediately when no API key is configured', async () => {
    delete process.env.ANTHROPIC_API_KEY
    vi.resetModules()

    const { extractTransactionsWithClaude } = await import('./claude')
    const result = await extractTransactionsWithClaude('some statement text')

    expect(result).toBeNull()
  })

  it('parses the tool_use response into transactions', async () => {
    vi.resetModules()
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          input: {
            bankName: 'Providus Bank',
            transactions: [
              { date: '2026-08-01', description: 'POS Purchase', amount: 5000, type: 'DEBIT' },
              { date: '2026-08-05', description: 'Salary', amount: 200000, type: 'CREDIT' },
            ],
          },
        },
      ],
    })
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        messages = { create }
      },
    }))

    const { extractTransactionsWithClaude } = await import('./claude')
    const result = await extractTransactionsWithClaude('some statement text')

    expect(result).toEqual({
      bankName: 'Providus Bank',
      transactions: [
        {
          date: new Date('2026-08-01'),
          description: 'POS Purchase',
          amount: 5000,
          type: 'DEBIT',
        },
        {
          date: new Date('2026-08-05'),
          description: 'Salary',
          amount: 200000,
          type: 'CREDIT',
        },
      ],
    })
  })

  it('returns null when the API call throws', async () => {
    vi.resetModules()
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        messages = { create: vi.fn().mockRejectedValue(new Error('API error')) }
      },
    }))

    const { extractTransactionsWithClaude } = await import('./claude')
    const result = await extractTransactionsWithClaude('some statement text')

    expect(result).toBeNull()
  })
})
