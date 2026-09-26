'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useBrandingReturnTo } from '@/components/ui/Branding'
import type { LoginFlow, UpdateLoginFlowBody } from '@ory/client'
import { initFlowUrl } from '@/lib/ory'
import { Loading } from '@/components/Loading'
import { createBrowserClient } from '@/lib/kratos'
import { config, isReturnUrlAllowed } from '@/lib/config'
import {
  getCsrfToken,
  getInput,
  getOidcProviders,
  hasGroup,
  availableMethods,
  handleContinueWith,
} from '@/lib/kratos-flow'
import { extractFlowBanners, detectUrlBanner } from '@/lib/flow-messages'
import { CodeView, LookupView, PasswordView, TotpView, WebAuthnView, type LoginStep } from '@/components/login/LoginViews'

type Step = LoginStep

function LoginPageContent() {
  const [flow, setFlow] = useState<LoginFlow | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('password')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [totp, setTotp] = useState('')
  const [lookup, setLookup] = useState('')
  const [remember, setRemember] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  useBrandingReturnTo(flow?.return_to)
  const flowId = searchParams.get('flow')
  const returnTo = searchParams.get('return_to') || ''
  // refresh=true / aal=aal2 must round-trip into the Kratos init endpoint.
  // Lost on the first redirect (init without these), Kratos serves a stale
  // session and the next sensitive call 403s again, looping the user back
  // to /login without ever forcing re-auth.
  const refresh = searchParams.get('refresh') === 'true'
  const aalParam = searchParams.get('aal')
  const aal: 'aal1' | 'aal2' | undefined =
    aalParam === 'aal1' ? 'aal1' : aalParam === 'aal2' ? 'aal2' : undefined
  const fetchingRef = useRef(false)

  const fetchFlow = useCallback((id: string) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    const kratos = createBrowserClient()
    kratos
      .getLoginFlow({ id })
      .then(({ data }) => {
        setFlow(data)
        // Pre-fill identifier from existing input value (Kratos echoes it on validation errors).
        const idIn = getInput(data, 'identifier') || getInput(data, 'password_identifier')
        if (idIn?.value) setIdentifier(idIn.value)
        // Default to TOTP/passkey/lookup step if password group is gone (second-factor).
        // If password is absent and only `code` is offered, this is passwordless email sign-in.
        if (!hasGroup(data, 'password') && hasGroup(data, 'totp')) setStep('totp')
        else if (!hasGroup(data, 'password') && hasGroup(data, 'webauthn')) setStep('webauthn')
        else if (!hasGroup(data, 'password') && hasGroup(data, 'lookup_secret')) setStep('lookup_secret')
        // Passkey renders on the default card — don't collapse a
        // passkey+code flow into the code-only step.
        else if (!hasGroup(data, 'password') && !hasGroup(data, 'passkey') && hasGroup(data, 'code')) setStep('code')
        else setStep('password')
        setLoading(false)
        setNetworkError(null)
      })
      .catch((err) => {
        const status = err?.response?.status
        if (status === 403 || status === 404 || status === 410) {
          window.location.href = initFlowUrl('login', returnTo, { refresh, aal })
          return
        }
        setNetworkError("Can't reach the server. Check your connection and try again.")
        setLoading(false)
      })
      .finally(() => { fetchingRef.current = false })
  }, [returnTo, refresh, aal])

  useEffect(() => {
    if (!flowId) {
      // Probe whoami before init. If a Kratos session already exists at
      // any AAL, a vanilla `/self-service/login/browser` 303s straight to
      // return_to. That return_to then 403s on whoami with
      // session_aal2_required and bounces us right back, never showing a
      // TOTP prompt. Force aal=aal2 in that case so Kratos creates a
      // step-up flow. The session cookie is httpOnly so we can't read it
      // directly — toSession is the only reliable signal.
      void (async () => {
        let needsStepUp = false
        try {
          await createBrowserClient().toSession()
          // 200 = the session already satisfies Kratos' required AAL. Forcing
          // aal2 here would hand an identity with NO second factor a dead-end
          // flow (zero method groups). Unless the caller explicitly asked for
          // re-auth (refresh/aal params), just bounce to the destination.
          if (!refresh && !aal) {
            let target = returnTo && isReturnUrlAllowed(returnTo) ? returnTo : config.defaultReturnUrl
            // A default that points back at this UI's own root or /login
            // would loop (the root route redirects to /login) — land the
            // already-signed-in user on /settings instead.
            try {
              const u = new URL(target, window.location.origin)
              if (u.origin === window.location.origin && (u.pathname === '/' || u.pathname === '/login')) {
                target = '/settings'
              }
            } catch {
              target = '/settings'
            }
            window.location.href = target
            return
          }
        } catch (e) {
          // 403 session_aal2_required = the identity HAS a second factor and
          // the session is aal1 — this is the genuine step-up case.
          const r = (e as { response?: { status?: number; data?: { error?: { id?: string } } } })?.response
          if (r?.status === 403 && r?.data?.error?.id === 'session_aal2_required') needsStepUp = true
        }
        const opts: { refresh: boolean; aal?: 'aal1' | 'aal2' } = needsStepUp
          ? { refresh, aal: 'aal2' }
          : { refresh, aal }
        window.location.href = initFlowUrl('login', returnTo, opts)
      })()
      return
    }
    fetchFlow(flowId)
  }, [flowId, returnTo, refresh, aal, fetchFlow])

  const banners = useMemo(() => {
    const list = extractFlowBanners(flow)
    const url = detectUrlBanner(new URLSearchParams(searchParams.toString()))
    if (url) list.unshift(url)
    return list
  }, [flow, searchParams])

  const oidc = useMemo(() => getOidcProviders(flow), [flow])
  const methods = useMemo(() => availableMethods(flow), [flow])

  const onSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!flow) return
    setSubmitting(true)
    setNetworkError(null)
    try {
      const body: UpdateLoginFlowBody = {
        method: 'password',
        identifier,
        password,
        csrf_token: getCsrfToken(flow),
      }
      const { data } = await createBrowserClient().updateLoginFlow({ flow: flow.id, updateLoginFlowBody: body })
      // Kratos returns 200 with session on success, or 422 with new flow if more steps required.
      // Browser flow uses set-cookie + redirect; we follow returnTo if set.
      if (handleContinueWith(data, returnTo)) return
      // Flow was updated (e.g. errors); re-fetch to render messages.
      fetchFlow(flow.id)
    } catch (err: unknown) {
      const r = (err as { response?: { status?: number; data?: { error?: { id?: string }; redirect_browser_to?: string } } })?.response
      const status = r?.status
      // Kratos 422 with ory-error-id=browser_location_change_required tells
      // us "this flow needs a different one — go here". Used after password
      // succeeds to step up into the aal2 flow (TOTP). Without honoring it
      // the user keeps re-POSTing password against a flow Kratos has
      // already moved past.
      const redirect = r?.data?.redirect_browser_to
      if (status === 422 && redirect) {
        window.location.href = redirect
        return
      }
      if (status === 400 || status === 422) {
        // Validation errors — re-fetch flow to read updated messages.
        fetchFlow(flow.id)
      } else if (status === 410) {
        window.location.href = initFlowUrl('login', returnTo, { refresh, aal })
      } else {
        setNetworkError("Sign-in failed. Please try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const onSubmitCodeRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!flow) return
    setSubmitting(true)
    setNetworkError(null)
    try {
      const { data } = await createBrowserClient().updateLoginFlow({
        flow: flow.id,
        updateLoginFlowBody: {
          method: 'code',
          identifier,
          csrf_token: getCsrfToken(flow),
        } as UpdateLoginFlowBody,
      })
      if (handleContinueWith(data, returnTo)) return
      fetchFlow(flow.id)
    } catch (err: unknown) {
      const r = (err as { response?: { status?: number; data?: { redirect_browser_to?: string } } })?.response
      const status = r?.status
      const redirect = r?.data?.redirect_browser_to
      if (status === 422 && redirect) { window.location.href = redirect; return }
      if (status === 400 || status === 422) fetchFlow(flow.id)
      else if (status === 410) window.location.href = initFlowUrl('login', returnTo, { refresh, aal })
      else setNetworkError('Could not send sign-in code. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const onSubmitCodeVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!flow) return
    setSubmitting(true)
    setNetworkError(null)
    try {
      // Kratos's login code method requires `identifier` on every submit —
      // unlike verification/recovery, where it's only needed for the request
      // step. Without it the verify POST returns 400 "Property identifier is
      // missing". We hang onto the value from the request stage in React
      // state; on `sent_email` Kratos re-emits the identifier node as a
      // hidden input with an empty value, so we can't recover it from the flow.
      const idValue = identifier || getInput(flow, 'identifier')?.value || ''
      const { data } = await createBrowserClient().updateLoginFlow({
        flow: flow.id,
        updateLoginFlowBody: {
          method: 'code',
          identifier: idValue,
          code,
          csrf_token: getCsrfToken(flow),
        } as UpdateLoginFlowBody,
      })
      if (handleContinueWith(data, returnTo)) return
      fetchFlow(flow.id)
    } catch (err: unknown) {
      const r = (err as { response?: { status?: number; data?: { redirect_browser_to?: string } } })?.response
      const status = r?.status
      const redirect = r?.data?.redirect_browser_to
      if (status === 422 && redirect) { window.location.href = redirect; return }
      if (status === 400 || status === 422) fetchFlow(flow.id)
      else if (status === 410) window.location.href = initFlowUrl('login', returnTo, { refresh, aal })
      else setNetworkError('Code rejected. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const onSubmitOidc = (provider: string) => {
    if (!flow) return
    // OIDC submission requires a real <form> POST so the browser can follow the
    // 303 to the provider. Build and submit a hidden form.
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

  const onSubmitTotp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!flow) return
    setSubmitting(true)
    setNetworkError(null)
    try {
      const { data } = await createBrowserClient().updateLoginFlow({
        flow: flow.id,
        updateLoginFlowBody: {
          method: 'totp',
          totp_code: totp,
          csrf_token: getCsrfToken(flow),
        } as UpdateLoginFlowBody,
      })
      if (handleContinueWith(data, returnTo)) return
      fetchFlow(flow.id)
    } catch (err: unknown) {
      const r = (err as { response?: { status?: number; data?: { redirect_browser_to?: string } } })?.response
      const status = r?.status
      const redirect = r?.data?.redirect_browser_to
      if (status === 422 && redirect) { window.location.href = redirect; return }
      if (status === 400 || status === 422) fetchFlow(flow.id)
      else setNetworkError('Verification failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const onSubmitLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!flow) return
    setSubmitting(true)
    setNetworkError(null)
    try {
      const { data } = await createBrowserClient().updateLoginFlow({
        flow: flow.id,
        updateLoginFlowBody: {
          method: 'lookup_secret',
          lookup_secret: lookup,
          csrf_token: getCsrfToken(flow),
        } as UpdateLoginFlowBody,
      })
      if (handleContinueWith(data, returnTo)) return
      fetchFlow(flow.id)
    } catch (err: unknown) {
      const r = (err as { response?: { status?: number; data?: { redirect_browser_to?: string } } })?.response
      const status = r?.status
      const redirect = r?.data?.redirect_browser_to
      if (status === 422 && redirect) { window.location.href = redirect; return }
      if (status === 400 || status === 422) fetchFlow(flow.id)
      else setNetworkError('Backup code rejected. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !flow) return <Loading />

  const idField = getInput(flow, 'identifier') || getInput(flow, 'password_identifier')
  const common = { flow, banners, networkError, submitting, setStep }

  if (step === 'webauthn') return <WebAuthnView {...common} methods={methods} returnTo={returnTo} />

  // Code-based passwordless login. Two sub-stages, derived from flow state:
  // after Kratos sends the email it adds a `code` input node, so a refresh on
  // the verify page still shows the code form.
  if (step === 'code') {
    return (
      <CodeView
        {...common}
        identifier={identifier}
        setIdentifier={setIdentifier}
        code={code}
        setCode={setCode}
        methods={methods}
        onSubmitCodeRequest={onSubmitCodeRequest}
        onSubmitCodeVerify={onSubmitCodeVerify}
        onResend={() => { window.location.href = initFlowUrl('login', returnTo, { refresh, aal }) }}
        onChangeEmail={() => { window.location.href = initFlowUrl('login', returnTo, { refresh, aal }) }}
      />
    )
  }

  if (step === 'totp') {
    return <TotpView {...common} totp={totp} setTotp={setTotp} methods={methods} returnTo={returnTo} onSubmitTotp={onSubmitTotp} />
  }

  if (step === 'lookup_secret') {
    return <LookupView {...common} lookup={lookup} setLookup={setLookup} methods={methods} returnTo={returnTo} onSubmitLookup={onSubmitLookup} />
  }

  // Default: password + OIDC + passkey.
  // Refresh mode = Kratos asked us to re-confirm an existing session before
  // a sensitive op (TOTP enroll, password change, ...). Identity is already
  // known, so collapse the UI to a password-only confirm. Gate on a known
  // identifier — if the cookie was deleted server-side we'd render the
  // compact form with an empty account chip; the full sign-in UI is the
  // safer default.
  const knownIdentifier = identifier || idField?.value || ''
  const refreshing = (refresh || flow?.refresh === true) && Boolean(knownIdentifier)
  return (
    <PasswordView
      {...common}
      identifier={identifier}
      setIdentifier={setIdentifier}
      password={password}
      setPassword={setPassword}
      refreshing={refreshing}
      knownIdentifier={knownIdentifier}
      oidc={oidc}
      methods={methods}
      returnTo={returnTo}
      onSubmitPassword={onSubmitPassword}
      onSubmitOidc={onSubmitOidc}
    />
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LoginPageContent />
    </Suspense>
  )
}
