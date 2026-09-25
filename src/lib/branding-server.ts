import { isAcceptableLogoRef, isValidHost, sanitizeBranding, type SiteBranding } from './branding'

/**
 * Server-side client for jinbe's public, unauthenticated
 * `GET /api/public/sites/by-host/:host` (task S-4). Short timeout, small
 * bounded TTL cache, and every failure resolves to `null` (platform
 * branding) — jinbe being down must never block sign-in.
 *
 * Logos are proxied rather than linked so the browser never talks to jinbe
 * (JINBE_PUBLIC_URL may be cluster-internal) and so the bytes can be sniffed:
 * only PNG and WebP are served, SVG never is.
 */

export const MAX_LOGO_BYTES = 256 * 1024

export interface BrandingServiceOptions {
  baseUrl: string
  fetchImpl?: typeof fetch
  now?: () => number
  timeoutMs?: number
  ttlMs?: number
  errorTtlMs?: number
  maxEntries?: number
}

interface Lookup {
  branding: SiteBranding | null
  logoRef: string | null
}

interface Logo {
  type: 'image/png' | 'image/webp'
  body: Uint8Array
}

export function sniffImageType(b: Uint8Array): Logo['type'] | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (b.length >= 8 && png.every((v, i) => b[i] === v)) return 'image/png'
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to))
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}

/** Read at most `max` bytes; null when the body is larger. */
async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get('content-length') || 0)
  if (declared > max) return null
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer())
    return all.length > max ? null : all
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

class TtlCache<V> {
  private m = new Map<string, { v: V; exp: number }>()
  constructor(private max: number, private now: () => number) {}
  get(k: string): V | undefined {
    const e = this.m.get(k)
    if (!e) return undefined
    if (e.exp <= this.now()) {
      this.m.delete(k)
      return undefined
    }
    return e.v
  }
  set(k: string, v: V, ttl: number) {
    this.m.delete(k)
    if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value as string)
    this.m.set(k, { v, exp: this.now() + ttl })
  }
}

export function createBrandingService(opts: BrandingServiceOptions) {
  const base = opts.baseUrl.replace(/\/+$/, '')
  const fetchImpl = opts.fetchImpl ?? fetch
  const now = opts.now ?? Date.now
  const timeoutMs = opts.timeoutMs ?? 1500
  const ttlMs = opts.ttlMs ?? 60_000
  const errorTtlMs = opts.errorTtlMs ?? 10_000
  const maxEntries = opts.maxEntries ?? 500
  const lookups = new TtlCache<Lookup>(maxEntries, now)
  const logos = new TtlCache<Logo | null>(Math.min(maxEntries, 100), now)

  let baseOrigin: string | null = null
  try {
    baseOrigin = base ? new URL(base).origin : null
  } catch {
    baseOrigin = null
  }

  async function get(url: string): Promise<Response> {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), timeoutMs)
    try {
      return await fetchImpl(url, { signal: ctl.signal, redirect: 'error', cache: 'no-store', headers: { accept: 'application/json, image/png, image/webp' } })
    } finally {
      clearTimeout(timer)
    }
  }

  async function resolve(host: string): Promise<Lookup> {
    const empty: Lookup = { branding: null, logoRef: null }
    if (!baseOrigin || !isValidHost(host)) return empty
    const cached = lookups.get(host)
    if (cached) return cached
    try {
      const res = await get(`${base}/api/public/sites/by-host/${encodeURIComponent(host)}`)
      if (res.status === 404) {
        lookups.set(host, empty, ttlMs)
        return empty
      }
      if (!res.ok) throw new Error(`jinbe ${res.status}`)
      const raw = (await res.json()) as Record<string, unknown>
      const branding = sanitizeBranding(raw, host)
      const out: Lookup = { branding, logoRef: branding?.hasLogo ? (raw.logoUrl as string) : null }
      lookups.set(host, out, ttlMs)
      return out
    } catch {
      lookups.set(host, empty, errorTtlMs)
      return empty
    }
  }

  return {
    async lookup(host: string): Promise<SiteBranding | null> {
      return (await resolve(host)).branding
    },

    async logo(host: string): Promise<Logo | null> {
      const { logoRef } = await resolve(host)
      if (!logoRef || !isAcceptableLogoRef(logoRef) || !baseOrigin) return null
      const cached = logos.get(host)
      if (cached !== undefined) return cached
      let out: Logo | null = null
      try {
        // Only the path of jinbe's logoUrl is used, always against
        // JINBE_PUBLIC_URL: jinbe may advertise its external origin while we
        // reach it internally, and site data can never point us elsewhere.
        const ref = new URL(logoRef, `${base}/`)
        if (!ref.pathname.startsWith('/api/public/sites/')) throw new Error('unexpected logo path')
        const res = await get(`${base}${ref.pathname}${ref.search}`)
        if (!res.ok) throw new Error(`logo ${res.status}`)
        const body = await readCapped(res, MAX_LOGO_BYTES)
        const type = body && sniffImageType(body)
        out = body && type ? { type, body } : null
      } catch {
        out = null
      }
      logos.set(host, out, out ? ttlMs : errorTtlMs)
      return out
    },
  }
}

let shared: ReturnType<typeof createBrandingService> | null = null

/** Process-wide service configured from JINBE_PUBLIC_URL (unset → platform branding only). */
export function brandingService() {
  if (!shared) shared = createBrandingService({ baseUrl: process.env.JINBE_PUBLIC_URL || '' })
  return shared
}
