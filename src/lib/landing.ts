import type { MySite, MySitesResult } from './sites-server'

/**
 * Where a finished flow goes when it has no valid return_to (LAND-1). Never
 * Kratos' default_browser_return_url: `/welcome` resolves, in order,
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
