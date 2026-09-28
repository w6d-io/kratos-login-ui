'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useBrandingReturnTo } from '@/components/ui/Branding'
import type { LoginFlow, Session, UpdateLoginFlowBody } from '@ory/client'
import { initFlowUrl } from '@/lib/ory'
import { Loading } from '@/components/Loading'
import { createBrowserClient } from '@/lib/kratos'
import { config } from '@/lib/config'
import {
  flowContext,
  landingUrl,
  recallFlowContext,
  rememberFlowContext,
  resolveKratosError,
  safeReturnTo,
  secondFactorGroups,
  type FlowContext,
} from '@/lib/flow-nav'
import { applyNav, errorNavOptions, rememberFlowDestination, rememberFlowOrigin, sessionStore } from '@/lib/flow-nav-browser'
import { signInUrl, switchAccountUrl } from '@/lib/access'
import {
  getCsrfToken,
  getInput,
  getOidcProviders,
  getTriggerButton,
  hasGroup,
  availableMethods,
  handleContinueWith,
} from '@/lib/kratos-flow'
import { extractFlowBanners, detectUrlBanner } from '@/lib/flow-messages'
import { useBotCheck, useSignInProtection } from '@/components/ui/BotCheck'
import { captchaHeaders, isTokenRefusal } from '@/lib/sign-in-protection'
import { CodeView, LookupView, PasswordView, TotpView, WebAuthnView, type LoginStep } from '@/components/login/LoginViews'

type Step = LoginStep

function LoginPageContent() {
  const [flow, setFlowState] = useState<LoginFlow | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('password')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [totp, setTotp] = useState('')
  const [lookup, setLookup] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  useBrandingReturnTo(flow?.return_to)
  const flowId = searchParams.get('flow')
  // refresh=true / aal=aal2 must round-trip into the Kratos init endpoint.
  // Lost on the first redirect (init without these), Kratos serves a stale
  // session and the next sensitive call 403s again, looping the user back
  // to /login without ever forcing re-auth.
  const urlReturnTo = searchParams.get('return_to') || ''
  const refresh = searchParams.get('refresh') === 'true'
  const aalParam = searchParams.get('aal')
  const aal: 'aal1' | 'aal2' | undefined =
    aalParam === 'aal1' ? 'aal1' : aalParam === 'aal2' ? 'aal2' : undefined
  // Kratos lands us on /login?flow=<id> only: return_to / aal / refresh live
  // on the flow. Restarts and links read them from there (or from what we
  // remembered for this flow id when a 410 leaves us without a body).
  const urlCtx = useMemo<FlowContext>(() => ({
    ...(urlReturnTo ? { returnTo: urlReturnTo } : {}),
    ...(aal === 'aal2' ? { aal } : {}),
    ...(refresh ? { refresh } : {}),
  }), [urlReturnTo, aal, refresh])
  const flowRef = useRef<LoginFlow | null>(null)
  const currentCtx = useCallback((): FlowContext => (
    flowRef.current ? flowContext(flowRef.current) : { ...urlCtx, ...recallFlowContext(flowId, sessionStore()) }
  ), [urlCtx, flowId])
  const returnTo = flow ? (flow.return_to || '') : urlReturnTo
  const fetchingRef = useRef(false)
  const protection = useSignInProtection()
  // A second factor or a re-auth (a session is present) is not where bots get in: no check there.
  const firstFactor = !!flow && flow.requested_aal !== 'aal2' && !flow.refresh
  const bot = useBotCheck('login', protection, { flowId: flow?.id, address: identifier, enabled: firstFactor })

  const showFlow = useCallback((data: LoginFlow) => {
    rememberFlowContext(data.id, flowContext(data), sessionStore())
    rememberFlowDestination(data.return_to)
    // An aal2 flow for an identity with no second factor has nothing to ask
    // (zero method groups) — don't render an empty card, just go on.
    if (data.requested_aal === 'aal2' && !data.refresh && !hasGroup(data, 'password') && secondFactorGroups(data).length === 0) {
      window.location.assign(landingUrl(data.return_to, window.location.origin))
      return
    }
    flowRef.current = data
    setFlowState(data)
    // Pre-fill identifier from existing input value (Kratos echoes it on validation errors).
    const idIn = getInput(data, 'identifier') || getInput(data, 'password_identifier')
    if (idIn?.value) setIdentifier(idIn.value)
    // Kratos v1.3 leaves the identifier empty on refresh (re-auth) flows:
    // without it the compact "confirm your password" card can't render and
    // the submit fails "Property identifier is missing". Take it from the
    // session being refreshed.
    else if (data.refresh) {
      void createBrowserClient().toSession()
        .then(({ data: s }) => {
          const email = (s.identity?.traits as { email?: unknown } | undefined)?.email
          if (typeof email === 'string') setIdentifier(email)
        })
        .catch(() => { /* no session: the full sign-in form asks for it */ })
    }
    // Default to TOTP/passkey/lookup step if password group is gone (second-factor).
    // If password is absent and only `code` is offered, this is passwordless email sign-in.
    if (!hasGroup(data, 'password') && hasGroup(data, 'totp')) setStep('totp')
    // The `webauthn` group also holds Kratos' webauthn.js script node on any
    // flow with passkeys — only a real security-key trigger means that step.
    else if (!hasGroup(data, 'password') && getTriggerButton(data, 'webauthn_login_trigger')) setStep('webauthn')
    else if (!hasGroup(data, 'password') && hasGroup(data, 'lookup_secret')) setStep('lookup_secret')
    // Passkey renders on the default card — don't collapse a
    // passkey+code flow into the code-only step.
    else if (!hasGroup(data, 'password') && !hasGroup(data, 'passkey') && hasGroup(data, 'code')) setStep('code')
    else setStep('password')
    setLoading(false)
    setNetworkError(null)
  }, [])

  const fetchFlow = useCallback((id: string) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    const kratos = createBrowserClient()
    kratos
      .getLoginFlow({ id })
      .then(({ data }) => showFlow(data))
      .catch((err) => {
        const navigating = applyNav<LoginFlow>(
          resolveKratosError(err, errorNavOptions('login', currentCtx(), "Can't reach the server. Check your connection and try again.")),
          { setFlow: showFlow, refetch: () => setNetworkError("Can't reach the server. Check your connection and try again."), setError: setNetworkError },
        )
        if (!navigating) setLoading(false)
      })
      .finally(() => { fetchingRef.current = false })
  }, [showFlow, currentCtx])

  /**
   * An aal2 login flow for this session when the identity has a second
   * factor, else null. Used to step up right after the first factor (and
   * for an aal1 session landing on /login) even when Kratos' whoami only
   * requires aal1 — the prompt people expect after enrolling 2FA.
   */
  const secondFactorFlow = useCallback(async (to: string | undefined): Promise<LoginFlow | null> => {
    if (!config.stepUpAfterLogin) return null
    try {
      const { data } = await createBrowserClient().createBrowserLoginFlow({ aal: 'aal2', returnTo: to || undefined })
      return secondFactorGroups(data).length > 0 ? data : null
    } catch {
      return null
    }
  }, [])

  const showStepUp = useCallback((data: LoginFlow) => {
    window.history.replaceState(null, '', `/login?flow=${encodeURIComponent(data.id)}`)
    showFlow(data)
  }, [showFlow])

  useEffect(() => {
    rememberFlowOrigin()
    rememberFlowDestination(urlReturnTo)
    if (flowId) {
      fetchFlow(flowId)
      return
    }
    // Probe whoami before init. The session cookie is httpOnly so toSession
    // is the only reliable signal.
    void (async () => {
      let session: Session | null = null
      let needsStepUp = false
      try {
        session = (await createBrowserClient().toSession()).data
      } catch (e) {
        // 403 session_aal2_required (whoami: highest_available) = the
        // identity HAS a second factor and the session is aal1.
        const r = (e as { response?: { status?: number; data?: { error?: { id?: string } } } })?.response
        if (r?.status === 403 && r?.data?.error?.id === 'session_aal2_required') needsStepUp = true
      }
      if (needsStepUp) {
        window.location.assign(initFlowUrl('login', urlReturnTo, { refresh, aal: 'aal2' }))
        return
      }
      if (!session) {
        // No session: an aal=aal2 init would 401 (session_aal1_required);
        // sign in first — the second factor is asked right after.
        window.location.assign(initFlowUrl('login', urlReturnTo, { refresh }))
        return
      }
      if (refresh || aal) {
        window.location.assign(initFlowUrl('login', urlReturnTo, { refresh, aal }))
        return
      }
      // Signed in already. An aal1 session whose identity has a second factor
      // finishes signing in here; otherwise go straight to the destination
      // (never back to this UI's root or /login — that would loop).
      if (session.authenticator_assurance_level === 'aal1') {
        const up = await secondFactorFlow(safeReturnTo(urlReturnTo, window.location.origin) ?? undefined)
        if (up) { showStepUp(up); return }
      }
      window.location.assign(landingUrl(urlReturnTo, window.location.origin))
    })()
  }, [flowId, urlReturnTo, refresh, aal, fetchFlow, secondFactorFlow, showStepUp])

  const banners = useMemo(() => {
    const list = extractFlowBanners(flow)
    const url = detectUrlBanner(new URLSearchParams(searchParams.toString()))
    if (url) list.unshift(url)
    return list
  }, [flow, searchParams])

  const oidc = useMemo(() => getOidcProviders(flow), [flow])
  const methods = useMemo(() => availableMethods(flow), [flow])

  /** Submit one method; success, step-up and every Kratos error route through flow-nav. */
  const submit = async (body: UpdateLoginFlowBody, failMessage: string, token: string | null = null) => {
    if (!flow) return
    setSubmitting(true)
    setNetworkError(null)
    try {
      const { data } = await createBrowserClient().updateLoginFlow({ flow: flow.id, updateLoginFlowBody: body }, captchaHeaders(token))
      // First factor done with an aal1 session: ask for the second factor
      // now if the identity has one, keeping this flow's return_to.
      if (data.session?.authenticator_assurance_level === 'aal1' && flow.requested_aal !== 'aal2' && !flow.refresh) {
        const up = await secondFactorFlow(flow.return_to)
        if (up) { showStepUp(up); return }
      }
      if (handleContinueWith(data, flow.return_to)) return
      fetchFlow(flow.id)
    } catch (err: unknown) {
      // Includes 422 browser_location_change_required (Kratos moving us to
      // its aal2 flow), 410 → replacement flow, CSRF → restart, and
      // session_already_available (another tab finished) → return_to.
      if (isTokenRefusal(err)) bot.reset()
      applyNav<LoginFlow>(resolveKratosError(err, errorNavOptions('login', flowContext(flow), failMessage)), {
        setFlow: showFlow,
        refetch: () => fetchFlow(flow.id),
        setError: setNetworkError,
      })
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * The bot-check token for a first-factor submit. In the X-Captcha-Token header, which the gateway
   * checks before Kratos acts on any submit of this flow; and in transient_payload, for jinbe's
   * interrupting Kratos hook before the session is issued. The same token serves every step of the
   * flow (see useBotCheck); `token` overrides it (a resend's fresh one).
   */
  const withBotCheck = <T extends object>(body: T, token: string | null = bot.use(identifier)): [T, string | null] =>
    [token ? { ...body, transient_payload: { captcha_token: token } } : body, token]

  const onSubmitPassword = (e: React.FormEvent) => {
    e.preventDefault()
    const [body, token] = withBotCheck({ method: 'password', identifier, password, csrf_token: getCsrfToken(flow) })
    void submit(body as UpdateLoginFlowBody, 'Sign-in failed. Please try again.', token)
  }

  // This submit sends the email: the gateway refuses it without a good token.
  const onSubmitCodeRequest = (e: React.FormEvent) => {
    e.preventDefault()
    const [body, token] = withBotCheck({ method: 'code', identifier, csrf_token: getCsrfToken(flow) })
    void submit(body as UpdateLoginFlowBody, 'Could not send sign-in code. Try again.', token)
  }

  const onSubmitCodeVerify = (e: React.FormEvent) => {
    e.preventDefault()
    // Kratos's login code method requires `identifier` on every submit —
    // unlike verification/recovery, where it's only needed for the request
    // step. Without it the verify POST returns 400 "Property identifier is
    // missing". We hang onto the value from the request stage in React
    // state; on `sent_email` Kratos re-emits the identifier node as a
    // hidden input with an empty value, so we can't recover it from the flow.
    const idValue = identifier || getInput(flow, 'identifier')?.value || ''
    const [body, token] = withBotCheck({ method: 'code', identifier: idValue, code, csrf_token: getCsrfToken(flow) })
    void submit(body as UpdateLoginFlowBody, 'Code rejected. Please try again.', token)
  }

  const onSubmitOidc = (provider: string) => {
    if (!flow) return
    // A checked flow needs the token in a header, which a form POST cannot carry: submit it as JSON,
    // and Kratos answers 422 browser_location_change_required to the provider (flow-nav follows it).
    const token = bot.use()
    if (token) {
      void submit(withBotCheck({ method: 'oidc', provider, csrf_token: getCsrfToken(flow) }, token)[0] as UpdateLoginFlowBody, 'Could not start the sign-in. Please try again.', token)
      return
    }
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

  const onSubmitTotp = (e: React.FormEvent) => {
    e.preventDefault()
    void submit({ method: 'totp', totp_code: totp, csrf_token: getCsrfToken(flow) } as UpdateLoginFlowBody, 'Verification failed. Please try again.')
  }

  const onSubmitLookup = (e: React.FormEvent) => {
    e.preventDefault()
    void submit({ method: 'lookup_secret', lookup_secret: lookup, csrf_token: getCsrfToken(flow) } as UpdateLoginFlowBody, 'Backup code rejected. Please try again.')
  }

  /**
   * Send a new sign-in code on the SAME flow (Kratos `resend: 'code'`), so the
   * person stays on the code step with their address kept. Errors route like
   * any submit (an expired flow restarts keeping return_to).
   */
  const resendCode = async () => {
    if (!flow) return
    const idValue = identifier || getInput(flow, 'identifier')?.value || ''
    setNetworkError(null)
    // A resend is another email: the flow's pass covers one, so it needs a token of its own.
    const [body, token] = withBotCheck({ method: 'code', identifier: idValue, resend: 'code', csrf_token: getCsrfToken(flow) }, await bot.fresh())
    try {
      await createBrowserClient().updateLoginFlow({
        flow: flow.id,
        updateLoginFlowBody: body as UpdateLoginFlowBody,
      }, captchaHeaders(token))
      fetchFlow(flow.id)
    } catch (err: unknown) {
      // Kratos answers a successful resend with 400 + the flow (message 1010014).
      if (isTokenRefusal(err)) bot.reset()
      applyNav<LoginFlow>(resolveKratosError(err, errorNavOptions('login', flowContext(flow), 'Could not send a new code. Try again.')), {
        setFlow: showFlow,
        refetch: () => fetchFlow(flow.id),
        setError: setNetworkError,
      })
    }
  }

  /** Back to the email step: a fresh flow with the same return_to / aal / refresh. */
  const changeEmail = () => {
    const c = flowContext(flow)
    window.location.href = initFlowUrl('login', c.returnTo, { refresh: c.refresh, aal: c.aal })
  }

  // Leaving a second-factor prompt means dropping the half-signed-in (aal1)
  // session: /login alone would bounce straight back here (or, under
  // whoami=aal1, past the prompt). Sign out, then sign in with the same
  // destination.
  const backToSignIn = flow?.requested_aal === 'aal2'
    ? switchAccountUrl(typeof window !== 'undefined' ? window.location.origin : '', returnTo || null)
    : signInUrl(returnTo || null)

  if (loading || !flow) return <Loading />

  const idField = getInput(flow, 'identifier') || getInput(flow, 'password_identifier')
  const common = { flow, banners, networkError, submitting, setStep }

  if (step === 'webauthn') return <WebAuthnView {...common} methods={methods} returnTo={returnTo} backToSignIn={backToSignIn} />

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
        onResend={resendCode}
        onChangeEmail={changeEmail}
        botCheck={bot.widget}
        botCheckPending={bot.pending}
      />
    )
  }

  if (step === 'totp') {
    return <TotpView {...common} backToSignIn={backToSignIn} totp={totp} setTotp={setTotp} methods={methods} returnTo={returnTo} onSubmitTotp={onSubmitTotp} />
  }

  if (step === 'lookup_secret') {
    return <LookupView {...common} backToSignIn={backToSignIn} lookup={lookup} setLookup={setLookup} methods={methods} returnTo={returnTo} onSubmitLookup={onSubmitLookup} />
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
      botCheck={bot.widget}
      botCheckPending={bot.pending}
      botCheckToken={bot.token}
      signUpOpen={protection?.registration.mode !== 'closed'}
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
