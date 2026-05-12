'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@/lib/kratos'
import { config, isReturnUrlAllowed } from '@/lib/config'
import { Loading } from '@/components/Loading'
import { Banner } from '@/components/ui/Banner'
import { Icons } from '@/components/ui/Icons'

function LogoutPageContent() {
  const [logoutUrl, setLogoutUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoSubmitted, setAutoSubmitted] = useState(false)
  const searchParams = useSearchParams()

  const rawReturnTo = searchParams.get('return_to') || ''
  const returnTo = isReturnUrlAllowed(rawReturnTo) ? rawReturnTo : config.defaultReturnUrl
  const auto = searchParams.get('confirm') !== 'false'

  useEffect(() => {
    createBrowserClient()
      .createBrowserLogoutFlow({ returnTo })
      .then(({ data }) => {
        setLogoutUrl(data.logout_url)
        setLoading(false)
        // If auto mode, follow the logout URL straight away — Kratos clears
        // the session cookie and redirects to returnTo.
        if (auto && data.logout_url) {
          setAutoSubmitted(true)
          window.location.href = data.logout_url
        }
      })
      .catch(() => {
        setError('You are not signed in.')
        setLoading(false)
      })
  }, [returnTo, auto])

  if (loading || autoSubmitted) return <Loading />

  if (error) {
    return (
      <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
        <div className="card-head">
          <h1>Sign out</h1>
          <p>{error}</p>
        </div>
        <div className="card-body">
          <Link href={`/login?return_to=${encodeURIComponent(returnTo)}`} className="btn btn-primary btn-block">
            Go to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
      <div className="card-head">
        <h1>Sign out</h1>
        <p>Are you sure you want to sign out?</p>
      </div>
      <div className="card-body">
        <Banner tone="info">You will be redirected after signing out.</Banner>
        <div className="btn-row mt-4">
          <a href={logoutUrl || '#'} className="btn btn-danger btn-block">
            <Icons.LogOut size={14} /> Sign out
          </a>
          <a href={returnTo} className="btn btn-secondary btn-block">Cancel</a>
        </div>
      </div>
    </div>
  )
}

export default function LogoutPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LogoutPageContent />
    </Suspense>
  )
}
