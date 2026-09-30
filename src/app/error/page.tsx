'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FlowError } from '@ory/client'
import { createBrowserClient } from '@/lib/kratos'
import { landingUrl } from '@/lib/flow-nav'
import { Loading } from '@/components/Loading'
import { FlowCard } from '@/components/flow/FlowCard'
import { CopyButton } from '@/components/flow/Parts'
import { describeFlowError, describeOAuthError } from '@/components/flow/flow-error'
import { Icons } from '@/components/ui/Icons'

function ErrorPageContent() {
  const [error, setError] = useState<FlowError | null>(null)
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()

  const errorId = searchParams.get('id')
  // Hydra (MCP app sign-in) lands here with ?error=&error_description=, not a Kratos error id.
  const oauthError = errorId ? null : (searchParams.get('error') || '').slice(0, 64)
  const rawReturnTo = searchParams.get('return_to') || ''
  // A valid return_to, else /welcome (site landing or picker) — never a static default.
  const returnTo = typeof window === 'undefined' ? '/welcome' : landingUrl(rawReturnTo, window.location.origin)

  useEffect(() => {
    if (oauthError) return
    if (!errorId) {
      setError({ id: 'unknown', error: { message: 'Unknown error occurred' } } as FlowError)
      setLoading(false)
      return
    }
    const kratos = createBrowserClient()
    kratos
      .getFlowError({ id: errorId })
      .then(({ data }) => { setError(data); setLoading(false) })
      .catch(() => {
        setError({ id: errorId, error: { message: 'Failed to load error details' } } as FlowError)
        setLoading(false)
      })
  }, [errorId, oauthError])

  if (oauthError) return <OAuthErrorView code={oauthError} description={(searchParams.get('error_description') || '').slice(0, 300)} />
  if (loading) return <Loading />

  const errorData = error?.error as { id?: string; message?: string; reason?: string; code?: number; status?: string } | undefined
  const friendly = describeFlowError(errorData)
  const signIn = `/login?return_to=${encodeURIComponent(returnTo)}`
  const primary =
    friendly.action === 'back' ? { href: returnTo, label: 'Continue' }
    : friendly.action === 'signin' ? { href: signIn, label: 'Sign in' }
    : friendly.action === 'wait' ? { href: signIn, label: 'Try again' }
    : { href: signIn, label: 'Start again' }
  const reference = [errorData?.id, errorData?.code && `code ${errorData.code}`, errorId && `ref ${errorId}`].filter(Boolean).join(' · ')

  return (
    <FlowCard
      icon={friendly.tone === 'info' ? <Icons.Info size={20} /> : <Icons.AlertTriangle size={20} />}
      tone={friendly.tone === 'info' ? 'neutral' : friendly.tone}
      title={friendly.title}
      subtitle={friendly.body}
    >
      <div className="form-actions" style={{ marginTop: 0 }}>
        <a href={primary.href} className="btn btn-primary btn-block">
          {friendly.action === 'restart' || friendly.action === 'wait' ? <Icons.RefreshCcw size={16} /> : null} {primary.label}
        </a>
        {friendly.action !== 'back' && (
          <a href={returnTo} className="btn btn-ghost btn-block">Go back</a>
        )}
      </div>
      {(errorData?.message || errorData?.reason || reference) && (
        <details className="disclosure">
          <summary><Icons.ChevronRight size={14} /> Technical details for support</summary>
          <div className="disclosure-body">
            {errorData?.message && <p style={{ margin: 0 }}>{errorData.message}</p>}
            {errorData?.reason && <p style={{ margin: 'var(--space-2) 0 0' }}>{errorData.reason}</p>}
            {reference && (
              <div className="secret">
                <code>{reference}</code>
                <CopyButton text={reference} label="Copy" />
              </div>
            )}
          </div>
        </details>
      )}
    </FlowCard>
  )
}

/** Hydra's error for an app's sign-in: what happened, and that the app has to start again. */
function OAuthErrorView({ code, description }: { code: string; description: string }) {
  const friendly = describeOAuthError(code)
  const details = [code, description].filter(Boolean).join(': ')
  return (
    <FlowCard icon={<Icons.Plug size={20} />} tone="warn" title={friendly.title} subtitle={friendly.body}>
      <p className="small muted" style={{ margin: 0 }}>You can close this tab and go back to the app.</p>
      <details className="disclosure">
        <summary><Icons.ChevronRight size={14} /> Technical details for support</summary>
        <div className="disclosure-body">
          <div className="secret">
            <code>{details}</code>
            <CopyButton text={details} label="Copy" />
          </div>
        </div>
      </details>
    </FlowCard>
  )
}

export default function ErrorPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ErrorPageContent />
    </Suspense>
  )
}
