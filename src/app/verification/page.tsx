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
import { flowContext, landingUrl, resolveKratosError } from '@/lib/flow-nav'
import { useBotCheck, useSignInProtection } from '@/components/ui/BotCheck'
import { captchaHeaders } from '@/lib/sign-in-protection'
import { applyNav, errorNavOptions, rememberFlowOrigin } from '@/lib/flow-nav-browser'

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
  const urlReturnTo = searchParams.get('return_to') || ''
  const fetchingRef = useRef(false)
  const protection = useSignInProtection()
  const bot = useBotCheck('verification', protection)

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
        // Verification disabled: re-init would 404 again — say so instead.
        if (status === 404) {
          setNetworkError('Email verification is not available on this instance.')
          setLoading(false)
          return
        }
        const navigating = applyNav(resolveKratosError(err, errorNavOptions('verification', urlReturnTo ? { returnTo: urlReturnTo } : {}, "Can't reach the server. Check your connection.")), {
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
      window.location.href = initFlowUrl('verification', urlReturnTo)
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
      const body = { method, email, csrf_token: getCsrfToken(flow) } as UpdateVerificationFlowBody
      // No Kratos hook runs when the email is sent: the gateway checks this token (X-Captcha-Token)
      // with the provider before Kratos acts. One token per email, so a fresh one is asked after.
      await createBrowserClient().updateVerificationFlow({ flow: flow.id, updateVerificationFlowBody: body }, captchaHeaders(bot.take()))
      fetchFlow(flow.id)
    } catch (err: unknown) {
      applyNav(resolveKratosError(err, errorNavOptions('verification', flowContext(flow), 'Could not send verification. Try again.')), {
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
      const { data } = await createBrowserClient().updateVerificationFlow({
        flow: flow.id,
        updateVerificationFlowBody: { method: 'code', code, csrf_token: getCsrfToken(flow) } as UpdateVerificationFlowBody,
      })
      if (handleContinueWith(data, flow.return_to)) return
      fetchFlow(flow.id)
    } catch (err: unknown) {
      // 422 browser_location_change_required = verification done, follow Kratos.
      applyNav(resolveKratosError(err, errorNavOptions('verification', flowContext(flow), 'Code rejected. Try again.')), {
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
    <VerificationView
      flow={flow}
      continueUrl={landingUrl(flow.return_to, window.location.origin)}
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
      botCheck={bot.widget}
      botCheckPending={bot.pending}
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
