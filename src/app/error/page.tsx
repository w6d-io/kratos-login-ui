'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FlowError } from '@ory/client'
import { createBrowserClient } from '@/lib/kratos'
import { config, isReturnUrlAllowed } from '@/lib/config'
import { Loading } from '@/components/Loading'
import { Banner } from '@/components/ui/Banner'
import { Icons } from '@/components/ui/Icons'

function ErrorPageContent() {
  const [error, setError] = useState<FlowError | null>(null)
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()

  const errorId = searchParams.get('id')
  const rawReturnTo = searchParams.get('return_to') || ''
  const returnTo = isReturnUrlAllowed(rawReturnTo) ? rawReturnTo : config.defaultReturnUrl

  useEffect(() => {
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
  }, [errorId])

  if (loading) return <Loading />

  const errorData = error?.error as { message?: string; reason?: string; code?: number; status?: string } | undefined
  const errorMessage = errorData?.message || 'An unexpected error occurred'
  const errorReason = errorData?.reason
  const errorCode = errorData?.code

  return (
    <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
      <div className="card-head">
        <h1>Something went wrong</h1>
        <p>We hit a snag while processing your request.</p>
      </div>
      <div className="card-body">
        <Banner tone="danger" title={errorMessage}>
          {errorReason && <div>{errorReason}</div>}
          {(errorCode || errorId) && (
            <div className="mono mt-2">
              {errorCode && <>code <strong>{errorCode}</strong> · </>}id <strong>{errorId || 'unknown'}</strong>
            </div>
          )}
        </Banner>
        <div className="btn-row mt-4">
          <a href={`/login?return_to=${encodeURIComponent(returnTo)}`} className="btn btn-primary btn-block">
            <Icons.RefreshCcw size={16} /> Try again
          </a>
          <a href={returnTo} className="btn btn-secondary btn-block">
            Go back
          </a>
        </div>
      </div>
    </div>
  )
}

export default function ErrorPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ErrorPageContent />
    </Suspense>
  )
}
