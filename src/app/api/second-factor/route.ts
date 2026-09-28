import { NextResponse } from 'next/server'
import { fetchSecondFactor } from '@/lib/second-factor-server'

export const dynamic = 'force-dynamic'

/**
 * This visitor's two-step status for /two-step — asked of jinbe with the
 * visitor's Kratos session only. Always 200 with a result kind: `status` |
 * `unauthenticated` | `unavailable` (jinbe down, unconfigured or policy
 * unavailable: the gate lets the sign-in finish).
 */
export async function GET(req: Request) {
  const result = await fetchSecondFactor({
    baseUrl: process.env.JINBE_PUBLIC_URL || '',
    cookieHeader: req.headers.get('cookie'),
    cookiePrefix: process.env.KRATOS_SESSION_COOKIE || undefined,
  })
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
}
