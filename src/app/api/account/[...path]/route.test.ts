import { describe, it, expect, vi, beforeEach } from 'vitest'

const relay = vi.fn()
vi.mock('@/lib/account-server', async (orig) => ({ ...(await orig<typeof import('@/lib/account-server')>()), relayAccountCall: (c: unknown, o: unknown) => relay(c, o) }))

import { GET, POST } from './route'

const ORG = '11111111-2222-4333-8444-555555555555'
const ctx = (path: string) => ({ params: Promise.resolve({ path: path.split('/') }) })

beforeEach(() => relay.mockReset())

describe('/api/account/[...path]', () => {
  it('relays a listed call with the incoming cookie header, never cached', async () => {
    relay.mockResolvedValue({ status: 200, body: { organizations: [] } })
    const res = await GET(new Request('http://ui/api/account/me/organizations', { headers: { cookie: 'ory_kratos_session=s' } }), ctx('me/organizations'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ organizations: [] })
    expect(relay).toHaveBeenCalledWith(expect.objectContaining({ path: 'me/organizations' }), expect.objectContaining({ cookieHeader: 'ory_kratos_session=s' }))
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('answers 404 for anything else, without asking jinbe', async () => {
    const res = await GET(new Request('http://ui/api/account/admin/organizations'), ctx('admin/organizations'))
    expect(res.status).toBe(404)
    expect(relay).not.toHaveBeenCalled()
  })

  it('refuses a change from another site, and a body that is not JSON', async () => {
    const body = JSON.stringify({ domain: 'example.com' })
    const cross = new Request(`http://ui/api/account/organizations/${ORG}/domains`, { method: 'POST', body, headers: { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' } })
    expect((await POST(cross, ctx(`organizations/${ORG}/domains`))).status).toBe(403)
    const form = new Request(`http://ui/api/account/organizations/${ORG}/domains`, { method: 'POST', body: 'domain=example.com', headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'text/plain' } })
    expect((await POST(form, ctx(`organizations/${ORG}/domains`))).status).toBe(415)
    expect(relay).not.toHaveBeenCalled()

    relay.mockResolvedValue({ status: 204, body: null })
    const ok = new Request(`http://ui/api/account/organizations/${ORG}/domains`, { method: 'POST', body, headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' } })
    expect((await POST(ok, ctx(`organizations/${ORG}/domains`))).status).toBe(204)
    expect(relay).toHaveBeenCalledWith(expect.objectContaining({ body: { domain: 'example.com' } }), expect.anything())
  })
})
