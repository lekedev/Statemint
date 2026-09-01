import { describe, it, expect } from 'vitest'
import { requireEnv } from './env'

describe('requireEnv', () => {
  it('returns the value when the env var is set', () => {
    process.env.TEST_VAR = 'hello'
    expect(requireEnv('TEST_VAR')).toBe('hello')
    delete process.env.TEST_VAR
  })

  it('throws when the env var is unset', () => {
    delete process.env.MISSING_VAR
    expect(() => requireEnv('MISSING_VAR')).toThrow(
      'Missing required environment variable: MISSING_VAR'
    )
  })

  it('throws when the env var is an empty string', () => {
    process.env.EMPTY_VAR = ''
    expect(() => requireEnv('EMPTY_VAR')).toThrow(
      'Missing required environment variable: EMPTY_VAR'
    )
    delete process.env.EMPTY_VAR
  })
})
