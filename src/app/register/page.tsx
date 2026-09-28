'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useBrandingReturnTo } from '@/components/ui/Branding'
import type { RegistrationFlow, UpdateRegistrationFlowBody } from '@ory/client'
import { initFlowUrl } from '@/lib/ory'
import { Loading } from '@/components/Loading'
import { createBrowserClient } from '@/lib/kratos'
import {
  getCsrfToken,
  getInputs,
  getOidcProviders,
  hasGroup,
  handleContinueWith,
  registrationCodeStage,
} from '@/lib/kratos-flow'
import { extractFlowBanners } from '@/lib/flow-messages'
import { RegisterView, SignUpClosedView } from '@/components/login/RegisterView'
import { flowContext, resolveKratosError } from '@/lib/flow-nav'
import { applyNav, errorNavOptions, rememberFlowDestination, rememberFlowOrigin } from '@/lib/flow-nav-browser'
import { signInUrl } from '@/lib/access'
import { useBotCheck, useSignInProtection } from '@/components/ui/BotCheck'
import { signUpLimitText } from '@/lib/sign-in-protection'

function RegisterPageContent() {
  const [flow, setFlow] = useState<RegistrationFlow | null>(null)
  const [loading, setLoading] = useState(true)
  const [traits, setTraits] = useState<Record<string, string>>({})
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  useBrandingReturnTo(flow?.return_to)
  const flowId = searchParams.get('flow')
  const returnTo = searchParams.get('return_to') || ''
  const fetchingRef = useRef(false)
  const protection = useSignInProtection()
  const bot = useBotCheck('registration', protection)

  const fetchFlow = useCallback((id: string) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    createBrowserClient()
      .getRegistrationFlow({ id })
      .then(({ data }) => {
        setFlow(data)
        rememberFlowDestination(data.return_to)
        // Pre-fill traits from existing values (Kratos echoes them on validation errors).
        const tr: Record<string, string> = {}
        for (const f of getInputs(data, 'profile')) {
          if (f.name.startsWith('traits.')) tr[f.name] = f.value
        }
        // The code step echoes them in `default`/`code` only; its submits must carry them again.
        for (const g of ['password', 'default', 'code']) {
          for (const f of getInputs(data, g)) {
            if (f.name.startsWith('traits.') && f.value) tr[f.name] = f.value
          }
        }
        setTraits((prev) => ({ ...prev, ...tr }))
        setLoading(false)
        setNetworkError(null)
      })
      .catch((err) => {
        const navigating = applyNav(resolveKratosError(err, errorNavOptions('registration', returnTo ? { returnTo } : {}, "Can't reach the server. Check your connection and try again.")), {
          setFlow: () => undefined,
          refetch: () => setNetworkError("Can't reach the server. Check your connection and try again."),
          setError: setNetworkError,
        })
        if (!navigating) setLoading(false)
      })
      .finally(() => { fetchingRef.current = false })
  }, [returnTo])

  useEffect(() => {
    rememberFlowOrigin()
    rememberFlowDestination(returnTo)
    if (!flowId) {
      window.location.href = initFlowUrl('registration', returnTo)
      return
    }
    fetchFlow(flowId)
  }, [flowId, returnTo, fetchFlow])

  const banners = useMemo(() => extractFlowBanners(flow), [flow])
  const oidc = useMemo(() => getOidcProviders(flow), [flow])
  const traitFields = useMemo(() => {
    if (!flow) return []
    // Kratos v26 puts trait inputs in `default`, `profile`, or `password`
    // groups depending on flow style. Scan all and dedupe by name.
    const map = new Map<string, ReturnType<typeof getInputs>[number]>()
    for (const g of ['default', 'profile', 'password']) {
      for (const f of getInputs(flow, g)) {
        if (f.name.startsWith('traits.') && !map.has(f.name)) map.set(f.name, f)
      }
    }
    return Array.from(map.values())
  }, [flow])
  // Detect available submit method: prefer password, fall back to profile
  // (multi-step flow — first click captures traits, server returns password fields).
  const hasPassword = useMemo(() => hasGroup(flow, 'password'), [flow])
  const hasProfileStep = useMemo(() => {
    if (!flow) return false
    return (flow.ui?.nodes ?? []).some((n) => {
      const attrs = (n.attributes as { name?: string; type?: string })
      return n.group === 'profile' && attrs.name === 'method' && attrs.type === 'submit'
    })
  }, [flow])

  const codeStage = useMemo(() => registrationCodeStage(flow), [flow])

  /** `traits.name.first` → { name: { first } }, as Kratos wants them in a submit body. */
  const traitsBody = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(traits)) {
      if (!k.startsWith('traits.')) continue
      const path = k.slice('traits.'.length).split('.')
      let cur = out
      for (let i = 0; i < path.length - 1; i++) {
        cur[path[i]] = (cur[path[i]] as Record<string, unknown>) || {}
        cur = cur[path[i]] as Record<string, unknown>
      }
      cur[path[path.length - 1]] = v
    }
    return out
  }

  /** One email-code submit; Kratos answers "code sent" as a 400 with the flow, which refetches it. */
  const submitCode = async (body: Record<string, unknown>, failMessage: string) => {
    if (!flow) return
    setSubmitting(true)
    setNetworkError(null)
    try {
      const { data } = await createBrowserClient().updateRegistrationFlow({
        flow: flow.id,
        updateRegistrationFlowBody: { method: 'code', traits: traitsBody(), csrf_token: getCsrfToken(flow), ...body } as unknown as UpdateRegistrationFlowBody,
      })
      if (handleContinueWith(data, flow.return_to || returnTo)) return
      fetchFlow(flow.id)
    } catch (err: unknown) {
      applyNav(resolveKratosError(err, errorNavOptions('registration', flowContext(flow), failMessage)), {
        setFlow: () => fetchFlow(flow.id),
        refetch: () => fetchFlow(flow.id),
        setError: setNetworkError,
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Sending and resending the code create nothing, so no hook runs and no token is spent there.
  const onSendCode = () => submitCode({}, 'Could not send the code. Try again.')
  const onResendCode = () => submitCode({ resend: 'code' }, 'Could not send a new code. Try again.')

  // Typing the code creates the account: Kratos hands this submit to jinbe's hook, which checks the token.
  const onSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = bot.widget ? bot.token : null
    try {
      await submitCode({ code, ...(token ? { transient_payload: { captcha_token: token } } : {}) }, 'Code rejected. Please try again.')
    } finally {
      if (bot.widget) bot.reset()
      setCode('')
    }
  }

  const setTrait = (name: string, value: string) => setTraits((p) => ({ ...p, [name]: value }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!flow) return
    setSubmitting(true)
    setNetworkError(null)
    try {
      const traitsObj = traitsBody()

      // If the flow already has a password group, submit method=password directly
      // with traits + password. Otherwise submit method=profile to advance Kratos
      // to the next step (which adds password inputs to the flow).
      // The bot-check token rides in transient_payload: Kratos hands it to jinbe's interrupting
      // hook before the account is stored, and never persists it.
      const body = (hasPassword
        ? { method: 'password', password, traits: traitsObj, csrf_token: getCsrfToken(flow), ...(bot.token ? { transient_payload: { captcha_token: bot.token } } : {}) }
        : { method: 'profile', traits: traitsObj, csrf_token: getCsrfToken(flow) }
      ) as unknown as UpdateRegistrationFlowBody

      const { data } = await createBrowserClient().updateRegistrationFlow({ flow: flow.id, updateRegistrationFlowBody: body })
      if (handleContinueWith(data, flow.return_to || returnTo)) return
      fetchFlow(flow.id)
    } catch (err: unknown) {
      // 422 browser_location_change_required = registration succeeded and
      // Kratos wants the browser elsewhere (e.g. verification) — follow it.
      applyNav(resolveKratosError(err, errorNavOptions('registration', flowContext(flow), 'Sign-up failed. Please try again.')), {
        setFlow: () => fetchFlow(flow.id),
        refetch: () => fetchFlow(flow.id),
        setError: setNetworkError,
      })
    } finally {
      setSubmitting(false)
      // One token, one submit.
      if (hasPassword && bot.widget) bot.reset()
    }
  }

  const onSubmitOidc = (provider: string) => {
    if (!flow) return
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = flow.ui.action
    const csrf = getCsrfToken(flow)
    if (csrf) {
      const i = document.createElement('input')
      i.type = 'hidden'; i.name = 'csrf_token'; i.value = csrf
      form.appendChild(i)
    }
    const m = document.createElement('input')
    m.type = 'hidden'; m.name = 'method'; m.value = 'oidc'
    form.appendChild(m)
    const p = document.createElement('input')
    p.type = 'hidden'; p.name = 'provider'; p.value = provider
    form.appendChild(p)
    document.body.appendChild(form)
    form.submit()
  }

  if (protection?.registration.mode === 'closed') {
    return <SignUpClosedView message={signUpLimitText(protection) ?? ''} signInHref={signInUrl(flow?.return_to || returnTo || null)} />
  }

  if (loading || !flow) return <Loading />

  return (
    <RegisterView
      flow={flow}
      banners={banners}
      networkError={networkError}
      submitting={submitting}
      oidc={oidc}
      traitFields={traitFields}
      traits={traits}
      setTrait={setTrait}
      password={password}
      setPassword={setPassword}
      accepted={accepted}
      setAccepted={setAccepted}
      hasPassword={hasPassword}
      hasProfileStep={hasProfileStep}
      hasPasskey={hasGroup(flow, 'passkey')}
      returnTo={returnTo}
      signInHref={signInUrl(flow?.return_to || returnTo || null)}
      onSubmit={onSubmit}
      onSubmitOidc={onSubmitOidc}
      botCheck={hasPassword || codeStage === 'enter' ? bot.widget : null}
      botCheckPending={(hasPassword || codeStage === 'enter') && bot.pending}
      codeStage={codeStage}
      code={code}
      setCode={setCode}
      onSendCode={onSendCode}
      onSubmitCode={onSubmitCode}
      onResendCode={onResendCode}
      signUpLimit={protection ? signUpLimitText(protection) : null}
    />
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RegisterPageContent />
    </Suspense>
  )
}
