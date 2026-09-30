import { kratosSessionCookies } from './sites-server'
import {
  PROTECTED_ACTIONS_HOURS_DEFAULT,
  TECHNICAL_SCOPES,
  allowedRedirect,
  refusalReason,
  type ConsentDecision,
  type ConsentLoad,
  type ConsentScope,
  type ConsentSubmit,
  type ConsentView,
  type RedirectOrigins,
  type RefusalReason,
} from './oauth2'

/**
 * Server-side client for jinbe's Hydra login/consent provider:
 *   GET  /api/public/oauth2/login?login_challenge=
 *   GET  /api/public/oauth2/consent?consent_challenge=
 *   POST /api/public/oauth2/consent
 * Only the Kratos session cookies are forwarded (plus, on the POST, the browser's Origin,
 * which jinbe checks). Per-visitor, so never cached. Every redirect jinbe hands back is
 * checked against `allowedRedirect` before the browser is sent anywhere.
 */

export interface OAuth2ServerOptions {
  baseUrl: string
  cookieHeader: string | null
  cookiePrefix?: string
  origins: RedirectOrigins
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export type LoginHop =
  | { kind: 'redirect'; to: string }
  /** `to` is Hydra's reject URL: the app gets `access_denied` when the person goes back to it. */
  | { kind: 'refused'; reason: RefusalReason; to: string | null }
  | { kind: 'unauthenticated' }
  | { kind: 'expired' }
  | { kind: 'unavailable' }

type Answer = { status: number; body: unknown } | null

async function call(o: OAuth2ServerOptions, path: string, init?: { method: 'POST'; body: unknown; origin: string | null }): Promise<Answer | 'unauthenticated'> {
  const base = o.baseUrl.replace(/\/+$/, '')
  if (!base) return null
  const cookie = kratosSessionCookies(o.cookieHeader, o.cookiePrefix)
  if (!cookie) return 'unauthenticated'
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 5000)
  try {
    const headers: Record<string, string> = { accept: 'application/json', cookie }
    if (init) {
      headers['content-type'] = 'application/json'
      if (init.origin) headers.origin = init.origin
    }
    const res = await (o.fetchImpl ?? fetch)(`${base}${path}`, {
      method: init?.method ?? 'GET',
      signal: ctl.signal,
      redirect: 'error',
      cache: 'no-store',
      headers,
      ...(init ? { body: JSON.stringify(init.body) } : {}),
    })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    return { status: res.status, body }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function field(body: unknown, ...keys: string[]): unknown {
  if (!body || typeof body !== 'object') return undefined
  const b = body as Record<string, unknown>
  for (const k of keys) if (b[k] !== undefined) return b[k]
  return undefined
}

/** jinbe's error bodies carry the reason as `reason`, `error` or `code`, sometimes under `details`. */
function errorReason(body: unknown): unknown {
  return field(body, 'reason') ?? field(field(body, 'details'), 'reason') ?? field(body, 'error') ?? field(body, 'code')
}

/** A refusal jinbe answered with an error status: 401 sign in again, 404/410 the request ended. */
function classifyError(a: { status: number; body: unknown }, origins: RedirectOrigins): LoginHop {
  if (a.status === 401) return { kind: 'unauthenticated' }
  if (a.status === 404 || a.status === 410) return { kind: 'expired' }
  if (a.status === 400 || a.status === 403 || a.status === 409) {
    const reason = errorReason(a.body)
    if (reason === 'challenge_expired' || reason === 'not_found' || reason === 'request_expired') return { kind: 'expired' }
    return { kind: 'refused', reason: refusalReason(reason), to: allowedRedirect(field(a.body, 'redirect_to', 'to'), origins) }
  }
  return { kind: 'unavailable' }
}

export function parseLoginHop(a: { status: number; body: unknown }, origins: RedirectOrigins): LoginHop {
  if (a.status !== 200) return classifyError(a, origins)
  const action = field(a.body, 'action')
  const to = allowedRedirect(field(a.body, 'to', 'redirect_to'), origins)
  if (action === 'redirect') return to ? { kind: 'redirect', to } : { kind: 'unavailable' }
  if (action === 'refused') return { kind: 'refused', reason: refusalReason(field(a.body, 'reason')), to }
  return { kind: 'unavailable' }
}

export async function fetchLoginHop(o: OAuth2ServerOptions, challenge: string): Promise<LoginHop> {
  const a = await call(o, `/api/public/oauth2/login?login_challenge=${encodeURIComponent(challenge)}`)
  if (a === 'unauthenticated') return { kind: 'unauthenticated' }
  return a ? parseLoginHop(a, o.origins) : { kind: 'unavailable' }
}

const SCOPE = /^[a-z0-9][a-z0-9_.:-]{0,127}$/i
const MAX_SCOPES = 500

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  // Printable only: a registered name is attacker-chosen text.
  const t = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim()
  return t ? t.slice(0, max) : null
}

function isoDate(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/** `localhost:53682` from a host or a URL; loopback only, as jinbe's registration allows. */
function redirectHost(v: unknown): string | null {
  const s = text(v, 300)
  if (!s) return null
  try {
    const u = new URL(s.includes('://') ? s : `http://${s}`)
    return u.host || null
  } catch {
    return null
  }
}

function catalogOf(raw: unknown, requested: Set<string> | null): ConsentScope[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: ConsentScope[] = []
  for (const item of raw.slice(0, MAX_SCOPES)) {
    const scope = typeof item === 'string' ? item : field(item, 'scope')
    if (typeof scope !== 'string' || !SCOPE.test(scope) || seen.has(scope) || TECHNICAL_SCOPES.includes(scope)) continue
    if (scope.includes('*') || (requested && !requested.has(scope))) continue
    const group = field(item, 'group')
    const label = text(field(item, 'label'), 80)
    seen.add(scope)
    out.push({
      scope,
      group: typeof group === 'string' && group ? group : scope.split(/[.:]/)[0],
      ...(label && label !== scope ? { label } : {}),
      ...(field(item, 'protected') === true ? { protected: true } : {}),
    })
  }
  return out
}

/** jinbe's consent answer as what the page may show. Malformed → null (the page says unavailable). */
export function parseConsentView(body: unknown): ConsentView | null {
  const client = field(body, 'client')
  if (!client || typeof client !== 'object') return null
  const requestedRaw = field(body, 'requested', 'requested_scope')
  const requested = Array.isArray(requestedRaw) ? new Set(requestedRaw.filter((s): s is string => typeof s === 'string')) : null
  const pa = field(body, 'protectedActions', 'protected_actions')
  const hours = Number(field(pa, 'hours', 'window_hours'))
  const account = field(body, 'account')
  return {
    client: {
      name: text(field(client, 'name', 'client_name'), 64) ?? 'MCP client',
      redirectHost: redirectHost(field(client, 'redirect_host', 'redirectHost', 'redirect_uri')),
      registeredAt: isoDate(field(client, 'registered_at', 'registeredAt')),
    },
    account: text(typeof account === 'string' ? account : field(account, 'email'), 254),
    catalog: catalogOf(field(body, 'catalog'), requested),
    protectedActions: {
      offered: field(pa, 'offered') === true,
      until: isoDate(field(pa, 'until')),
      hours: Number.isInteger(hours) && hours > 0 && hours <= 720 ? hours : PROTECTED_ACTIONS_HOURS_DEFAULT,
    },
    signedInUntil: isoDate(field(body, 'grantExpiresAt', 'grant_expires_at')),
  }
}

/** Load the consent screen. A refusal comes back with Hydra's reject URL for the "Return to your app" button. */
export async function fetchConsent(o: OAuth2ServerOptions, challenge: string): Promise<{ load: ConsentLoad; returnTo: string | null }> {
  const a = await call(o, `/api/public/oauth2/consent?consent_challenge=${encodeURIComponent(challenge)}`)
  if (a === 'unauthenticated') return { load: { kind: 'unauthenticated' }, returnTo: null }
  if (!a) return { load: { kind: 'unavailable' }, returnTo: null }
  if (a.status === 200 && field(a.body, 'action') === 'refused') {
    return { load: { kind: 'refused', reason: refusalReason(field(a.body, 'reason')) }, returnTo: allowedRedirect(field(a.body, 'to', 'redirect_to'), o.origins) }
  }
  if (a.status === 200) {
    const view = parseConsentView(a.body)
    return { load: view ? { kind: 'consent', view } : { kind: 'unavailable' }, returnTo: null }
  }
  const e = classifyError(a, o.origins)
  return e.kind === 'refused' ? { load: { kind: 'refused', reason: e.reason }, returnTo: e.to } : { load: e.kind === 'redirect' ? { kind: 'unavailable' } : e, returnTo: null }
}

/** The browser's decision, re-shaped for jinbe; unknown or unticked scopes are jinbe's to drop again. */
export function consentBody(challenge: string, d: ConsentDecision): Record<string, unknown> {
  if (d.decision === 'deny') return { consent_challenge: challenge, decision: 'deny' }
  return {
    consent_challenge: challenge,
    decision: 'allow',
    mode: d.mode,
    ...(d.mode === 'chosen' ? { scopes: d.scopes } : {}),
    protected_actions: d.protectedActions,
  }
}

export async function submitConsent(o: OAuth2ServerOptions & { origin: string | null }, challenge: string, d: ConsentDecision): Promise<{ result: ConsentSubmit; returnTo: string | null }> {
  const a = await call(o, '/api/public/oauth2/consent', { method: 'POST', body: consentBody(challenge, d), origin: o.origin })
  if (a === 'unauthenticated') return { result: { kind: 'unauthenticated' }, returnTo: null }
  if (!a) return { result: { kind: 'unavailable' }, returnTo: null }
  if (a.status === 200 || a.status === 201) {
    const to = allowedRedirect(field(a.body, 'redirect_to', 'to'), o.origins)
    if (field(a.body, 'action') === 'refused') return { result: { kind: 'refused', reason: refusalReason(field(a.body, 'reason')) }, returnTo: to }
    return { result: to ? { kind: 'redirect', to } : { kind: 'unavailable' }, returnTo: null }
  }
  const e = classifyError(a, o.origins)
  return e.kind === 'refused' ? { result: { kind: 'refused', reason: e.reason }, returnTo: e.to } : { result: e.kind === 'redirect' ? { kind: 'unavailable' } : e, returnTo: null }
}

/** Parse the browser's POST body; anything off-shape is refused before jinbe sees it. */
export function parseDecision(body: unknown): { challenge: string; decision: ConsentDecision } | null {
  const challenge = field(body, 'consent_challenge')
  const decision = field(body, 'decision')
  if (typeof challenge !== 'string' || (decision !== 'allow' && decision !== 'deny')) return null
  const mode = field(body, 'mode') === 'chosen' ? 'chosen' : 'all'
  const rawScopes = field(body, 'scopes')
  const scopes = Array.isArray(rawScopes)
    ? [...new Set(rawScopes.filter((s): s is string => typeof s === 'string' && SCOPE.test(s) && !s.includes('*')))].slice(0, MAX_SCOPES)
    : []
  if (decision === 'allow' && mode === 'chosen' && scopes.length === 0) return null
  return { challenge, decision: { decision, mode, scopes, protectedActions: field(body, 'protected_actions') === true } }
}

/** This UI's origin as the browser sees it (behind Oathkeeper: the forwarded host). */
export function requestOrigin(req: Request): string | null {
  const url = new URL(req.url)
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host).split(',')[0].trim()
  const proto = (req.headers.get('x-forwarded-proto') || url.protocol.replace(/:$/, '')).split(',')[0].trim()
  if (!host || (proto !== 'https' && proto !== 'http')) return null
  try {
    return new URL(`${proto}://${host}`).origin
  } catch {
    return null
  }
}

/** The redirect allow-list for this request, from the environment. */
export function redirectOrigins(req: Request): RedirectOrigins {
  return {
    self: requestOrigin(req),
    hydra: process.env.HYDRA_PUBLIC_URL || null,
    kratos: process.env.NEXT_PUBLIC_KRATOS_BROWSER_URL || null,
  }
}

/** The cookie holding Hydra's reject URL between the refusal and "Return to your app". */
export const RETURN_COOKIE = 'oauth2_return'
