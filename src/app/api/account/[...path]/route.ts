import { NextResponse } from 'next/server'
import { accountCall, relayAccountCall, sameOrigin } from '@/lib/account-server'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * The Account area's calls to jinbe (/api/account/<jinbe path without /api/>), with the visitor's
 * Kratos session only. Anything not in ACCOUNT_ROUTES is 404 here; a change that does not come from
 * this UI's own pages is 403. jinbe's status and JSON answer are relayed as they are.
 */
async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const method = req.method.toUpperCase()
  if (method !== 'GET' && !sameOrigin(req.headers)) {
    return NextResponse.json({ error: 'forbidden', message: 'Not from this page' }, { status: 403, headers: NO_STORE })
  }
  let raw: unknown = undefined
  if (method !== 'GET' && method !== 'DELETE') {
    const text = await req.text()
    if (text) {
      if (!(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
        return NextResponse.json({ error: 'invalid_request' }, { status: 415, headers: NO_STORE })
      }
      try {
        raw = JSON.parse(text)
      } catch {
        return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE })
      }
    }
  }
  const call = accountCall(method, (path ?? []).join('/'), new URL(req.url).searchParams, raw)
  if (!call) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  const result = await relayAccountCall(call, {
    baseUrl: process.env.JINBE_PUBLIC_URL || '',
    cookieHeader: req.headers.get('cookie'),
    cookieName: process.env.KRATOS_SESSION_COOKIE || undefined,
  })
  if (result.status === 204 || result.body === null) return new NextResponse(null, { status: result.status === 204 ? 204 : result.status, headers: NO_STORE })
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE })
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
