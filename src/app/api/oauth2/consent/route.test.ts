import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { GET, POST } from './route'

const answer = (status: number, body: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://auth.example.com/api/oauth2/consent', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { cookie: 'ory_kratos_session=s', origin: 'https://auth.example.com', 'content-type': 'application/json', ...headers },
  })
const allow = { consent_challenge: 'C1', decision: 'allow', mode: 'all', protected_actions: true }

beforeEach(() => {
  vi.stubEnv('JINBE_PUBLIC_URL', 'http://jinbe:8080')
  vi.stubEnv('HYDRA_PUBLIC_URL', 'https://hydra.example.com/')
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('POST /api/oauth2/consent', () => {
  it('same-origin JSON: forwards to jinbe and hands back the checked Hydra URL', async () => {
    const f = answer(200, { redirect_to: 'https://hydra.example.com/oauth2/auth?consent_verifier=v' })
    const res = await POST(post(allow))
    expect(await res.json()).toEqual({ kind: 'redirect', to: 'https://hydra.example.com/oauth2/auth?consent_verifier=v' })
    const init = f.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).origin).toBe('https://auth.example.com')
    expect((init.headers as Record<string, string>).cookie).toBe('ory_kratos_session=s')
  })
  it.each([
    ['no Origin', { origin: '' }],
    ['another Origin', { origin: 'https://evil.example.org' }],
    ['cross-site fetch', { 'sec-fetch-site': 'cross-site' }],
  ])('%s: 403, jinbe not asked', async (_n, headers) => {
    const f = answer(200, {})
    const res = await POST(post(allow, headers))
    expect(res.status).toBe(403)
    expect(f).not.toHaveBeenCalled()
  })
  it('a form post (not JSON) is 415; an off-shape body 400', async () => {
    const f = answer(200, {})
    expect((await POST(post(allow, { 'content-type': 'application/x-www-form-urlencoded' }))).status).toBe(415)
    expect((await POST(post({ consent_challenge: 'C1', decision: 'allow', mode: 'chosen', scopes: [] }))).status).toBe(400)
    expect((await POST(post({ consent_challenge: 'a b', decision: 'deny' }))).status).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })
  it('a refusal parks the reject URL in the return cookie', async () => {
    answer(403, { reason: 'client_bound_elsewhere', redirect_to: 'https://hydra.example.com/oauth2/auth?consent_verifier=r' })
    const res = await POST(post(allow))
    expect(await res.json()).toEqual({ kind: 'refused', reason: 'client_bound_elsewhere' })
    expect(res.headers.get('set-cookie')).toContain('oauth2_return=')
  })
})

describe('GET /api/oauth2/consent', () => {
  it('no challenge: expired', async () => {
    expect(await (await GET(new Request('https://auth.example.com/api/oauth2/consent'))).json()).toEqual({ kind: 'expired' })
  })
  it('no session: unauthenticated', async () => {
    const res = await GET(new Request('https://auth.example.com/api/oauth2/consent?consent_challenge=C1'))
    expect(await res.json()).toEqual({ kind: 'unauthenticated' })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})
