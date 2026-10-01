import { kratosSessionCookies } from './sites-server'
import { allowedRedirect, type RedirectOrigins } from './oauth2'
import { call, errorReason, field, isoDate, text, type OAuth2ServerOptions } from './oauth2-server'
import { factorIsFresh, stepUpRefusal, type StepUpLoad, type StepUpSubmit } from './oauth2-step-up'

/**
 * Server side of /oauth2/step-up: the second-factor freshness, asked of Kratos with the visitor's
 * session, and jinbe's step-up request —
 *   GET  /api/public/oauth2/step-up?req=   what the link would refresh (nothing consumed)
 *   POST /api/public/oauth2/step-up {req}  refresh it (single use; Origin = this UI)
 * Kratos session cookies only, as for consent. A redirect from jinbe is only ever followed to this
 * UI, Kratos or Hydra (allowedRedirect).
 */

export type SessionProof =
  | { kind: 'session'; secondFactorAt: string | null; email: string | null }
  | { kind: 'unauthenticated' }
  | { kind: 'unavailable' }

export interface KratosProofOptions {
  kratosUrl: string
  cookieHeader: string | null
  cookiePrefix?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/** When the session last proved a second factor: the latest aal2 method's completed_at (jinbe's clock too). */
export function secondFactorAt(session: unknown): string | null {
  const methods = field(session, 'authentication_methods')
  if (!Array.isArray(methods)) return null
  const times = methods
    .filter((m) => field(m, 'aal') === 'aal2')
    .map((m) => new Date(String(field(m, 'completed_at'))).getTime())
    .filter((t) => Number.isFinite(t))
  return times.length ? new Date(Math.max(...times)).toISOString() : null
}

/** Kratos whoami with the visitor's cookies. A session Kratos holds at aal1 has no fresh proof (refresh). */
export async function kratosProof(o: KratosProofOptions): Promise<SessionProof> {
  const base = o.kratosUrl.replace(/\/+$/, '')
  const cookie = kratosSessionCookies(o.cookieHeader, o.cookiePrefix)
  if (!cookie) return { kind: 'unauthenticated' }
  if (!base) return { kind: 'unavailable' }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 3000)
  try {
    const res = await (o.fetchImpl ?? fetch)(`${base}/sessions/whoami`, {
      signal: ctl.signal,
      redirect: 'error',
      cache: 'no-store',
      headers: { accept: 'application/json', cookie },
    })
    if (res.status === 401) return { kind: 'unauthenticated' }
    // session_aal2_required: signed in, second factor not proven in this session.
    if (res.status === 403) return { kind: 'session', secondFactorAt: null, email: null }
    if (!res.ok) return { kind: 'unavailable' }
    const s = (await res.json()) as unknown
    if (field(s, 'active') === false) return { kind: 'unauthenticated' }
    return { kind: 'session', secondFactorAt: secondFactorAt(s), email: text(field(field(field(s, 'identity'), 'traits'), 'email'), 254) }
  } catch {
    return { kind: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}

/** Kratos' aal2 refresh login, back to `back` (an absolute URL on this UI). */
export function refreshUrl(origins: RedirectOrigins, back: string): string | null {
  const base = (origins.kratos || origins.self || '').replace(/\/+$/, '')
  if (!base) return null
  return `${base}/self-service/login/browser?${new URLSearchParams({ aal: 'aal2', refresh: 'true', return_to: back })}`
}

/** What the freshness check says to do before asking jinbe: nothing (null), or this answer. */
export function proofGate(p: SessionProof, origins: RedirectOrigins, back: string, now: number = Date.now()): StepUpLoad | null {
  if (p.kind !== 'session') return p
  if (factorIsFresh(p.secondFactorAt, now)) return null
  const to = refreshUrl(origins, back)
  return to ? { kind: 'refresh', to } : { kind: 'unavailable' }
}

type Failure = Exclude<StepUpLoad, { kind: 'show' }>

function classify(a: { status: number; body: unknown }): Failure {
  if (a.status === 401) return { kind: 'unauthenticated' }
  if (a.status === 404) return { kind: 'expired' }
  const code = errorReason(a.body)
  if (a.status === 400 && code === 'invalid_request') return { kind: 'expired' }
  if (a.status === 403 || a.status === 409) {
    const reason = stepUpRefusal(code)
    if (reason !== 'unknown') return { kind: 'refused', reason }
  }
  // bad_origin, 429, 503…: ours to retry, never "you can't".
  return { kind: 'unavailable' }
}

function redirectOrFail(body: unknown, origins: RedirectOrigins): Failure {
  const to = allowedRedirect(field(body, 'to'), origins)
  return to ? { kind: 'refresh', to } : { kind: 'unavailable' }
}

type JinbeOptions = Omit<OAuth2ServerOptions, 'origins'> & { origins: RedirectOrigins }

/** What the link would refresh. `account` comes from the Kratos session (jinbe does not repeat it). */
export async function fetchStepUp(o: JinbeOptions, req: string, account: string | null): Promise<StepUpLoad> {
  const a = await call(o, `/api/public/oauth2/step-up?req=${encodeURIComponent(req)}`)
  if (a === 'unauthenticated') return { kind: 'unauthenticated' }
  if (!a) return { kind: 'unavailable' }
  if (a.status !== 200) return classify(a)
  const action = field(a.body, 'action')
  if (action === 'redirect') return redirectOrFail(a.body, o.origins)
  if (action !== 'show') return { kind: 'unavailable' }
  const hours = Number(field(a.body, 'hours', 'window_hours'))
  return {
    kind: 'show',
    view: {
      kind: field(a.body, 'kind') === 'personal' ? 'personal' : 'oauth',
      name: text(field(a.body, 'client_name', 'name'), 64) ?? (field(a.body, 'kind') === 'personal' ? 'Personal key' : 'MCP client'),
      account,
      hours: Number.isInteger(hours) && hours > 0 && hours <= 24 * 366 ? hours : null,
    },
  }
}

export async function submitStepUp(o: JinbeOptions & { origin: string }, req: string): Promise<StepUpSubmit> {
  const a = await call(o, '/api/public/oauth2/step-up', { method: 'POST', body: { req }, origin: o.origin })
  if (a === 'unauthenticated') return { kind: 'unauthenticated' }
  if (!a) return { kind: 'unavailable' }
  if (a.status !== 200) return classify(a)
  const action = field(a.body, 'action')
  // The factor went stale while the page was open: jinbe sends the aal2 refresh, back to the link.
  if (action === 'redirect') return redirectOrFail(a.body, o.origins)
  if (action !== 'done') return { kind: 'unavailable' }
  return { kind: 'done', name: text(field(a.body, 'client_name'), 64), until: isoDate(field(a.body, 'step_up_until')) }
}
