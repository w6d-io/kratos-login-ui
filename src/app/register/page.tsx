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
  registrationTraitFields,
} from '@/lib/kratos-flow'
import { extractFlowBanners } from '@/lib/flow-messages'
import { RegisterView, SignUpClosedView } from '@/components/login/RegisterView'
import { flowContext, resolveKratosError } from '@/lib/flow-nav'
import { applyNav, errorNavOptions, rememberFlowDestination, rememberFlowOrigin } from '@/lib/flow-nav-browser'
import { signInUrl } from '@/lib/access'
import { useBotCheck, useSignInProtection } from '@/components/ui/BotCheck'
import { captchaHeaders, isTokenRefusal, DEFAULT_PROTECTED_TRAITS, isProtectedTrait, signUpLimitText } from '@/lib/sign-in-protection'
import { offeredSignUpMethods, parseSignUpMethods, type SignUpMethod } from '@/lib/sign-up-methods'

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
  const email = traits['traits.email'] ?? ''
  const bot = useBotCheck('registration', protection, { flowId: flow?.id, address: email })
  // Traits only an administrator sets (the gateway forwards them to apps): never asked, never sent.
  const protectedTraits = protection?.protectedTraits ?? DEFAULT_PROTECTED_TRAITS
  // What the identity schema lets Kratos offer — the details step says what comes next.
  const [schemaMethods, setSchemaMethods] = useState<SignUpMethod[] | null>(null)
  useEffect(() => {
    let live = true
    fetch('/api/sign-up-methods', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (live) setSchemaMethods(parseSignUpMethods(body)) })
      .catch(() => {})
    return () => { live = false }
  }, [])

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
  const traitFields = useMemo(() => registrationTraitFields(flow, (name) => isProtectedTrait(name, protectedTraits)), [flow, protectedTraits])
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
  const offered = useMemo(() => offeredSignUpMethods(flow), [flow])

  /** `traits.name.first` → { name: { first } }, as Kratos wants them in a submit body. */
  const traitsBody = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(traits)) {
      if (!k.startsWith('traits.') || isProtectedTrait(k, protectedTraits)) continue
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
  const submitCode = async (body: Record<string, unknown>, failMessage: string, token: string | null) => {
    if (!flow) return
    setSubmitting(true)
    setNetworkError(null)
    try {
      const { data } = await createBrowserClient().updateRegistrationFlow({
        flow: flow.id,
        updateRegistrationFlowBody: { method: 'code', traits: traitsBody(), csrf_token: getCsrfToken(flow), ...body } as unknown as UpdateRegistrationFlowBody,
      }, captchaHeaders(token))
      if (handleContinueWith(data, flow.return_to || returnTo)) return
      fetchFlow(flow.id)
    } catch (err: unknown) {
      if (isTokenRefusal(err)) bot.reset()
      applyNav(resolveKratosError(err, errorNavOptions('registration', flowContext(flow), failMessage)), {
        setFlow: () => fetchFlow(flow.id),
        refetch: () => fetchFlow(flow.id),
        setError: setNetworkError,
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Sending the code creates nothing, so no Kratos hook runs: the gateway checks the flow's token
  // (X-Captcha-Token) before Kratos emails it. Its pass covers one email: a resend needs a new token.
  const onSendCode = () => submitCode({}, 'Could not send the code. Try again.', bot.use(email))
  const onResendCode = async () => submitCode({ resend: 'code' }, 'Could not send a new code. Try again.', await bot.fresh())

  // After the details step: when the next one only offers an email code, send it straight away
  // rather than show a one-button "choice". Otherwise (or on any doubt) show the step as it is.
  const afterDetails = async (id: string) => {
    try {
      const { data } = await createBrowserClient().getRegistrationFlow({ id })
      const next = offeredSignUpMethods(data)
      const refused = (data.ui?.messages ?? []).some((m) => m.type === 'error')
      if (next?.length === 1 && next[0] === 'code' && registrationCodeStage(data) === 'send' && getOidcProviders(data).length === 0 && !refused) {
        await onSendCode()
        return
      }
    } catch { /* show the flow as it is */ }
    fetchFlow(id)
  }

  // Typing the code creates the account: Kratos hands this submit to jinbe's hook, which checks the token.
  const onSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = bot.use(email)
    try {
      await submitCode({ code, ...(token ? { transient_payload: { captcha_token: token } } : {}) }, 'Code rejected. Please try again.', token)
    } finally {
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
      // The same token goes with the details step and every step after it (the gateway checks each
      // submit of the flow); in code-only sign-up the next one emails the code.
      const token = bot.use(email)
      const body = (hasPassword
        ? { method: 'password', password, traits: traitsObj, csrf_token: getCsrfToken(flow), ...(token ? { transient_payload: { captcha_token: token } } : {}) }
        : { method: 'profile', traits: traitsObj, csrf_token: getCsrfToken(flow) }
      ) as unknown as UpdateRegistrationFlowBody

      const { data } = await createBrowserClient().updateRegistrationFlow({ flow: flow.id, updateRegistrationFlowBody: body }, captchaHeaders(token))
      if (handleContinueWith(data, flow.return_to || returnTo)) return
      if (hasPassword) fetchFlow(flow.id)
      else void afterDetails(flow.id)
    } catch (err: unknown) {
      // 422 browser_location_change_required = registration succeeded and
      // Kratos wants the browser elsewhere (e.g. verification) — follow it.
      // The details step "fails" into the next one: Kratos answers it with a 400 and the flow.
      if (isTokenRefusal(err)) bot.reset()
      applyNav(resolveKratosError(err, errorNavOptions('registration', flowContext(flow), 'Sign-up failed. Please try again.')), {
        setFlow: () => (hasPassword ? fetchFlow(flow.id) : void afterDetails(flow.id)),
        refetch: () => fetchFlow(flow.id),
        setError: setNetworkError,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const onSubmitOidc = (provider: string) => {
    if (!flow) return
    // A checked flow needs the token in a header, which a form POST cannot carry: submit it as JSON,
    // and Kratos answers 422 browser_location_change_required to the provider (flow-nav follows it).
    const token = bot.use()
    if (token) {
      const body = { method: 'oidc', provider, csrf_token: getCsrfToken(flow), transient_payload: { captcha_token: token } } as unknown as UpdateRegistrationFlowBody
      createBrowserClient().updateRegistrationFlow({ flow: flow.id, updateRegistrationFlowBody: body }, captchaHeaders(token)).catch((err: unknown) => {
        if (isTokenRefusal(err)) bot.reset()
        applyNav(resolveKratosError(err, errorNavOptions('registration', flowContext(flow), 'Could not start the sign-up. Please try again.')), {
          setFlow: () => fetchFlow(flow.id),
          refetch: () => fetchFlow(flow.id),
          setError: setNetworkError,
        })
      })
      return
    }
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
      upcoming={offered ?? schemaMethods}
      returnTo={returnTo}
      signInHref={signInUrl(flow?.return_to || returnTo || null)}
      onSubmit={onSubmit}
      onSubmitOidc={onSubmitOidc}
      // Every step: the details one (its token emails the code in code-only sign-up), the choice of
      // credential (password or "email me a code"), and the code step (resend, then create).
      botCheck={bot.widget}
      botCheckPending={bot.pending}
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
