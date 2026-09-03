import { TRANSACTION_CATEGORIES } from '../lib/hf'

interface CategoryRule {
  category: (typeof TRANSACTION_CATEGORIES)[number]
  keywords: string[]
}

// Ordered from most to least specific — the first matching rule wins, so
// narrower signals (a fee, a specific subscription) are listed ahead of
// broad ones (a generic transfer) that would otherwise shadow them.
const RULES: CategoryRule[] = [
  {
    category: 'Bank Charges & Fees',
    keywords: [
      'stamp duty',
      'sms alert',
      'card maintenance',
      'account maintenance',
      'vat on',
      'transfer fee',
      'commission',
      'levy',
      'service charge',
      'maintenance charge',
    ],
  },
  {
    category: 'ATM Withdrawal',
    keywords: ['atm withdrawal', 'cash withdrawal', 'atm wdl'],
  },
  {
    category: 'Salary & Income',
    keywords: ['salary', 'payroll', 'wages', 'stipend'],
  },
  {
    category: 'Airtime & Data',
    keywords: [
      'airtime',
      'data bundle',
      'recharge',
      'mtn',
      'airtel',
      'glo',
      '9mobile',
      'data purchase',
    ],
  },
  {
    category: 'Utilities & Bills',
    keywords: [
      'electricity',
      'phcn',
      'nepa',
      'water bill',
      'dstv',
      'gotv',
      'startimes',
      'internet subscription',
      'utility',
    ],
  },
  {
    category: 'Entertainment',
    keywords: ['netflix', 'spotify', 'showmax', 'cinema', 'movie', 'amazon prime'],
  },
  {
    category: 'Transportation',
    keywords: ['uber', 'bolt', 'taxify', 'fuel', 'petrol', 'diesel', 'transport', 'fare'],
  },
  {
    category: 'Healthcare',
    keywords: ['hospital', 'clinic', 'pharmacy', 'medical', 'health insurance', 'drugs'],
  },
  {
    category: 'Education',
    keywords: ['school fees', 'tuition', 'jamb', 'waec', 'university', 'college fee'],
  },
  {
    category: 'Investment',
    keywords: [
      'owealth',
      'savings',
      'mutual fund',
      'stock',
      'investment',
      'piggyvest',
      'cowrywise',
      'treasury bill',
    ],
  },
  {
    category: 'Food & Dining',
    keywords: ['restaurant', 'eatery', 'kitchen', 'bukka', 'shoprite', 'supermarket'],
  },
  {
    category: 'Shopping & Retail',
    keywords: ['jumia', 'konga', 'merchant', 'pos purchase', 'store', 'mall', 'retail'],
  },
  {
    category: 'Transfer',
    keywords: ['transfer to', 'transfer from', 'inward transfer', 'outward transfer'],
  },
]

// Fast, local, deterministic categorization — no external API call, so it
// never times out or rate-limits regardless of how many transactions a
// statement has. Confidence is a fixed value indicating a rule matched,
// not a probability; there is no model behind it to calibrate one.
export function categorizeByRules(description: string): {
  category: string
  confidence: number
} {
  const text = description.toLowerCase()

  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return { category: rule.category, confidence: 0.85 }
    }
  }

  return { category: 'Other', confidence: 0 }
}

export function categorizeBatchByRules(
  descriptions: string[]
): Array<{ category: string; confidence: number }> {
  return descriptions.map(categorizeByRules)
}
