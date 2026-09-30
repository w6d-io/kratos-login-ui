import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { GET } from './route'

const answer = (status: number, body: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
const req = (qs: string, cookie = 'ory_kratos_session=s') =>
  new Request(`http://10.0.0.5:3000/oauth2/login${qs}`, { headers: { cookie, 'x-forwarded-host': 'auth.example.com', 'x-forwarded-proto': 'https' } })

beforeEach(() => {
  vi.stubEnv('JINBE_PUBLIC_URL', 'http://jinbe:8080')
  vi.stubEnv('HYDRA_PUBLIC_URL', 'https://hydra.example.com/')
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('GET /oauth2/login', () => {
  it('follows jinbe to Hydra when the sign-in is accepted', async () => {
    answer(200, { action: 'redirect', to: 'https://hydra.example.com/oauth2/auth?login_verifier=v' })
    const res = await GET(req('?login_challenge=L1'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://hydra.example.com/oauth2/auth?login_verifier=v')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
  it('follows jinbe to the Kratos aal2 step-up on this UI', async () => {
    answer(200, { action: 'redirect', to: 'https://auth.example.com/self-service/login/browser?aal=aal2&refresh=true&return_to=x' })
    expect((await GET(req('?login_challenge=L1'))).headers.get('location')).toContain('/self-service/login/browser?aal=aal2')
  })
  it('no session: sign in, then back here (absolute, this UI)', async () => {
    const f = answer(200, {})
    const res = await GET(req('?login_challenge=L1', ''))
    expect(f).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBe(`/login?return_to=${encodeURIComponent('https://auth.example.com/oauth2/login?login_challenge=L1')}`)
  })
  it('refused: the reason in the URL, Hydra\'s reject URL only in an HttpOnly cookie', async () => {
    answer(200, { action: 'refused', reason: 'group_not_allowed', to: 'https://hydra.example.com/oauth2/auth?login_verifier=r' })
    const res = await GET(req('?login_challenge=L1'))
    expect(res.headers.get('location')).toBe('/oauth2/refused?reason=group_not_allowed')
    const cookie = res.headers.get('set-cookie') || ''
    expect(cookie).toContain(`oauth2_return=${encodeURIComponent('https://hydra.example.com/oauth2/auth?login_verifier=r')}`)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/Secure/)
    expect(cookie).toMatch(/Path=\/oauth2/)
  })
  it('a target off the allow-list is never followed', async () => {
    answer(200, { action: 'redirect', to: 'https://evil.example.org/' })
    expect((await GET(req('?login_challenge=L1'))).headers.get('location')).toBe('/oauth2/refused?reason=unavailable&login_challenge=L1')
  })
  it('missing or malformed challenge: the request has ended, jinbe not asked', async () => {
    const f = answer(200, {})
    expect((await GET(req(''))).headers.get('location')).toBe('/oauth2/refused?reason=expired')
    expect((await GET(req('?login_challenge=%3Cx%3E'))).headers.get('location')).toBe('/oauth2/refused?reason=expired')
    expect(f).not.toHaveBeenCalled()
  })
  it('JINBE_PUBLIC_URL unset: unavailable with a retry, and a server warning naming the setting', async () => {
    vi.stubEnv('JINBE_PUBLIC_URL', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await GET(req('?login_challenge=L1'))).headers.get('location')).toBe('/oauth2/refused?reason=unavailable&login_challenge=L1')
    expect(warn.mock.calls.map((c) => String(c[0])).join(' ')).toContain('JINBE_PUBLIC_URL')
  })
})
