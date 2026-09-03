import fs from 'fs'
import pdfParse from 'pdf-parse'
import { ParsedTransaction } from '../types'
import { extractTransactionsWithClaude } from '../lib/claude'

interface ParserResult {
  bankName: string
  transactions: ParsedTransaction[]
  rawText: string
}

// ─── Supported banks list ─────────────────────────────────────────────────────

export const SUPPORTED_BANKS = [
  'GTBank',
  'Access Bank',
  'Zenith Bank',
  'First Bank',
  'UBA',
  'Union Bank',
  'Sterling Bank',
  'Fidelity Bank',
  'Polaris Bank',
  'Stanbic IBTC',
  'Kuda Bank',
  'Opay',
  'Palmpay',
  'Moniepoint',
  'Wema Bank',
  'Ecobank',
  'FCMB',
  'Jaiz Bank',
]

// ─── Bank detection ───────────────────────────────────────────────────────────
// Only check the first 500 characters (header) to avoid false positives
// from bank names appearing in transaction descriptions

function detectBank(text: string): string {
  // Kuda's page-footer legal text ("Kuda MF Bank (RC...", "trademarks of Kuda
  // Technologies") is a far more reliable signal than a header substring —
  // it's unambiguously the issuer's own boilerplate, not something a
  // counterparty transaction description could plausibly contain, so it's
  // safe to check across the whole document rather than just the header.
  if (/kuda mf bank|kuda technologies/i.test(text)) return 'Kuda Bank'
  // Same reasoning for Access Bank: its statement's own domain appears only
  // in the customer-service footer, never in the header, and is not
  // something a counterparty description would plausibly contain.
  if (/accessbankplc\.com/i.test(text)) return 'Access Bank'

  const header = text.slice(0, 500).toLowerCase()

  if (header.includes('kuda')) return 'Kuda Bank'
  if (header.includes('guaranty trust') || header.includes('gtbank')) return 'GTBank'
  if (header.includes('access bank')) return 'Access Bank'
  if (header.includes('zenith bank')) return 'Zenith Bank'
  if (header.includes('first bank') || header.includes('firstbank')) return 'First Bank'
  if (header.includes('united bank for africa') || header.includes('uba ')) return 'UBA'
  if (header.includes('union bank')) return 'Union Bank'
  if (header.includes('sterling bank')) return 'Sterling Bank'
  if (header.includes('fidelity bank')) return 'Fidelity Bank'
  if (header.includes('polaris bank')) return 'Polaris Bank'
  if (header.includes('stanbic')) return 'Stanbic IBTC'
  if (header.includes('opay')) return 'Opay'
  if (header.includes('palmpay')) return 'Palmpay'
  if (header.includes('moniepoint')) return 'Moniepoint'
  if (header.includes('wema bank')) return 'Wema Bank'
  if (header.includes('ecobank')) return 'Ecobank'
  if (header.includes('fcmb')) return 'FCMB'

  return 'Unknown Bank'
}

// ─── Amount parser ────────────────────────────────────────────────────────────

function parseAmount(raw: string): number {
  // Remove ₦, commas, spaces
  return parseFloat(raw.replace(/[₦,\s]/g, ''))
}

// ─── Date parser ──────────────────────────────────────────────────────────────

function parseDate(raw: string): Date {
  const cleaned = raw.trim()

  // DD/MM/YY or DD/MM/YYYY
  const parts = cleaned.split('/')
  if (parts.length === 3) {
    const [d, m, y] = parts
    const year = y.length === 2 ? `20${y}` : y
    const date = new Date(
      `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    )
    if (!isNaN(date.getTime())) return date
  }

  const fallback = new Date(cleaned)
  return isNaN(fallback.getTime()) ? new Date() : fallback
}

// ─── Kuda Bank parser ─────────────────────────────────────────────────────────
// Kuda statements are multi-line. Each transaction block looks like:
// DD/MM/YY
// HH:MM:SS
// ₦AMOUNT
// inward/outward transfer | bills
// recipient/description
// category
// ₦BALANCE

function parseKuda(text: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = []

  // Split into lines and clean up
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const datePattern = /^\d{2}\/\d{2}\/\d{2}$/
  const timePattern = /^\d{2}:\d{2}:\d{2}$/
  const amountPattern = /^₦[\d,]+\.\d{2}$/

  let i = 0
  while (i < lines.length) {
    // Look for a date line
    if (datePattern.test(lines[i])) {
      const date = parseDate(lines[i])

      // Next line should be time — skip it
      let j = i + 1
      if (j < lines.length && timePattern.test(lines[j])) j++

      // Next should be amount
      if (j < lines.length && amountPattern.test(lines[j])) {
        const amount = parseAmount(lines[j])
        j++

        // Next is transfer type
        let type: 'DEBIT' | 'CREDIT' = 'DEBIT'
        if (j < lines.length) {
          const transferLine = lines[j].toLowerCase()
          if (
            transferLine.includes('inward') ||
            transferLine.includes('credit') ||
            transferLine.includes('reversal')
          ) {
            type = 'CREDIT'
          }
          j++
        }

        // Collect description lines until we hit a balance (₦amount)
        const descLines: string[] = []
        while (j < lines.length && !amountPattern.test(lines[j])) {
          // Stop if we hit the next date
          if (datePattern.test(lines[j])) break
          descLines.push(lines[j])
          j++
        }

        // Skip the balance line
        if (j < lines.length && amountPattern.test(lines[j])) j++

        const description = descLines
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 100)

        if (amount > 0 && description.length > 0) {
          transactions.push({
            date,
            description,
            amount,
            type,
            rawText: `${lines[i]} ${amount} ${type}`,
          })
        }

        i = j
        continue
      }
    }
    i++
  }

  return transactions
}

// ─── Generic single-line parser ───────────────────────────────────────────────
// For GTBank, Access, Zenith, First Bank etc.

const SINGLE_LINE_PATTERNS = [
  // DD/MM/YYYY description AMOUNT DR/CR
  /(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(DR|CR|Debit|Credit)/gi,

  // DD-Mon-YYYY description AMOUNT
  /(\d{2}[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-\s]\d{4})\s+(.+?)\s+([\d,]+\.\d{2})/gi,

  // Generic date + two amounts
  /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.{5,80}?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/gi,
]

function inferType(line: string): 'DEBIT' | 'CREDIT' {
  const upper = line.toUpperCase()
  if (upper.includes(' CR') || upper.includes('CREDIT') || upper.includes('SALARY') || upper.includes(' FROM ')) return 'CREDIT'
  return 'DEBIT'
}

function parseGeneric(text: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = []
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  for (const line of lines) {
    for (const pattern of SINGLE_LINE_PATTERNS) {
      pattern.lastIndex = 0
      const match = pattern.exec(line)

      if (match) {
        const [rawLine, rawDate, description, rawAmount, drCr] = match
        const amount = parseFloat(rawAmount.replace(/,/g, ''))
        const date = parseDate(rawDate)
        const type = drCr
          ? drCr.toUpperCase().startsWith('C') ? 'CREDIT' : 'DEBIT'
          : inferType(rawLine)

        if (amount > 0 && description.length > 2) {
          transactions.push({
            date,
            description: description.trim(),
            amount,
            type,
            rawText: line,
          })
        }
        break
      }
    }
  }

  return transactions
}

// ─── Concatenated-column wallet parser ─────────────────────────────────────────
// Some fintech wallet statements (e.g. OPay) export tables whose columns get
// squashed together with no separator once pdf-parse flattens them to text.
// Each row looks like:
//   DD Mon YYYY HH:MM:SSDD Mon YYYY      <- trans datetime + value date, no gap
//   Description text (may wrap to 2+ lines)
//   (--|amount)(--|amount)(amount)Channel<reference noise, may wrap>
// The three leading amount-or-"--" groups are Debit, Credit, Balance After, in
// that fixed column order — so type is read from which column is populated,
// never guessed from the description text.

const WALLET_START =
  /^(\d{2}\s[A-Za-z]{3}\s\d{4}\s\d{2}:\d{2}:\d{2})(\d{2}\s[A-Za-z]{3}\s\d{4})$/
const WALLET_AMOUNTS = /^(--|[\d,]+\.\d{2})(--|[\d,]+\.\d{2})([\d,]+\.\d{2})/

function parseConcatenatedTable(text: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = []
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  let i = 0
  while (i < lines.length) {
    const startMatch = WALLET_START.exec(lines[i])
    if (!startMatch) {
      i++
      continue
    }

    const datePortion = startMatch[1].match(/^\d{2}\s[A-Za-z]{3}\s\d{4}/)![0]
    const date = parseDate(datePortion)

    let j = i + 1
    const descLines: string[] = []
    while (j < lines.length && !WALLET_AMOUNTS.test(lines[j])) {
      if (WALLET_START.test(lines[j])) break
      descLines.push(lines[j])
      j++
    }

    if (j < lines.length && WALLET_AMOUNTS.test(lines[j])) {
      const amountsMatch = WALLET_AMOUNTS.exec(lines[j])!
      const [, debitRaw, creditRaw] = amountsMatch
      const isCredit = creditRaw !== '--'
      const amount = parseAmount(isCredit ? creditRaw : debitRaw)
      const type: 'DEBIT' | 'CREDIT' = isCredit ? 'CREDIT' : 'DEBIT'
      const description = descLines
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200)

      // Consume trailing channel/reference noise up to the next transaction.
      let k = j + 1
      while (k < lines.length && !WALLET_START.test(lines[k])) k++

      if (amount > 0 && description.length > 0) {
        transactions.push({
          date,
          description,
          amount,
          type,
          rawText: [lines[i], ...descLines, lines[j]].join(' '),
        })
      }

      i = k
      continue
    }

    i++
  }

  return transactions
}

// ─── Trailing-balance ledger parser ────────────────────────────────────────────
// A single-amount-per-row layout (seen in Kuda's newer statement export):
//   DD/MM/YY
//   HH:MM:SS
//   ₦AMOUNT + direction word, concatenated (e.g. "₦40,000.00outward")
//   "transfer" (only present for plain inward/outward transfers)
//   description lines (counterparty details, may wrap)
//   [category tag]₦BALANCE, concatenated — marks the block's end
// Some rows collapse everything onto the amount line itself:
//   ₦20,000.00phone - credit₦2,391.03
//
// The "inward"/"outward" label is usually reliable, but verified against
// real statement data it mislabels a few internal-movement categories as
// "outward" even though they add money back (a reversal, a flexible-savings
// or fixed-savings-pot withdrawal into the main wallet, a savings-account
// closure refund) — those are recognized by keyword and reclassified.
const CREDIT_KEYWORDS = /reversal|withdrawal|closure/i

const LEDGER_BOILERPLATE = [
  /kuda mf bank/i,
  /licensed by the central bank/i,
  /commercial avenue/i,
  /finsbury pavement/i,
  /^page \d+ of \d+$/i,
]
const LEDGER_DATE_LINE = /^\d{2}\/\d{2}\/\d{2}$/
const LEDGER_TIME_LINE = /^\d{2}:\d{2}:\d{2}$/
const LEDGER_AMOUNT_TYPE_LINE = /^₦([\d,]+\.\d{2})([A-Za-z].*)$/
const LEDGER_TRAILING_BALANCE = /^(.*)₦([\d,]+\.\d{2})$/

function parseTrailingBalanceLedger(text: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = []
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !LEDGER_BOILERPLATE.some((p) => p.test(l)))

  let i = 0
  while (i < lines.length) {
    if (!LEDGER_DATE_LINE.test(lines[i])) {
      i++
      continue
    }
    const dateLine = lines[i]
    if (i + 1 >= lines.length || !LEDGER_TIME_LINE.test(lines[i + 1])) {
      i++
      continue
    }
    if (i + 2 >= lines.length) {
      i++
      continue
    }
    const amtMatch = LEDGER_AMOUNT_TYPE_LINE.exec(lines[i + 2])
    if (!amtMatch) {
      i++
      continue
    }

    const amount = parseAmount(amtMatch[1])
    const typeSuffix = amtMatch[2]

    // Some rows collapse type + description + balance onto this one line.
    const inlineMatch = LEDGER_TRAILING_BALANCE.exec(typeSuffix)
    if (inlineMatch) {
      const description = inlineMatch[1].replace(/\s+/g, ' ').trim().slice(0, 200)
      const type: 'DEBIT' | 'CREDIT' = CREDIT_KEYWORDS.test(description)
        ? 'CREDIT'
        : 'DEBIT'
      if (amount > 0 && description.length > 0) {
        transactions.push({
          date: parseDate(dateLine),
          description,
          amount,
          type,
          rawText: `${dateLine} ${lines[i + 2]}`,
        })
      }
      i = i + 3
      continue
    }

    let j = i + 3
    const descParts: string[] = []
    const bareDirection =
      typeSuffix.toLowerCase() === 'inward' || typeSuffix.toLowerCase() === 'outward'
    if (!bareDirection) descParts.push(typeSuffix)
    else if (j < lines.length && lines[j].toLowerCase() === 'transfer') j++

    let matchedBalance: string | null = null
    while (j < lines.length) {
      if (LEDGER_DATE_LINE.test(lines[j])) break
      const balMatch = LEDGER_TRAILING_BALANCE.exec(lines[j])
      if (balMatch) {
        if (balMatch[1]) descParts.push(balMatch[1])
        matchedBalance = balMatch[2]
        j++
        break
      }
      descParts.push(lines[j])
      j++
    }

    if (matchedBalance === null) {
      i++
      continue
    }

    const description = descParts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 200)
    let type: 'DEBIT' | 'CREDIT' = typeSuffix.toLowerCase().startsWith('inward')
      ? 'CREDIT'
      : 'DEBIT'
    if (CREDIT_KEYWORDS.test(description)) type = 'CREDIT'

    if (amount > 0 && description.length > 0) {
      transactions.push({
        date: parseDate(dateLine),
        description,
        amount,
        type,
        rawText: `${dateLine} ${lines[i + 2]} ${description}`,
      })
    }

    i = j
  }

  return transactions
}

// ─── Three-column ledger parser ────────────────────────────────────────────────
// Access Bank's export: each row is
//   DD-MON-YY (posted) + DD-MON-YY (value), glued with no separator
//   description text, may continue on the same line or wrap onto more lines
//   [Debit or "-"][Credit or "-"][Balance], glued to the end of the description
// A single "-" (not "--") marks an empty debit/credit cell.
const LEDGER3_BOILERPLATE = [
  /^posted datevalue date/i,
  /automated transaction alert/i,
  /^page \d+/i,
  /^transactions$/i,
  /contactcenter@/i,
  /^\d+, \+234/,
]
const LEDGER3_DATE_LINE = /^(\d{2}-[A-Za-z]{3}-\d{2})(\d{2}-[A-Za-z]{3}-\d{2})(.*)$/
const LEDGER3_TAIL = /^(.*?)(?<!\d)(-|[\d,]+\.\d{2})(-|[\d,]+\.\d{2})([\d,]+\.\d{2})$/
// A date fragment like ".../26" immediately followed by an amount with no
// separator ("26150.00") is textually indistinguishable from a single
// larger amount — inserting a boundary right after the 2-digit year is the
// only way to disambiguate it from the real amount that follows.
const LEDGER3_EMBEDDED_DATE_GLUE = /(\d{2}\/\d{2}\/\d{2})(\d)/

function parseThreeColumnLedger(text: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = []
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !LEDGER3_BOILERPLATE.some((p) => p.test(l)))

  let i = 0
  while (i < lines.length) {
    const dm = LEDGER3_DATE_LINE.exec(lines[i])
    if (!dm) {
      i++
      continue
    }
    const dateLine = dm[1]
    let block = dm[3] || ''
    let j = i + 1
    while (j < lines.length && !LEDGER3_DATE_LINE.test(lines[j])) {
      block += (block ? ' ' : '') + lines[j]
      j++
    }
    block = block.replace(LEDGER3_EMBEDDED_DATE_GLUE, '$1 $2')

    const tm = LEDGER3_TAIL.exec(block.trim())
    if (tm) {
      const description = tm[1].replace(/\s+/g, ' ').trim().slice(0, 200)
      const debitRaw = tm[2]
      const creditRaw = tm[3]
      const isCredit = creditRaw !== '-'
      const amount = parseAmount(isCredit ? creditRaw : debitRaw)
      const type: 'DEBIT' | 'CREDIT' = isCredit ? 'CREDIT' : 'DEBIT'

      if (amount > 0 && description.length > 0) {
        transactions.push({
          date: parseDate(dateLine),
          description,
          amount,
          type,
          rawText: `${dateLine} ${description} ${tm[2]} ${tm[3]} ${tm[4]}`,
        })
      }
    }

    i = j
  }

  return transactions
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export async function parsePdf(filePath: string): Promise<ParserResult> {
  const buffer = fs.readFileSync(filePath)
  const parsed = await pdfParse(buffer)
  const rawText = parsed.text

  const bankName = detectBank(rawText)

  // Extraction never gates on which bank was detected — bank identity is
  // unreliable to detect and statements from the same bank can still vary
  // by layout. Every strategy runs unconditionally; whichever extracts the
  // most transactions wins.
  const candidates = [
    parseKuda(rawText),
    parseGeneric(rawText),
    parseConcatenatedTable(rawText),
    parseTrailingBalanceLedger(rawText),
    parseThreeColumnLedger(rawText),
  ]
  let transactions = candidates.reduce((best, current) =>
    current.length > best.length ? current : best
  )
  let finalBankName = bankName

  console.log(
    `[Parser] Bank: ${bankName} | Extracted ${transactions.length} transactions ` +
      `(candidates: ${candidates.map((c) => c.length).join('/')})`
  )

  // None of the hand-written parsers recognized this layout — fall back to
  // LLM extraction, which generalizes to statement formats no parser here
  // was built for, instead of failing outright.
  if (transactions.length === 0) {
    const claudeResult = await extractTransactionsWithClaude(rawText)
    if (claudeResult && claudeResult.transactions.length > 0) {
      transactions = claudeResult.transactions
      if (finalBankName === 'Unknown Bank') finalBankName = claudeResult.bankName
      console.log(
        `[Parser] Claude fallback extracted ${transactions.length} transactions`
      )
    }
  }

  return { bankName: finalBankName, transactions, rawText }
}

// ─── Text chunker ─────────────────────────────────────────────────────────────

export function chunkText(
  text: string,
  chunkSize = 500,
  overlap = 50
): string[] {
  const words = text.split(/\s+/)
  const chunks: string[] = []

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ')
    if (chunk.trim()) chunks.push(chunk.trim())
    if (i + chunkSize >= words.length) break
  }

  return chunks
}