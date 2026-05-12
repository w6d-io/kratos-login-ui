'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { RecoveryFlow, UpdateRecoveryFlowBody } from '@ory/client'
import { initFlowUrl } from '@/lib/ory'
import { Loading } from '@/components/Loading'
import { createBrowserClient } from '@/lib/kratos'
import { Banner } from '@/components/ui/Banner'
import { Field } from '@/components/ui/Field'
import { OtpInput } from '@/components/ui/OtpInput'
import { Icons } from '@/components/ui/Icons'
import {
  getCsrfToken,
  getInput,
  hasGroup,
  handleContinueWith,
} from '@/lib/kratos-flow'
import { extractFlowBanners } from '@/lib/flow-messages'

type Stage = 'request' | 'verify'

function RecoveryPageContent() {
  const [flow, setFlow] = useState<RecoveryFlow | null>(null)
  const [loading, setLoading] = useState(true)
  const [stage, setStage] = useState<Stage>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const flowId = searchParams.get('flow')
  const fetchingRef = useRef(false)

  const fetchFlow = useCallback((id: string) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    createBrowserClient()
      .getRecoveryFlow({ id })
      .then(({ data }) => {
        setFlow(data)
        // Detect stage from flow.state: choose_method → request, sent_email → verify.
        const state = (data as { state?: string }).state
        if (state === 'sent_email' || state === 'passed_challenge') setStage('verify')
        else setStage('request')
        // Pre-fill email if echoed.
        const emailField = getInput(data, 'email')
        if (emailField?.value) setEmail(emailField.value)
        setLoading(false)
        setNetworkError(null)
      })
      .catch((err) => {
        const status = err?.response?.status
        // Avoid an infinite loop when Kratos has recovery disabled — re-init
        // would return 404 again. Only re-init for in-flight expirations.
        if (status === 410) {
          window.location.href = initFlowUrl('recovery')
          return
        }
        if (status === 404) {
          setNetworkError('Account recovery is not available on this instance.')
          setLoading(false)
          return
        }
        if (status === 403) {
          setNetworkError('You are signed in. Sign out first to use account recovery.')
          setLoading(false)
          return
        }
        setNetworkError("Can't reach the server. Check your connection.")
        setLoading(false)
      })
      .finally(() => { fetchingRef.current = false })
  }, [])

  useEffect(() => {
    if (!flowId) {
      window.location.href = initFlowUrl('recovery')
      return
    }
    fetchFlow(flowId)
  }, [flowId, fetchFlow])

  const banners = useMemo(() => extractFlowBanners(flow), [flow])

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!flow) return
    setSubmitting(true)
    setNetworkError(null)
    try {
      const method = hasGroup(flow, 'code') ? 'code' : 'link'
      const body = (method === 'code'
        ? { method: 'code', email, csrf_token: getCsrfToken(flow) }
        : { method: 'link', email, csrf_token: getCsrfToken(flow) }) as UpdateRecoveryFlowBody
      await createBrowserClient().updateRecoveryFlow({ flow: flow.id, updateRecoveryFlowBody: body })
      fetchFlow(flow.id)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 400 || status === 422) fetchFlow(flow.id)
      else if (status === 410) window.location.href = initFlowUrl('recovery')
      else setNetworkError('Could not send recovery. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!flow) return
    setSubmitting(true)
    setNetworkError(null)
    try {
      const { data } = await createBrowserClient().updateRecoveryFlow({
        flow: flow.id,
        updateRecoveryFlowBody: { method: 'code', code, csrf_token: getCsrfToken(flow) } as UpdateRecoveryFlowBody,
      })
      if (handleContinueWith(data)) return
      window.location.href = '/settings'
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 400 || status === 422) fetchFlow(flow.id)
      else if (status === 410) window.location.href = initFlowUrl('recovery')
      else setNetworkError('Code rejected. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !flow) return <Loading />

  if (stage === 'verify') {
    const usesCode = hasGroup(flow, 'code')
    return (
      <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
        <div className="card-head">
          <h1>Check your inbox</h1>
          <p>
            {usesCode
              ? <>We sent a 6-digit code to <strong>{email || 'your email'}</strong>. Enter it below to continue.</>
              : <>We sent a recovery link to <strong>{email || 'your email'}</strong>. Click the link in the email to continue.</>}
          </p>
        </div>
        <div className="card-body">
          {networkError && <Banner tone="danger" title="Network error">{networkError}</Banner>}
          {banners.map((b, i) => <Banner key={i} tone={b.tone} title={b.title}>{b.body}</Banner>)}
          {usesCode ? (
            <form onSubmit={submitCode} noValidate>
              <Field label="6-digit code" htmlFor="rec-code" error={getInput(flow, 'code')?.errors?.[0]}>
                <OtpInput value={code} onChange={setCode} />
              </Field>
              <button type="submit" className="btn btn-primary btn-block mt-4" disabled={submitting || code.length !== 6}>
                {submitting ? <><span className="spinner" /> Verifying…</> : 'Recover account'}
              </button>
              <button type="button" className="btn btn-link mt-3" onClick={() => setStage('request')}>
                Use a different email
              </button>
            </form>
          ) : (
            <>
              <Banner tone="info" title="Email sent">
                Open the email and click the link. The link is valid for a limited time. If you don&apos;t see it, check spam.
              </Banner>
              <button type="button" className="btn btn-secondary btn-block mt-4" onClick={() => setStage('request')}>
                Send to a different email
              </button>
            </>
          )}
        </div>
        <div className="card-foot">
          <Link href="/login"><Icons.ArrowLeft size={12} /> Back to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
      <div className="card-head">
        <h1>Recover your account</h1>
        <p>We will help you regain access in a couple of clicks.</p>
      </div>
      <div className="card-body">
        {networkError && <Banner tone="danger" title="Network error">{networkError}</Banner>}
        {banners.map((b, i) => <Banner key={i} tone={b.tone} title={b.title}>{b.body}</Banner>)}
        <form onSubmit={submitRequest} noValidate>
          <Field label="Work email" required htmlFor="rec-email" error={getInput(flow, 'email')?.errors?.[0]}>
            <input
              id="rec-email"
              type="email"
              autoComplete="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoFocus
              required
            />
          </Field>
          <button type="submit" className="btn btn-primary btn-block mt-4" disabled={submitting || !email}>
            {submitting ? <><span className="spinner" /> Sending…</> : 'Send recovery code'}
          </button>
        </form>
      </div>
      <div className="card-foot">
        <Link href="/login"><Icons.ArrowLeft size={12} /> Back to sign in</Link>
      </div>
    </div>
  )
}

export default function RecoveryPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RecoveryPageContent />
    </Suspense>
  )
}
