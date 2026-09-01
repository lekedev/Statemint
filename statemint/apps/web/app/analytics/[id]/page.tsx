'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts'
import {
  ArrowLeft, TrendingUp, TrendingDown,
  MessageCircle, Send, Loader2
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { Analytics, ChatMessage } from '@/types'
import { formatCurrency } from '@/lib/utils'
import api from '@/lib/api'

const CATEGORY_COLORS = [
  '#00D97E', '#60A5FA', '#F59E0B', '#F87171',
  '#A78BFA', '#34D399', '#FB923C', '#38BDF8',
]

function StatBox({
  label, value, sub, positive, negative
}: {
  label: string
  value: string
  sub?: string
  positive?: boolean
  negative?: boolean
}) {
  const color = positive ? '#00D97E' : negative ? '#FF4D4D' : '#fff'
  return (
    <div className="card" style={{ padding: '20px' }}>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </p>
      <p style={{ color, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{value}</p>
      {sub && <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: {active?: boolean, payload?: {value: number, name: string}[], label?: string}) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1A1A26', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 14px' }}>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 6 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.name === 'totalCredits' ? '#00D97E' : '#FF4D4D', fontSize: 13, fontWeight: 600 }}>
          {p.name === 'totalCredits' ? 'In' : 'Out'}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get(`/analytics/${id}`)
        setAnalytics(res.data.data)
      } catch { router.push('/dashboard') }
      finally { setLoading(false) }
    }
    load()
  }, [id, router])

  async function sendMessage() {
    if (!question.trim() || chatLoading) return
    const userMsg: ChatMessage = { role: 'user', content: question }
    setMessages((prev) => [...prev, userMsg])
    setQuestion('')
    setChatLoading(true)

    try {
      const res = await api.post(`/analytics/${id}/chat`, {
        question: userMsg.content,
        history: messages,
      })
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.data.data.answer },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <Loader2 size={32} style={{ color: '#00D97E' }} className="animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!analytics) return null

  const netPositive = analytics.netFlow >= 0

  return (
    <AppShell>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button onClick={() => router.push('/dashboard')} className="btn-ghost" style={{ padding: '8px 10px' }}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Analytics
          </p>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Statement Overview
          </h1>
        </div>
      </div>

      {/* Key stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatBox label="Money In" value={formatCurrency(analytics.totalCredits)} positive sub={`${analytics.transactionCount} transactions`} />
        <StatBox label="Money Out" value={formatCurrency(analytics.totalDebits)} negative />
        <StatBox
          label="Net Flow"
          value={formatCurrency(Math.abs(analytics.netFlow))}
          positive={netPositive}
          negative={!netPositive}
          sub={netPositive ? 'You saved money' : 'You spent more than you earned'}
        />
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          {netPositive
            ? <TrendingUp size={28} style={{ color: '#00D97E' }} />
            : <TrendingDown size={28} style={{ color: '#FF4D4D' }} />
          }
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center' }}>
            {netPositive ? 'Positive cash flow' : 'Negative cash flow'}
          </p>
        </div>
      </div>

      {/* Monthly flow chart */}
      {analytics.monthlyFlow.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Monthly Flow</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={analytics.monthlyFlow} barGap={4}>
              <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="totalCredits" fill="#00D97E" radius={[6, 6, 0, 0]} maxBarSize={40} />
              <Bar dataKey="totalDebits" fill="#FF4D4D" radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12 }}>
            {[{ color: '#00D97E', label: 'Money In' }, { color: '#FF4D4D', label: 'Money Out' }].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spending by category */}
      {analytics.spendingByCategory.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Spending by Category</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {analytics.spendingByCategory.map((cat, i) => (
              <div key={cat.category} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < analytics.spendingByCategory.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500 }}>{cat.category}</p>
                    <p style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{formatCurrency(cat.total)}</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 999, height: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${cat.percentage}%`, height: '100%', background: CATEGORY_COLORS[i % CATEGORY_COLORS.length], borderRadius: 999, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, flexShrink: 0, width: 36, textAlign: 'right' }}>{cat.percentage.toFixed(0)}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top merchants */}
      {analytics.topMerchants.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Top Merchants</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {analytics.topMerchants.slice(0, 5).map((m, i) => (
              <div key={m.description} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)' }}>
                <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: 700, width: 20, flexShrink: 0 }}>
                  {String(i + 1).padStart(2, '0')}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.description}
                </p>
                <p style={{ color: '#FF4D4D', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {formatCurrency(m.total)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <MessageCircle size={18} style={{ color: '#00D97E' }} />
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Ask your statement</p>
        </div>

        {/* Messages */}
        {messages.length > 0 && (
          <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: msg.role === 'user' ? 'rgba(0,217,126,0.15)' : 'rgba(255,255,255,0.06)',
                  border: msg.role === 'user' ? '1px solid rgba(0,217,126,0.25)' : '1px solid rgba(255,255,255,0.08)',
                  fontSize: 13,
                  color: msg.role === 'user' ? '#00D97E' : 'rgba(255,255,255,0.8)',
                  lineHeight: 1.5,
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display: 'flex' }}>
                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.06)', borderRadius: '14px 14px 14px 4px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <Loader2 size={14} style={{ color: '#00D97E' }} className="animate-spin" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Suggested questions */}
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {[
              'What is my biggest expense?',
              'How much did I spend on transfers?',
              'What is my net savings?',
            ].map((q) => (
              <button
                key={q}
                onClick={() => setQuestion(q)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: 'rgba(255,255,255,0.55)',
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            className="input"
            placeholder="Ask anything about your statement..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          />
          <button
            onClick={sendMessage}
            disabled={!question.trim() || chatLoading}
            className="btn-primary"
            style={{ padding: '11px 16px', flexShrink: 0 }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </AppShell>
  )
}