import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('extractTransactionsWithGemini', () => {
  const originalKey = process.env.GEMINI_API_KEY

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key'
  })

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalKey
    vi.resetModules()
    vi.doUnmock('@google/genai')
  })

  it('returns null immediately when no API key is configured', async () => {
    delete process.env.GEMINI_API_KEY
    vi.resetModules()

    const { extractTransactionsWithGemini } = await import('./gemini')
    const result = await extractTransactionsWithGemini('some statement text')

    expect(result).toBeNull()
  })

  it('parses the structured JSON response into transactions', async () => {
    vi.resetModules()
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        bankName: 'Providus Bank',
        transactions: [
          { date: '2026-08-01', description: 'POS Purchase', amount: 5000, type: 'DEBIT' },
          { date: '2026-08-05', description: 'Salary', amount: 200000, type: 'CREDIT' },
        ],
      }),
    })
    vi.doMock('@google/genai', () => ({
      GoogleGenAI: class {
        models = { generateContent }
      },
      Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', NUMBER: 'NUMBER' },
    }))

    const { extractTransactionsWithGemini } = await import('./gemini')
    const result = await extractTransactionsWithGemini('some statement text')

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
    vi.doMock('@google/genai', () => ({
      GoogleGenAI: class {
        models = { generateContent: vi.fn().mockRejectedValue(new Error('API error')) }
      },
      Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', NUMBER: 'NUMBER' },
    }))

    const { extractTransactionsWithGemini } = await import('./gemini')
    const result = await extractTransactionsWithGemini('some statement text')

    expect(result).toBeNull()
  })

  it('returns null when the response has no text', async () => {
    vi.resetModules()
    vi.doMock('@google/genai', () => ({
      GoogleGenAI: class {
        models = { generateContent: vi.fn().mockResolvedValue({ text: undefined }) }
      },
      Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', NUMBER: 'NUMBER' },
    }))

    const { extractTransactionsWithGemini } = await import('./gemini')
    const result = await extractTransactionsWithGemini('some statement text')

    expect(result).toBeNull()
  })
})
