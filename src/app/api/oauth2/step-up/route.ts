import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { validReq, type StepUpLoad, type StepUpSubmit } from '@/lib/oauth2-step-up'
import { redirectOrigins, requestOrigin } from '@/lib/oauth2-server'
import { fetchStepUp, kratosProof, proofGate, submitStepUp } from '@/lib/oauth2-step-up-server'
import { jinbeBaseUrl } from '@/lib/oauth2-response'

export const dynamic = 'force-dynamic'

/**
 * The step-up page's backend (/oauth2/step-up?req=R):
 *   GET  ?req=R  → StepUpLoad: first a second factor under 2 minutes old (Kratos whoami; else the aal2
 *                  refresh login back to the link), then what jinbe says the link refreshes
 *   POST {req}   → StepUpSubmit: the same freshness check, then jinbe refreshes it (single use)
 * Kratos session cookies only; a POST must be same-origin JSON. Always 200 with a result kind,
 * except a POST that is not (403/415/400).
 */

function json(body: StepUpLoad | StepUpSubmit): NextResponse {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
}

async function prepare(req: Request, id: string) {
  const origins = redirectOrigins(req)
  const cookieHeader = req.headers.get('cookie')
  const cookiePrefix = process.env.KRATOS_SESSION_COOKIE || undefined
  const back = `${origins.self ?? ''}/oauth2/step-up?req=${encodeURIComponent(id)}`
  const proof = await kratosProof({ kratosUrl: config.kratos.publicUrl, cookieHeader, cookiePrefix })
  const jinbe = { baseUrl: jinbeBaseUrl(), cookieHeader, cookiePrefix, forwardedFor: req.headers.get('x-forwarded-for'), origins }
  return { gate: proofGate(proof, origins, back), proof, jinbe }
}

export async function GET(req: Request) {
  const id = validReq(new URL(req.url).searchParams.get('req'))
  if (!id) return json({ kind: 'expired' })
  const { gate, proof, jinbe } = await prepare(req, id)
  if (gate) return json(gate)
  return json(await fetchStepUp(jinbe, id, proof.kind === 'session' ? proof.email : null))
}

export async function POST(req: Request) {
  // Same-origin JSON only: confirming acts as the visitor, so a cross-site form can't post it.
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
  const id = validReq(raw && typeof raw === 'object' ? (raw as { req?: unknown }).req as string : null)
  if (!id) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const { gate, jinbe } = await prepare(req, id)
  if (gate) return json(gate)
  return json(await submitStepUp({ ...jinbe, origin }, id))
}
