import { parseSignInProtection, UNKNOWN_PROTECTION, type SignInProtection } from './sign-in-protection'

/**
 * Server-side client for jinbe's public `GET /api/public/sign-in-protection`. Every sign-in page asks
 * it, so the answer is cached for a few seconds (a console change shows within `ttlMs`); a failure is
 * cached shorter and answers "unknown" — jinbe being down must never block the sign-in pages, and the
 * Kratos hook still enforces what the settings say.
 */

export interface ProtectionServiceOptions {
  baseUrl: string
  fetchImpl?: typeof fetch
  now?: () => number
  timeoutMs?: number
  ttlMs?: number
  errorTtlMs?: number
}

export function createProtectionService(o: ProtectionServiceOptions) {
  const now = o.now ?? Date.now
  const ttlMs = o.ttlMs ?? 10_000
  const errorTtlMs = o.errorTtlMs ?? 2_000
  let cached: { at: number; ttl: number; value: SignInProtection } | null = null

  return async function current(): Promise<SignInProtection> {
    if (cached && now() - cached.at < cached.ttl) return cached.value
    const base = o.baseUrl.replace(/\/+$/, '')
    let value = UNKNOWN_PROTECTION
    let ttl = errorTtlMs
    if (base) {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 2000)
      try {
        const res = await (o.fetchImpl ?? fetch)(`${base}/api/public/sign-in-protection`, {
          signal: ctl.signal, redirect: 'error', cache: 'no-store', headers: { accept: 'application/json' },
        })
        if (res.ok) {
          value = parseSignInProtection(await res.json())
          ttl = ttlMs
        }
      } catch {
        // unknown
      } finally {
        clearTimeout(timer)
      }
    }
    cached = { at: now(), ttl, value }
    return value
  }
}

let service: ReturnType<typeof createProtectionService> | null = null

export function protectionService() {
  if (!service) service = createProtectionService({ baseUrl: process.env.JINBE_PUBLIC_URL || '' })
  return service
}
