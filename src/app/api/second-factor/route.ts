import { NextResponse } from 'next/server'
import { fetchSecondFactor } from '@/lib/second-factor-server'

export const dynamic = 'force-dynamic'

/**
 * This visitor's two-step status for /two-step — asked of jinbe with the
 * visitor's Kratos session only. Always 200 with a result kind: `status` |
 * `unauthenticated` | `unavailable` (jinbe down, unconfigured or policy
 * unavailable: the gate lets the sign-in finish).
 */
let warnedUnconfigured = false

export async function GET(req: Request) {
  const baseUrl = process.env.JINBE_PUBLIC_URL || ''
  // Unset is a misconfiguration, not an outage: every sign-in then passes the gate unchecked, and a
  // privileged account without a second factor is refused by the gateway after it. Said once.
  if (!baseUrl && !warnedUnconfigured) {
    warnedUnconfigured = true
    console.warn('[two-step] JINBE_PUBLIC_URL is not set: the two-step gate cannot ask whether an account must use a second factor. Set it to jinbe\'s in-cluster URL.')
  }
  const result = await fetchSecondFactor({
    baseUrl,
    cookieHeader: req.headers.get('cookie'),
    cookiePrefix: process.env.KRATOS_SESSION_COOKIE || undefined,
  })
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
}
