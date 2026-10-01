import { describe, it, expect, vi } from 'vitest'
import { fetchStepUp, kratosProof, proofGate, refreshUrl, secondFactorAt, submitStepUp } from './oauth2-step-up-server'

const origins = { self: 'https://auth.example.com', hydra: 'https://hydra.example.com/', kratos: null }
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
const REQ = 'abcdefghijklmnop1234'
const jinbe = (f: typeof fetch, cookieHeader = 'ory_kratos_session=s; _ga=1') => ({ baseUrl: 'http://jinbe:8080', cookieHeader, forwardedFor: '203.0.113.7', origins, fetchImpl: f })
const now = Date.parse('2026-10-01T10:00:00Z')

describe('secondFactorAt', () => {
  it('is the latest aal2 method, never the first factor', () => {
    expect(secondFactorAt({
      authentication_methods: [
        { method: 'password', aal: 'aal1', completed_at: '2026-10-01T09:59:00Z' },
        { method: 'totp', aal: 'aal2', completed_at: '2026-10-01T08:00:00Z' },
        { method: 'webauthn', aal: 'aal2', completed_at: '2026-10-01T09:30:00Z' },
      ],
    })).toBe('2026-10-01T09:30:00.000Z')
    expect(secondFactorAt({ authentication_methods: [{ method: 'password', aal: 'aal1', completed_at: '2026-10-01T09:59:00Z' }] })).toBeNull()
    expect(secondFactorAt({})).toBeNull()
  })
})

describe('kratosProof', () => {
  it('asks whoami with the Kratos cookies only', async () => {
    const f = reply(200, { active: true, identity: { traits: { email: 'ada@example.com' } }, authentication_methods: [{ aal: 'aal2', completed_at: '2026-10-01T09:59:30Z' }] })
    expect(await kratosProof({ kratosUrl: 'http://kratos:4433/', cookieHeader: 'ory_kratos_session=s; _ga=1', fetchImpl: f }))
      .toEqual({ kind: 'session', secondFactorAt: '2026-10-01T09:59:30.000Z', email: 'ada@example.com' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://kratos:4433/sessions/whoami')
    expect((init.headers as Record<string, string>).cookie).toBe('ory_kratos_session=s')
  })
  it('no cookie or 401: signed out; 403 (aal2 required): signed in without proof; errors: unavailable', async () => {
    const f = reply(200, {})
    expect(await kratosProof({ kratosUrl: 'http://k', cookieHeader: null, fetchImpl: f })).toEqual({ kind: 'unauthenticated' })
    expect(f).not.toHaveBeenCalled()
    expect(await kratosProof({ kratosUrl: 'http://k', cookieHeader: 'ory_kratos_session=s', fetchImpl: reply(401, {}) })).toEqual({ kind: 'unauthenticated' })
    expect(await kratosProof({ kratosUrl: 'http://k', cookieHeader: 'ory_kratos_session=s', fetchImpl: reply(403, {}) })).toEqual({ kind: 'session', secondFactorAt: null, email: null })
    expect(await kratosProof({ kratosUrl: 'http://k', cookieHeader: 'ory_kratos_session=s', fetchImpl: reply(200, { active: false }) })).toEqual({ kind: 'unauthenticated' })
    expect(await kratosProof({ kratosUrl: 'http://k', cookieHeader: 'ory_kratos_session=s', fetchImpl: reply(500, {}) })).toEqual({ kind: 'unavailable' })
  })
})

describe('proofGate / refreshUrl', () => {
  const back = `https://auth.example.com/oauth2/step-up?req=${REQ}`
  it('fresh: go on; stale or none: the aal2 refresh login back to the link', () => {
    expect(proofGate({ kind: 'session', secondFactorAt: '2026-10-01T09:59:00Z', email: null }, origins, back, now)).toBeNull()
    const g = proofGate({ kind: 'session', secondFactorAt: '2026-10-01T09:50:00Z', email: null }, origins, back, now)
    expect(g?.kind).toBe('refresh')
    const u = new URL((g as { to: string }).to)
    expect(u.origin + u.pathname).toBe('https://auth.example.com/self-service/login/browser')
    expect(Object.fromEntries(u.searchParams)).toEqual({ aal: 'aal2', refresh: 'true', return_to: back })
    expect(proofGate({ kind: 'session', secondFactorAt: null, email: null }, origins, back, now)?.kind).toBe('refresh')
  })
  it('signed out / Kratos down pass through', () => {
    expect(proofGate({ kind: 'unauthenticated' }, origins, back, now)).toEqual({ kind: 'unauthenticated' })
    expect(proofGate({ kind: 'unavailable' }, origins, back, now)).toEqual({ kind: 'unavailable' })
  })
  it('uses the Kratos browser URL when it is not this UI', () => {
    expect(refreshUrl({ ...origins, kratos: 'https://kratos.example.com/' }, back)).toMatch(/^https:\/\/kratos\.example\.com\/self-service\/login\/browser\?/)
  })
})

describe('fetchStepUp', () => {
  it('shows what will be refreshed, with the hours and the account from the session', async () => {
    const f = reply(200, { action: 'show', kind: 'oauth', client_id: 'c1', client_name: 'Claude Code', expiresAt: '2026-10-01T10:10:00Z', hours: 12 })
    expect(await fetchStepUp(jinbe(f), REQ, 'ada@example.com')).toEqual({
      kind: 'show', view: { kind: 'oauth', name: 'Claude Code', account: 'ada@example.com', hours: 12 },
    })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`http://jinbe:8080/api/public/oauth2/step-up?req=${REQ}`)
    const h = init.headers as Record<string, string>
    expect(h.cookie).toBe('ory_kratos_session=s')
    expect(h['x-forwarded-for']).toBe('203.0.113.7')
    expect(h.origin).toBeUndefined()
  })
  it('a personal key without hours', async () => {
    const r = await fetchStepUp(jinbe(reply(200, { action: 'show', kind: 'personal', client_name: 'laptop' })), REQ, null)
    expect(r).toEqual({ kind: 'show', view: { kind: 'personal', name: 'laptop', account: null, hours: null } })
  })
  it.each([
    [401, { error: 'unauthenticated' }, { kind: 'unauthenticated' }],
    [404, { error: 'request_unknown' }, { kind: 'expired' }],
    [400, { error: 'invalid_request' }, { kind: 'expired' }],
    [403, { error: 'wrong_account' }, { kind: 'refused', reason: 'wrong_account' }],
    [403, { error: 'protected_actions_off' }, { kind: 'refused', reason: 'protected_actions_off' }],
    [409, { error: 'credential_gone' }, { kind: 'refused', reason: 'credential_gone' }],
    [409, { error: 'protected_actions_not_allowed' }, { kind: 'refused', reason: 'protected_actions_not_allowed' }],
    [403, { error: 'session_only' }, { kind: 'unavailable' }],
    [429, { error: 'rate_limited' }, { kind: 'unavailable' }],
    [503, { error: 'unavailable' }, { kind: 'unavailable' }],
  ])('%i %j → %j', async (status, body, out) => {
    expect(await fetchStepUp(jinbe(reply(status, body)), REQ, null)).toEqual(out)
  })
})

describe('submitStepUp', () => {
  it('posts {req} with the browser Origin; done carries the new window end', async () => {
    const f = reply(200, { action: 'done', kind: 'oauth', client_id: 'c1', client_name: 'Claude Code', step_up_at: '2026-10-01T10:00:00Z', step_up_until: '2026-10-01T22:00:00Z' })
    expect(await submitStepUp({ ...jinbe(f), origin: 'https://auth.example.com' }, REQ)).toEqual({ kind: 'done', name: 'Claude Code', until: '2026-10-01T22:00:00.000Z' })
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ req: REQ })
    expect((init.headers as Record<string, string>).origin).toBe('https://auth.example.com')
  })
  it('a stale factor: follows jinbe\'s refresh redirect on the auth host, never elsewhere', async () => {
    const to = `https://auth.example.com/self-service/login/browser?aal=aal2&refresh=true&return_to=x`
    expect(await submitStepUp({ ...jinbe(reply(200, { action: 'redirect', to })), origin: 'o' }, REQ)).toEqual({ kind: 'refresh', to })
    expect(await submitStepUp({ ...jinbe(reply(200, { action: 'redirect', to: 'https://evil.example.org/' })), origin: 'o' }, REQ)).toEqual({ kind: 'unavailable' })
  })
  it('bad_origin is ours to retry', async () => {
    expect(await submitStepUp({ ...jinbe(reply(403, { error: 'bad_origin' })), origin: 'o' }, REQ)).toEqual({ kind: 'unavailable' })
  })
})
