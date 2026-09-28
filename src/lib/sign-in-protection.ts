/**
 * Sign-in protection as login-ui sees it: which flows show the bot check (and with which public site
 * key), and whether people may sign up. Read from jinbe's `GET /api/public/sign-in-protection`
 * through /api/sign-in-protection.
 *
 * None of this is the enforcement. jinbe's interrupting Kratos web_hook refuses a sign-up or sign-in
 * without a good token, and a sign-up the policy does not allow, whatever this page shows — so when
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
}

/** What the page assumes when jinbe cannot say: nothing to draw, the server still decides. */
export const UNKNOWN_PROTECTION: SignInProtection = { captcha: null, registration: { mode: 'open', domains: [] } }

/** Kratos message ids jinbe's guard answers with (jinbe src/sign-in-protection/guard.ts). */
export const GUARD_MESSAGE_IDS = {
  captchaMissing: 4000901,
  captchaInvalid: 4000902,
  captchaUnavailable: 4000903,
  registrationClosed: 4000911,
  registrationNotAllowed: 4000912,
  registrationDisposable: 4000913,
} as const

const PROVIDER_SCRIPT_HOSTS: Record<BotCheckProvider, string> = {
  turnstile: 'challenges.cloudflare.com',
  hcaptcha: 'js.hcaptcha.com',
  recaptcha: 'www.google.com',
}

const DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

/**
 * jinbe's answer as a clean value, or the unknown one. The widget script is only ever loaded from its
 * provider's own host over https, whatever the answer says. Idempotent: the browser parses again what
 * /api/sign-in-protection already parsed (which drops jinbe's `configured`, so only `false` counts).
 */
export function parseSignInProtection(body: unknown): SignInProtection {
  if (!body || typeof body !== 'object') return UNKNOWN_PROTECTION
  const b = body as { captcha?: Record<string, unknown>; registration?: Record<string, unknown> }
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
  return { captcha, registration: { mode, domains } }
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
 * Recovery and verification cannot be interrupted by a Kratos hook, so their token travels in a
 * cookie the gateway reads (Oathkeeper redacts cookies from its logs, never custom headers). Scoped
 * to Kratos' self-service paths and short-lived; the gateway spends it through jinbe.
 */
export const GATEWAY_TOKEN_COOKIE = 'stl_kcap'

export function gatewayTokenCookie(token: string, secure: boolean): string {
  const safe = token.replace(/[^A-Za-z0-9_.-]/g, '')
  return `${GATEWAY_TOKEN_COOKIE}=${safe}; Path=/self-service; Max-Age=600; SameSite=Strict${secure ? '; Secure' : ''}`
}

/** A Kratos error body (or flow) carrying one of the guard's bot-check refusals: time for a fresh token. */
export function isBotCheckRefusal(flowOrBody: unknown): boolean {
  const ui = (flowOrBody as { ui?: { messages?: Array<{ id?: number }> } } | null)?.ui
  return (ui?.messages ?? []).some((m) => m.id === GUARD_MESSAGE_IDS.captchaMissing || m.id === GUARD_MESSAGE_IDS.captchaInvalid || m.id === GUARD_MESSAGE_IDS.captchaUnavailable)
}
