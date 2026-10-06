import { describe, expect, it, vi } from 'vitest'
import { accountCall, relayAccountCall, sameOrigin } from './account-server'

const ORG = '11111111-2222-4333-8444-555555555555'
const USER = '66666666-7777-4888-9999-aaaaaaaaaaaa'
const q = (s = '') => new URLSearchParams(s)
const reply = (status: number, body?: unknown) => vi.fn(async () => (body === undefined ? new Response(null, { status }) : new Response(JSON.stringify(body), { status })))

describe('accountCall', () => {
  it('lets through the listed calls only', () => {
    expect(accountCall('GET', 'me/organizations', q(), undefined)).toMatchObject({ method: 'GET', path: 'me/organizations' })
    expect(accountCall('GET', `organizations/${ORG}/users`, q(), undefined)).not.toBeNull()
    expect(accountCall('DELETE', `organizations/${ORG}/users/${USER}`, q(), undefined)).not.toBeNull()
    expect(accountCall('POST', `organizations/${ORG}/domains/example.com/verify`, q(), undefined)).not.toBeNull()
    // Not listed: other methods, other paths, someone else's admin routes.
    expect(accountCall('DELETE', `organizations/${ORG}`, q(), undefined)).toBeNull()
    expect(accountCall('PUT', `organizations/${ORG}/users/${USER}/membership`, q(), undefined)).toBeNull()
    expect(accountCall('GET', 'admin/organizations', q(), undefined)).toBeNull()
    expect(accountCall('GET', `organizations/not-a-uuid/users`, q(), undefined)).toBeNull()
  })

  it('refuses path tricks', () => {
    expect(accountCall('DELETE', `organizations/${ORG}/api-keys/..`, q(), undefined)).toBeNull()
    expect(accountCall('DELETE', `organizations/${ORG}/api-keys/a/../..`, q(), undefined)).toBeNull()
    expect(accountCall('DELETE', `organizations/${ORG}/domains/..`, q(), undefined)).toBeNull()
    expect(accountCall('DELETE', `organizations/${ORG}/api-keys/client-1.prod`, q(), undefined)).not.toBeNull()
  })

  it('takes only the query keys a call knows', () => {
    expect(accountCall('GET', 'me/orgs', q('app=jinbe'), undefined)?.query.toString()).toBe('app=jinbe')
    expect(accountCall('GET', 'me/orgs', q('app=jinbe&x=1'), undefined)).toBeNull()
    expect(accountCall('GET', 'me/orgs', q('app=Bad App'), undefined)).toBeNull()
    expect(accountCall('GET', 'me/organizations', q('all=1'), undefined)).toBeNull()
    expect(accountCall('GET', 'me/invitations/by-token', q(`token=${'a'.repeat(43)}`), undefined)).not.toBeNull()
    expect(accountCall('GET', 'me/invitations/by-token', q('token=short'), undefined)).toBeNull()
  })

  it('rebuilds each body from the fields it takes', () => {
    expect(accountCall('POST', `organizations/${ORG}/invitations`, q(), { email: ' Ann@Example.com ', roles: ['jinbe:viewer'], extra: 1 })?.body)
      .toEqual({ email: 'ann@example.com', roles: ['jinbe:viewer'] })
    expect(accountCall('POST', `organizations/${ORG}/invitations`, q(), { email: 'nope' })).toBeNull()
    expect(accountCall('POST', `organizations/${ORG}/invitations`, q(), { email: 'a@b.co', roles: ['Not A Role'] })).toBeNull()
    expect(accountCall('PUT', `organizations/${ORG}/users/${USER}/roles`, q(), { roles: [] })?.body).toEqual({ roles: [] })
    expect(accountCall('PUT', `organizations/${ORG}/users/${USER}/roles`, q(), {})).toBeNull()
    expect(accountCall('POST', 'me/invitations/accept', q(), { token: 'a'.repeat(43), id: USER })?.body).toEqual({ token: 'a'.repeat(43) })
    expect(accountCall('POST', 'me/invitations/accept', q(), { id: USER })?.body).toEqual({ id: USER })
    expect(accountCall('POST', 'me/invitations/accept', q(), { token: 'short' })).toBeNull()
    expect(accountCall('POST', `organizations/${ORG}/domains`, q(), { domain: 'Example.COM' })?.body).toEqual({ domain: 'example.com' })
    // A call that takes no body gets none.
    expect(accountCall('POST', `me/invitations/${USER}/decline`, q(), { anything: 1 })).toBeNull()
  })
})

describe('sameOrigin', () => {
  it('trusts Sec-Fetch-Site, else compares Origin with Host', () => {
    expect(sameOrigin(new Headers({ 'sec-fetch-site': 'same-origin' }))).toBe(true)
    expect(sameOrigin(new Headers({ 'sec-fetch-site': 'cross-site', origin: 'https://id.test', host: 'id.test' }))).toBe(false)
    expect(sameOrigin(new Headers({ origin: 'https://id.test', host: 'id.test' }))).toBe(true)
    expect(sameOrigin(new Headers({ origin: 'https://evil.test', host: 'id.test' }))).toBe(false)
    expect(sameOrigin(new Headers({ host: 'id.test' }))).toBe(false)
  })
})

describe('relayAccountCall', () => {
  const opts = { baseUrl: 'http://jinbe:8080/', cookieHeader: 'a=1; ory_kratos_session=s3; b=2' }

  it('forwards only the session cookie, the body and the query', async () => {
    const fetchImpl = reply(201, { token: 't' })
    const call = accountCall('POST', `organizations/${ORG}/invitations`, q(), { email: 'a@b.co' })!
    expect(await relayAccountCall(call, { ...opts, fetchImpl })).toEqual({ status: 201, body: { token: 't' } })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`http://jinbe:8080/api/organizations/${ORG}/invitations`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).cookie).toBe('ory_kratos_session=s3')
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.co', roles: [] }))

    const get = reply(200, {})
    await relayAccountCall(accountCall('GET', 'me/orgs', q('app=jinbe'), undefined)!, { ...opts, fetchImpl: get })
    expect((get.mock.calls[0] as unknown as [string])[0]).toBe('http://jinbe:8080/api/me/orgs?app=jinbe')
  })

  it('relays refusals as they are, and answers for a missing session or an outage', async () => {
    const call = accountCall('GET', 'me/invitations', q(), undefined)!
    expect(await relayAccountCall(call, { ...opts, fetchImpl: reply(403, { refused: [] }) })).toEqual({ status: 403, body: { refused: [] } })
    expect(await relayAccountCall(call, { ...opts, fetchImpl: reply(204) })).toEqual({ status: 204, body: null })
    expect((await relayAccountCall(call, { ...opts, cookieHeader: 'a=1' })).status).toBe(401)
    expect((await relayAccountCall(call, { ...opts, baseUrl: '' })).status).toBe(503)
    expect((await relayAccountCall(call, { ...opts, fetchImpl: vi.fn(async () => { throw new Error('down') }) })).status).toBe(503)
  })
})
