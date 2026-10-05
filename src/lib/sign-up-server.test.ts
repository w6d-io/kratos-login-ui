import { describe, expect, it, vi } from 'vitest'
import { continueRefusalText, continueSignUp } from './sign-up-server'
import { sanitizeSignUp } from './branding'

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

describe('continueSignUp', () => {
  const base = { baseUrl: 'http://jinbe:8080', host: 'shop.example.com', cookieHeader: 'a=1; ory_kratos_session=abc' }

  it('forwards only the session cookie and the host', async () => {
    const fetchImpl = reply(200, { joined: true })
    expect(await continueSignUp({ ...base, fetchImpl })).toEqual({ kind: 'joined' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://jinbe:8080/api/me/sign-up/continue')
    expect((init.headers as Record<string, string>).cookie).toBe('ory_kratos_session=abc')
    expect(init.body).toBe(JSON.stringify({ host: 'shop.example.com' }))
  })

  it('relays a refusal, a missing session and an outage', async () => {
    expect(await continueSignUp({ ...base, fetchImpl: reply(200, { joined: false, reason: 'domain_not_allowed' }) })).toEqual({ kind: 'refused', reason: 'domain_not_allowed' })
    expect(await continueSignUp({ ...base, fetchImpl: reply(401, {}) })).toEqual({ kind: 'unauthenticated' })
    expect(await continueSignUp({ ...base, fetchImpl: reply(500, {}) })).toEqual({ kind: 'unavailable' })
    expect(await continueSignUp({ ...base, cookieHeader: 'a=1' })).toEqual({ kind: 'unauthenticated' })
    expect(await continueSignUp({ ...base, fetchImpl: reply(200, { joined: false, reason: 'made_up' }) })).toEqual({ kind: 'unavailable' })
  })

  it('says why in words', () => {
    expect(continueRefusalText('domain_not_allowed', 'Shop', ['client.com'])).toContain('@client.com')
    expect(continueRefusalText('email_not_verified', 'Shop', [])).toMatch(/Verify your email/)
  })
})

describe('sanitizeSignUp', () => {
  it('keeps a well-formed answer and drops what is not', () => {
    expect(sanitizeSignUp({ open: true, mode: 'domains', domains: ['client.com', 'not a domain'], orgs: 'personal' })).toEqual({ open: true, mode: 'domains', domains: ['client.com'], orgs: 'personal' })
    expect(sanitizeSignUp({ open: true, mode: 'closed', domains: [], orgs: 'none' })).toEqual({ open: false, mode: 'closed', domains: [], orgs: 'none' })
    expect(sanitizeSignUp({ open: true, mode: 'wide', orgs: 'personal' })).toBeNull()
    expect(sanitizeSignUp(null)).toBeNull()
  })
})
