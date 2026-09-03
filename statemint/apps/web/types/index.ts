export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface Document {
  id: string
  fileName: string
  bankName: string | null
  status: 'PENDING' | 'PARSING' | 'CATEGORIZING' | 'EMBEDDING' | 'COMPLETED' | 'FAILED'
  createdAt: string
  parsedAt: string | null
  transactionCount?: number
  errorMessage?: string | null
}

export interface Analytics {
  documentId: string
  totalCredits: number
  totalDebits: number
  netFlow: number
  transactionCount: number
  spendingByCategory: {
    category: string
    total: number
    count: number
    percentage: number
  }[]
  monthlyFlow: {
    month: string
    totalCredits: number
    totalDebits: number
    netFlow: number
  }[]
  topMerchants: {
    description: string
    total: number
  }[]
}

export interface TaxCalculation {
  userType: 'PAYE' | 'SELF_EMPLOYED' | 'BUSINESS'
  taxYear: number
  grossIncome: number
  totalDeductions: number
  chargeableIncome: number
  totalTax: number
  monthlyTax: number
  effectiveRate: number
  isTaxFree: boolean
  breakdown: {
    band: string
    rate: number
    taxableAmount: number
    taxDue: number
  }[]
  deductions: {
    name: string
    amount: number
    applicable: boolean
    description: string
    saves: number
  }[]
  checklist: {
    item: string
    completed: boolean
    note: string
  }[]
  paymentGuide: {
    stateName: string
    irsName: string
    portal: string
    deadline: string
    steps: string[]
  }
}

export interface TaxDetection {
  suggestedType: 'PAYE' | 'SELF_EMPLOYED' | 'BUSINESS'
  grossIncome: number
  incomeBreakdown: {
    source: string
    amount: number
    count: number
  }[]
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface NigerianState {
  key: string
  name: string
  irsName: string
  portal: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}