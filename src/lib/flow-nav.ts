import { config, isReturnUrlAllowed } from './config'
import { initFlowUrl } from './ory'

/**
 * One place that turns Kratos answers into navigation (see docs/FLOWS.md).
 *
 * Kratos' browser redirects land on `/<page>?flow=<id>` only — `return_to`,
 * `aal` and `refresh` live on the flow object, never in our URL. Every
 * restart/redirect therefore reads them from the flow (or the context we
 * remembered for it), so they survive expiry, CSRF restarts and step-ups.
 *
 * All functions here are pure (inputs → NavAction); pages apply the action.
 */

export type FlowKind = 'login' | 'registration' | 'recovery' | 'settings' | 'verification'

export const UI_PATH: Record<FlowKind, string> = {
  login: '/login',
  registration: '/register',
  recovery: '/recovery',
  settings: '/settings',
  verification: '/verification',
}

export interface FlowContext {
  returnTo?: string
  aal?: 'aal1' | 'aal2'
  refresh?: boolean
}

export type NavAction =
  | { kind: 'redirect'; to: string }
  /** Kratos answered with the updated flow (validation errors) — render it. */
  | { kind: 'flow'; flow: unknown }
  | { kind: 'refetch' }
  | { kind: 'error'; message: string }

/** Groups that satisfy aal2 on a login flow (passkey is a first factor). */
export const SECOND_FACTOR_GROUPS = ['totp', 'webauthn', 'lookup_secret', 'code'] as const

export function secondFactorGroups(flow: { ui?: { nodes?: Array<{ group?: string; type?: string }> } } | null | undefined): string[] {
  // Input nodes only: Kratos ships webauthn.js as a `script` node in group
  // `webauthn` on any flow with passkeys, which is not a second factor.
  const present = new Set((flow?.ui?.nodes ?? []).filter((n) => n.type !== 'script').map((n) => n.group))
  return SECOND_FACTOR_GROUPS.filter((g) => present.has(g))
}

/**
 * A return_to we may navigate to ourselves, as an absolute URL, or null.
 * Same-origin paths and same-origin URLs pass; other origins must be in
 * NEXT_PUBLIC_ALLOWED_RETURN_URLS. Never javascript:, data:, `//host`.
 */
export function safeReturnTo(raw: string | null | undefined, origin: string): string | null {
  if (!raw) return null
  if (raw.startsWith('/')) {
    if (raw.startsWith('//') || raw.startsWith('/\\')) return null
    try {
      const u = new URL(raw, origin)
      return u.origin === origin ? u.toString() : null
    } catch {
      return null
    }
  }
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (u.origin === origin) return u.toString()
  return isReturnUrlAllowed(u.toString()) ? u.toString() : null
}

/**
 * Redirect targets handed to us by Kratos (redirect_browser_to,
 * continue_with). Kratos validated them already; we still refuse anything
 * that is not http(s) on this UI, the Kratos public URL, or an allowed
 * return URL.
 */
export function safeKratosRedirect(raw: string | null | undefined, origin: string, kratosBase: string): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw, origin)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (u.origin === new URL(kratosBase, origin).origin) return u.toString()
  } catch {
    return null
  }
  return safeReturnTo(raw, origin)
}

/** This UI's own entry pages: landing there after sign-in would loop back to /login. */
function isLoginLoop(url: string, origin: string): boolean {
  try {
    const u = new URL(url)
    return u.origin === origin && (u.pathname === '/' || u.pathname === '/login')
  } catch {
    return true
  }
}

/** The "Where to?" page (src/lib/landing.ts) — the only fallback destination. */
export const WELCOME_PATH = '/welcome'

/** The two-step gate (src/lib/two-step.ts): set up or prove a second factor when the account must. */
export const TWO_STEP_PATH = '/two-step'

/**
 * The final destination of a signed-in person: a valid return_to, else
 * /welcome (site landing or picker). Never Kratos' or our own static
 * default, and never this UI's root or /login (that would loop). Only the
 * gate itself goes here directly; everything else uses landingUrl.
 */
export function destinationUrl(returnTo: string | null | undefined, origin: string): string {
  const safe = safeReturnTo(returnTo, origin)
  if (safe && !isLoginLoop(safe, origin)) return safe
  return `${origin}${WELCOME_PATH}`
}

/** The gate for a destination already validated by destinationUrl. */
export function gateUrl(destination: string, origin: string): string {
  return `${origin}${TWO_STEP_PATH}?return_to=${encodeURIComponent(destination)}`
}

/**
 * Where a signed-in person goes: through the two-step gate to
 * destinationUrl — so no sign-in leaves this UI for a site before an account
 * that must have a second factor has one (NEXT_PUBLIC_SECOND_FACTOR_GATE=false
 * skips the gate). Every exit of a finished flow is built here.
 */
export function landingUrl(returnTo: string | null | undefined, origin: string): string {
  const destination = destinationUrl(returnTo, origin)
  return config.secondFactorGate ? gateUrl(destination, origin) : destination
}

type FlowLike = { return_to?: string; requested_aal?: string; refresh?: boolean } | null | undefined

export function flowContext(flow: FlowLike): FlowContext {
  const ctx: FlowContext = {}
  if (flow?.return_to) ctx.returnTo = flow.return_to
  if (flow?.requested_aal === 'aal2') ctx.aal = 'aal2'
  if (flow?.refresh) ctx.refresh = true
  return ctx
}

/** `url` with return_to set, unless it already carries one. */
export function withReturnTo(url: string, returnTo: string | null | undefined): string {
  if (!returnTo) return url
  try {
    const u = new URL(url)
    if (!u.searchParams.get('return_to')) u.searchParams.set('return_to', returnTo)
    return u.toString()
  } catch {
    return url
  }
}

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>

/** Remember a flow's context so a later 410 on load (no body) can restart it faithfully. */
export function rememberFlowContext(id: string, ctx: FlowContext, storage: KeyValueStore | null): void {
  try {
    storage?.setItem(`kratos:flowctx:${id}`, JSON.stringify(ctx))
  } catch {
    /* storage blocked: restarts fall back to URL params */
  }
}

export function recallFlowContext(id: string | null, storage: KeyValueStore | null): FlowContext {
  if (!id) return {}
  try {
    const raw = storage?.getItem(`kratos:flowctx:${id}`)
    if (!raw) return {}
    const v = JSON.parse(raw) as FlowContext
    return {
      ...(typeof v.returnTo === 'string' ? { returnTo: v.returnTo } : {}),
      ...(v.aal === 'aal2' ? { aal: 'aal2' as const } : {}),
      ...(v.refresh === true ? { refresh: true } : {}),
    }
  } catch {
    return {}
  }
}

const RESTART_WINDOW_MS = 60_000
const RESTART_MAX = 3

/**
 * Loop guard for automatic flow restarts (expired / CSRF / unknown flow):
 * at most 3 per flow kind per minute, then we stop and show an error.
 */
export function restartGuard(kind: FlowKind, storage: KeyValueStore | null, now: () => number = Date.now): boolean {
  const key = `kratos:restarts:${kind}`
  try {
    if (!storage) return true
    const t = now()
    const recent = (JSON.parse(storage.getItem(key) || '[]') as number[]).filter((x) => t - x < RESTART_WINDOW_MS)
    if (recent.length >= RESTART_MAX) return false
    storage.setItem(key, JSON.stringify([...recent, t]))
  } catch {
    /* no storage: allow */
  }
  return true
}

export interface ErrorNavOptions {
  kind: FlowKind
  /** Context of the current flow (flowContext(flow), else URL params / remembered). */
  ctx: FlowContext
  /** Where to come back to after a re-auth (settings: this page). Defaults to ctx.returnTo. */
  authReturnTo?: string
  origin: string
  kratosBase: string
  /** Loop guard for restarts; see restartGuard. */
  mayRestart: () => boolean
  /** Message for failures we cannot route (network, 5xx). */
  fallbackMessage: string
  now?: () => number
}

type KratosErrorBody = {
  error?: { id?: string; message?: string; details?: { redirect_to?: string } }
  redirect_browser_to?: string
  use_flow_id?: string
  ui?: unknown
  expires_at?: string
}

/** The central Kratos error → navigation table (docs/FLOWS.md § Errors). */
export function resolveKratosError(err: unknown, o: ErrorNavOptions): NavAction {
  const r = (err as { response?: { status?: number; data?: unknown } })?.response
  if (!r || !r.status) return { kind: 'error', message: o.fallbackMessage }
  const status = r.status
  const data = (r.data && typeof r.data === 'object' ? r.data : {}) as KratosErrorBody
  const id = data.error?.id
  const redirectTo = safeKratosRedirect(data.redirect_browser_to, o.origin, o.kratosBase)
  const authReturnTo = o.authReturnTo ?? o.ctx.returnTo

  const restart = (): NavAction => {
    if (!o.mayRestart()) {
      return { kind: 'error', message: 'This page keeps expiring. Reload it to start again.' }
    }
    const ctx = o.ctx
    return { kind: 'redirect', to: initFlowUrl(o.kind, ctx.returnTo, o.kind === 'login' ? { aal: ctx.aal, refresh: ctx.refresh } : undefined) }
  }

  switch (id) {
    case 'browser_location_change_required':
      if (redirectTo) return { kind: 'redirect', to: redirectTo }
      break
    case 'session_aal2_required':
      return {
        kind: 'redirect',
        to: withReturnTo(redirectTo ?? initFlowUrl('login', undefined, { aal: 'aal2' }), authReturnTo),
      }
    case 'session_refresh_required':
      return {
        kind: 'redirect',
        to: withReturnTo(redirectTo ?? initFlowUrl('login', undefined, { refresh: true }), authReturnTo),
      }
    case 'session_inactive':
    case 'session_aal1_required':
      return { kind: 'redirect', to: initFlowUrl('login', authReturnTo) }
    case 'self_service_flow_expired':
      // Kratos v1.3's replacement login flow drops requested_aal/refresh: for
      // a step-up or re-auth it is a plain aal1 flow that fails with "a valid
      // session was detected". Restart those from our context instead.
      if (o.kind === 'login' && (o.ctx.aal === 'aal2' || o.ctx.refresh)) return restart()
      if (data.use_flow_id && /^[0-9a-f-]{36}$/i.test(data.use_flow_id)) {
        return { kind: 'redirect', to: `${UI_PATH[o.kind]}?flow=${data.use_flow_id}` }
      }
      return restart()
    case 'security_csrf_violation':
    case 'security_identity_mismatch':
      return restart()
    case 'session_already_available':
      return { kind: 'redirect', to: landingUrl(o.ctx.returnTo, o.origin) }
  }

  if (status === 422 && redirectTo) return { kind: 'redirect', to: redirectTo }
  if (status === 401) return { kind: 'redirect', to: initFlowUrl('login', authReturnTo) }
  if (status === 410) return restart()
  if (status === 404 && (o.kind === 'login' || o.kind === 'registration' || o.kind === 'settings')) return restart()
  if (status === 403 && redirectTo) return { kind: 'redirect', to: redirectTo }
  if (status === 400 || status === 422) {
    if (!data.ui) return { kind: 'refetch' }
    // Kratos v1.3 answers a submit on an EXPIRED aal2 flow with 400 and the
    // same flow ("A valid session was detected…") instead of 410 — retrying
    // can never succeed, so restart it like a 410.
    const expiresAt = data.expires_at ? Date.parse(data.expires_at) : NaN
    if (expiresAt < (o.now ?? Date.now)()) return restart()
    return { kind: 'flow', flow: data }
  }
  return { kind: 'error', message: o.fallbackMessage }
}

/** A redirect to one of this UI's flow pages or to Kratos — part of a flow, not a destination. */
function isFlowHop(url: string, origin: string, kratosBase: string): boolean {
  try {
    const u = new URL(url)
    if (u.origin === new URL(kratosBase, origin).origin && u.pathname.startsWith('/self-service/')) return true
    return u.origin === origin && !isLoginLoop(url, origin)
  } catch {
    return false
  }
}

type ContinueAction = {
  action: string
  redirect_browser_to?: string
  flow?: { id: string; url?: string }
}

export interface ContinueOptions {
  origin: string
  kratosBase: string
  /** Where to land when Kratos returns a session without directives. */
  returnTo?: string
  /** Settings: an unverified address makes Kratos prepend show_verification_ui to every save. */
  skipVerification?: boolean
  /** Settings: a redirect back to this same settings flow is just a re-render. */
  currentSettingsFlowId?: string
  /** Settings tab hash to keep across a show_settings_ui hop. */
  hash?: string
}

/** Follow a Kratos `continue_with` chain from a successful update; null = nothing to do. */
export function resolveContinueWith(data: unknown, o: ContinueOptions): NavAction | null {
  const cw = (data as { continue_with?: ContinueAction[] })?.continue_with
  for (const c of Array.isArray(cw) ? cw : []) {
    switch (c.action) {
      case 'redirect_browser_to': {
        const to = safeKratosRedirect(c.redirect_browser_to, o.origin, o.kratosBase)
        if (!to) break
        // A flow without a valid return_to gets Kratos' default_browser_return_url
        // here — never follow that silently: land via /welcome instead. Hops
        // inside this UI (settings, verification…) and Kratos itself still go.
        if (!safeReturnTo(o.returnTo, o.origin) && !isFlowHop(to, o.origin, o.kratosBase)) {
          return { kind: 'redirect', to: landingUrl(null, o.origin) }
        }
        if (o.currentSettingsFlowId) {
          const u = new URL(to)
          if (u.origin === o.origin && u.pathname === UI_PATH.settings && u.searchParams.get('flow') === o.currentSettingsFlowId) {
            return { kind: 'refetch' }
          }
        }
        // Leaving this UI for a destination: through the gate, like every other landing.
        return { kind: 'redirect', to: isFlowHop(to, o.origin, o.kratosBase) ? to : landingUrl(to, o.origin) }
      }
      case 'show_verification_ui':
        if (c.flow?.id && !o.skipVerification) return { kind: 'redirect', to: `${UI_PATH.verification}?flow=${encodeURIComponent(c.flow.id)}` }
        break
      case 'show_recovery_ui':
        if (c.flow?.id) return { kind: 'redirect', to: `${UI_PATH.recovery}?flow=${encodeURIComponent(c.flow.id)}` }
        break
      case 'show_settings_ui':
        if (c.flow?.id) return { kind: 'redirect', to: `${UI_PATH.settings}?flow=${encodeURIComponent(c.flow.id)}${o.hash ?? ''}` }
        break
      // set_ory_session_token: API flows only, no navigation.
    }
  }
  if ((data as { session?: unknown })?.session) return { kind: 'redirect', to: landingUrl(o.returnTo, o.origin) }
  return null
}
