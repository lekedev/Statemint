import { describe, it, expect, vi } from 'vitest'

vi.mock('fs', () => ({
  default: { readFileSync: vi.fn(() => Buffer.from('fake-pdf-bytes')) },
  readFileSync: vi.fn(() => Buffer.from('fake-pdf-bytes')),
}))

describe('parsePdf', () => {
  it('detects GTBank and extracts single-line transactions', async () => {
    vi.resetModules()
    vi.doMock('pdf-parse', () => ({
      default: vi.fn().mockResolvedValue({
        text: [
          'GTBank e-Statement',
          'Account Number: 0123456789',
          '',
          '01/03/2026 POS Purchase SHOPRITE 15,000.00 DR',
          '05/03/2026 SALARY PAYMENT XYZ LTD 250,000.00 CR',
        ].join('\n'),
      }),
    }))

    const { parsePdf } = await import('./parser.service')
    const result = await parsePdf('/fake/path.pdf')

    expect(result.bankName).toBe('GTBank')
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0]).toMatchObject({
      description: 'POS Purchase SHOPRITE',
      amount: 15_000,
      type: 'DEBIT',
    })
    expect(result.transactions[1]).toMatchObject({
      description: 'SALARY PAYMENT XYZ LTD',
      amount: 250_000,
      type: 'CREDIT',
    })

    vi.doUnmock('pdf-parse')
  })

  it('detects Kuda Bank and extracts multi-line transactions', async () => {
    vi.resetModules()
    vi.doMock('pdf-parse', () => ({
      default: vi.fn().mockResolvedValue({
        text: [
          'Kuda Bank Statement',
          '',
          '05/03/26',
          '09:15:00',
          '₦50,000.00',
          'inward transfer',
          'JOHN DOE SALARY',
          'Salary',
          '₦120,000.00',
        ].join('\n'),
      }),
    }))

    const { parsePdf } = await import('./parser.service')
    const result = await parsePdf('/fake/path.pdf')

    expect(result.bankName).toBe('Kuda Bank')
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0]).toMatchObject({
      amount: 50_000,
      type: 'CREDIT',
    })
    expect(result.transactions[0].description).toContain('JOHN DOE SALARY')

    vi.doUnmock('pdf-parse')
  })

  it('falls back to Unknown Bank and the generic parser for unrecognized headers', async () => {
    vi.resetModules()
    vi.doMock('pdf-parse', () => ({
      default: vi.fn().mockResolvedValue({
        text: 'Some Random Bank\n\n01/03/2026 ATM Withdrawal 5,000.00 DR',
      }),
    }))

    const { parsePdf } = await import('./parser.service')
    const result = await parsePdf('/fake/path.pdf')

    expect(result.bankName).toBe('Unknown Bank')
    expect(result.transactions).toHaveLength(1)

    vi.doUnmock('pdf-parse')
  })

  it('extracts transactions from a concatenated-column wallet statement even when the bank is unrecognized', async () => {
    vi.resetModules()
    vi.doMock('pdf-parse', () => ({
      default: vi.fn().mockResolvedValue({
        text: [
          'Wallet Account',
          'Account Statement',
          '',
          '01 Aug 2026 08:21:5101 Aug 2026',
          'OWealth Withdrawal(Transaction Payment)',
          '--20,235.0020,235.00Mobile260801010201253026418548',
          '01 Aug 2026 08:21:3401 Aug 2026',
          'Third-Party Merchant Order | DEMERGE NIGERIA',
          'LIMITED',
          '20,235.00--0.00Mobile2608011403002527536838',
          '51',
        ].join('\n'),
      }),
    }))

    const { parsePdf } = await import('./parser.service')
    const result = await parsePdf('/fake/path.pdf')

    expect(result.bankName).toBe('Unknown Bank')
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0]).toMatchObject({
      description: 'OWealth Withdrawal(Transaction Payment)',
      amount: 20_235,
      type: 'CREDIT',
    })
    expect(result.transactions[1]).toMatchObject({
      description: 'Third-Party Merchant Order | DEMERGE NIGERIA LIMITED',
      amount: 20_235,
      type: 'DEBIT',
    })

    vi.doUnmock('pdf-parse')
  })
})

describe('chunkText', () => {
  it('splits text into overlapping word chunks', async () => {
    const { chunkText } = await import('./parser.service')
    const words = Array.from({ length: 12 }, (_, i) => `word${i}`).join(' ')

    const chunks = chunkText(words, 5, 1)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].split(' ')).toHaveLength(5)
  })

  it('returns a single chunk for text shorter than chunkSize', async () => {
    const { chunkText } = await import('./parser.service')
    const chunks = chunkText('one two three', 500, 50)

    expect(chunks).toEqual(['one two three'])
  })
})
