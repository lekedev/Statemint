import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('categorizeTransaction', () => {
  const originalFetch = global.fetch
  const originalToken = process.env.HF_API_TOKEN

  beforeEach(() => {
    process.env.HF_API_TOKEN = 'test-token'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env.HF_API_TOKEN = originalToken
    vi.resetModules()
  })

  it('reads the top label and score from the real HF zero-shot response shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          sequence: 'POS Purchase SHOPRITE',
          labels: ['Shopping & Retail', 'Food & Dining', 'Other'],
          scores: [0.87, 0.09, 0.04],
        }),
    }) as unknown as typeof fetch

    const { categorizeTransaction } = await import('./hf')
    const result = await categorizeTransaction('POS Purchase SHOPRITE')

    expect(result).toEqual({ category: 'Shopping & Retail', confidence: 0.87 })
  })

  it('returns null when the HF response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: 'Internal error' }),
    }) as unknown as typeof fetch

    const { categorizeTransaction } = await import('./hf')
    const result = await categorizeTransaction('anything')

    expect(result).toBeNull()
  })

  it('returns null without retrying when the response body is not JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '<html><body>Too Many Requests</body></html>',
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const { categorizeTransaction } = await import('./hf')
    const result = await categorizeTransaction('anything')

    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
