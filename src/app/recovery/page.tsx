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
import { flowContext, resolveKratosError } from '@/lib/flow-nav'
import { applyNav, errorNavOptions, rememberFlowOrigin } from '@/lib/flow-nav-browser'

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
  const urlReturnTo = searchParams.get('return_to') || ''
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
        // Recovery disabled: re-init would 404 again — say so instead.
        if (status === 404) {
          setNetworkError('Account recovery is not available on this instance.')
          setLoading(false)
          return
        }
        // 410 expired / 403 CSRF → restart (keeping return_to), guarded.
        const navigating = applyNav(resolveKratosError(err, errorNavOptions('recovery', urlReturnTo ? { returnTo: urlReturnTo } : {}, "Can't reach the server. Check your connection.")), {
          setFlow: () => undefined,
          refetch: () => setNetworkError("Can't reach the server. Check your connection."),
          setError: setNetworkError,
        })
        if (!navigating) setLoading(false)
      })
      .finally(() => { fetchingRef.current = false })
  }, [urlReturnTo])

  useEffect(() => {
    rememberFlowOrigin()
    if (!flowId) {
      window.location.href = initFlowUrl('recovery', urlReturnTo)
      return
    }
    fetchFlow(flowId)
  }, [flowId, urlReturnTo, fetchFlow])

  const banners = useMemo(() => extractFlowBanners(flow), [flow])

  /** Send (or re-send) the email on this flow; also the view's resend action. */
  const sendRequest = async () => {
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
      applyNav(resolveKratosError(err, errorNavOptions('recovery', flowContext(flow), 'Could not send recovery. Try again.')), {
        setFlow: () => fetchFlow(flow.id),
        refetch: () => fetchFlow(flow.id),
        setError: setNetworkError,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const submitRequest = (e: React.FormEvent) => {
    e.preventDefault()
    void sendRequest()
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
      if (handleContinueWith(data, flow.return_to)) return
      window.location.href = '/settings'
    } catch (err: unknown) {
      // Successful recovery answers 422 browser_location_change_required with
      // the privileged settings-flow URL — flow-nav follows it, or the user is
      // stuck re-submitting a code Kratos has already consumed.
      applyNav(resolveKratosError(err, errorNavOptions('recovery', flowContext(flow), 'Code rejected. Try again.')), {
        setFlow: () => fetchFlow(flow.id),
        refetch: () => fetchFlow(flow.id),
        setError: setNetworkError,
      })
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
      onResend={sendRequest}
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
