import { describe, it, expect, vi, afterEach } from 'vitest'

import { GET } from './route'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('GET /api/second-factor', () => {
  it('JINBE_PUBLIC_URL unset: unavailable, and a server warning naming the setting — once', async () => {
    vi.stubEnv('JINBE_PUBLIC_URL', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const req = () => new Request('http://ui/api/second-factor', { headers: { cookie: 'ory_kratos_session=s' } })
    const res = await GET(req())
    expect(await res.json()).toEqual({ kind: 'unavailable' })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    await GET(req())
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('JINBE_PUBLIC_URL')
  })
})
