import { NextResponse } from 'next/server'
import { hostFromReturnTo } from '@/lib/branding'
import { brandingService } from '@/lib/branding-server'
import { isReturnUrlAllowed } from '@/lib/config'

export const dynamic = 'force-dynamic'

/**
 * Per-site branding for the sign-in pages, keyed by the host of a return_to
 * that passes the allowed-return-URL check. Always 200: `{branding: null}`
 * means platform branding (unknown site, bad return_to, jinbe down).
 */
export async function GET(req: Request) {
  const returnTo = new URL(req.url).searchParams.get('return_to')
  const host = hostFromReturnTo(returnTo, isReturnUrlAllowed)
  let branding = null
  if (host) {
    try {
      branding = await brandingService().lookup(host)
    } catch {
      branding = null
    }
  }
  return NextResponse.json({ branding }, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
