import { CheckCircle2, Circle, ExternalLink } from 'lucide-react'
import Pill from '@/components/ui/Pill'
import { TaxCalculation } from '@/types'
import { formatCurrency } from '@/lib/utils'

export default function TaxResults({ result }: { result: TaxCalculation }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary */}
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div>
          <p style={{ color: 'var(--gray-2)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Gross income
          </p>
          <p style={{ color: 'var(--white)', fontSize: 22, fontWeight: 800 }}>{formatCurrency(result.grossIncome)}</p>
        </div>
        <div>
          <p style={{ color: 'var(--gray-2)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Total tax (annual)
          </p>
          <p style={{ color: result.isTaxFree ? 'var(--green)' : 'var(--white)', fontSize: 22, fontWeight: 800 }}>
            {formatCurrency(result.totalTax)}
          </p>
        </div>
        <div>
          <p style={{ color: 'var(--gray-2)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Effective rate
          </p>
          <p style={{ color: 'var(--white)', fontSize: 22, fontWeight: 800 }}>{result.effectiveRate.toFixed(1)}%</p>
        </div>
      </div>

      {result.isTaxFree && (
        <div className="card-glow" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={18} style={{ color: 'var(--green)' }} />
          <p style={{ color: 'var(--green)', fontSize: 14, fontWeight: 600 }}>
            Your income is tax-free under the ₦800,000 threshold.
          </p>
        </div>
      )}

      {/* Band breakdown */}
      {result.breakdown.length > 0 && (
        <div className="card">
          <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Tax band breakdown</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {result.breakdown.map((band) => (
              <div key={band.band} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <div>
                  <p style={{ color: 'var(--gray-1)' }}>{band.band}</p>
                  <p style={{ color: 'var(--gray-3)', fontSize: 11 }}>{band.rate}% rate</p>
                </div>
                <p style={{ color: 'var(--white)', fontWeight: 700 }}>{formatCurrency(band.taxDue)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deductions */}
      <div className="card">
        <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Deductions</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {result.deductions.map((d) => (
            <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ color: d.applicable ? 'var(--gray-1)' : 'var(--gray-3)', fontSize: 13, fontWeight: 500 }}>
                  {d.name}
                </p>
                <p style={{ color: 'var(--gray-3)', fontSize: 11, marginTop: 2 }}>{d.description}</p>
              </div>
              {d.applicable ? (
                <Pill color="#00D97E">Saves {formatCurrency(d.saves)}</Pill>
              ) : (
                <Pill>Not applied</Pill>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Checklist */}
      <div className="card">
        <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Filing checklist</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {result.checklist.map((item) => (
            <div key={item.item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              {item.completed ? (
                <CheckCircle2 size={16} style={{ color: 'var(--green)', flexShrink: 0, marginTop: 1 }} />
              ) : (
                <Circle size={16} style={{ color: 'var(--gray-3)', flexShrink: 0, marginTop: 1 }} />
              )}
              <div>
                <p style={{ color: 'var(--gray-1)', fontSize: 13, fontWeight: 500 }}>{item.item}</p>
                <p style={{ color: 'var(--gray-3)', fontSize: 11, marginTop: 2 }}>{item.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payment guide */}
      <div className="card">
        <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
          {result.paymentGuide.irsName}
        </p>
        <p style={{ color: 'var(--gray-2)', fontSize: 12, marginBottom: 16 }}>
          Deadline: {result.paymentGuide.deadline}
        </p>
        <ol style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, marginBottom: 16 }}>
          {result.paymentGuide.steps.map((step, i) => (
            <li key={i} style={{ color: 'var(--gray-1)', fontSize: 13, lineHeight: 1.5 }}>{step}</li>
          ))}
        </ol>
        <a
          href={result.paymentGuide.portal}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary"
          style={{ textDecoration: 'none', display: 'inline-flex' }}
        >
          Visit {result.paymentGuide.stateName} portal <ExternalLink size={14} />
        </a>
      </div>
    </div>
  )
}
