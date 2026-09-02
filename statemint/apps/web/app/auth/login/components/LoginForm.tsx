'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { login } from '@/lib/auth'

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      router.push('/dashboard')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid email or password'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 360 }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--white)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 6 }}>
          Welcome back
        </h2>
        <p style={{ color: 'var(--gray-2)', fontSize: 14 }}>Sign in to continue to Statemint</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="label">Email address</label>
          <input
            type="email"
            className="input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label">Password</label>
          <input
            type="password"
            className="input"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <div style={{ background: 'var(--red-dim)', color: 'var(--red)', fontSize: 13, padding: '10px 12px', borderRadius: 10 }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px 20px' }} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Sign in'}
        </button>
      </form>

      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--gray-2)', marginTop: 24 }}>
        Don&apos;t have an account?{' '}
        <Link href="/auth/register" style={{ color: 'var(--green)', fontWeight: 600 }}>
          Create one
        </Link>
      </p>
    </div>
  )
}
