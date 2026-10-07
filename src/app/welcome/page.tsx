'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { Loading } from '@/components/Loading'
import { WelcomeView, type WelcomeViewProps } from '@/components/flow/WelcomeView'
import { config } from '@/lib/config'
import { returnGuard } from '@/lib/access'
import { destinationUrl, gateUrl, safeReturnTo } from '@/lib/flow-nav'
import { initFlowUrl } from '@/lib/ory'
import { gateJustPassed, resolveGate, stepUpGuard } from '@/lib/two-step'
import type { SecondFactorResult } from '@/lib/second-factor-server'
import { sessionStore } from '@/lib/flow-nav-browser'
import { forgetDestination, lastSiteChoice, originHosts, recallDestination, rememberSiteChoice, resolveWelcome } from '@/lib/landing'
import type { MySitesResult } from '@/lib/sites-server'

function localStore(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Landing for flows that finished without a valid return_to (never Kratos'
 * default_browser_return_url): the page this tab's sign-in started for, the
 * originating site's landing URL, the only reachable site, or a picker. See src/lib/landing.ts.
 */
function WelcomePageContent() {
  const [state, setState] = useState<WelcomeViewProps['state'] | null>(null)

  const run = useCallback(async () => {
    // A picker is an exit too: an account that must have a second factor goes through the gate
    // first, however it got here (typed URL, bookmark, back button).
    // The two-step page sends here once it has checked: no second check, no second loading screen.
    if (config.secondFactorGate && !gateJustPassed(`${window.location.origin}/welcome`, sessionStore())) {
      const self = `${window.location.origin}/welcome`
      const g = await resolveGate({
        status: async () => {
          const res = await fetch('/api/second-factor', { cache: 'no-store', credentials: 'same-origin' })
          return res.ok ? ((await res.json()) as SecondFactorResult) : { kind: 'unavailable' }
        },
        destination: self,
        stepUpUrl: (rt) => initFlowUrl('login', rt, { aal: 'aal2' }),
        selfUrl: gateUrl(self, window.location.origin),
        mayStepUp: () => stepUpGuard(sessionStore()),
        // The picker is this UI's own page, not a destination that refuses and sends people back.
        mayContinueUnchecked: () => true,
      })
      if (g.kind === 'enrol' || g.kind === 'stuck' || g.kind === 'unchecked') { window.location.assign(gateUrl(self, window.location.origin)); return }
      if (g.kind === 'stepup') { window.location.assign(g.to); return }
    }
    void resolveWelcome({
      rememberedDestination: () => {
        const url = recallDestination(sessionStore())
        forgetDestination(sessionStore())
        const safe = safeReturnTo(url, window.location.origin)
        return safe && destinationUrl(safe, window.location.origin) === safe ? safe : null
      },
      originHosts: originHosts(window.location.host, sessionStore()),
      landingFor: async (host) => {
        const res = await fetch(`/api/landing?host=${encodeURIComponent(host)}`, { credentials: 'same-origin' })
        if (!res.ok) return null
        const { url } = (await res.json()) as { url: string | null }
        return safeReturnTo(url, window.location.origin)
      },
      mySites: async () => {
        const res = await fetch('/api/sites/mine', { cache: 'no-store', credentials: 'same-origin' })
        if (!res.ok) return { kind: 'unavailable' }
        return (await res.json()) as MySitesResult
      },
      lastChoice: () => lastSiteChoice(localStore()),
      mayAutoRedirect: (url) => {
        const s = sessionStore()
        return s ? returnGuard(url, s) : true
      },
      selfUrl: window.location.href,
    }).then((o) => {
      if (o.kind === 'redirect' || o.kind === 'signin') window.location.assign(o.to)
      else setState(o)
    })
  }, [])

  useEffect(() => { void run() }, [run])

  if (!state) return <Loading />
  return (
    <WelcomeView
      state={state}
      onPick={(site) => rememberSiteChoice(site.name, localStore())}
      onRetry={() => { setState(null); void run() }}
      consoleUrl={safeReturnTo(config.consoleUrl, window.location.origin)}
    />
  )
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <WelcomePageContent />
    </Suspense>
  )
}
