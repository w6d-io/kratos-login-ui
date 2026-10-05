import { NextResponse } from 'next/server'
import { continueSignUp } from '@/lib/sign-up-server'
import { isReturnUrlAllowed } from '@/lib/config'

export const dynamic = 'force-dynamic'

/**
 * "Continue to <site>": the signed-in visitor joins the site their return_to points at, when its own
 * sign-up is open to them. Asked of jinbe with the visitor's Kratos session only; a return_to outside
 * the allow-list is refused here. Always 200 with a result kind (joined | refused | unauthenticated |
 * unavailable).
 */
export async function POST(req: Request) {
  let returnTo = ''
  try {
    const body = (await req.json()) as { return_to?: unknown }
    returnTo = typeof body.return_to === 'string' ? body.return_to : ''
  } catch {
    returnTo = ''
  }
  let host = ''
  try {
    if (returnTo && isReturnUrlAllowed(returnTo)) host = new URL(returnTo).hostname.toLowerCase()
  } catch {
    host = ''
  }
  const result = host
    ? await continueSignUp({
        baseUrl: process.env.JINBE_PUBLIC_URL || '',
        host,
        cookieHeader: req.headers.get('cookie'),
        cookieName: process.env.KRATOS_SESSION_COOKIE || undefined,
      })
    : { kind: 'refused', reason: 'site_not_found' }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
