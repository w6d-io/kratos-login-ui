/**
 * Sign-in protection as login-ui sees it: which flows show the bot check (and with which public site
 * key), and whether people may sign up. Read from jinbe's `GET /api/public/sign-in-protection`
 * through /api/sign-in-protection.
 *
 * None of this is the enforcement. The gateway (jinbe, before Kratos) refuses a submit that would
 * email a code or link without a good token, jinbe's interrupting Kratos web_hook refuses a sign-up
 * or sign-in without one, and a sign-up the policy does not allow, whatever this page shows — so when
 * the settings cannot be read, the page draws the plain forms and lets the server answer.
 */

export const BOT_CHECK_FLOWS = ['registration', 'login', 'recovery', 'verification'] as const
export type BotCheckFlow = (typeof BOT_CHECK_FLOWS)[number]
export type BotCheckProvider = 'turnstile' | 'hcaptcha' | 'recaptcha'

export interface SignInProtection {
  captcha: {
    provider: BotCheckProvider
    siteKey: string
    scriptUrl: string
    flows: Record<BotCheckFlow, boolean>
  } | null
  registration: { mode: 'open' | 'allowlist' | 'closed'; domains: string[] }
  /**
   * Identity traits only an administrator sets (jinbe PROTECTED_TRAITS): the gateway forwards them to
   * apps as trusted headers. Never a sign-up field; kept but not shown on the profile. jinbe's guard
   * hook refuses them whatever the form sends — this only keeps the form honest.
   */
  protectedTraits: string[]
}

/** jinbe's default PROTECTED_TRAITS, used while its answer is unknown. */
export const DEFAULT_PROTECTED_TRAITS = ['person_uuid', 'applicant_uuid']

/** What the page assumes when jinbe cannot say: nothing to draw, the server still decides. */
export const UNKNOWN_PROTECTION: SignInProtection = { captcha: null, registration: { mode: 'open', domains: [] }, protectedTraits: DEFAULT_PROTECTED_TRAITS }

/** Kratos message ids jinbe's guard answers with (jinbe src/sign-in-protection/guard.ts). */
export const GUARD_MESSAGE_IDS = {
  captchaMissing: 4000901,
  captchaInvalid: 4000902,
  captchaUnavailable: 4000903,
  registrationClosed: 4000911,
  registrationNotAllowed: 4000912,
  registrationDisposable: 4000913,
  protectedTrait: 4000915,
  protectedTraitsUnchecked: 4000916,
} as const

const PROVIDER_SCRIPT_HOSTS: Record<BotCheckProvider, string> = {
  turnstile: 'challenges.cloudflare.com',
  hcaptcha: 'js.hcaptcha.com',
  recaptcha: 'www.google.com',
}

const TRAIT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

/**
 * jinbe's answer as a clean value, or the unknown one. The widget script is only ever loaded from its
 * provider's own host over https, whatever the answer says. Idempotent: the browser parses again what
 * /api/sign-in-protection already parsed (which drops jinbe's `configured`, so only `false` counts).
 */
export function parseSignInProtection(body: unknown): SignInProtection {
  if (!body || typeof body !== 'object') return UNKNOWN_PROTECTION
  const b = body as { captcha?: Record<string, unknown>; registration?: Record<string, unknown>; protectedTraits?: unknown }
  const r = b.registration ?? {}
  const mode = r.mode === 'allowlist' || r.mode === 'closed' ? r.mode : 'open'
  const domains = mode === 'allowlist' && Array.isArray(r.domains) ? r.domains.filter((d): d is string => typeof d === 'string' && DOMAIN.test(d)).slice(0, 20) : []

  let captcha: SignInProtection['captcha'] = null
  const c = b.captcha
  const provider = c?.provider as BotCheckProvider
  if (c && c.configured !== false && typeof c.siteKey === 'string' && /^[\w.-]{1,200}$/.test(c.siteKey) && provider in PROVIDER_SCRIPT_HOSTS) {
    let scriptUrl = ''
    try {
      const u = new URL(String(c.scriptUrl))
      if (u.protocol === 'https:' && u.host === PROVIDER_SCRIPT_HOSTS[provider]) scriptUrl = u.toString()
    } catch { /* not a URL */ }
    const flowsIn = (c.flows ?? {}) as Record<string, unknown>
    const flows = Object.fromEntries(BOT_CHECK_FLOWS.map((f) => [f, flowsIn[f] === true])) as Record<BotCheckFlow, boolean>
    if (scriptUrl) captcha = { provider, siteKey: c.siteKey, scriptUrl, flows }
  }
  const protectedTraits = Array.isArray(b.protectedTraits)
    ? b.protectedTraits.filter((t): t is string => typeof t === 'string' && TRAIT_NAME.test(t)).slice(0, 50)
    : DEFAULT_PROTECTED_TRAITS
  return { captcha, registration: { mode, domains }, protectedTraits }
}

/** `traits.person_uuid` (or a field under it) is one of the protected traits. */
export function isProtectedTrait(field: string, protectedTraits: readonly string[]): boolean {
  if (!field.startsWith('traits.')) return false
  return protectedTraits.includes(field.slice('traits.'.length).split('.')[0])
}

/** The bot check to draw on this flow's page, or null. */
export function botCheckFor(p: SignInProtection, flow: BotCheckFlow): NonNullable<SignInProtection['captcha']> | null {
  return p.captcha?.flows[flow] ? p.captcha : null
}

/** "Sign-ups are limited to @corp.io and @lab.io addresses." — or null when sign-up is open. */
export function signUpLimitText(p: SignInProtection): string | null {
  if (p.registration.mode === 'closed') return 'Sign-ups are closed. Ask an administrator to create your account.'
  if (p.registration.mode !== 'allowlist') return null
  const d = p.registration.domains
  if (!d.length) return 'Sign-ups are limited to invited addresses. Ask an administrator for an account.'
  const list = d.length === 1 ? `@${d[0]}` : `${d.slice(0, -1).map((x) => `@${x}`).join(', ')} and @${d[d.length - 1]}`
  return `Sign-ups are limited to ${list} addresses.`
}

/**
 * Every submit of a flow that asks for the bot check goes through the gateway first: the gateway
 * hands POST /self-service/* to jinbe, which wants this header's token before Kratos acts. A token
 * verified once becomes a pass for that Kratos flow and address (one email under it), so the page
 * keeps it across the flow's steps (useBotCheck). Same-origin requests, so a custom header needs no
 * CORS allowance. Login and sign-up keep the token in transient_payload too, for Kratos' after-hook.
 */
export const CAPTCHA_TOKEN_HEADER = 'X-Captcha-Token'

/** Request options (axios) carrying the token, or undefined when there is none. */
export function captchaHeaders(token: string | null | undefined): { headers: Record<string, string> } | undefined {
  if (!token) return undefined
  // Provider tokens are URL-safe; anything else cannot be a header value anyway.
  const safe = token.replace(/[^A-Za-z0-9_.:-]/g, '')
  return safe ? { headers: { [CAPTCHA_TOKEN_HEADER]: safe } } : undefined
}

export type GateRefusalId =
  | 'captcha_missing'
  | 'captcha_invalid'
  | 'captcha_unavailable'
  | 'rate_limited'
  | 'registration_closed'
  | 'registration_not_allowed'
  | 'registration_disposable'
  | 'settings_unavailable'

export interface GateRefusal {
  id: GateRefusalId
  message: string
  /** Seconds to wait (rate_limited). */
  retryAfter?: number
}

const GATE_TEXT: Record<GateRefusalId, string> = {
  captcha_missing: 'Please complete the bot check, then try again.',
  captcha_invalid: 'The bot check did not pass or has expired. Please complete it again.',
  captcha_unavailable: 'The bot check is unavailable right now. Please try again in a minute.',
  rate_limited: 'Too many codes were requested. Please wait a few minutes and try again.',
  registration_closed: 'Sign-ups are closed. Ask an administrator to create your account.',
  registration_not_allowed: 'Sign-ups are limited to invited addresses. Ask an administrator for an account.',
  registration_disposable: 'This email provider cannot be used to sign up. Use your work or personal address.',
  settings_unavailable: 'Sign-up is unavailable right now. Please try again in a minute.',
}

/** The status each refusal comes with: a Kratos error reusing an id under another status is not ours. */
const GATE_STATUS: Record<GateRefusalId, number> = {
  captcha_missing: 403,
  captcha_invalid: 403,
  captcha_unavailable: 403,
  rate_limited: 429,
  registration_closed: 403,
  registration_not_allowed: 403,
  registration_disposable: 403,
  settings_unavailable: 503,
}

/**
 * The gateway's own refusal — 403 bot check or a code sign-up the registration policy forbids (checked
 * before Kratos emails the code), 429 too many codes, 503 sign-up settings unreadable. Not a Kratos
 * flow, so it carries no `ui`. null for anything else. `status` guards against a Kratos error that
 * happens to reuse an id. Only the captcha_* ones refused the token itself (isTokenRefusal).
 */
export function gateRefusal(body: unknown, status?: number): GateRefusal | null {
  const e = (body as { error?: Record<string, unknown> } | null)?.error
  if (!e || typeof e !== 'object') return null
  const id = e.id as GateRefusalId
  if (!Object.hasOwn(GATE_TEXT, id)) return null
  if (status !== undefined && status !== GATE_STATUS[id]) return null
  const message = typeof e.message === 'string' && e.message.trim() && e.message.length <= 300 ? e.message : GATE_TEXT[id]
  const retry = Number(e.retry_after)
  return id === 'rate_limited' && Number.isFinite(retry) && retry > 0 ? { id, message, retryAfter: Math.ceil(retry) } : { id, message }
}

/** A Kratos error body (or flow) carrying one of the guard's bot-check refusals: time for a fresh token. */
export function isBotCheckRefusal(flowOrBody: unknown): boolean {
  const ui = (flowOrBody as { ui?: { messages?: Array<{ id?: number }> } } | null)?.ui
  return (ui?.messages ?? []).some((m) => m.id === GUARD_MESSAGE_IDS.captchaMissing || m.id === GUARD_MESSAGE_IDS.captchaInvalid || m.id === GUARD_MESSAGE_IDS.captchaUnavailable)
}

/**
 * A failed submit that refused the bot-check TOKEN — the gateway's captcha_* answer, or the Kratos
 * hook's bot-check message in the returned flow: the page asks the widget for a new one. Any other
 * failure (a wrong password or code, a policy refusal) keeps the token for the next try.
 */
export function isTokenRefusal(err: unknown): boolean {
  const r = (err as { response?: { status?: number; data?: unknown } } | null)?.response
  if (!r) return false
  const gate = gateRefusal(r.data, r.status)
  if (gate) return gate.id.startsWith('captcha_')
  return isBotCheckRefusal(r.data)
}

/**
 * A profile save that changes the email: Kratos emails the new address a verification code, so the
 * gateway judges that save under the verification check. Any other save passes without a token.
 */
export function isEmailChange(current: string | null | undefined, edited: string | null | undefined): boolean {
  const e = (edited ?? '').trim().toLowerCase()
  return !!e && e !== (current ?? '').trim().toLowerCase()
}
