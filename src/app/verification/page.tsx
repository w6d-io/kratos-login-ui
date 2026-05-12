'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { VerificationFlow, UpdateVerificationFlowBody } from '@ory/client'
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

type Stage = 'request' | 'verify' | 'success'

function VerificationPageContent() {
  const [flow, setFlow] = useState<VerificationFlow | null>(null)
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
      .getVerificationFlow({ id })
      .then(({ data }) => {
        setFlow(data)
        const state = (data as { state?: string }).state
        if (state === 'sent_email') setStage('verify')
        else if (state === 'passed_challenge') setStage('success')
        else setStage('request')
        const emailField = getInput(data, 'email')
        if (emailField?.value) setEmail(emailField.value)
        setLoading(false)
        setNetworkError(null)
      })
      .catch((err) => {
        const status = err?.response?.status
        if (status === 410) {
          window.location.href = initFlowUrl('verification')
          return
        }
        if (status === 404) {
          setNetworkError('Email verification is not available on this instance.')
          setLoading(false)
          return
        }
        if (status === 403) {
          setNetworkError('You are not allowed to verify in the current state.')
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
      window.location.href = initFlowUrl('verification')
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
      const body = { method, email, csrf_token: getCsrfToken(flow) } as UpdateVerificationFlowBody
      await createBrowserClient().updateVerificationFlow({ flow: flow.id, updateVerificationFlowBody: body })
      fetchFlow(flow.id)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 400 || status === 422) fetchFlow(flow.id)
      else if (status === 410) window.location.href = initFlowUrl('verification')
      else setNetworkError('Could not send verification. Try again.')
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
      const { data } = await createBrowserClient().updateVerificationFlow({
        flow: flow.id,
        updateVerificationFlowBody: { method: 'code', code, csrf_token: getCsrfToken(flow) } as UpdateVerificationFlowBody,
      })
      if (handleContinueWith(data)) return
      fetchFlow(flow.id)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 400 || status === 422) fetchFlow(flow.id)
      else if (status === 410) window.location.href = initFlowUrl('verification')
      else setNetworkError('Code rejected. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !flow) return <Loading />

  if (stage === 'success') {
    return (
      <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
        <div className="card-head">
          <h1>Email verified</h1>
          <p>Thanks — your email is now verified.</p>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
            <Icons.CheckCircle size={56} stroke={1.5} />
          </div>
          <Link href="/login" className="btn btn-primary btn-block">
            Continue
          </Link>
        </div>
      </div>
    )
  }

  if (stage === 'verify') {
    return (
      <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
        <div className="card-head">
          <h1>Verify your email</h1>
          <p>We sent a 6-digit code to <strong>{email || 'your email'}</strong>.</p>
        </div>
        <div className="card-body">
          {networkError && <Banner tone="danger" title="Network error">{networkError}</Banner>}
          {banners.map((b, i) => <Banner key={i} tone={b.tone} title={b.title}>{b.body}</Banner>)}
          <form onSubmit={submitCode} noValidate>
            <Field label="Code" htmlFor="ver-code" error={getInput(flow, 'code')?.errors?.[0]}>
              <OtpInput value={code} onChange={setCode} />
            </Field>
            <button type="submit" className="btn btn-primary btn-block mt-4" disabled={submitting || code.length !== 6}>
              {submitting ? <><span className="spinner" /> Verifying…</> : 'Verify email'}
            </button>
            <button type="button" className="btn-link mt-3" onClick={() => setStage('request')}>
              Send a new code
            </button>
          </form>
        </div>
        <div className="card-foot"><Link href="/login">Back to sign in</Link></div>
      </div>
    )
  }

  return (
    <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
      <div className="card-head">
        <h1>Verify your email</h1>
        <p>Enter your email and we&apos;ll send you a verification code.</p>
      </div>
      <div className="card-body">
        {networkError && <Banner tone="danger" title="Network error">{networkError}</Banner>}
        {banners.map((b, i) => <Banner key={i} tone={b.tone} title={b.title}>{b.body}</Banner>)}
        <form onSubmit={submitRequest} noValidate>
          <Field label="Email" required htmlFor="ver-email" error={getInput(flow, 'email')?.errors?.[0]}>
            <input
              id="ver-email"
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
            {submitting ? <><span className="spinner" /> Sending…</> : 'Send verification code'}
          </button>
        </form>
      </div>
      <div className="card-foot"><Link href="/login">Back to sign in</Link></div>
    </div>
  )
}

export default function VerificationPage() {
  return (
    <Suspense fallback={<Loading />}>
      <VerificationPageContent />
    </Suspense>
  )
}
