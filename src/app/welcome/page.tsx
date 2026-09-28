'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { Loading } from '@/components/Loading'
import { WelcomeView, type WelcomeViewProps } from '@/components/flow/WelcomeView'
import { config } from '@/lib/config'
import { returnGuard } from '@/lib/access'
import { safeReturnTo } from '@/lib/flow-nav'
import { sessionStore } from '@/lib/flow-nav-browser'
import { lastSiteChoice, originHosts, rememberSiteChoice, resolveWelcome } from '@/lib/landing'
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
 * default_browser_return_url): the originating site's landing URL, the only
 * reachable site, or a picker. See src/lib/landing.ts.
 */
function WelcomePageContent() {
  const [state, setState] = useState<WelcomeViewProps['state'] | null>(null)

  const run = useCallback(() => {
    void resolveWelcome({
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

  useEffect(() => { run() }, [run])

  if (!state) return <Loading />
  return (
    <WelcomeView
      state={state}
      onPick={(site) => rememberSiteChoice(site.name, localStore())}
      onRetry={() => { setState(null); run() }}
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
