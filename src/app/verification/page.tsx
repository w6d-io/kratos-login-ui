'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useBrandingReturnTo } from '@/components/ui/Branding'
import type { VerificationFlow, UpdateVerificationFlowBody } from '@ory/client'
import { initFlowUrl } from '@/lib/ory'
import { Loading } from '@/components/Loading'
import { createBrowserClient } from '@/lib/kratos'
import {
  getCsrfToken,
  getInput,
  hasGroup,
  handleContinueWith,
} from '@/lib/kratos-flow'
import { extractFlowBanners } from '@/lib/flow-messages'
import { VerificationView } from '@/components/login/EmailCodeViews'

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
  useBrandingReturnTo(flow?.return_to)
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
      const r = (err as { response?: { status?: number; data?: { redirect_browser_to?: string } } })?.response
      const status = r?.status
      // 422 browser_location_change_required = verification done, follow Kratos.
      const redirect = r?.data?.redirect_browser_to
      if (status === 422 && redirect) { window.location.href = redirect; return }
      if (status === 400 || status === 422) fetchFlow(flow.id)
      else if (status === 410) window.location.href = initFlowUrl('verification')
      else setNetworkError('Code rejected. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !flow) return <Loading />

  return (
    <VerificationView
      flow={flow}
      stage={stage}
      banners={banners}
      networkError={networkError}
      submitting={submitting}
      email={email}
      setEmail={setEmail}
      code={code}
      setCode={setCode}
      onSubmitRequest={submitRequest}
      onSubmitCode={submitCode}
      onChangeEmail={() => { setCode(''); setStage('request') }}
      onResend={() => submitRequest({ preventDefault: () => {} } as React.FormEvent)}
    />
  )
}

export default function VerificationPage() {
  return (
    <Suspense fallback={<Loading />}>
      <VerificationPageContent />
    </Suspense>
  )
}
