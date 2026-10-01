import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { GET, POST } from './route'

const REQ = 'abcdefghijklmnop1234'
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const whoami = (agoMs: number) => ({
  active: true,
  identity: { traits: { email: 'ada@example.com' } },
  authentication_methods: [{ method: 'totp', aal: 'aal2', completed_at: new Date(Date.now() - agoMs).toISOString() }],
})
/** Kratos and jinbe behind one fetch, by URL. */
function backends(kratos: Response | (() => Response), jinbe: Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.startsWith('http://kratos')) return typeof kratos === 'function' ? kratos() : kratos
    return jinbe
  })
}
const headers = { cookie: 'ory_kratos_session=s', 'x-forwarded-host': 'auth.example.com', 'x-forwarded-proto': 'https' }
const get = (qs: string) => new Request(`http://10.0.0.5:3000/api/oauth2/step-up${qs}`, { headers })
const post = (body: unknown, extra: Record<string, string> = {}) =>
  new Request('http://10.0.0.5:3000/api/oauth2/step-up', {
    method: 'POST', body: JSON.stringify(body),
    headers: { ...headers, origin: 'https://auth.example.com', 'content-type': 'application/json', ...extra },
  })

beforeEach(() => {
  vi.stubEnv('JINBE_PUBLIC_URL', 'http://jinbe:8080')
  vi.stubEnv('HYDRA_PUBLIC_URL', 'https://hydra.example.com/')
  vi.stubEnv('KRATOS_PUBLIC_URL', 'http://kratos:4433')
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('GET /api/oauth2/step-up', () => {
  it('a factor under 2 minutes old: shows what jinbe says, with the session\'s account', async () => {
    const f = backends(json(200, whoami(30_000)), json(200, { action: 'show', kind: 'oauth', client_name: 'Claude Code', hours: 12 }))
    expect(await (await GET(get(`?req=${REQ}`))).json()).toEqual({ kind: 'show', view: { kind: 'oauth', name: 'Claude Code', account: 'ada@example.com', hours: 12 } })
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('an older factor: the aal2 refresh login back to this link, jinbe not asked', async () => {
    const f = backends(json(200, whoami(10 * 60_000)), json(200, {}))
    const r = await (await GET(get(`?req=${REQ}`))).json()
    expect(r.kind).toBe('refresh')
    expect(new URL(r.to).searchParams.get('return_to')).toBe(`https://auth.example.com/oauth2/step-up?req=${REQ}`)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('signed out: unauthenticated; bad id: expired, nothing asked', async () => {
    const f = backends(json(401, {}), json(200, {}))
    expect(await (await GET(get(`?req=${REQ}`))).json()).toEqual({ kind: 'unauthenticated' })
    f.mockClear()
    expect(await (await GET(get('?req=../x'))).json()).toEqual({ kind: 'expired' })
    expect(f).not.toHaveBeenCalled()
  })
})

describe('POST /api/oauth2/step-up', () => {
  it('fresh and same-origin: jinbe refreshes it', async () => {
    const f = backends(json(200, whoami(30_000)), json(200, { action: 'done', client_name: 'Claude Code', step_up_until: '2026-10-01T22:00:00Z' }))
    expect(await (await POST(post({ req: REQ }))).json()).toEqual({ kind: 'done', name: 'Claude Code', until: '2026-10-01T22:00:00.000Z' })
    const init = f.mock.calls[1][1] as RequestInit
    expect((init.headers as Record<string, string>).origin).toBe('https://auth.example.com')
  })
  it('stale by the time of Confirm: refresh first, jinbe not asked', async () => {
    const f = backends(json(200, whoami(3 * 60_000)), json(200, {}))
    expect((await (await POST(post({ req: REQ }))).json()).kind).toBe('refresh')
    expect(f).toHaveBeenCalledTimes(1)
  })
  it.each([
    ['no Origin', { origin: '' }, 403],
    ['another Origin', { origin: 'https://evil.example.org' }, 403],
    ['cross-site', { 'sec-fetch-site': 'cross-site' }, 403],
    ['a form post', { 'content-type': 'application/x-www-form-urlencoded' }, 415],
  ])('%s: %i, nothing asked', async (_n, extra, status) => {
    const f = backends(json(200, whoami(0)), json(200, {}))
    expect((await POST(post({ req: REQ }, extra))).status).toBe(status)
    expect(f).not.toHaveBeenCalled()
  })
  it('an off-shape body: 400', async () => {
    const f = backends(json(200, whoami(0)), json(200, {}))
    expect((await POST(post({ req: 'x' }))).status).toBe(400)
    expect((await POST(post(null))).status).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })
})
