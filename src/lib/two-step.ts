import type { SecondFactorResult } from './second-factor-server'

/**
 * The two-step gate (/two-step?return_to=<destination>): every finished
 * sign-in passes here (flow-nav landingUrl) before leaving this UI. An account
 * the platform says must have a second factor (jinbe: a member of a group in
 * the "require two-step sign-in" setting, default super_admins):
 *   - has none         → enrol here, then continue
 *   - has one, at aal1 → step up (aal2 login flow returning here), then continue
 *   - at aal2          → continue
 * Everyone else continues at once. When jinbe can't answer, the first pass
 * for a destination continues: an OPA/Kratos outage must not block sign-in,
 * and jinbe and the gateway refuse server-side anyway. But a second blind
 * pass for the same destination within minutes means that destination keeps
 * sending the person back (a required account without a second factor, with
 * jinbe unreachable or unconfigured) — continuing again would loop, so the
 * gate says it couldn't check instead (`unchecked`).
 */

export type GateOutcome =
  | { kind: 'continue'; to: string }
  | { kind: 'stepup'; to: string }
  | { kind: 'signin'; to: string }
  | { kind: 'enrol' }
  /** Stepped up and still at aal1 moments ago: stop bouncing, offer a retry. */
  | { kind: 'stuck' }
  /** jinbe couldn't answer, and this destination was already passed through unchecked moments ago. */
  | { kind: 'unchecked' }

export interface GateDeps {
  /** /api/second-factor */
  status: () => Promise<SecondFactorResult>
  /** Where to go once done (already validated: flow-nav destinationUrl). */
  destination: string
  /** Kratos init URL of an aal2 login flow returning to `returnTo`. */
  stepUpUrl: (returnTo: string) => string
  /** This gate, so a step-up or sign-in comes back here. */
  selfUrl: string
  /** Loop guard for automatic step-ups (see stepUpGuard). */
  mayStepUp: () => boolean
  /** Loop guard for continuing without an answer (see blindPassGuard). */
  mayContinueUnchecked: () => boolean
}

export async function resolveGate(d: GateDeps): Promise<GateOutcome> {
  let s: SecondFactorResult
  try {
    s = await d.status()
  } catch {
    s = { kind: 'unavailable' }
  }
  if (s.kind === 'unauthenticated') return { kind: 'signin', to: `/login?return_to=${encodeURIComponent(d.destination)}` }
  if (s.kind === 'unavailable') return d.mayContinueUnchecked() ? { kind: 'continue', to: d.destination } : { kind: 'unchecked' }
  if (!s.required || s.aal === 'aal2') return { kind: 'continue', to: d.destination }
  if (!s.enrolled) return { kind: 'enrol' }
  return d.mayStepUp() ? { kind: 'stepup', to: d.stepUpUrl(d.selfUrl) } : { kind: 'stuck' }
}

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>
const STEP_UP_WINDOW_MS = 60_000
const STEP_UP_MAX = 2

/** At most 2 automatic step-ups a minute: a third means the level is not sticking. */
export function stepUpGuard(storage: KeyValueStore | null, now: () => number = Date.now): boolean {
  const key = 'two-step:stepups'
  try {
    if (!storage) return true
    const t = now()
    const recent = (JSON.parse(storage.getItem(key) || '[]') as number[]).filter((x) => t - x < STEP_UP_WINDOW_MS)
    if (recent.length >= STEP_UP_MAX) return false
    storage.setItem(key, JSON.stringify([...recent, t]))
  } catch {
    /* no storage: allow */
  }
  return true
}

const BLIND_WINDOW_MS = 5 * 60_000

/**
 * One unchecked pass per destination every five minutes. Recorded when it is granted, so the
 * refused destination → sign-in → gate round trip finds it and stops. Without storage: allow
 * (private mode loses the guard, never the sign-in).
 */
export function blindPassGuard(destination: string, storage: KeyValueStore | null, now: () => number = Date.now): boolean {
  const key = `two-step:unchecked:${destination}`
  try {
    if (!storage) return true
    const last = Number(storage.getItem(key) || 0)
    if (last && now() - last < BLIND_WINDOW_MS) return false
    storage.setItem(key, String(now()))
  } catch {
    /* no storage: allow */
  }
  return true
}
