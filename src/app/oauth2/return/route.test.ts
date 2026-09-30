import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { GET } from './route'

const req = (cookie: string) => new Request('https://auth.example.com/oauth2/return', { headers: { cookie } })

beforeEach(() => vi.stubEnv('HYDRA_PUBLIC_URL', 'https://hydra.example.com/'))
afterEach(() => vi.unstubAllEnvs())

describe('GET /oauth2/return', () => {
  it('follows the parked Hydra reject URL once, clearing the cookie', async () => {
    const res = await GET(req(`oauth2_return=${encodeURIComponent('https://hydra.example.com/oauth2/auth?login_verifier=r')}`))
    expect(res.headers.get('location')).toBe('https://hydra.example.com/oauth2/auth?login_verifier=r')
    expect(res.headers.get('set-cookie')).toMatch(/oauth2_return=; Max-Age=0/)
  })
  it('anything but Hydra (a tossed cookie) is not followed', async () => {
    for (const to of ['https://evil.example.org/', 'https://auth.example.com/x', 'http://localhost:1/cb']) {
      expect((await GET(req(`oauth2_return=${encodeURIComponent(to)}`))).headers.get('location')).toBe('/oauth2/refused?reason=expired')
    }
  })
  it('no cookie: the request has ended', async () => {
    expect((await GET(req(''))).headers.get('location')).toBe('/oauth2/refused?reason=expired')
  })
})
