'use client'
import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { TaxCalculation, TaxDetection, NigerianState } from '@/types'

interface TaxIntakeFormProps {
  documentId: string
  detection: TaxDetection | null
  onCalculated: (result: TaxCalculation) => void
}

type UserType = 'PAYE' | 'SELF_EMPLOYED' | 'BUSINESS'

export default function TaxIntakeForm({ documentId, detection, onCalculated }: TaxIntakeFormProps) {
  const [states, setStates] = useState<NigerianState[]>([])
  const [userType, setUserType] = useState<UserType>(detection?.suggestedType || 'PAYE')
  const [stateOfResidence, setStateOfResidence] = useState('lagos')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [lifeInsurance, setLifeInsurance] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/tax/states').then((res) => setStates(res.data.data || []))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post(`/tax/${documentId}/calculate`, {
        userType,
        stateOfResidence,
        ...(monthlyRent && { monthlyRent: Number(monthlyRent) }),
        ...(lifeInsurance && { lifeInsurance: Number(lifeInsurance) }),
      })
      onCalculated(res.data.data)
    } catch {
      setError('Could not calculate tax. Please check your inputs and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
        Tell us about your income
      </p>
      <p style={{ color: 'var(--gray-2)', fontSize: 13, marginBottom: 20 }}>
        {detection
          ? `We detected ${detection.confidence.toLowerCase()}-confidence ${detection.suggestedType.replace('_', ' ').toLowerCase()} income from your statement.`
          : 'This helps us calculate accurate deductions and find your state tax portal.'}
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="label">Income type</label>
          <select className="input" value={userType} onChange={(e) => setUserType(e.target.value as UserType)}>
            <option value="PAYE">PAYE (Employed)</option>
            <option value="SELF_EMPLOYED">Self-employed</option>
            <option value="BUSINESS">Business owner</option>
          </select>
        </div>

        <div>
          <label className="label">State of residence</label>
          <select className="input" value={stateOfResidence} onChange={(e) => setStateOfResidence(e.target.value)}>
            {states.map((s) => (
              <option key={s.key} value={s.key}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Monthly rent (optional)</label>
          <input
            type="number"
            className="input"
            placeholder="e.g. 250000"
            value={monthlyRent}
            onChange={(e) => setMonthlyRent(e.target.value)}
            min={0}
          />
        </div>

        <div>
          <label className="label">Annual life insurance premium (optional)</label>
          <input
            type="number"
            className="input"
            placeholder="e.g. 50000"
            value={lifeInsurance}
            onChange={(e) => setLifeInsurance(e.target.value)}
            min={0}
          />
        </div>

        {error && (
          <div style={{ background: 'var(--red-dim)', color: 'var(--red)', fontSize: 13, padding: '10px 12px', borderRadius: 10 }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={loading || states.length === 0}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Calculate my tax'}
        </button>
      </form>
    </div>
  )
}
