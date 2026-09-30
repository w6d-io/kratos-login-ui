import { allowedRedirect } from '@/lib/oauth2'
import { redirectOrigins } from '@/lib/oauth2-server'
import { readReturnCookie, redirectTo, refusedPath, returnCookie } from '@/lib/oauth2-response'

export const dynamic = 'force-dynamic'

/**
 * "Return to your app" on /oauth2/refused: follows Hydra's reject URL parked in the
 * `oauth2_return` cookie (checked again, then cleared), so the app is told `access_denied`.
 * Without one the request has ended.
 */
export async function GET(req: Request) {
  const origins = redirectOrigins(req)
  const secure = origins.self?.startsWith('https:') ?? true
  // Only Hydra continues a refused request: never this UI or Kratos from here.
  const to = allowedRedirect(readReturnCookie(req.headers.get('cookie')), { self: null, hydra: origins.hydra, kratos: null })
  return redirectTo(to ?? refusedPath('expired'), returnCookie(null, secure))
}
