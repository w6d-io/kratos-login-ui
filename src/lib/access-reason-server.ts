import type { AccessReasonResult, JinbeReason } from './access'

/**
 * Server-side client for jinbe's
 * `GET /api/public/sites/:name/access-reason?url=<return_to>` (task S-4).
 * Oathkeeper can't tell a 2FA refusal from a plain one, so /access asks
 * jinbe why the visitor was refused, on the visitor's behalf: only the
 * Kratos session cookie is forwarded. Per-visitor, so never cached.
 * Failures resolve to `unavailable` — never to a guess.
 */

const SITE_NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const REASONS: readonly JinbeReason[] = ['needs_2fa', 'forbidden', 'ok', 'not_found']

export interface AccessReasonOptions {
  baseUrl: string
  site: string
  url: string
  cookieHeader: string | null
  cookieName?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/** `name=value` of one cookie from a Cookie header, or null. */
export function sessionCookie(header: string | null, name: string): string | null {
  for (const part of (header || '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name && v.length) return `${name}=${v.join('=')}`
  }
  return null
}

export async function fetchAccessReason(opts: AccessReasonOptions): Promise<AccessReasonResult> {
  const forbidden: AccessReasonResult = { kind: 'reason', reason: 'forbidden', minAal: null }
  const base = opts.baseUrl.replace(/\/+$/, '')
  if (!base) return { kind: 'unavailable' }
  if (!SITE_NAME.test(opts.site)) return forbidden
  const cookie = sessionCookie(opts.cookieHeader, opts.cookieName ?? 'ory_kratos_session')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 3000)
  try {
    const res = await (opts.fetchImpl ?? fetch)(
      `${base}/api/public/sites/${encodeURIComponent(opts.site)}/access-reason?url=${encodeURIComponent(opts.url)}`,
      {
        signal: ctl.signal,
        redirect: 'error',
        cache: 'no-store',
        headers: { accept: 'application/json', ...(cookie ? { cookie } : {}) },
      },
    )
    if (res.status === 401) return { kind: 'unauthenticated' }
    if (res.status === 400) return forbidden
    if (!res.ok) return { kind: 'unavailable' }
    const body = (await res.json()) as { reason?: unknown; minAal?: unknown }
    if (!REASONS.includes(body.reason as JinbeReason)) return { kind: 'unavailable' }
    const minAal = body.minAal === 'aal1' || body.minAal === 'aal2' ? body.minAal : null
    return { kind: 'reason', reason: body.reason as JinbeReason, minAal }
  } catch {
    return { kind: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}
