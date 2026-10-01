'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loading } from '@/components/Loading'
import { StepUpConfirmView, StepUpDoneView, StepUpEndView, type StepUpEndKind } from '@/components/OAuthStepUpViews'
import { signInUrl, switchAccountUrl } from '@/lib/access'
import { sessionStore } from '@/lib/flow-nav-browser'
import { stepUpGuard } from '@/lib/two-step'
import { validReq, type StepUpLoad, type StepUpSubmit, type StepUpView } from '@/lib/oauth2-step-up'

type Leave = Extract<StepUpLoad, { kind: 'unauthenticated' | 'refresh' }>

type State =
  | { kind: 'loading' }
  | { kind: 'show'; view: StepUpView }
  | { kind: 'done'; name: string | null; until: string | null }
  | { kind: 'end'; end: StepUpEndKind }

/**
 * /oauth2/step-up?req=<id>: the link an AI assistant hands its person when a protected action needs
 * a fresh second factor. The server makes sure one was proven in the last 2 minutes (else Kratos'
 * aal2 refresh login, back here), shows what will be refreshed, and on Confirm asks jinbe to refresh
 * it. Then: "go back to your assistant and retry". Automatic refreshes are capped (stepUpGuard), so a
 * proof that doesn't stick ends on a retry, never a loop.
 */
function StepUpPageContent() {
  const req = validReq(useSearchParams().get('req'))
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Leave the page (or stop) when the answer says so; true when it did. */
  const follow = useCallback((r: StepUpLoad | StepUpSubmit): r is Leave => {
    if (r.kind === 'unauthenticated') {
      window.location.assign(signInUrl(window.location.href))
      return true
    }
    if (r.kind === 'refresh') {
      if (stepUpGuard(sessionStore())) {
        window.location.assign(r.to)
        return true
      }
      setState({ kind: 'end', end: 'stuck' })
      return true
    }
    return false
  }, [])

  useEffect(() => {
    if (!req) return
    fetch(`/api/oauth2/step-up?req=${encodeURIComponent(req)}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => (res.ok ? ((await res.json()) as StepUpLoad) : ({ kind: 'unavailable' } as const)))
      .catch(() => ({ kind: 'unavailable' }) as const)
      .then((r) => {
        if (follow(r)) return
        if (r.kind === 'show') setState({ kind: 'show', view: r.view })
        else setState({ kind: 'end', end: r.kind === 'refused' ? r.reason : r.kind })
      })
  }, [req, follow])

  const confirm = async () => {
    if (!req || busy) return
    setBusy(true)
    setError(null)
    let r: StepUpSubmit
    try {
      const res = await fetch('/api/oauth2/step-up', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ req }),
      })
      r = res.ok ? ((await res.json()) as StepUpSubmit) : { kind: 'unavailable' }
    } catch {
      r = { kind: 'unavailable' }
    }
    if (follow(r)) return
    setBusy(false)
    if (r.kind === 'done') setState({ kind: 'done', name: r.name, until: r.until })
    else if (r.kind === 'unavailable') setError('We couldn’t confirm. Nothing changed — try again.')
    else setState({ kind: 'end', end: r.kind === 'refused' ? r.reason : r.kind })
  }

  const reload = () => window.location.reload()
  if (!req) return <StepUpEndView kind="expired" />
  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'done') return <StepUpDoneView name={state.name} until={state.until} />
  const switchHref = switchAccountUrl(window.location.origin, window.location.href)
  if (state.kind === 'end') {
    const retry = state.end === 'unavailable' || state.end === 'stuck' ? reload : undefined
    return <StepUpEndView kind={state.end} onRetry={retry} switchHref={switchHref} />
  }
  return (
    <StepUpConfirmView
      view={state.view}
      busy={busy}
      error={error}
      switchHref={switchHref}
      onConfirm={() => void confirm()}
      onCancel={() => setState({ kind: 'end', end: 'cancelled' })}
    />
  )
}

export default function OAuthStepUpPage() {
  return (
    <Suspense fallback={<Loading />}>
      <StepUpPageContent />
    </Suspense>
  )
}
