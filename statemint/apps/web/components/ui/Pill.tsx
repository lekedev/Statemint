import { ReactNode } from 'react'

interface PillProps {
  children: ReactNode
  color?: string
  icon?: ReactNode
}

export default function Pill({ children, color, icon }: PillProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: color || 'var(--gray-2)',
        background: color ? `${color}1F` : 'var(--surface-2)',
      }}
    >
      {icon}
      {children}
    </span>
  )
}
