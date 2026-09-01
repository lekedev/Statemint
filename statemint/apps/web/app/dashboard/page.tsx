'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, TrendingUp, Calculator, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import UploadZone from '@/components/ui/UploadZone'
import { Document } from '@/types'
import { formatDate, getStatusLabel } from '@/lib/utils'
import api from '@/lib/api'

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    COMPLETED: 'badge badge-green',
    FAILED: 'badge badge-red',
    PENDING: 'badge badge-yellow',
    PARSING: 'badge badge-blue',
    CATEGORIZING: 'badge badge-blue',
    EMBEDDING: 'badge badge-blue',
  }
  return <span className={cls[status] || 'badge badge-blue'}>{getStatusLabel(status)}</span>
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'COMPLETED') return <CheckCircle size={15} style={{ color: '#00D97E', flexShrink: 0 }} />
  if (status === 'FAILED') return <XCircle size={15} style={{ color: '#FF4D4D', flexShrink: 0 }} />
  return <Loader2 size={15} style={{ color: '#60A5FA', flexShrink: 0 }} className="animate-spin" />
}

export default function DashboardPage() {
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await api.get('/documents')
      setDocuments(res.data.data || [])
    } catch { /* auth interceptor handles */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  function handleUploadComplete(doc: Document) {
    setDocuments((prev) => [doc, ...prev])
    pollStatus(doc.id)
  }

  async function pollStatus(docId: string) {
    const iv = setInterval(async () => {
      try {
        const res = await api.get(`/documents/${docId}/status`)
        const updated = res.data.data
        setDocuments((prev) => prev.map((d) => d.id === docId ? { ...d, ...updated } : d))
        if (updated.status === 'COMPLETED' || updated.status === 'FAILED') clearInterval(iv)
      } catch { clearInterval(iv) }
    }, 2000)
  }

  const completed = documents.filter((d) => d.status === 'COMPLETED').length
  const processing = documents.filter((d) =>
    ['PENDING', 'PARSING', 'CATEGORIZING', 'EMBEDDING'].includes(d.status)
  ).length

  return (
    <AppShell>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
          Overview
        </p>
        <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
          Dashboard
        </h1>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total', value: documents.length, color: '#fff' },
          { label: 'Ready', value: completed, color: '#00D97E' },
          { label: 'Processing', value: processing, color: '#60A5FA' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
            <p style={{ fontSize: 32, fontWeight: 800, color, letterSpacing: '-0.03em' }}>{value}</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Upload */}
      <div className="card" style={{ marginBottom: 24 }}>
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Upload Statement</p>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 16 }}>
          GTBank · Kuda · Access · Zenith · UBA · and more
        </p>
        <UploadZone onUploadComplete={handleUploadComplete} />
      </div>

      {/* Documents list */}
      {!loading && documents.length > 0 && (
        <div className="card">
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Statements</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {documents.map((doc) => (
              <div
                key={doc.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'transparent',
                  transition: 'background 0.15s',
                  cursor: 'default',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{
                  width: 38, height: 38,
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <FileText size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <StatusIcon status={doc.status} />
                    <p style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>
                      {doc.bankName || 'Detecting bank...'}
                    </p>
                    <StatusBadge status={doc.status} />
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                    {doc.fileName} ·{' '}
                    {doc.transactionCount ? `${doc.transactionCount} transactions` : 'Processing...'}{' '}
                    · {formatDate(doc.createdAt)}
                  </p>
                </div>

                {doc.status === 'COMPLETED' && (
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => router.push(`/analytics/${doc.id}`)}
                      className="btn-secondary"
                      style={{ padding: '7px 14px', fontSize: 12 }}
                    >
                      <TrendingUp size={12} />
                      <span>Analytics</span>
                    </button>
                    <button
                      onClick={() => router.push(`/tax/${doc.id}`)}
                      className="btn-primary"
                      style={{ padding: '7px 14px', fontSize: 12 }}
                    >
                      <Calculator size={12} />
                      <span>Tax</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && documents.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{
            width: 56, height: 56,
            background: 'rgba(0,217,126,0.10)',
            border: '1px solid rgba(0,217,126,0.20)',
            borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <FileText size={24} style={{ color: '#00D97E' }} />
          </div>
          <p style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>No statements yet</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 6, maxWidth: 280, margin: '6px auto 0' }}>
            Upload your first bank statement to see spending insights and tax calculations
          </p>
        </div>
      )}
    </AppShell>
  )
}