import { prisma } from '../lib/prisma'
import { AnalyticsSummary, SpendingByCategory, MonthlyFlow } from '../types'

export async function getAnalytics(
  documentId: string,
  userId: string
): Promise<AnalyticsSummary | null> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, userId },
  })
  if (!document) return null

  const transactions = await prisma.transaction.findMany({
    where: { documentId },
    orderBy: { date: 'asc' },
  })

  if (transactions.length === 0) {
    return {
      documentId,
      totalCredits: 0,
      totalDebits: 0,
      netFlow: 0,
      transactionCount: 0,
      spendingByCategory: [],
      monthlyFlow: [],
      topMerchants: [],
    }
  }

  // ─── Totals ───────────────────────────────────────────────────────────────

  let totalCredits = 0
  let totalDebits = 0

  for (const t of transactions) {
    const amount = Number(t.amount)
    if (t.type === 'CREDIT') totalCredits += amount
    else totalDebits += amount
  }

  // ─── Spending by category ─────────────────────────────────────────────────

  const categoryMap = new Map<string, { total: number; count: number }>()

  for (const t of transactions) {
    if (t.type === 'DEBIT') {
      const cat = t.category || 'Other'
      const existing = categoryMap.get(cat) || { total: 0, count: 0 }
      categoryMap.set(cat, {
        total: existing.total + Number(t.amount),
        count: existing.count + 1,
      })
    }
  }

  const spendingByCategory: SpendingByCategory[] = Array.from(
    categoryMap.entries()
  )
    .map(([category, { total, count }]) => ({
      category,
      total,
      count,
      percentage: totalDebits > 0 ? (total / totalDebits) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // ─── Monthly flow ─────────────────────────────────────────────────────────

  const monthMap = new Map<string, { credits: number; debits: number }>()

  for (const t of transactions) {
    const key = `${t.date.getFullYear()}-${String(
      t.date.getMonth() + 1
    ).padStart(2, '0')}`
    const existing = monthMap.get(key) || { credits: 0, debits: 0 }
    if (t.type === 'CREDIT') existing.credits += Number(t.amount)
    else existing.debits += Number(t.amount)
    monthMap.set(key, existing)
  }

  const monthlyFlow: MonthlyFlow[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { credits, debits }]) => ({
      month,
      totalCredits: credits,
      totalDebits: debits,
      netFlow: credits - debits,
    }))

  // ─── Top merchants ────────────────────────────────────────────────────────

  const merchantMap = new Map<string, number>()
  for (const t of transactions) {
    if (t.type === 'DEBIT') {
      const key = t.description.slice(0, 40)
      merchantMap.set(key, (merchantMap.get(key) || 0) + Number(t.amount))
    }
  }

  const topMerchants = Array.from(merchantMap.entries())
    .map(([description, total]) => ({ description, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  return {
    documentId,
    totalCredits,
    totalDebits,
    netFlow: totalCredits - totalDebits,
    transactionCount: transactions.length,
    spendingByCategory,
    monthlyFlow,
    topMerchants,
  }
}