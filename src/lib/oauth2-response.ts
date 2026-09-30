import { RETURN_COOKIE } from './oauth2-server'
import type { RefusedKind } from './oauth2'

/**
 * Responses shared by the /oauth2/* route handlers: a no-store redirect (relative Location
 * kept relative), and Hydra's reject URL parked in a short-lived HttpOnly cookie so the
 * refused page's "Return to your app" never carries a URL in the query (no open redirect).
 */

const NO_STORE = 'private, no-store'
const RETURN_MAX_AGE_S = 15 * 60

export function redirectTo(location: string, setCookie?: string): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': NO_STORE })
  if (setCookie) headers.append('Set-Cookie', setCookie)
  return new Response(null, { status: 302, headers })
}

export function returnCookie(value: string | null, secure: boolean): string {
  const attrs = ['Path=/oauth2', 'HttpOnly', 'SameSite=Lax', ...(secure ? ['Secure'] : [])]
  return value
    ? `${RETURN_COOKIE}=${encodeURIComponent(value)}; Max-Age=${RETURN_MAX_AGE_S}; ${attrs.join('; ')}`
    : `${RETURN_COOKIE}=; Max-Age=0; ${attrs.join('; ')}`
}

export function readReturnCookie(header: string | null): string | null {
  for (const part of (header || '').split(';')) {
    const kv = part.trim()
    if (!kv.startsWith(`${RETURN_COOKIE}=`)) continue
    try {
      return decodeURIComponent(kv.slice(RETURN_COOKIE.length + 1)) || null
    } catch {
      return null
    }
  }
  return null
}

export function refusedPath(reason: RefusedKind, loginChallenge?: string): string {
  const qs = new URLSearchParams({ reason })
  if (loginChallenge) qs.set('login_challenge', loginChallenge)
  return `/oauth2/refused?${qs}`
}

/** Unset is a misconfiguration: every MCP sign-in then stops here. Each said once per process. */
const warned = { jinbe: false, hydra: false }
export function jinbeBaseUrl(): string {
  const base = process.env.JINBE_PUBLIC_URL || ''
  if (!base && !warned.jinbe) {
    warned.jinbe = true
    console.warn('[oauth2] JINBE_PUBLIC_URL is not set: MCP sign-in (Hydra login/consent) cannot be answered. Set it to jinbe\'s in-cluster URL.')
  }
  if (!process.env.HYDRA_PUBLIC_URL && !warned.hydra) {
    warned.hydra = true
    console.warn('[oauth2] HYDRA_PUBLIC_URL is not set: accepted MCP sign-ins cannot continue to Hydra. Set it to Hydra\'s public issuer URL.')
  }
  return base
}
