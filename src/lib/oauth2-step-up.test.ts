import { describe, it, expect } from 'vitest'
import { STEP_UP_FRESH_MS, factorIsFresh, stepUpRefusal, validReq } from './oauth2-step-up'

describe('validReq', () => {
  it('takes jinbe-shaped ids only', () => {
    expect(validReq('abcDEF0123456789_-xy')).toBe('abcDEF0123456789_-xy')
    expect(validReq('short')).toBeNull()
    expect(validReq('a'.repeat(65))).toBeNull()
    expect(validReq('abcdefghijklmnop.q')).toBeNull()
    expect(validReq(null)).toBeNull()
  })
})

describe('factorIsFresh', () => {
  const now = Date.parse('2026-10-01T10:00:00Z')
  it('under 2 minutes is fresh, over is not, none is not', () => {
    expect(factorIsFresh(new Date(now - 30_000).toISOString(), now)).toBe(true)
    expect(factorIsFresh(new Date(now - STEP_UP_FRESH_MS).toISOString(), now)).toBe(true)
    expect(factorIsFresh(new Date(now - STEP_UP_FRESH_MS - 1).toISOString(), now)).toBe(false)
    expect(factorIsFresh(null, now)).toBe(false)
    expect(factorIsFresh('garbage', now)).toBe(false)
  })
  it('a little clock skew is tolerated, a proof far in the future is not', () => {
    expect(factorIsFresh(new Date(now + 20_000).toISOString(), now)).toBe(true)
    expect(factorIsFresh(new Date(now + 3_600_000).toISOString(), now)).toBe(false)
  })
})

describe('stepUpRefusal', () => {
  it('known reasons, else unknown', () => {
    expect(stepUpRefusal('credential_gone')).toBe('credential_gone')
    expect(stepUpRefusal('bad_origin')).toBe('unknown')
    expect(stepUpRefusal(undefined)).toBe('unknown')
  })
})
