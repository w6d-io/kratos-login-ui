/**
 * OAuth2 sign-in for MCP clients (Hydra login/consent, answered by jinbe): the shapes the
 * browser sees and the pure rules shared by the /oauth2/* route handlers and pages.
 * Nothing here is secret: the challenge is Hydra's, single-use and bound to Hydra's own
 * CSRF cookie; every decision is re-checked by jinbe on submit.
 */

/** Hydra login/consent challenges: opaque URL-safe tokens. Anything else is refused unread. */
const CHALLENGE = /^[A-Za-z0-9._~=-]{1,4096}$/

export function validChallenge(raw: string | null | undefined): string | null {
  return raw && CHALLENGE.test(raw) ? raw : null
}

/** Why a sign-in was refused, as jinbe says it. Anything unknown reads as `unknown`. */
export const REFUSAL_REASONS = [
  'mcp_disabled',
  'oauth_disabled',
  'group_not_allowed',
  'client_bound_elsewhere',
  'not_mcp_client',
  'pkce_required',
  'invalid_target',
  'wrong_account',
  'unknown',
] as const
export type RefusalReason = (typeof REFUSAL_REASONS)[number]

/** jinbe says `mcp_group_not_allowed` in some places, `group_not_allowed` in others. */
export function refusalReason(raw: unknown): RefusalReason {
  const r = typeof raw === 'string' ? raw.replace(/^mcp_(?=group_not_allowed$)/, '') : ''
  return (REFUSAL_REASONS as readonly string[]).includes(r) ? (r as RefusalReason) : 'unknown'
}

/** What /oauth2/refused can say: a refusal, or the request ended, or we could not ask. */
export type RefusedKind = RefusalReason | 'expired' | 'unavailable'

export function isRefusedKind(v: unknown): v is RefusedKind {
  return typeof v === 'string' && (v === 'expired' || v === 'unavailable' || (REFUSAL_REASONS as readonly string[]).includes(v))
}

/** One permission the app may be given, and the resource it belongs to (`sites`, `users`). */
export interface ConsentScope {
  scope: string
  group: string
  /** jinbe's readable name for it, when it has one. */
  label?: string
  /** Publishing, changing an email, changing groups: needs a recent second factor. */
  protected?: boolean
}

/** What the consent page shows: built server-side from jinbe's answer, never from the URL. */
export interface ConsentView {
  client: {
    /** The name the app registered with. Not verified: anyone can register any name. */
    name: string
    /** Where the browser is sent back to, `localhost:53682`. */
    redirectHost: string | null
    registeredAt: string | null
  }
  /** The account it will act as. */
  account: string | null
  /** Requested ∩ held: the only permissions the person may tick. */
  catalog: ConsentScope[]
  protectedActions: {
    offered: boolean
    /** When the consent-time second factor stops standing in for protected actions. */
    until: string | null
    hours: number
  }
  /** When the sign-in ends at the latest (the admin's maximum, ≤ 30 days). */
  signedInUntil: string | null
}

export type ConsentLoad =
  | { kind: 'consent'; view: ConsentView }
  | { kind: 'refused'; reason: RefusalReason }
  | { kind: 'unauthenticated' }
  /** The challenge is unknown, used or expired: start again from the app. */
  | { kind: 'expired' }
  | { kind: 'unavailable' }

export type ConsentSubmit =
  | { kind: 'redirect'; to: string }
  | { kind: 'refused'; reason: RefusalReason }
  | { kind: 'unauthenticated' }
  | { kind: 'expired' }
  | { kind: 'unavailable' }

export interface ConsentDecision {
  decision: 'allow' | 'deny'
  mode: 'all' | 'chosen'
  scopes: string[]
  protectedActions: boolean
}

/** The owner's window (D1): protected actions work this long after the consent-time second factor. */
export const PROTECTED_ACTIONS_HOURS_DEFAULT = 12

/** Scopes every MCP sign-in carries that are not permissions: never listed, never ticked. */
export const TECHNICAL_SCOPES: readonly string[] = ['mcp', 'offline_access', 'openid']

const GROUP_LABELS: Record<string, string> = {
  admin: 'Administration',
  audit: 'Audit trail',
  users: 'Users',
  sessions: 'Sessions',
  org: 'Organizations',
}

/** A readable name for a permission's resource: known ones named, the rest capitalized (as in kuma). */
export function scopeGroupLabel(group: string): string {
  return GROUP_LABELS[group] ?? (group ? group[0].toUpperCase() + group.slice(1) : 'Other')
}

const READ_VERBS = /:(read|list|get|view)$/

/** What a permission lets the app do, in two words: reading, or changing things. */
export function scopeHint(scope: string): 'Read only' | 'Can change data' {
  return READ_VERBS.test(scope) ? 'Read only' : 'Can change data'
}

/** The catalog by resource, groups by label, reads before the rest inside a group. */
export function groupScopes(entries: readonly ConsentScope[]): Array<{ group: string; label: string; scopes: string[] }> {
  const by = new Map<string, string[]>()
  for (const { scope, group } of entries) by.set(group, [...(by.get(group) ?? []), scope])
  const res = (s: string) => s.slice(0, s.lastIndexOf(':'))
  return [...by.entries()]
    .map(([group, scopes]) => ({
      group,
      label: scopeGroupLabel(group),
      scopes: [...scopes].sort((a, b) => res(a).localeCompare(res(b)) || Number(!READ_VERBS.test(a)) - Number(!READ_VERBS.test(b)) || a.localeCompare(b)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** A relative path on this UI (`/login?…`), never `//host` or `/\host`. */
export function isLocalPath(to: string): boolean {
  return to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/\\')
}

function originOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null
  } catch {
    return null
  }
}

export interface RedirectOrigins {
  /** This UI, as the browser sees it. */
  self: string | null
  /** Hydra's public URL (its issuer): where accepted and refused requests continue. */
  hydra: string | null
  /** Kratos' browser URL when it is not this UI (step-up flows). */
  kratos: string | null
}

/**
 * Where jinbe may send the browser from the /oauth2/* pages: this UI (a path or its origin),
 * Hydra, or Kratos. Nothing else — above all never the app's own redirect URI directly, which
 * only Hydra may send the browser to after checking it. Returns what to put in Location, or null.
 */
export function allowedRedirect(to: unknown, origins: RedirectOrigins): string | null {
  if (typeof to !== 'string' || !to || to.length > 8192) return null
  if (isLocalPath(to)) return to
  let u: URL
  try {
    u = new URL(to)
  } catch {
    return null
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null
  const allowed = [origins.self, originOf(origins.hydra), originOf(origins.kratos)].filter((o): o is string => !!o)
  return allowed.includes(u.origin) ? u.toString() : null
}
