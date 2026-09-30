import { describe, it, expect, vi } from 'vitest'
import { consentBody, fetchConsent, fetchLoginHop, parseConsentView, parseDecision, parseLoginHop, requestOrigin, submitConsent } from './oauth2-server'

const origins = { self: 'https://auth.example.com', hydra: 'https://hydra.example.com/', kratos: null }
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
const opts = (fetchImpl: typeof fetch, cookieHeader: string | null = 'ory_kratos_session=s; other=1') => ({ baseUrl: 'http://jinbe:8080/', cookieHeader, origins, fetchImpl })

describe('fetchLoginHop', () => {
  it('asks jinbe with the Kratos cookies only and follows an allowed redirect', async () => {
    const f = reply(200, { action: 'redirect', to: 'https://hydra.example.com/oauth2/auth?login_verifier=v' })
    expect(await fetchLoginHop(opts(f), 'L1')).toEqual({ kind: 'redirect', to: 'https://hydra.example.com/oauth2/auth?login_verifier=v' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://jinbe:8080/api/public/oauth2/login?login_challenge=L1')
    expect((init.headers as Record<string, string>).cookie).toBe('ory_kratos_session=s')
    expect(init.redirect).toBe('error')
  })
  it('no Kratos cookie: sign in first, jinbe not asked', async () => {
    const f = reply(200, {})
    expect(await fetchLoginHop(opts(f, 'other=1'), 'L1')).toEqual({ kind: 'unauthenticated' })
    expect(f).not.toHaveBeenCalled()
  })
  it('a redirect off the allow-list is never followed', async () => {
    expect(await fetchLoginHop(opts(reply(200, { action: 'redirect', to: 'http://localhost:1234/callback' })), 'L')).toEqual({ kind: 'unavailable' })
  })
  it('jinbe down or unconfigured: unavailable', async () => {
    const boom = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    expect(await fetchLoginHop(opts(boom as unknown as typeof fetch), 'L')).toEqual({ kind: 'unavailable' })
    expect(await fetchLoginHop({ ...opts(reply(200, {})), baseUrl: '' }, 'L')).toEqual({ kind: 'unavailable' })
    expect(await fetchLoginHop(opts(reply(502, {})), 'L')).toEqual({ kind: 'unavailable' })
  })
})

describe('parseLoginHop', () => {
  it('refused keeps the reason and the checked reject URL', () => {
    expect(parseLoginHop({ status: 200, body: { action: 'refused', reason: 'group_not_allowed', to: 'https://hydra.example.com/oauth2/auth?login_verifier=r' } }, origins))
      .toEqual({ kind: 'refused', reason: 'group_not_allowed', to: 'https://hydra.example.com/oauth2/auth?login_verifier=r' })
    expect(parseLoginHop({ status: 200, body: { action: 'refused', reason: 'mcp_disabled', to: 'https://evil.io/' } }, origins))
      .toEqual({ kind: 'refused', reason: 'mcp_disabled', to: null })
  })
  it('error statuses: 401 sign in, 404/410 expired, 403 with reason refused', () => {
    expect(parseLoginHop({ status: 401, body: null }, origins)).toEqual({ kind: 'unauthenticated' })
    expect(parseLoginHop({ status: 404, body: null }, origins)).toEqual({ kind: 'expired' })
    expect(parseLoginHop({ status: 410, body: null }, origins)).toEqual({ kind: 'expired' })
    expect(parseLoginHop({ status: 403, body: { error: 'forbidden', details: { reason: 'not_mcp_client' } } }, origins)).toEqual({ kind: 'refused', reason: 'not_mcp_client', to: null })
    expect(parseLoginHop({ status: 200, body: { action: 'dance' } }, origins)).toEqual({ kind: 'unavailable' })
  })
})

const consent = {
  client: { client_id: 'c1', name: '  Claude\u202e Code\u0007 ', redirect_host: 'localhost:53682', registered_at: '2026-09-30T10:00:00Z' },
  action: 'show',
  account: { email: 'ada@example.com', subject: 'id-1' },
  requested: ['mcp', 'offline_access', 'sites:read', 'sites:apply', 'users:read', '*'],
  catalog: [{ scope: 'sites:read', group: 'sites', label: 'Read sites' }, { scope: 'sites:apply', group: 'sites', label: 'Publish sites', protected: true }, 'users:read', { scope: 'audit:read', group: 'audit' }, { scope: '*' }, { scope: 'mcp' }],
  protectedActions: { offered: true, until: '2026-09-30T22:00:00Z' },
  grantExpiresAt: '2026-10-30T10:00:00Z',
}

describe('parseConsentView', () => {
  it('shows only requested ∩ held permissions, never technical scopes or wildcards; strips control/bidi characters', () => {
    const v = parseConsentView(consent)!
    expect(v.client).toEqual({ name: 'Claude Code', redirectHost: 'localhost:53682', registeredAt: '2026-09-30T10:00:00.000Z' })
    expect(v.account).toBe('ada@example.com')
    expect(v.catalog).toEqual([{ scope: 'sites:read', group: 'sites', label: 'Read sites' }, { scope: 'sites:apply', group: 'sites', label: 'Publish sites', protected: true }, { scope: 'users:read', group: 'users' }])
    expect(v.protectedActions).toEqual({ offered: true, until: '2026-09-30T22:00:00.000Z', hours: 12 })
    expect(v.signedInUntil).toBe('2026-10-30T10:00:00.000Z')
  })
  it('defaults: unnamed app, protected actions not offered, bad numbers dropped', () => {
    const v = parseConsentView({ client: {}, catalog: 'x', protected_actions: { offered: 'yes', hours: 9999 }, grantExpiresAt: 'soon' })!
    expect(v.client.name).toBe('MCP client')
    expect(v.catalog).toEqual([])
    expect(v.protectedActions).toEqual({ offered: false, until: null, hours: 12 })
    expect(v.signedInUntil).toBeNull()
    expect(v.account).toBeNull()
    expect(parseConsentView({})).toBeNull()
  })
  it('takes the protected-actions window from jinbe when it says it', () => {
    expect(parseConsentView({ client: {}, protectedActions: { offered: true, until: null, hours: 4 } })!.protectedActions.hours).toBe(4)
  })
  it('reads the redirect host off a full redirect URI', () => {
    expect(parseConsentView({ client: { redirect_uri: 'http://127.0.0.1:4000/callback' } })!.client.redirectHost).toBe('127.0.0.1:4000')
  })
})

describe('fetchConsent', () => {
  it('a refusal returns the reason and the reject URL for the return cookie', async () => {
    const r = await fetchConsent(opts(reply(403, { error: 'forbidden', reason: 'client_bound_elsewhere', redirect_to: 'https://hydra.example.com/oauth2/auth?consent_verifier=x' })), 'C')
    expect(r).toEqual({ load: { kind: 'refused', reason: 'client_bound_elsewhere' }, returnTo: 'https://hydra.example.com/oauth2/auth?consent_verifier=x' })
  })
  it('a well-formed answer becomes the view', async () => {
    const r = await fetchConsent(opts(reply(200, consent)), 'C')
    expect(r.load.kind).toBe('consent')
  })
})

describe('submitConsent', () => {
  it('posts the decision with the browser Origin and follows the Hydra redirect', async () => {
    const f = reply(200, { redirect_to: 'https://hydra.example.com/oauth2/auth?consent_verifier=v' })
    const r = await submitConsent({ ...opts(f), origin: 'https://auth.example.com' }, 'C', { decision: 'allow', mode: 'chosen', scopes: ['sites:read'], protectedActions: false })
    expect(r.result).toEqual({ kind: 'redirect', to: 'https://hydra.example.com/oauth2/auth?consent_verifier=v' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://jinbe:8080/api/public/oauth2/consent')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).origin).toBe('https://auth.example.com')
    expect(JSON.parse(String(init.body))).toEqual({ consent_challenge: 'C', decision: 'allow', mode: 'chosen', scopes: ['sites:read'], protected_actions: false })
  })
  it('a redirect straight to the app is refused (only Hydra may send it there)', async () => {
    const r = await submitConsent({ ...opts(reply(200, { redirect_to: 'http://localhost:53682/callback?code=x' })), origin: null }, 'C', { decision: 'deny', mode: 'all', scopes: [], protectedActions: false })
    expect(r.result).toEqual({ kind: 'unavailable' })
  })
})

describe('consentBody / parseDecision', () => {
  it('deny sends no permissions; all sends no list', () => {
    expect(consentBody('C', { decision: 'deny', mode: 'chosen', scopes: ['a:b'], protectedActions: true })).toEqual({ consent_challenge: 'C', decision: 'deny' })
    expect(consentBody('C', { decision: 'allow', mode: 'all', scopes: ['a:b'], protectedActions: true })).toEqual({ consent_challenge: 'C', decision: 'allow', mode: 'all', protected_actions: true })
  })
  it('refuses off-shape bodies, drops wildcards and junk, dedupes', () => {
    expect(parseDecision(null)).toBeNull()
    expect(parseDecision({ consent_challenge: 'C', decision: 'maybe' })).toBeNull()
    expect(parseDecision({ consent_challenge: 'C', decision: 'allow', mode: 'chosen', scopes: ['*'] })).toBeNull()
    expect(parseDecision({ consent_challenge: 'C', decision: 'allow', mode: 'chosen', scopes: ['sites:read', 'sites:read', 'x y', 3, 'sites:*'], protected_actions: 'true' }))
      .toEqual({ challenge: 'C', decision: { decision: 'allow', mode: 'chosen', scopes: ['sites:read'], protectedActions: false } })
  })
})

describe('requestOrigin', () => {
  it('uses the forwarded host and proto behind the gateway', () => {
    const req = new Request('http://10.0.0.1:3000/oauth2/login', { headers: { 'x-forwarded-host': 'auth.example.com', 'x-forwarded-proto': 'https' } })
    expect(requestOrigin(req)).toBe('https://auth.example.com')
    expect(requestOrigin(new Request('http://localhost:3000/x'))).toBe('http://localhost:3000')
  })
})
