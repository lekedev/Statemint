interface StatCardProps {
  label: string
  value: string
  sub?: string
  positive?: boolean
  negative?: boolean
  centered?: boolean
}

export default function StatCard({
  label,
  value,
  sub,
  positive,
  negative,
  centered,
}: StatCardProps) {
  const valueColor = positive ? 'var(--green)' : negative ? 'var(--red)' : 'var(--white)'

  if (centered) {
    return (
      <div className="card" style={{ padding: '20px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 32, fontWeight: 800, color: valueColor, letterSpacing: '-0.03em' }}>
          {value}
        </p>
        <p style={{ fontSize: 11, color: 'var(--gray-3)', marginTop: 4, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </p>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <p style={{ color: 'var(--gray-2)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </p>
      <p style={{ color: valueColor, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>
        {value}
      </p>
      {sub && <p style={{ color: 'var(--gray-3)', fontSize: 12, marginTop: 4 }}>{sub}</p>}
    </div>
  )
}