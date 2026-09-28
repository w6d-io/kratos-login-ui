import { accentPassesContrast, cleanText, isAcceptableLogoRef, isValidHost, normaliseHex, safeHttpUrl } from './branding'

/**
 * Server-side client for jinbe's `GET /api/public/sites/mine` (LAND-1): the
 * sites the visitor can reach, for the "Where to?" page. Only the Kratos
 * session cookies are forwarded. Per-visitor, so never cached.
 * 503 from jinbe means "policy unavailable" — never a partial list — and,
 * like any failure, resolves to `unavailable` (retry), never to "no sites".
 */

export interface MySite {
  name: string
  displayName: string
  url: string
  /** The browser loads it via /api/branding/logo?host=<url host>. */
  hasLogo: boolean
  accent: string | null
}

export type MySitesResult =
  | { kind: 'sites'; sites: MySite[] }
  | { kind: 'unauthenticated' }
  | { kind: 'unavailable' }

const SITE_NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const MAX_SITES = 200

/** The `ory_kratos_session*` cookies of a Cookie header (Kratos may suffix the name). */
export function kratosSessionCookies(header: string | null, prefix = 'ory_kratos_session'): string | null {
  const out: string[] = []
  for (const part of (header || '').split(';')) {
    const kv = part.trim()
    const i = kv.indexOf('=')
    if (i > 0 && kv.slice(0, i).startsWith(prefix)) out.push(kv)
  }
  return out.length ? out.join('; ') : null
}

/** Validate one entry; sites whose URL is off the return-URL allow-list are dropped. */
export function sanitizeSite(raw: unknown, isAllowed: (url: string) => boolean): MySite | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string' || !SITE_NAME.test(r.name)) return null
  const url = safeHttpUrl(r.url)
  if (!url || !isAllowed(url) || !isValidHost(new URL(url).hostname)) return null
  const accent = normaliseHex(r.accent)
  return {
    name: r.name,
    displayName: cleanText(r.displayName, 60) || r.name,
    url,
    hasLogo: isAcceptableLogoRef(r.logoUrl),
    accent: accent && accentPassesContrast(accent) ? accent : null,
  }
}

export interface MySitesOptions {
  baseUrl: string
  cookieHeader: string | null
  /** Kratos session cookie name (prefix match; default ory_kratos_session). */
  cookiePrefix?: string
  isAllowed: (url: string) => boolean
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export async function fetchMySites(o: MySitesOptions): Promise<MySitesResult> {
  const base = o.baseUrl.replace(/\/+$/, '')
  if (!base) return { kind: 'unavailable' }
  const cookie = kratosSessionCookies(o.cookieHeader, o.cookiePrefix)
  if (!cookie) return { kind: 'unauthenticated' }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 3000)
  try {
    const res = await (o.fetchImpl ?? fetch)(`${base}/api/public/sites/mine`, {
      signal: ctl.signal,
      redirect: 'error',
      cache: 'no-store',
      headers: { accept: 'application/json', cookie },
    })
    if (res.status === 401) return { kind: 'unauthenticated' }
    if (!res.ok) return { kind: 'unavailable' }
    const body = (await res.json()) as unknown
    if (!Array.isArray(body)) return { kind: 'unavailable' }
    const sites = body
      .slice(0, MAX_SITES)
      .map((s) => sanitizeSite(s, o.isAllowed))
      .filter((s): s is MySite => s !== null)
    return { kind: 'sites', sites }
  } catch {
    return { kind: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}
