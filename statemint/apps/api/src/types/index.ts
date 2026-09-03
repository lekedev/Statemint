// ─── API Response wrapper ────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string
  email: string
}

export interface AuthTokens {
  accessToken: string
}

// ─── Document ────────────────────────────────────────────────────────────────

export type DocumentStatus =
  | 'PENDING'
  | 'PARSING'
  | 'CATEGORIZING'
  | 'EMBEDDING'
  | 'COMPLETED'
  | 'FAILED'

export interface DocumentSummary {
  id: string
  fileName: string
  bankName: string | null
  status: DocumentStatus
  createdAt: string
  parsedAt: string | null
  transactionCount?: number
}

// ─── Transaction ─────────────────────────────────────────────────────────────

export type TransactionType = 'DEBIT' | 'CREDIT'

export interface ParsedTransaction {
  date: Date
  description: string
  amount: number
  type: TransactionType
  rawText?: string
}

export interface CategorizedTransaction extends ParsedTransaction {
  category: string
  confidence: number
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface SpendingByCategory {
  category: string
  total: number
  count: number
  percentage: number
}

export interface MonthlyFlow {
  month: string
  totalCredits: number
  totalDebits: number
  netFlow: number
}

export interface AnalyticsSummary {
  documentId: string
  totalCredits: number
  totalDebits: number
  netFlow: number
  transactionCount: number
  spendingByCategory: SpendingByCategory[]
  monthlyFlow: MonthlyFlow[]
  topMerchants: { description: string; total: number }[]
}

// ─── Q&A ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  documentId: string
  question: string
  history?: ChatMessage[]
}

export interface ChatResponse {
  answer: string
  sources?: string[]
}

// ─── Queue Jobs ──────────────────────────────────────────────────────────────

export interface ParseJobData {
  documentId: string
  filePath: string
  fileBuffer: string
  userId: string
}

export interface CategorizeJobData {
  documentId: string
  transactionIds: string[]
}

export interface EmbedJobData {
  documentId: string
}

export const QUEUE_NAMES = {
  PARSE: 'parse',
  CATEGORIZE: 'categorize',
  EMBED: 'embed',
} as const