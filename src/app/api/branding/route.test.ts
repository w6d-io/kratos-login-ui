import { describe, it, expect, vi, beforeEach } from 'vitest'

const lookup = vi.fn()
const logo = vi.fn()
vi.mock('@/lib/branding-server', () => ({ brandingService: () => ({ lookup, logo }) }))

import { GET } from './route'
import { GET as GET_LOGO } from './logo/route'

const req = (url: string) => new Request(url)

beforeEach(() => {
  lookup.mockReset()
  logo.mockReset()
})

describe('GET /api/branding', () => {
  it('looks up the return_to host and returns the sanitised branding', async () => {
    lookup.mockResolvedValue({ host: 'p.test', name: 'p', displayName: 'P' })
    const res = await GET(req('http://ui/api/branding?return_to=' + encodeURIComponent('https://P.test/x')))
    expect(lookup).toHaveBeenCalledWith('p.test')
    expect(await res.json()).toEqual({ branding: { host: 'p.test', name: 'p', displayName: 'P' } })
    expect(res.headers.get('cache-control')).toContain('max-age=60')
  })

  it('returns the platform default without calling jinbe for a missing or bad return_to', async () => {
    for (const q of ['', '?return_to=javascript:alert(1)', '?return_to=/relative']) {
      const res = await GET(req('http://ui/api/branding' + q))
      expect(await res.json()).toEqual({ branding: null })
    }
    expect(lookup).not.toHaveBeenCalled()
  })

  it('returns the platform default when the lookup throws', async () => {
    lookup.mockRejectedValue(new Error('boom'))
    const res = await GET(req('http://ui/api/branding?return_to=https://p.test/'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ branding: null })
  })
})

describe('GET /api/branding/logo', () => {
  it('serves the sniffed image with locked-down headers', async () => {
    logo.mockResolvedValue({ type: 'image/png', body: new Uint8Array([1, 2, 3]) })
    const res = await GET_LOGO(req('http://ui/api/branding/logo?host=p.test'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
  })

  it('404s for an invalid host or no logo', async () => {
    logo.mockResolvedValue(null)
    expect((await GET_LOGO(req('http://ui/api/branding/logo?host=p.test'))).status).toBe(404)
    expect((await GET_LOGO(req('http://ui/api/branding/logo?host=a%2F..%2Fb'))).status).toBe(404)
    expect(logo).toHaveBeenCalledTimes(1)
  })
})
