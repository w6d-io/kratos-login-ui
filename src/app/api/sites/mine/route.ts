import { NextResponse } from 'next/server'
import { fetchMySites } from '@/lib/sites-server'
import { isReturnUrlAllowed } from '@/lib/config'

export const dynamic = 'force-dynamic'

/**
 * The sites this visitor can reach, for the "Where to?" page — asked of
 * jinbe with the visitor's Kratos session only. Always 200 with a result
 * kind: `sites` | `unauthenticated` | `unavailable` (jinbe down or policy
 * unavailable: retry, never an empty list).
 */
export async function GET(req: Request) {
  const result = await fetchMySites({
    baseUrl: process.env.JINBE_PUBLIC_URL || '',
    cookieHeader: req.headers.get('cookie'),
    cookiePrefix: process.env.KRATOS_SESSION_COOKIE || undefined,
    isAllowed: isReturnUrlAllowed,
  })
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
}
