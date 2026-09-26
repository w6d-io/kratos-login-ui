/**
 * Small per-browser conveniences kept in localStorage: the sign-in method used last (so the login
 * screen can point at it) and resend cooldowns that survive a reload. Storage can be missing or
 * throw (private mode, blocked site data) — every access is guarded and falls back to "nothing
 * remembered". Nothing here is a security decision.
 */

export type SignInMethod = 'password' | 'code' | 'passkey' | 'security_key' | `oidc:${string}`

const LAST_METHOD_KEY = 'auth:last-method'
const METHOD = /^(password|code|passkey|security_key|oidc:[a-z0-9_-]{1,40})$/

function store(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function rememberMethod(method: SignInMethod): void {
  try {
    store()?.setItem(LAST_METHOD_KEY, method)
  } catch {
    /* storage full or blocked */
  }
}

export function lastMethod(): SignInMethod | null {
  try {
    const v = store()?.getItem(LAST_METHOD_KEY) ?? null
    return v && METHOD.test(v) ? (v as SignInMethod) : null
  } catch {
    return null
  }
}

/** Whole seconds left until `until` (epoch ms), never negative. */
export function secondsLeft(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000))
}

/** "0:42" — how the resend countdown reads. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const COOLDOWN_PREFIX = 'auth:cooldown:'

export function cooldownUntil(key: string): number {
  try {
    const n = Number(store()?.getItem(COOLDOWN_PREFIX + key))
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

export function setCooldownUntil(key: string, until: number): void {
  try {
    store()?.setItem(COOLDOWN_PREFIX + key, String(until))
  } catch {
    /* ignore */
  }
}
