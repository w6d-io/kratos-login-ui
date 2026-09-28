import { kratosSessionCookies } from './sites-server'

/**
 * Server-side client for jinbe's `GET /api/public/second-factor`: must the
 * signed-in visitor set up or prove a second factor before going on? Only the
 * Kratos session cookies are forwarded. Per-visitor, so never cached here.
 * Anything but a well-formed answer is `unavailable` — the gate then lets the
 * sign-in finish, because jinbe and the gateway refuse server-side anyway.
 */

export const SECOND_FACTOR_METHODS = ['totp', 'webauthn', 'lookup_secret'] as const
export type SecondFactorMethod = (typeof SECOND_FACTOR_METHODS)[number]

export type SecondFactorResult =
  | { kind: 'status'; required: boolean; enrolled: boolean; methods: SecondFactorMethod[]; aal: 'aal1' | 'aal2' }
  | { kind: 'unauthenticated' }
  | { kind: 'unavailable' }

export interface SecondFactorOptions {
  baseUrl: string
  cookieHeader: string | null
  cookiePrefix?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export function parseSecondFactor(body: unknown): SecondFactorResult {
  if (!body || typeof body !== 'object') return { kind: 'unavailable' }
  const b = body as Record<string, unknown>
  if (typeof b.secondFactorRequired !== 'boolean' || typeof b.hasSecondFactor !== 'boolean') return { kind: 'unavailable' }
  const methods = Array.isArray(b.methods)
    ? SECOND_FACTOR_METHODS.filter((m) => (b.methods as unknown[]).includes(m))
    : []
  return {
    kind: 'status',
    required: b.secondFactorRequired,
    enrolled: b.hasSecondFactor,
    methods,
    // Anything but an explicit aal2 is treated as the lower level.
    aal: b.aal === 'aal2' ? 'aal2' : 'aal1',
  }
}

export async function fetchSecondFactor(o: SecondFactorOptions): Promise<SecondFactorResult> {
  const base = o.baseUrl.replace(/\/+$/, '')
  if (!base) return { kind: 'unavailable' }
  const cookie = kratosSessionCookies(o.cookieHeader, o.cookiePrefix)
  if (!cookie) return { kind: 'unauthenticated' }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 3000)
  try {
    const res = await (o.fetchImpl ?? fetch)(`${base}/api/public/second-factor`, {
      signal: ctl.signal,
      redirect: 'error',
      cache: 'no-store',
      headers: { accept: 'application/json', cookie },
    })
    if (res.status === 401) return { kind: 'unauthenticated' }
    if (!res.ok) return { kind: 'unavailable' }
    return parseSecondFactor(await res.json())
  } catch {
    return { kind: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}
