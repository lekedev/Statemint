import api from './api'

export interface User {
  email: string
  name?: string
}

export async function login(
  email: string,
  password: string
): Promise<string> {
  const res = await api.post('/auth/login', { email, password })
  const token = res.data.data.accessToken
  localStorage.setItem('statemint_token', token)
  return token
}

export async function register(
  email: string,
  password: string,
  name: string
): Promise<string> {
  const res = await api.post('/auth/register', { email, password, name })
  const token = res.data.data.accessToken
  localStorage.setItem('statemint_token', token)
  return token
}

export function logout(): void {
  localStorage.removeItem('statemint_token')
  window.location.href = '/auth/login'
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('statemint_token')
}

export function isAuthenticated(): boolean {
  return !!getToken()
}