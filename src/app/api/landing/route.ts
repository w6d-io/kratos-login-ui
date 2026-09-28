import { NextResponse } from 'next/server'
import { isValidHost } from '@/lib/branding'
import { brandingService } from '@/lib/branding-server'
import { isReturnUrlAllowed } from '@/lib/config'

export const dynamic = 'force-dynamic'

/**
 * Landing URL of the site at `host` (jinbe's by-host `defaultReturnUrl`),
 * for flows that finished without a return_to. `{url: null}` when the host
 * is not a site, has no default, jinbe is down, or the URL fails the
 * return-URL allow-list.
 */
export async function GET(req: Request) {
  const host = (new URL(req.url).searchParams.get('host') || '').toLowerCase()
  let url: string | null = null
  if (isValidHost(host)) {
    try {
      const candidate = (await brandingService().lookup(host))?.defaultReturnUrl ?? null
      url = candidate && isReturnUrlAllowed(candidate) ? candidate : null
    } catch {
      url = null
    }
  }
  return NextResponse.json({ url }, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
