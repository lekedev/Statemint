'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BarChart2, Calculator, LogOut, X, Sun, Moon } from 'lucide-react'
import { logout } from '@/lib/auth'
import { useTheme } from '@/lib/theme'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/tax', label: 'Tax Calculator', icon: Calculator },
]

interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()

  const content = (
    <div
      style={{
        background: 'var(--surface-2)',
        borderRight: '1px solid var(--border)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Logo */}
      <div style={{ padding: '28px 24px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36,
              background: 'linear-gradient(135deg, #00D97E, #00A85E)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 16px rgba(0,217,126,0.35)',
            }}>
              <span style={{ color: '#0A0A0F', fontWeight: 800, fontSize: 16 }}>S</span>
            </div>
            <div>
              <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 16, lineHeight: 1 }}>Statemint</p>
              <p style={{ color: 'var(--gray-3)', fontSize: 11, marginTop: 3 }}>Financial clarity</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} style={{ color: 'var(--gray-2)', background: 'none', border: 'none', cursor: 'pointer' }} className="lg:hidden">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--green)' : 'var(--gray-2)',
                background: active ? 'rgba(0,217,126,0.10)' : 'transparent',
                border: active ? '1px solid rgba(0,217,126,0.15)' : '1px solid transparent',
                textDecoration: 'none',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={17} />
              {label}
              {active && (
                <div style={{
                  width: 6, height: 6,
                  borderRadius: '50%',
                  background: '#00D97E',
                  marginLeft: 'auto',
                  boxShadow: '0 0 8px #00D97E',
                }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '16px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          onClick={toggleTheme}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 14,
            color: 'var(--gray-2)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            transition: 'all 0.15s',
          }}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button
          onClick={logout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 14,
            color: 'var(--gray-2)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            transition: 'all 0.15s',
          }}
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden lg:block" style={{ width: 240, minHeight: '100vh', flexShrink: 0 }}>
        {content}
      </aside>

      {open && (
        <>
          <div
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 40, backdropFilter: 'blur(4px)' }}
            className="lg:hidden"
          />
          <aside style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 260, zIndex: 50 }} className="lg:hidden">
            {content}
          </aside>
        </>
      )}
    </>
  )
}