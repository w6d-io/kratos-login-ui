/**
 * Refreshing the second factor behind an AI assistant's credential (/oauth2/step-up?req=<id>): when
 * a protected action needs a fresh proof, the assistant hands its person a single-use link; they
 * confirm a second factor here and that sign-in (or personal key) may do protected actions again for
 * the admin's window. The shapes the browser sees and the pure rules; jinbe decides and re-checks.
 */

/** jinbe's step-up request ids. Anything else is refused unread. */
const REQ = /^[A-Za-z0-9_-]{16,64}$/

export function validReq(raw: string | null | undefined): string | null {
  return raw && REQ.test(raw) ? raw : null
}

/** The proof must be this fresh when the person confirms: a factor entered just now. jinbe holds the same line. */
export const STEP_UP_FRESH_MS = 2 * 60_000

/** True when the second factor was proven within `STEP_UP_FRESH_MS` of `now`. */
export function factorIsFresh(secondFactorAt: string | null, now: number = Date.now()): boolean {
  if (!secondFactorAt) return false
  const t = new Date(secondFactorAt).getTime()
  // A clock a little behind Kratos' must not read a proof from "the future" as fresh forever.
  return Number.isFinite(t) && now - t <= STEP_UP_FRESH_MS && t - now <= 60_000
}

/** Why jinbe won't refresh this credential. Anything unknown reads as `unknown`. */
export const STEP_UP_REFUSALS = [
  'wrong_account',
  'protected_actions_off',
  'protected_actions_not_allowed',
  'credential_gone',
  'mcp_disabled',
  'unknown',
] as const
export type StepUpRefusal = (typeof STEP_UP_REFUSALS)[number]

export function stepUpRefusal(raw: unknown): StepUpRefusal {
  return typeof raw === 'string' && (STEP_UP_REFUSALS as readonly string[]).includes(raw) ? (raw as StepUpRefusal) : 'unknown'
}

export interface StepUpView {
  /** A browser sign-in or a personal key. */
  kind: 'oauth' | 'personal'
  /** The app's registered name (unverified) or the key's label. */
  name: string
  /** The account confirming, from the Kratos session. */
  account: string | null
  /** How long protected actions work after confirming; null when jinbe did not say. */
  hours: number | null
}

type Common =
  /** Kratos' aal2 refresh login, coming back to this link. */
  | { kind: 'refresh'; to: string }
  | { kind: 'refused'; reason: StepUpRefusal }
  | { kind: 'unauthenticated' }
  /** Unknown, used or expired link: ask the assistant for a new one. */
  | { kind: 'expired' }
  | { kind: 'unavailable' }

export type StepUpLoad = { kind: 'show'; view: StepUpView } | Common
export type StepUpSubmit = { kind: 'done'; name: string | null; until: string | null } | Common
