import { sessionCookie } from './access-reason-server'

/**
 * Server-side client for jinbe's `POST /api/me/sign-up/continue` ("Continue to <site>"): a signed-in
 * visitor joins a site whose own sign-up is open to them. Only the Kratos session cookie is
 * forwarded. jinbe decides everything (open, verified address, allowed domain); this only relays.
 */

export type ContinueRefusal = 'site_not_found' | 'sign_up_closed' | 'domain_not_allowed' | 'email_not_verified' | 'no_roles'
export type ContinueResult =
  | { kind: 'joined' }
  | { kind: 'refused'; reason: ContinueRefusal }
  | { kind: 'unauthenticated' }
  | { kind: 'unavailable' }

const REFUSALS: readonly ContinueRefusal[] = ['site_not_found', 'sign_up_closed', 'domain_not_allowed', 'email_not_verified', 'no_roles']

export interface ContinueOptions {
  baseUrl: string
  host: string
  cookieHeader: string | null
  cookieName?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export async function continueSignUp(opts: ContinueOptions): Promise<ContinueResult> {
  const base = opts.baseUrl.replace(/\/+$/, '')
  if (!base) return { kind: 'unavailable' }
  const cookie = sessionCookie(opts.cookieHeader, opts.cookieName ?? 'ory_kratos_session')
  if (!cookie) return { kind: 'unauthenticated' }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8000)
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${base}/api/me/sign-up/continue`, {
      method: 'POST',
      signal: ctl.signal,
      redirect: 'error',
      cache: 'no-store',
      headers: { accept: 'application/json', 'content-type': 'application/json', cookie },
      body: JSON.stringify({ host: opts.host }),
    })
    if (res.status === 401) return { kind: 'unauthenticated' }
    if (!res.ok) return { kind: 'unavailable' }
    const body = (await res.json()) as { joined?: unknown; reason?: unknown }
    if (body.joined === true) return { kind: 'joined' }
    return REFUSALS.includes(body.reason as ContinueRefusal) ? { kind: 'refused', reason: body.reason as ContinueRefusal } : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}

/** What a refusal means to the visitor. */
export function continueRefusalText(reason: ContinueRefusal, siteName: string, domains: string[]): string {
  switch (reason) {
    case 'email_not_verified':
      return 'Verify your email address first, then continue.'
    case 'domain_not_allowed':
      return domains.length
        ? `${siteName} is open to ${domains.slice(0, 5).map((d) => `@${d}`).join(', ')} addresses. Switch to one of those accounts.`
        : `${siteName} is not open to this address.`
    case 'sign_up_closed':
    case 'no_roles':
      return `${siteName} is not taking new members right now.`
    default:
      return 'This site could not be found.'
  }
}
