/**
 * Decision tree for /access (site-ux §11.2). The gateway sends every refused
 * browser on a 2FA site here with `?site=<name>&return_to=<url>` — Oathkeeper
 * can't say why, so the reason comes from jinbe (server-side, with the
 * visitor's session); any `reason` query param is ignored. Kratos then
 * decides step-up vs enrolment, and the gateway re-checks on return.
 */

export type AccessReason = 'needs_2fa' | 'forbidden'
export type JinbeReason = AccessReason | 'ok' | 'not_found'

/** jinbe's answer to "why was this visitor refused?" (see access-reason-server). */
export type AccessReasonResult =
  | { kind: 'reason'; reason: JinbeReason; minAal: 'aal1' | 'aal2' | null }
  | { kind: 'unauthenticated' }
  | { kind: 'unavailable' }

export interface AccessParams {
  returnTo: string | null
  site: string | null
}

export type SessionProbe =
  | { kind: 'none' }
  | { kind: 'aal2_required' }
  | { kind: 'session'; aal: string; email: string | null }
  | { kind: 'error' }

export type AccessStep = 'signin' | 'stepup' | 'check_factors' | 'forbidden' | 'error'

/** Groups that satisfy aal2 on a login flow. Passkey is a first factor. */
export const STEP_UP_GROUPS = ['totp', 'webauthn', 'lookup_secret', 'code'] as const
/** Groups a person can enrol in from settings to get a second factor. */
export const ENROL_GROUPS = ['totp', 'webauthn', 'lookup_secret'] as const

const SITE_NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export function parseAccessParams(sp: URLSearchParams, isAllowed: (url: string) => boolean): AccessParams {
  const rawReturn = sp.get('return_to') || ''
  let returnTo: string | null = null
  try {
    const u = new URL(rawReturn)
    if ((u.protocol === 'https:' || u.protocol === 'http:') && isAllowed(rawReturn)) returnTo = rawReturn
  } catch {
    returnTo = null
  }
  const site = sp.get('site') || ''
  return { returnTo, site: SITE_NAME.test(site) ? site : null }
}

export function classifySessionError(err: unknown): SessionProbe {
  const r = (err as { response?: { status?: number; data?: { error?: { id?: string } } } })?.response
  if (r?.status === 401) return { kind: 'none' }
  if (r?.status === 403 && r.data?.error?.id === 'session_aal2_required') return { kind: 'aal2_required' }
  return { kind: 'error' }
}

export function decideAccess(reason: AccessReason, probe: SessionProbe): AccessStep {
  if (probe.kind === 'none') return 'signin'
  if (probe.kind === 'error') return 'error'
  if (reason === 'forbidden') return 'forbidden'
  if (probe.kind === 'aal2_required') return 'stepup'
  // Already aal2 and still refused → not a 2FA problem.
  return probe.aal === 'aal2' ? 'forbidden' : 'check_factors'
}

type FlowLike = { ui?: { nodes?: Array<{ group?: string }> } } | null | undefined

export function flowGroups<T extends string>(flow: FlowLike, candidates: readonly T[]): T[] {
  const present = new Set((flow?.ui?.nodes ?? []).map((n) => n.group))
  return candidates.filter((g) => present.has(g))
}

export function signInUrl(returnTo: string | null): string {
  return returnTo ? `/login?return_to=${encodeURIComponent(returnTo)}` : '/login'
}

/** Sign out, then land on sign-in with the same destination. */
export function switchAccountUrl(origin: string, returnTo: string | null): string {
  return `/logout?return_to=${encodeURIComponent(origin + signInUrl(returnTo))}`
}

export type AccessOutcome =
  | { kind: 'redirect'; to: string }
  | { kind: 'forbidden'; email: string | null; alreadyAal2: boolean }
  /** methods null = settings probe failed; the settings page still lists what's on offer. */
  | { kind: 'enrol'; settingsUrl: string; methods: Array<(typeof ENROL_GROUPS)[number]> | null; email: string | null }
  | { kind: 'error' }
  /** jinbe couldn't say why (down, timeout, 5xx): neutral retry, never a blind step-up. */
  | { kind: 'unavailable' }

type FlowWithId = { id: string } & NonNullable<FlowLike>

export interface AccessDeps {
  /** Why the gateway refused — asked of jinbe server-side (/api/access-reason). */
  accessReason: () => Promise<AccessReasonResult>
  /** False when we already sent this visitor back to return_to moments ago (loop guard). */
  mayReturn: () => boolean
  /** Kratos whoami; throws the client error on 401/403. */
  toSession: () => Promise<{ aal: string; email: string | null }>
  /** Browser login flow with aal=aal2 (JSON), carrying return_to. */
  createLoginFlow: (returnTo: string | null) => Promise<FlowWithId>
  /** Browser settings flow (JSON) returning to `returnTo` after a successful save. */
  createSettingsFlow: (returnTo: string) => Promise<FlowWithId>
  /** Kratos browser init URL for an aal2 login flow. */
  stepUpUrl: (returnTo: string | null) => string
  /** This /access URL; enrolment returns here when there is no return_to. */
  selfUrl: string
}

export async function resolveAccess(params: AccessParams, deps: AccessDeps): Promise<AccessOutcome> {
  const whoami = async (): Promise<SessionProbe> => {
    try {
      return { kind: 'session', ...(await deps.toSession()) }
    } catch (e) {
      return classifySessionError(e)
    }
  }
  // Without both there is nothing to ask jinbe about (its 400 → forbidden).
  let answer: AccessReasonResult = { kind: 'reason', reason: 'forbidden', minAal: null }
  if (params.site && params.returnTo) {
    try {
      answer = await deps.accessReason()
    } catch {
      answer = { kind: 'unavailable' }
    }
  }
  if (answer.kind === 'unauthenticated') return { kind: 'redirect', to: signInUrl(params.returnTo) }
  if (answer.kind === 'unavailable') return { kind: 'unavailable' }
  if (answer.reason === 'ok') {
    return params.returnTo && deps.mayReturn() ? { kind: 'redirect', to: params.returnTo } : { kind: 'unavailable' }
  }
  if (answer.reason !== 'needs_2fa') {
    // jinbe evaluated the session already; whoami only supplies "signed in as".
    const probe = await whoami()
    return probe.kind === 'session'
      ? { kind: 'forbidden', email: probe.email, alreadyAal2: probe.aal === 'aal2' }
      : { kind: 'forbidden', email: null, alreadyAal2: false }
  }

  const probe = await whoami()
  const email = probe.kind === 'session' ? probe.email : null
  switch (decideAccess('needs_2fa', probe)) {
    case 'signin':
      return { kind: 'redirect', to: signInUrl(params.returnTo) }
    case 'stepup':
      return { kind: 'redirect', to: deps.stepUpUrl(params.returnTo) }
    case 'forbidden':
      return { kind: 'forbidden', email, alreadyAal2: probe.kind === 'session' && probe.aal === 'aal2' }
    case 'error':
      return { kind: 'error' }
  }
  // aal1 session: an aal2 login flow only offers second factors the identity
  // has, so an empty one means nothing is enrolled yet.
  try {
    const login = await deps.createLoginFlow(params.returnTo)
    if (flowGroups(login, STEP_UP_GROUPS).length > 0) return { kind: 'redirect', to: `/login?flow=${encodeURIComponent(login.id)}` }
  } catch {
    return { kind: 'error' }
  }
  // After enrolment go straight back to the site: Kratos upgrades the session
  // to aal2 on enrolment, so a detour via /access would misread it as
  // "refused at aal2". If the site still refuses, the gateway sends us back.
  const back = params.returnTo ?? deps.selfUrl
  try {
    const settings = await deps.createSettingsFlow(back)
    return { kind: 'enrol', settingsUrl: `/settings?flow=${encodeURIComponent(settings.id)}#mfa`, methods: flowGroups(settings, ENROL_GROUPS), email }
  } catch {
    return { kind: 'enrol', settingsUrl: `/settings?return_to=${encodeURIComponent(back)}#mfa`, methods: null, email }
  }
}

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>
const RETURN_WINDOW_MS = 30_000

/**
 * Loop guard for jinbe's `ok`: if we sent this visitor back to the same
 * return_to within the last 30 s and the gateway refused again, jinbe and
 * the gateway disagree — stop bouncing and show the retry page instead.
 */
export function returnGuard(returnTo: string, storage: KeyValueStore, now: () => number = Date.now): boolean {
  const key = `access-return:${returnTo}`
  try {
    const last = Number(storage.getItem(key) || 0)
    if (last && now() - last < RETURN_WINDOW_MS) return false
    storage.setItem(key, String(now()))
  } catch {
    // No storage (private mode): allow; the retry page is one refusal away.
  }
  return true
}
