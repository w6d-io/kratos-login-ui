import { NextResponse } from 'next/server'
import { fetchAccessReason } from '@/lib/access-reason-server'
import { parseAccessParams } from '@/lib/access'
import { isReturnUrlAllowed } from '@/lib/config'

export const dynamic = 'force-dynamic'

/**
 * Why the gateway refused this visitor on `site` for `return_to`, asked of
 * jinbe with the visitor's Kratos session. Any `reason` query param is
 * ignored. Missing/invalid site or return_to → forbidden (as jinbe's 400).
 */
export async function GET(req: Request) {
  const { site, returnTo } = parseAccessParams(new URL(req.url).searchParams, isReturnUrlAllowed)
  const result =
    site && returnTo
      ? await fetchAccessReason({
          baseUrl: process.env.JINBE_PUBLIC_URL || '',
          site,
          url: returnTo,
          cookieHeader: req.headers.get('cookie'),
          cookieName: process.env.KRATOS_SESSION_COOKIE || undefined,
        })
      : { kind: 'reason', reason: 'forbidden', minAal: null }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
