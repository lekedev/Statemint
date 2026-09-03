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

  it('extracts transactions from a trailing-balance ledger and detects Kuda from footer text', async () => {
    vi.resetModules()
    vi.doMock('pdf-parse', () => ({
      default: vi.fn().mockResolvedValue({
        text: [
          'Opening Balance',
          '₦64.78',
          '12/05/26',
          '10:42:14',
          '₦100,000.00inward',
          'transfer',
          'Some Company Ltd/1310771808/Some Bank Plc',
          'salary₦100,064.78',
          '14/05/26',
          '08:40:46',
          '₦40,000.00outward',
          'transfer',
          'Jane Doe/9123361463/Some Bank',
          'savings₦60,064.78',
          '18/05/26',
          '14:43:41',
          '₦1,000.00outward',
          'transfer',
          'reversal of groceries₦61,064.78',
          '02/09/26',
          '18:51:28',
          '₦1,500.00airtimeairtime purchase',
          '2349066276550',
          '₦59,564.78',
          'Kuda MF Bank (RC796975). All rights reserved.',
          'Kuda MF Bank is licensed by the Central Bank of Nigeria.',
          'Page 1 of 1',
        ].join('\n'),
      }),
    }))

    const { parsePdf } = await import('./parser.service')
    const result = await parsePdf('/fake/path.pdf')

    expect(result.bankName).toBe('Kuda Bank')
    expect(result.transactions).toHaveLength(4)
    expect(result.transactions[0]).toMatchObject({ amount: 100_000, type: 'CREDIT' })
    expect(result.transactions[1]).toMatchObject({ amount: 40_000, type: 'DEBIT' })
    expect(result.transactions[2]).toMatchObject({
      description: 'reversal of groceries',
      amount: 1_000,
      type: 'CREDIT',
    })
    expect(result.transactions[3]).toMatchObject({
      description: 'airtimeairtime purchase 2349066276550',
      amount: 1_500,
      type: 'DEBIT',
    })

    vi.doUnmock('pdf-parse')
  })

  it('extracts transactions from a three-column ledger and detects Access Bank from footer text', async () => {
    vi.resetModules()
    vi.doMock('pdf-parse', () => ({
      default: vi.fn().mockResolvedValue({
        text: [
          'ACCOUNT STATEMENT',
          'Posted DateValue DateDescriptionDebit (NGN)Credit (NGN)Balance (NGN)',
          '03-AUG-2603-AUG-26Opening Balance-0.003,226.53',
          '07-AUG-2607-AUG-26SMS Alert Fee-29/06-28/07/2026 + VAT9.76-3,216.77',
          '10-AUG-2610-AUG-26MOBILE TRF TO PAY/ /JOHN DOE3,000.00-216.77',
          '30-AUG-2629-AUG-26FGN Stamp Duty for 3 txns 23/08-29/08/26150.00-29,917.33',
          '31-AUG-2601-SEP-26CREDIT INTEREST CAPITALIZATION-41.9629,959.29',
          'This is an automated transaction alert service. For enquiries call',
          '2802500, +234 0201-2712500-7 or send an email to contactcenter@accessbankplc.com',
        ].join('\n'),
      }),
    }))

    const { parsePdf } = await import('./parser.service')
    const result = await parsePdf('/fake/path.pdf')

    expect(result.bankName).toBe('Access Bank')
    expect(result.transactions).toHaveLength(4)
    expect(result.transactions[0]).toMatchObject({ amount: 9.76, type: 'DEBIT' })
    expect(result.transactions[1]).toMatchObject({ amount: 3_000, type: 'DEBIT' })
    expect(result.transactions[2]).toMatchObject({
      description: 'FGN Stamp Duty for 3 txns 23/08-29/08/26',
      amount: 150,
      type: 'DEBIT',
    })
    expect(result.transactions[3]).toMatchObject({ amount: 41.96, type: 'CREDIT' })

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
