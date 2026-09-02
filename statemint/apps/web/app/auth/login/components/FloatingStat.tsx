import { ReactNode, CSSProperties } from 'react'

interface FloatingStatProps {
  icon: ReactNode
  label: string
  style?: CSSProperties
}

export default function FloatingStat({ icon, label, style }: FloatingStatProps) {
  return (
    <div
      style={{
        position: 'absolute',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.15)',
        backdropFilter: 'blur(12px)',
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        ...style,
      }}
    >
      {icon}
      {label}
    </div>
  )
}
