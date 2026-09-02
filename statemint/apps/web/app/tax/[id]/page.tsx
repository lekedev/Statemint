'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TaxIntakeForm from '@/components/tax/TaxIntakeForm'
import TaxResults from '@/components/tax/TaxResults'
import { TaxCalculation, TaxDetection } from '@/types'
import api from '@/lib/api'

export default function TaxPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [result, setResult] = useState<TaxCalculation | null>(null)
  const [detection, setDetection] = useState<TaxDetection | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const summaryRes = await api.get(`/tax/${id}/summary`)
      setResult(summaryRes.data.data)
    } catch {
      try {
        const detectRes = await api.get(`/tax/${id}/detect`)
        setDetection(detectRes.data.data)
      } catch {
        /* proceed with no detection — the form still works without it */
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <AppShell>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <Loader2 size={32} style={{ color: 'var(--green)' }} className="animate-spin" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button onClick={() => router.push('/dashboard')} className="btn-ghost" style={{ padding: '8px 10px' }}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <p style={{ color: 'var(--gray-3)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Tax Calculator
          </p>
          <h1 style={{ color: 'var(--white)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {result ? 'Your tax summary' : 'Estimate your tax'}
          </h1>
        </div>
      </div>

      {result ? (
        <TaxResults result={result} />
      ) : (
        <TaxIntakeForm documentId={id} detection={detection} onCalculated={setResult} />
      )}
    </AppShell>
  )
}
