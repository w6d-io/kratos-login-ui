import { isValidHost } from '@/lib/branding'
import { brandingService } from '@/lib/branding-server'

export const dynamic = 'force-dynamic'

/** Site logo proxied from jinbe; bytes are sniffed server-side (PNG/WebP only, never SVG). */
export async function GET(req: Request) {
  const host = (new URL(req.url).searchParams.get('host') || '').toLowerCase()
  const logo = isValidHost(host) ? await brandingService().logo(host).catch(() => null) : null
  if (!logo) return new Response(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } })
  return new Response(logo.body as BodyInit, {
    headers: {
      'Content-Type': logo.type,
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': 'inline',
    },
  })
}
