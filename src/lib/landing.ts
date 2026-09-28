import type { MySite, MySitesResult } from './sites-server'

/**
 * Where a finished flow goes when it has no valid return_to (LAND-1). Never
 * Kratos' default_browser_return_url: `/welcome` resolves, in order,
 *   0. the page this tab's sign-in started for, when a hop lost its return_to
 *      (a fresh flow from a link without it) — that exact URL, no picker,
 *   1. the site the visitor came from → its `defaultReturnUrl` (jinbe by-host),
 *   2. the sites the visitor can reach (jinbe /sites/mine): exactly one →
 *      go there, several → "Where to?" picker (last choice first), none →
 *      empty state, jinbe down → neutral retry.
 * Every URL is re-checked against the return-URL allow-list server-side.
 */

export type WelcomeOutcome =
  | { kind: 'redirect'; to: string }
  | { kind: 'signin'; to: string }
  | { kind: 'choose'; sites: MySite[]; lastUsed: string | null }
  | { kind: 'empty' }
  | { kind: 'unavailable' }

export interface WelcomeDeps {
  /** The destination this tab's sign-in started with, when a later hop lost it (see recallDestination). */
  rememberedDestination: () => string | null
  /** Hosts the flow may have started from (remembered referrer, this UI's host). */
  originHosts: string[]
  /** Site landing URL for a host (/api/landing), null when none. */
  landingFor: (host: string) => Promise<string | null>
  /** /api/sites/mine */
  mySites: () => Promise<MySitesResult>
  /** Name of the site picked last time, if any. */
  lastChoice: () => string | null
  /** Loop guard for automatic redirects (see access.ts returnGuard). */
  mayAutoRedirect: (url: string) => boolean
  /** This page, so signing in comes back here. */
  selfUrl: string
}

export async function resolveWelcome(d: WelcomeDeps): Promise<WelcomeOutcome> {
  const remembered = d.rememberedDestination()
  if (remembered && d.mayAutoRedirect(remembered)) return { kind: 'redirect', to: remembered }
  for (const host of d.originHosts) {
    let url: string | null = null
    try {
      url = await d.landingFor(host)
    } catch {
      url = null
    }
    if (url && d.mayAutoRedirect(url)) return { kind: 'redirect', to: url }
  }
  let r: MySitesResult
  try {
    r = await d.mySites()
  } catch {
    return { kind: 'unavailable' }
  }
  if (r.kind === 'unauthenticated') return { kind: 'signin', to: `/login?return_to=${encodeURIComponent(d.selfUrl)}` }
  if (r.kind === 'unavailable') return { kind: 'unavailable' }
  if (r.sites.length === 0) return { kind: 'empty' }
  if (r.sites.length === 1 && d.mayAutoRedirect(r.sites[0].url)) return { kind: 'redirect', to: r.sites[0].url }
  const last = d.lastChoice()
  const lastUsed = last && r.sites.some((s) => s.name === last) ? last : null
  // Last choice first; otherwise jinbe's order (sorted by displayName).
  const sites = lastUsed ? [...r.sites.filter((s) => s.name === lastUsed), ...r.sites.filter((s) => s.name !== lastUsed)] : r.sites
  return { kind: 'choose', sites, lastUsed }
}

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>

const ORIGIN_KEY = 'kratos:origin-host'
const LAST_SITE_KEY = 'kratos:last-site'
const DESTINATION_KEY = 'kratos:destination'
const DESTINATION_TTL_MS = 30 * 60_000

/**
 * Remember the destination a sign-in started with (a flow page's valid return_to, already
 * checked by flow-nav destinationUrl), so /welcome can still land there if a later hop drops it.
 * Tab-scoped (sessionStorage), 30 minutes, forgotten once reached, used, or on sign-out.
 */
export function rememberDestination(url: string, storage: KeyValueStore | null, now: () => number = Date.now): void {
  try {
    storage?.setItem(DESTINATION_KEY, JSON.stringify({ url, at: now() }))
  } catch {
    /* private mode: /welcome falls back to the site landing or picker */
  }
}

export function recallDestination(storage: KeyValueStore | null, now: () => number = Date.now): string | null {
  try {
    const v = JSON.parse(storage?.getItem(DESTINATION_KEY) || 'null') as { url?: unknown; at?: unknown } | null
    if (!v || typeof v.url !== 'string' || typeof v.at !== 'number') return null
    return now() - v.at < DESTINATION_TTL_MS ? v.url : null
  } catch {
    return null
  }
}

export function forgetDestination(storage: KeyValueStore | null): void {
  try {
    storage?.setItem(DESTINATION_KEY, '')
  } catch {
    /* nothing remembered */
  }
}

/**
 * Remember the site a flow started from: the referrer of a flow page, when
 * it is an allowed return URL on another host than this UI or Kratos
 * (redirect chains keep the original Referer).
 */
export function rememberOriginHost(
  referrer: string,
  ownOrigin: string,
  kratosBase: string,
  isAllowed: (url: string) => boolean,
  storage: KeyValueStore | null,
): void {
  try {
    if (!referrer || !storage) return
    const u = new URL(referrer)
    if (u.origin === ownOrigin || u.origin === new URL(kratosBase, ownOrigin).origin) return
    if (!isAllowed(u.toString())) return
    storage.setItem(ORIGIN_KEY, u.hostname.toLowerCase())
  } catch {
    /* unparsable referrer or blocked storage */
  }
}

/** Candidate origin hosts, most specific first, deduplicated. */
export function originHosts(ownHost: string, storage: KeyValueStore | null): string[] {
  let remembered: string | null = null
  try {
    remembered = storage?.getItem(ORIGIN_KEY) ?? null
  } catch {
    remembered = null
  }
  return [...new Set([remembered, ownHost.toLowerCase().replace(/:\d+$/, '')].filter((h): h is string => !!h))]
}

export function lastSiteChoice(storage: KeyValueStore | null): string | null {
  try {
    return storage?.getItem(LAST_SITE_KEY) ?? null
  } catch {
    return null
  }
}

export function rememberSiteChoice(name: string, storage: KeyValueStore | null): void {
  try {
    storage?.setItem(LAST_SITE_KEY, name)
  } catch {
    /* private mode: nothing remembered */
  }
}
