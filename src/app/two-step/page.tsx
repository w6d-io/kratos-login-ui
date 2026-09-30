'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { SettingsFlow } from '@ory/client'
import { Loading } from '@/components/Loading'
import { createBrowserClient } from '@/lib/kratos'
import { initFlowUrl } from '@/lib/ory'
import { getTriggerButton } from '@/lib/kratos-flow'
import { destinationUrl, gateUrl, WELCOME_PATH } from '@/lib/flow-nav'
import { sessionStore } from '@/lib/flow-nav-browser'
import { switchAccountUrl } from '@/lib/access'
import { blindPassGuard, resolveGate, stepUpGuard } from '@/lib/two-step'
import { forgetDestination } from '@/lib/landing'
import type { SecondFactorResult } from '@/lib/second-factor-server'
import { useBranding, useBrandingReturnTo } from '@/components/ui/Branding'
import { Icons } from '@/components/ui/Icons'
import { WebAuthnTriggerForm } from '@/components/ui/OryWebAuthn'
import { MfaTotpSection, onSettingsError } from '@/components/settings/TotpSection'
import { TwoStepSetupView, TwoStepStuckView, TwoStepUncheckedView } from '@/components/TwoStepViews'

/**
 * The two-step gate every finished sign-in passes (src/lib/two-step.ts):
 *   /two-step?return_to=<destination>
 * Continues to the destination, steps up, or shows the enrolment step — the
 * authenticator app (and a security key when Kratos offers one), in the
 * same components as /settings. A settings flow created here returns here,
 * so every way out of enrolment is re-checked before the destination.
 */
function TwoStepPageContent() {
  const searchParams = useSearchParams()
  const rawReturn = searchParams.get('return_to')
  // An app signing in (jinbe's MCP login step) needs a second factor on any account; only ever stricter.
  const mustEnrol = searchParams.get('must_enrol') === '1'
  const [origin, setOrigin] = useState('')
  const destination = origin ? destinationUrl(rawReturn, origin) : null
  const selfUrl = destination ? gateUrl(destination, origin, mustEnrol) : ''
  useBrandingReturnTo(destination)
  const { branding } = useBranding()
  const [view, setView] = useState<'loading' | 'enrol' | 'stuck' | 'unchecked'>('loading')
  const [flow, setFlow] = useState<SettingsFlow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)

  useEffect(() => { setOrigin(window.location.origin) }, [])

  const loadFlow = useCallback((id?: string) => {
    const kratos = createBrowserClient()
    const req = id ? kratos.getSettingsFlow({ id }) : kratos.createBrowserSettingsFlow({ returnTo: selfUrl })
    req
      .then(({ data }) => { setFlow(data); setView('enrol') })
      .catch((err) => {
        // Privileged-session refresh or an expired session: flow-nav signs in / re-auths and comes back here.
        onSettingsError(err, { returnTo: selfUrl }, "Can't reach the server. Check your connection.", () => setError("Can't reach the server. Check your connection."), setError)
        setView('enrol')
      })
  }, [selfUrl])

  const run = useCallback(() => {
    if (!destination || running.current) return
    running.current = true
    setView('loading')
    void resolveGate({
      status: async () => {
        const res = await fetch('/api/second-factor', { cache: 'no-store', credentials: 'same-origin' })
        if (!res.ok) return { kind: 'unavailable' }
        return (await res.json()) as SecondFactorResult
      },
      destination,
      stepUpUrl: (rt) => initFlowUrl('login', rt, { aal: 'aal2' }),
      selfUrl,
      mayStepUp: () => stepUpGuard(sessionStore()),
      mayContinueUnchecked: () => blindPassGuard(destination, sessionStore()),
      mustEnrol,
    }).then((o) => {
      running.current = false
      // Reached: /welcome no longer needs the remembered destination (it uses it itself).
      if (o.kind === 'continue' && o.to !== `${origin}${WELCOME_PATH}`) forgetDestination(sessionStore())
      if (o.kind === 'continue' || o.kind === 'stepup' || o.kind === 'signin') window.location.assign(o.to)
      else if (o.kind === 'enrol') loadFlow()
      else setView(o.kind)
    })
  }, [destination, selfUrl, origin, loadFlow, mustEnrol])

  useEffect(() => { run() }, [run])

  if (!destination || view === 'loading') return <Loading />
  const signOutHref = switchAccountUrl(origin, destination)
  if (view === 'stuck') return <TwoStepStuckView onRetry={run} signOutHref={signOutHref} />
  if (view === 'unchecked') {
    return <TwoStepUncheckedView onRetry={run} settingsHref={`/settings?return_to=${encodeURIComponent(selfUrl)}#mfa`} signOutHref={signOutHref} />
  }

  const email = (flow?.identity?.traits as { email?: unknown } | undefined)?.email
  return (
    <TwoStepSetupView
      email={typeof email === 'string' ? email : null}
      destinationName={branding?.displayName ?? null}
      forApp={mustEnrol}
      error={error}
      signOutHref={signOutHref}
    >
      {flow && (
        <>
          {/* Saved: ask again rather than follow the flow — enrolment may or may not have raised the level. */}
          <MfaTotpSection flow={flow} onChanged={() => loadFlow(flow.id)} onSaved={run} />
          {getTriggerButton(flow, 'webauthn_register_trigger') && (
            <div className="settings-row">
              <div className="settings-row-icon" aria-hidden><Icons.Key size={18} /></div>
              <div className="settings-row-content">
                <div className="settings-row-title">Security key</div>
                <div className="settings-row-meta">A hardware key or your device’s built-in authenticator, asked for after your password.</div>
              </div>
              <div className="settings-row-actions">
                <WebAuthnTriggerForm flow={flow} group="webauthn" triggerName="webauthn_register_trigger" className="btn btn-secondary btn-sm">
                  <Icons.Plus size={14} /> Add security key
                </WebAuthnTriggerForm>
              </div>
            </div>
          )}
        </>
      )}
    </TwoStepSetupView>
  )
}

export default function TwoStepPage() {
  return (
    <Suspense fallback={<Loading />}>
      <TwoStepPageContent />
    </Suspense>
  )
}
