'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loading } from '@/components/Loading'
import { ConsentForm, RefusedView } from '@/components/OAuthViews'
import { config } from '@/lib/config'
import { signInUrl, switchAccountUrl } from '@/lib/access'
import { validChallenge, type ConsentDecision, type ConsentLoad, type ConsentSubmit, type ConsentView } from '@/lib/oauth2'

/**
 * Hydra's consent URL (`urls.consent`): /oauth2/consent?consent_challenge=C. What the app is,
 * where it sends you back, as which account, with which permissions, and whether protected
 * actions work for the next hours — then Allow or Deny. Everything shown and decided goes
 * through /api/oauth2/consent (jinbe, with the Kratos session); the browser holds no secret
 * and is only ever sent to a Hydra URL the server checked.
 */
function ConsentPageContent() {
  const challenge = validChallenge(useSearchParams().get('consent_challenge'))
  const [view, setView] = useState<ConsentView | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'expired' | 'unavailable'>('loading')
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const follow = useCallback((r: ConsentLoad | ConsentSubmit): boolean => {
    if (r.kind === 'unauthenticated') window.location.assign(signInUrl(window.location.href))
    else if (r.kind === 'refused') window.location.assign(`/oauth2/refused?reason=${encodeURIComponent(r.reason)}`)
    else if (r.kind === 'redirect') window.location.assign(r.to)
    else return false
    return true
  }, [])

  // Runs once per challenge; "Try again" reloads the page.
  useEffect(() => {
    if (!challenge) return
    fetch(`/api/oauth2/consent?consent_challenge=${encodeURIComponent(challenge)}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => (res.ok ? ((await res.json()) as ConsentLoad) : ({ kind: 'unavailable' } as const)))
      .catch(() => ({ kind: 'unavailable' }) as const)
      .then((r) => {
        if (follow(r)) return
        if (r.kind === 'consent') { setView(r.view); setState('ready') }
        else setState(r.kind === 'expired' ? 'expired' : 'unavailable')
      })
  }, [challenge, follow])

  const decide = async (d: ConsentDecision) => {
    if (!challenge || busy) return
    setBusy(d.decision)
    setError(null)
    let r: ConsentSubmit
    try {
      const res = await fetch('/api/oauth2/consent', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          consent_challenge: challenge,
          decision: d.decision,
          mode: d.mode,
          ...(d.mode === 'chosen' ? { scopes: d.scopes } : {}),
          protected_actions: d.protectedActions,
        }),
      })
      r = res.ok ? ((await res.json()) as ConsentSubmit) : { kind: 'unavailable' }
    } catch {
      r = { kind: 'unavailable' }
    }
    // Leaving the page: keep the buttons busy so nothing is sent twice.
    if (follow(r)) return
    setBusy(null)
    if (r.kind === 'expired') setState('expired')
    else setError('We couldn’t save your answer. Nothing was shared with the app — try again.')
  }

  if (!challenge || state === 'expired') return <RefusedView kind="expired" returnHref={null} retryHref={null} />
  if (state === 'loading') return <Loading />
  if (state === 'unavailable' || !view) {
    return <RefusedView kind="unavailable" returnHref={null} retryHref={typeof window !== 'undefined' ? window.location.href : null} />
  }
  return (
    <ConsentForm
      view={view}
      platformName={config.appName}
      busy={busy}
      error={error}
      switchHref={switchAccountUrl(window.location.origin, window.location.href)}
      onDecide={(d) => void decide(d)}
    />
  )
}

export default function OAuthConsentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ConsentPageContent />
    </Suspense>
  )
}
