'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@/lib/kratos'
import { safeReturnTo } from '@/lib/flow-nav'
import { Loading } from '@/components/Loading'
import { FlowCard } from '@/components/flow/FlowCard'
import { Icons } from '@/components/ui/Icons'

function LogoutPageContent() {
  const [logoutUrl, setLogoutUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoSubmitted, setAutoSubmitted] = useState(false)
  const searchParams = useSearchParams()

  const rawReturnTo = searchParams.get('return_to') || ''
  // Same-origin paths (e.g. "use another account" → /login?return_to=…) and
  // allowed URLs only; Kratos re-validates it on the logout flow.
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const returnTo = (origin && safeReturnTo(rawReturnTo, origin)) || `${origin}/login`
  const auto = searchParams.get('confirm') !== 'false'

  // One logout flow per visit: a second one (effect re-run) racing the first
  // navigation reaches Kratos after the session is gone and lands on the
  // error page (session_inactive).
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
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

  if (loading || autoSubmitted) return <Loading label="Signing you out" />

  if (error) {
    return (
      <FlowCard
        icon={<Icons.LogOut size={20} />}
        title="You’re not signed in"
        subtitle="There’s no active session in this browser, so there’s nothing to sign out of."
      >
        <Link href={`/login?return_to=${encodeURIComponent(returnTo)}`} className="btn btn-primary btn-block">
          Sign in
        </Link>
      </FlowCard>
    )
  }

  return (
    <FlowCard
      icon={<Icons.LogOut size={20} />}
      title="Sign out?"
      subtitle="You’ll be signed out in this browser. Apps you opened with this account will ask you to sign in again."
    >
      <div className="form-actions" style={{ marginTop: 0 }}>
        <a href={logoutUrl || '#'} className="btn btn-primary btn-block">
          <Icons.LogOut size={16} /> Sign out
        </a>
        <a href={returnTo} className="btn btn-ghost btn-block">Stay signed in</a>
      </div>
    </FlowCard>
  )
}

export default function LogoutPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LogoutPageContent />
    </Suspense>
  )
}
