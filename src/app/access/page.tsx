'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@/lib/kratos'
import { initFlowUrl } from '@/lib/ory'
import { isReturnUrlAllowed } from '@/lib/config'
import { parseAccessParams, resolveAccess, type AccessOutcome } from '@/lib/access'
import { Loading } from '@/components/Loading'
import { AccessErrorView, EnrolView, ForbiddenView } from '@/components/AccessViews'
import { useBranding, useBrandingReturnTo } from '@/components/ui/Branding'

/**
 * Where the gateway sends browsers it refused (task PX-1):
 *   /access?site=<name>&return_to=<url>&reason=needs_2fa|forbidden
 * needs_2fa → step up (aal2 login flow) or enrol a second factor first;
 * forbidden (or still refused at aal2) → branded "no access" page.
 * The gateway re-checks on return, so nothing here grants access.
 */
function AccessPageContent() {
  const searchParams = useSearchParams()
  const params = useMemo(() => parseAccessParams(new URLSearchParams(searchParams.toString()), isReturnUrlAllowed), [searchParams])
  const { branding } = useBranding()
  useBrandingReturnTo(params.returnTo)
  const [outcome, setOutcome] = useState<AccessOutcome | null>(null)

  const run = useCallback(() => {
    const kratos = createBrowserClient()
    void resolveAccess(params, {
      toSession: async () => {
        const { data } = await kratos.toSession()
        const email = (data.identity?.traits as { email?: unknown } | undefined)?.email
        return { aal: data.authenticator_assurance_level || 'aal1', email: typeof email === 'string' ? email : null }
      },
      createLoginFlow: async (returnTo) => (await kratos.createBrowserLoginFlow({ aal: 'aal2', returnTo: returnTo ?? undefined })).data,
      createSettingsFlow: async (returnTo) => (await kratos.createBrowserSettingsFlow({ returnTo })).data,
      stepUpUrl: (returnTo) => initFlowUrl('login', returnTo ?? undefined, { aal: 'aal2' }),
      selfUrl: window.location.href,
    }).then((o) => {
      if (o.kind === 'redirect') window.location.href = o.to
      else setOutcome(o)
    })
  }, [params])

  useEffect(() => { run() }, [run])
  const retry = () => { setOutcome(null); run() }

  if (!outcome) return <Loading />

  const siteName = branding?.displayName || params.site || 'this site'
  const helpUrl = branding?.helpUrl ?? null
  switch (outcome.kind) {
    case 'forbidden':
      return (
        <ForbiddenView
          siteName={siteName}
          email={outcome.email}
          helpUrl={helpUrl}
          returnTo={params.returnTo}
          origin={window.location.origin}
          alreadyAal2={outcome.alreadyAal2}
        />
      )
    case 'enrol':
      return <EnrolView siteName={siteName} email={outcome.email} methods={outcome.methods} settingsUrl={outcome.settingsUrl} helpUrl={helpUrl} />
    default:
      return <AccessErrorView onRetry={retry} />
  }
}

export default function AccessPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AccessPageContent />
    </Suspense>
  )
}
