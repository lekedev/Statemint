import { ShieldCheck, TrendingUp, Landmark } from 'lucide-react'
import FloatingStat from './FloatingStat'

export default function LeftPanel() {
  return (
    <section
      className="relative hidden lg:flex flex-col justify-center overflow-hidden px-12 py-16"
      style={{
        background: 'radial-gradient(120% 120% at 0% 0%, #0F2E22 0%, #0A0A0F 60%)',
      }}
    >
      <FloatingStat icon={<Landmark size={14} />} label="18 Nigerian banks supported" style={{ top: '12%', left: '8%' }} />
      <FloatingStat icon={<TrendingUp size={14} />} label="Instant spending insights" style={{ top: '38%', right: '6%' }} />
      <FloatingStat icon={<ShieldCheck size={14} />} label="Bank-grade encryption" style={{ bottom: '16%', left: '14%' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 420 }}>
        <div
          style={{
            width: 44,
            height: 44,
            background: 'linear-gradient(135deg, #00D97E, #00A85E)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 28,
            boxShadow: '0 0 20px rgba(0,217,126,0.35)',
          }}
        >
          <span style={{ color: '#0A0A0F', fontWeight: 800, fontSize: 19 }}>S</span>
        </div>
        <h1 style={{ color: '#fff', fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 16 }}>
          Your money, beautifully organized.
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, lineHeight: 1.6 }}>
          Upload a bank statement and get instant categorized spending, tax estimates,
          and answers to any question about your money.
        </p>
      </div>
    </section>
  )
}
