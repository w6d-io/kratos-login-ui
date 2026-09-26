'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useBrandingReturnTo } from '@/components/ui/Branding'
import type { RecoveryFlow, UpdateRecoveryFlowBody } from '@ory/client'
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
import { RecoveryView } from '@/components/login/EmailCodeViews'

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
  useBrandingReturnTo(flow?.return_to)
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
      const r = (err as { response?: { status?: number; data?: { redirect_browser_to?: string } } })?.response
      const status = r?.status
      // Successful recovery answers 422 browser_location_change_required with
      // the privileged settings-flow URL — follow it or the user is stuck
      // re-submitting a code Kratos has already consumed.
      const redirect = r?.data?.redirect_browser_to
      if (status === 422 && redirect) { window.location.href = redirect; return }
      if (status === 400 || status === 422) fetchFlow(flow.id)
      else if (status === 410) window.location.href = initFlowUrl('recovery')
      else setNetworkError('Code rejected. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !flow) return <Loading />

  return (
    <RecoveryView
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

export default function RecoveryPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RecoveryPageContent />
    </Suspense>
  )
}
