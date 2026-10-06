import { sessionCookie } from './access-reason-server'

/**
 * Server-side relay for the Account area (/account, /invitation): the signed-in person's own
 * organizations, asked of jinbe on their behalf. Only the calls listed in ACCOUNT_ROUTES pass, each
 * with only the query keys and body fields it takes; only the Kratos session cookie is forwarded.
 * jinbe decides every permission; this only relays its answer (status and JSON body) unchanged.
 */

export type AccountMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const DOMAIN = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+'
const CLIENT_ID = '[A-Za-z0-9][A-Za-z0-9._:-]{0,127}'
const ROLE = /^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/

type Body = Record<string, unknown>
/** Rebuilds the body from the fields the call takes; null refuses it. */
type BodyRule = (raw: unknown) => Body | null

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const roleList = (v: unknown): string[] | null =>
  v === undefined ? [] : Array.isArray(v) && v.length <= 32 && v.every((r) => typeof r === 'string' && ROLE.test(r)) ? [...(v as string[])] : null

const BODIES = {
  accept: (raw) => {
    if (!isObj(raw)) return null
    if (typeof raw.token === 'string' && TOKEN.test(raw.token)) return { token: raw.token }
    if (typeof raw.id === 'string' && new RegExp(`^${UUID}$`).test(raw.id)) return { id: raw.id }
    return null
  },
  roles: (raw) => {
    const roles = isObj(raw) ? roleList(raw.roles) : null
    return roles && isObj(raw) && raw.roles !== undefined ? { roles } : null
  },
  invite: (raw) => {
    if (!isObj(raw) || typeof raw.email !== 'string') return null
    const email = raw.email.trim().toLowerCase()
    const roles = roleList(raw.roles)
    return email.length <= 254 && EMAIL.test(email) && roles ? { email, roles } : null
  },
  domain: (raw) => {
    if (!isObj(raw) || typeof raw.domain !== 'string') return null
    const domain = raw.domain.trim().toLowerCase()
    return new RegExp(`^${DOMAIN}$`).test(domain) ? { domain } : null
  },
} satisfies Record<string, BodyRule>

interface AccountRoute {
  method: AccountMethod
  /** Matched against the jinbe path without its leading `/api/`. */
  path: RegExp
  query?: Record<string, RegExp>
  body?: BodyRule
}

const r = (method: AccountMethod, path: string, extra: Omit<AccountRoute, 'method' | 'path'> = {}): AccountRoute => ({ method, path: new RegExp(`^${path}$`), ...extra })
const ORG = `organizations/${UUID}`

export const ACCOUNT_ROUTES: readonly AccountRoute[] = [
  r('GET', 'me/organizations'),
  r('GET', 'me/permissions', { query: { orgLimit: /^\d{1,4}$/, orgCursor: /^[A-Za-z0-9-]{1,64}$/ } }),
  r('GET', 'me/orgs', { query: { app: /^[a-z][a-z0-9-]{0,39}$/ } }),
  r('GET', 'me/invitations'),
  r('GET', 'me/invitations/by-token', { query: { token: TOKEN } }),
  r('POST', 'me/invitations/accept', { body: BODIES.accept }),
  r('POST', `me/invitations/${UUID}/decline`),
  r('GET', `${ORG}/users`),
  r('DELETE', `${ORG}/users/${UUID}`),
  r('GET', `${ORG}/roles`),
  r('GET', `${ORG}/users/${UUID}/roles`),
  r('PUT', `${ORG}/users/${UUID}/roles`, { body: BODIES.roles }),
  r('GET', `${ORG}/invitations`),
  r('POST', `${ORG}/invitations`, { body: BODIES.invite }),
  r('DELETE', `${ORG}/invitations/${UUID}`),
  r('GET', `${ORG}/api-keys`),
  r('DELETE', `${ORG}/api-keys/${CLIENT_ID}`),
  r('GET', `${ORG}/domains`),
  r('POST', `${ORG}/domains`, { body: BODIES.domain }),
  r('POST', `${ORG}/domains/${DOMAIN}/verify`),
  r('DELETE', `${ORG}/domains/${DOMAIN}`),
]

export interface AccountCall {
  method: AccountMethod
  /** e.g. `me/organizations` (no leading `/api/`). */
  path: string
  query: URLSearchParams
  body?: Body
}

/**
 * The call to make for this request, or null when it is not one the Account area may make: an
 * unknown path or method, a query key the call does not take, or a body that does not fit.
 */
export function accountCall(method: string, path: string, search: URLSearchParams, rawBody: unknown): AccountCall | null {
  const route = ACCOUNT_ROUTES.find((rt) => rt.method === method && rt.path.test(path))
  if (!route) return null
  const query = new URLSearchParams()
  for (const [k, v] of search) {
    const rule = route.query?.[k]
    if (!rule || !rule.test(v) || query.has(k)) return null
    query.set(k, v)
  }
  if (!route.body) return rawBody === undefined || rawBody === null ? { method: route.method, path, query } : null
  const body = route.body(rawBody)
  return body ? { method: route.method, path, query, body } : null
}

/**
 * Whether a state-changing request comes from this UI's own pages: Sec-Fetch-Site when the browser
 * sends it, else the Origin's host against Host. A request with neither is refused.
 */
export function sameOrigin(headers: Headers): boolean {
  const site = headers.get('sec-fetch-site')
  if (site) return site === 'same-origin'
  const origin = headers.get('origin')
  const host = headers.get('x-forwarded-host') || headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host.toLowerCase() === host.split(',')[0].trim().toLowerCase()
  } catch {
    return false
  }
}

export interface RelayOptions {
  baseUrl: string
  cookieHeader: string | null
  cookieName?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export interface RelayResult {
  status: number
  /** jinbe's JSON answer, or null (204, or nothing readable). */
  body: unknown
}

/** Makes the call with the visitor's session. 401 without a session; 503 when jinbe can't be reached. */
export async function relayAccountCall(call: AccountCall, opts: RelayOptions): Promise<RelayResult> {
  const base = opts.baseUrl.replace(/\/+$/, '')
  if (!base) return { status: 503, body: { error: 'unavailable' } }
  const cookie = sessionCookie(opts.cookieHeader, opts.cookieName ?? 'ory_kratos_session')
  if (!cookie) return { status: 401, body: { error: 'unauthenticated' } }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 10000)
  const qs = call.query.toString()
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${base}/api/${call.path}${qs ? `?${qs}` : ''}`, {
      method: call.method,
      signal: ctl.signal,
      redirect: 'error',
      cache: 'no-store',
      headers: { accept: 'application/json', cookie, ...(call.body ? { 'content-type': 'application/json' } : {}) },
      ...(call.body ? { body: JSON.stringify(call.body) } : {}),
    })
    if (res.status === 204) return { status: 204, body: null }
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    return { status: res.status, body }
  } catch {
    return { status: 503, body: { error: 'unavailable' } }
  } finally {
    clearTimeout(timer)
  }
}
