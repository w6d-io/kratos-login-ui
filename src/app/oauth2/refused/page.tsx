import { cookies } from 'next/headers'
import { isRefusedKind, validChallenge } from '@/lib/oauth2'
import { RETURN_COOKIE } from '@/lib/oauth2-server'
import { RefusedView } from '@/components/OAuthViews'

export const dynamic = 'force-dynamic'

/**
 * /oauth2/refused?reason=<reason>[&login_challenge=L]: why an app could not sign in. The
 * reason only picks the wording; "Return to your app" goes through /oauth2/return, which
 * follows the reject URL kept server-side. `unavailable` offers a retry of the same request.
 */
export default async function OAuthRefusedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const reason = typeof sp.reason === 'string' && isRefusedKind(sp.reason) ? sp.reason : 'unknown'
  const challenge = reason === 'unavailable' && typeof sp.login_challenge === 'string' ? validChallenge(sp.login_challenge) : null
  const canReturn = (await cookies()).has(RETURN_COOKIE)
  return (
    <RefusedView
      kind={reason}
      returnHref={canReturn ? '/oauth2/return' : null}
      retryHref={challenge ? `/oauth2/login?login_challenge=${encodeURIComponent(challenge)}` : null}
    />
  )
}
