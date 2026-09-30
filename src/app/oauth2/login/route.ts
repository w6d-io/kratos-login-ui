import { signInUrl } from '@/lib/access'
import { validChallenge } from '@/lib/oauth2'
import { fetchLoginHop, redirectOrigins } from '@/lib/oauth2-server'
import { jinbeBaseUrl, redirectTo, refusedPath, returnCookie } from '@/lib/oauth2-response'

export const dynamic = 'force-dynamic'

/**
 * Hydra's login URL (`urls.login`): /oauth2/login?login_challenge=L. No UI — jinbe decides
 * with the visitor's Kratos session and this sends the browser on:
 *   no session           → /login?return_to=<here> (sign-in, the two-step gate, then back)
 *   no/stale 2FA         → Kratos' aal2 (refresh) login flow, back here
 *   refused              → /oauth2/refused?reason=…, Hydra's reject URL kept in a cookie
 *   accepted             → Hydra, which continues to /oauth2/consent
 * Every target is checked against this UI, Hydra and Kratos before it is followed.
 */
export async function GET(req: Request) {
  const challenge = validChallenge(new URL(req.url).searchParams.get('login_challenge'))
  if (!challenge) return redirectTo(refusedPath('expired'))
  const origins = redirectOrigins(req)
  const here = `/oauth2/login?login_challenge=${encodeURIComponent(challenge)}`
  const hop = await fetchLoginHop(
    { baseUrl: jinbeBaseUrl(), cookieHeader: req.headers.get('cookie'), cookiePrefix: process.env.KRATOS_SESSION_COOKIE || undefined, origins },
    challenge,
  )
  switch (hop.kind) {
    case 'redirect':
      return redirectTo(hop.to)
    case 'unauthenticated':
      return redirectTo(signInUrl(origins.self ? `${origins.self}${here}` : here))
    case 'refused':
      return redirectTo(refusedPath(hop.reason), returnCookie(hop.to, origins.self?.startsWith('https:') ?? true))
    case 'expired':
      return redirectTo(refusedPath('expired'))
    default:
      return redirectTo(refusedPath('unavailable', challenge))
  }
}
