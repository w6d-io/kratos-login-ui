/**
 * Decision tree for /access (site-ux §11.2). The gateway sends refused
 * browsers here with `?site=<name>&return_to=<url>&reason=needs_2fa|forbidden`.
 * Query params are display hints only: the real state comes from Kratos
 * (whoami + an aal2 login-flow probe), and the gateway re-checks on return.
 */

export type AccessReason = 'needs_2fa' | 'forbidden'

export interface AccessParams {
  reason: AccessReason
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
  const reason: AccessReason = sp.get('reason') === 'needs_2fa' ? 'needs_2fa' : 'forbidden'
  const rawReturn = sp.get('return_to') || ''
  let returnTo: string | null = null
  try {
    const u = new URL(rawReturn)
    if ((u.protocol === 'https:' || u.protocol === 'http:') && isAllowed(rawReturn)) returnTo = rawReturn
  } catch {
    returnTo = null
  }
  const site = sp.get('site') || ''
  return { reason, returnTo, site: SITE_NAME.test(site) ? site : null }
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

type FlowWithId = { id: string } & NonNullable<FlowLike>

export interface AccessDeps {
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
  let probe: SessionProbe
  try {
    probe = { kind: 'session', ...(await deps.toSession()) }
  } catch (e) {
    probe = classifySessionError(e)
  }
  const email = probe.kind === 'session' ? probe.email : null
  switch (decideAccess(params.reason, probe)) {
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
