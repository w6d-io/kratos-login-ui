import { describe, it, expect, vi } from 'vitest'
import { fetchAccessReason, sessionCookie } from './access-reason-server'

const JINBE = 'http://jinbe.test:8080'
const URL_ = 'https://payroll.test/pay?x=1'
const COOKIE = 'theme=dark; ory_kratos_session=abc123; csrf_token_x=zzz'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
const ask = (f: unknown, extra: Record<string, unknown> = {}) =>
  fetchAccessReason({ baseUrl: JINBE, site: 'payroll', url: URL_, cookieHeader: COOKIE, fetchImpl: f as typeof fetch, ...extra })

describe('sessionCookie', () => {
  it('extracts only the Kratos session cookie', () => {
    expect(sessionCookie(COOKIE, 'ory_kratos_session')).toBe('ory_kratos_session=abc123')
    expect(sessionCookie('a=b', 'ory_kratos_session')).toBeNull()
    expect(sessionCookie(null, 'ory_kratos_session')).toBeNull()
  })
})

describe('fetchAccessReason', () => {
  it('asks jinbe for the site and URL, forwarding only the session cookie', async () => {
    const f = vi.fn(async () => json({ reason: 'needs_2fa', minAal: 'aal2' }))
    expect(await ask(f)).toEqual({ kind: 'reason', reason: 'needs_2fa', minAal: 'aal2' })
    expect(f).toHaveBeenCalledWith(
      `${JINBE}/api/public/sites/payroll/access-reason?url=${encodeURIComponent(URL_)}`,
      expect.objectContaining({ redirect: 'error', cache: 'no-store', headers: expect.objectContaining({ cookie: 'ory_kratos_session=abc123' }) }),
    )
  })

  it('passes through ok, forbidden and not_found', async () => {
    for (const reason of ['ok', 'forbidden', 'not_found'] as const) {
      expect(await ask(async () => json({ reason }))).toEqual({ kind: 'reason', reason, minAal: null })
    }
  })

  it('maps 401 to sign-in and 400 to forbidden', async () => {
    expect(await ask(async () => json({}, 401))).toEqual({ kind: 'unauthenticated' })
    expect(await ask(async () => json({}, 400))).toEqual({ kind: 'reason', reason: 'forbidden', minAal: null })
  })

  it('reports unavailable on 503, other errors, bad bodies, network failure and timeout', async () => {
    expect(await ask(async () => json({}, 503))).toEqual({ kind: 'unavailable' })
    expect(await ask(async () => json({}, 500))).toEqual({ kind: 'unavailable' })
    expect(await ask(async () => json({ reason: 'maybe' }))).toEqual({ kind: 'unavailable' })
    expect(await ask(async () => new Response('nope'))).toEqual({ kind: 'unavailable' })
    expect(await ask(async () => { throw new Error('ECONNREFUSED') })).toEqual({ kind: 'unavailable' })
    const hang = (_u: string, init: RequestInit) =>
      new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    expect(await ask(hang, { timeoutMs: 20 })).toEqual({ kind: 'unavailable' })
  })

  it('is unavailable when JINBE_PUBLIC_URL is unset, without calling anything', async () => {
    const f = vi.fn()
    expect(await ask(f, { baseUrl: '' })).toEqual({ kind: 'unavailable' })
    expect(f).not.toHaveBeenCalled()
  })

  it('treats an invalid site name as forbidden without calling jinbe', async () => {
    const f = vi.fn()
    expect(await ask(f, { site: '../admin' })).toEqual({ kind: 'reason', reason: 'forbidden', minAal: null })
    expect(f).not.toHaveBeenCalled()
  })

  it('still asks without a session cookie (jinbe answers 401)', async () => {
    const f = vi.fn(async () => json({}, 401))
    expect(await ask(f, { cookieHeader: null })).toEqual({ kind: 'unauthenticated' })
    expect((f.mock.calls[0] as unknown[])[1]).not.toHaveProperty('headers.cookie')
  })
})
