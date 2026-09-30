import { NextResponse } from 'next/server'
import { validChallenge, type ConsentLoad, type ConsentSubmit } from '@/lib/oauth2'
import { fetchConsent, parseDecision, redirectOrigins, requestOrigin, submitConsent } from '@/lib/oauth2-server'
import { jinbeBaseUrl, returnCookie } from '@/lib/oauth2-response'

export const dynamic = 'force-dynamic'

/**
 * The consent screen's backend, asked of jinbe with the visitor's Kratos session only:
 *   GET  ?consent_challenge=C → ConsentLoad (what to show)
 *   POST {consent_challenge, decision, mode, scopes, protected_actions} → ConsentSubmit
 * Always 200 with a result kind, except a POST that is not same-origin JSON (403/400). A
 * refusal parks Hydra's reject URL in the `oauth2_return` cookie for /oauth2/refused; the
 * browser only ever gets a Hydra URL checked against the allow-list.
 */

function json(body: ConsentLoad | ConsentSubmit, req: Request, returnTo: string | null): NextResponse {
  const res = NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
  if (body.kind === 'refused') res.headers.append('Set-Cookie', returnCookie(returnTo, requestOrigin(req)?.startsWith('https:') ?? true))
  return res
}

function options(req: Request) {
  return {
    baseUrl: jinbeBaseUrl(),
    cookieHeader: req.headers.get('cookie'),
    cookiePrefix: process.env.KRATOS_SESSION_COOKIE || undefined,
    origins: redirectOrigins(req),
  }
}

export async function GET(req: Request) {
  const challenge = validChallenge(new URL(req.url).searchParams.get('consent_challenge'))
  if (!challenge) return json({ kind: 'expired' }, req, null)
  const { load, returnTo } = await fetchConsent(options(req), challenge)
  return json(load, req, returnTo)
}

export async function POST(req: Request) {
  // Same-origin JSON only: the decision acts as the visitor, so a cross-site form can't post it.
  const origin = req.headers.get('origin')
  const self = requestOrigin(req)
  if (!origin || !self || origin !== self || req.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (!(req.headers.get('content-type') || '').startsWith('application/json')) {
    return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 })
  }
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    raw = null
  }
  const parsed = parseDecision(raw)
  const challenge = validChallenge(parsed?.challenge)
  if (!parsed || !challenge) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const { result, returnTo } = await submitConsent({ ...options(req), origin }, challenge, parsed.decision)
  return json(result, req, returnTo)
}
