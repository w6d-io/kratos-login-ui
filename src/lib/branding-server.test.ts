import { describe, it, expect, vi } from 'vitest'
import { createBrandingService, sniffImageType } from './branding-server'

const JINBE = 'http://jinbe.test:8080'
const HOST = 'payroll.dev.example.com'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0])
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

const site = {
  name: 'payroll',
  displayName: 'Payroll',
  logoUrl: '/api/public/sites/payroll/logo',
  accent: '#2F6FEB',
  welcome: 'Hi',
  helpUrl: 'https://help.example/',
  minAal: 'aal2',
  scope: 'writes',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function service(fetchImpl: typeof fetch, extra: Partial<Parameters<typeof createBrandingService>[0]> = {}) {
  return createBrandingService({ baseUrl: JINBE, fetchImpl, ...extra })
}

describe('sniffImageType', () => {
  it('recognises PNG and WebP by magic bytes only', () => {
    expect(sniffImageType(PNG)).toBe('image/png')
    expect(sniffImageType(WEBP)).toBe('image/webp')
    expect(sniffImageType(SVG)).toBeNull()
    expect(sniffImageType(new Uint8Array())).toBeNull()
  })
})

describe('lookup', () => {
  it('queries the exact host on the by-host endpoint and sanitises the answer', async () => {
    const f = vi.fn(async () => json(site))
    const b = await service(f as unknown as typeof fetch).lookup(HOST)
    expect(f).toHaveBeenCalledWith(`${JINBE}/api/public/sites/by-host/${HOST}`, expect.objectContaining({ redirect: 'error' }))
    expect(b?.displayName).toBe('Payroll')
    expect(b?.hasLogo).toBe(true)
  })

  it('returns null (platform default) on 404, on errors and when jinbe is down', async () => {
    expect(await service((async () => json({}, 404)) as unknown as typeof fetch).lookup(HOST)).toBeNull()
    expect(await service((async () => json({}, 500)) as unknown as typeof fetch).lookup(HOST)).toBeNull()
    expect(await service((async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch).lookup(HOST)).toBeNull()
    expect(await service((async () => new Response('not json')) as unknown as typeof fetch).lookup(HOST)).toBeNull()
  })

  it('gives up after the timeout instead of blocking sign-in', async () => {
    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch
    const start = Date.now()
    expect(await service(hang, { timeoutMs: 30 }).lookup(HOST)).toBeNull()
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('never calls jinbe for an invalid host or when JINBE_PUBLIC_URL is unset', async () => {
    const f = vi.fn(async () => json(site))
    expect(await service(f as unknown as typeof fetch).lookup('a/../admin')).toBeNull()
    expect(await createBrandingService({ baseUrl: '', fetchImpl: f as unknown as typeof fetch }).lookup(HOST)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('caches hits and misses for the TTL, then refetches', async () => {
    let t = 0
    const f = vi.fn(async () => json(site))
    const s = service(f as unknown as typeof fetch, { now: () => t, ttlMs: 60_000 })
    await s.lookup(HOST)
    await s.lookup(HOST)
    expect(f).toHaveBeenCalledTimes(1)
    t = 61_000
    await s.lookup(HOST)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('caches failures only briefly so a jinbe blip does not stick', async () => {
    let t = 0
    const f = vi.fn(async () => { throw new Error('down') })
    const s = service(f as unknown as typeof fetch, { now: () => t, ttlMs: 60_000, errorTtlMs: 5_000 })
    await s.lookup(HOST)
    t = 6_000
    await s.lookup(HOST)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('bounds the cache size', async () => {
    const f = vi.fn(async () => json({}, 404))
    const s = service(f as unknown as typeof fetch, { maxEntries: 2 })
    await s.lookup('a.test')
    await s.lookup('b.test')
    await s.lookup('c.test')
    await s.lookup('a.test')
    expect(f).toHaveBeenCalledTimes(4)
  })
})

describe('logo', () => {
  function routed(logo: Response | (() => Response), body = site) {
    return (async (url: string) => {
      if (url.includes('/by-host/')) return json(body)
      return typeof logo === 'function' ? logo() : logo
    }) as unknown as typeof fetch
  }

  it('proxies a PNG from the jinbe origin with the sniffed type', async () => {
    const out = await service(routed(new Response(PNG, { headers: { 'content-type': 'image/png' } }))).logo(HOST)
    expect(out?.type).toBe('image/png')
    expect(out?.body.length).toBe(PNG.length)
  })

  it('refuses SVG even when labelled as PNG', async () => {
    expect(await service(routed(new Response(SVG, { headers: { 'content-type': 'image/png' } }))).logo(HOST)).toBeNull()
  })

  it('refuses logos larger than the size cap', async () => {
    const big = new Uint8Array(300 * 1024)
    big.set(PNG)
    expect(await service(routed(new Response(big))).logo(HOST)).toBeNull()
  })

  it('only ever fetches the logo path from the jinbe origin (no SSRF through site data)', async () => {
    const seen: string[] = []
    const f = (async (url: string) => {
      seen.push(url)
      return url.includes('/by-host/') ? json({ ...site, logoUrl: 'https://jinbe.public.example/api/public/sites/payroll/logo' }) : new Response(PNG)
    }) as unknown as typeof fetch
    expect(await service(f).logo(HOST)).not.toBeNull()
    expect(seen[1]).toBe(`${JINBE}/api/public/sites/payroll/logo`)
    const meta = { ...site, logoUrl: 'http://169.254.169.254/latest/meta-data' }
    expect(await service(routed(new Response(PNG), meta)).logo(HOST)).toBeNull()
  })

  it('returns null when the site has no logo', async () => {
    expect(await service(routed(new Response(PNG), { ...site, logoUrl: '' })).logo(HOST)).toBeNull()
  })
})
