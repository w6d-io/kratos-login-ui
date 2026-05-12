'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { LoginFlow, UpdateLoginFlowBody } from '@ory/client'
import { initFlowUrl } from '@/lib/ory'
import { Loading } from '@/components/Loading'
import { createBrowserClient } from '@/lib/kratos'
import { Banner } from '@/components/ui/Banner'
import { Field } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Checkbox } from '@/components/ui/Checkbox'
import { Icons } from '@/components/ui/Icons'
import { ProviderLogo, providerLabel } from '@/components/ui/ProviderLogo'
import {
  getCsrfToken,
  getInput,
  getOidcProviders,
  hasGroup,
  availableMethods,
  handleContinueWith,
} from '@/lib/kratos-flow'
import { extractFlowBanners, detectUrlBanner } from '@/lib/flow-messages'

type Step = 'password' | 'totp' | 'webauthn' | 'lookup_secret' | 'code'

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
        if (!hasGroup(data, 'password') && hasGroup(data, 'totp')) setStep('totp')
        else if (!hasGroup(data, 'password') && hasGroup(data, 'webauthn')) setStep('webauthn')
        else if (!hasGroup(data, 'password') && hasGroup(data, 'lookup_secret')) setStep('lookup_secret')
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
          needsStepUp = true // 200 = session present
        } catch (e) {
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
  const idErrors = idField?.errors ?? []
  const pwErrors = getInput(flow, 'password')?.errors ?? []

  // ── Step: WebAuthn (passkey) ─────────────────────────────────────────
  if (step === 'webauthn') {
    return (
      <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
        <div className="card-head">
          <h1>Use your passkey</h1>
          <p>Confirm with the device that has your passkey.</p>
        </div>
        <div className="card-body">
          <Banner tone="warn" title="Passkey not yet supported in this UI">
            Passkey / WebAuthn challenges require a browser-side credential prompt
            that this UI does not implement yet. Use your authenticator app or a
            backup code instead.
          </Banner>
          <div className="btn-row mt-4">
            {methods.includes('totp') && (
              <button type="button" className="btn btn-secondary btn-block" onClick={() => setStep('totp')}>
                <Icons.Shield size={14} /> Authenticator app
              </button>
            )}
            {methods.includes('lookup_secret') && (
              <button type="button" className="btn btn-secondary btn-block" onClick={() => setStep('lookup_secret')}>
                <Icons.Key size={14} /> Backup code
              </button>
            )}
          </div>
        </div>
        <div className="card-foot"><Link href="/login">Back to sign-in</Link></div>
      </div>
    )
  }

  // ── Step: code-based passwordless login ─────────────────────────────
  if (step === 'code') {
    return (
      <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
        <div className="card-head">
          <h1>Email sign-in</h1>
          <p>Enter the code we sent to your email.</p>
        </div>
        <div className="card-body">
          <Banner tone="warn" title="Code-based sign-in not yet supported in this UI">
            This Kratos instance is configured for passwordless email sign-in,
            which is not implemented in this UI yet. Use a different method.
          </Banner>
        </div>
        <div className="card-foot"><Link href="/login">Back to sign-in</Link></div>
      </div>
    )
  }

  // ── Step: TOTP / Lookup secret (second-factor) ──────────────────────
  if (step === 'totp') {
    return (
      <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
        <div className="card-head">
          <h1>Two-factor authentication</h1>
          <p>Enter the 6-digit code from your authenticator app.</p>
        </div>
        <div className="card-body">
          {networkError && <Banner tone="danger" title="Network error">{networkError}</Banner>}
          {banners.map((b, i) => <Banner key={i} tone={b.tone} title={b.title}>{b.body}</Banner>)}
          <form onSubmit={onSubmitTotp} noValidate>
            <Field label="Verification code" required htmlFor="totp" error={getInput(flow, 'totp_code')?.errors?.[0]}>
              <input
                id="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="input"
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                autoFocus
                style={{ fontFamily: 'var(--font-mono)', fontSize: 18, letterSpacing: 4, textAlign: 'center' }}
              />
            </Field>
            <button type="submit" className="btn btn-primary btn-block mt-4" disabled={submitting || totp.length < 6}>
              {submitting ? <><span className="spinner" /> Verifying…</> : 'Verify'}
            </button>
          </form>
          {methods.includes('lookup_secret') && (
            <button type="button" className="btn-link mt-3" onClick={() => setStep('lookup_secret')}>
              Use a backup code instead
            </button>
          )}
        </div>
        <div className="card-foot"><Link href="/login">Back to sign-in</Link></div>
      </div>
    )
  }

  if (step === 'lookup_secret') {
    return (
      <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
        <div className="card-head">
          <h1>Use a backup code</h1>
          <p>Enter one of the recovery codes you saved when MFA was enabled.</p>
        </div>
        <div className="card-body">
          {networkError && <Banner tone="danger" title="Network error">{networkError}</Banner>}
          <form onSubmit={onSubmitLookup} noValidate>
            <Field label="Backup code" required htmlFor="lookup" error={getInput(flow, 'lookup_secret')?.errors?.[0]}>
              <input
                id="lookup"
                className="input"
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
                placeholder="abcd-1234"
                autoFocus
                autoComplete="one-time-code"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </Field>
            <button type="submit" className="btn btn-primary btn-block mt-4" disabled={submitting || !lookup}>
              {submitting ? <><span className="spinner" /> Verifying…</> : 'Verify'}
            </button>
          </form>
        </div>
        <div className="card-foot">
          <button type="button" className="btn-link" onClick={() => setStep('totp')}>Try authenticator code instead</button>
        </div>
      </div>
    )
  }

  // ── Default: password + OIDC ──────────────────────────────────────────
  // Refresh mode = Kratos asked us to re-confirm an existing session before
  // a sensitive op (TOTP enroll, password change, ...). Identity is already
  // known, so collapse the UI to a password-only confirm and hide the
  // OIDC/register/keep-me-signed-in chrome that would imply a full sign-in.
  // Gate on a known identifier — if the cookie was deleted server-side
  // we'd render the compact form with an empty email chip, which looks
  // broken. Falling back to the full sign-in UI is the safer default.
  const knownIdentifier = identifier || idField?.value || ''
  const refreshing = (refresh || flow?.refresh === true) && Boolean(knownIdentifier)
  return (
    <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
      <div className="card-head">
        <h1>{refreshing ? 'Confirm your password' : 'Sign in to your account'}</h1>
        <p>
          {refreshing
            ? "We're verifying it's you before a sensitive change."
            : 'Welcome back. Enter your credentials to continue.'}
        </p>
      </div>
      <div className="card-body">
        {networkError && <Banner tone="danger" title="Network error">{networkError}</Banner>}
        {banners.map((b, i) => <Banner key={i} tone={b.tone} title={b.title}>{b.body}</Banner>)}

        {!refreshing && oidc.length > 0 && (
          <>
            <div className={oidc.length === 1 ? '' : 'oidc-grid'}>
              {oidc.map((p) => (
                <button key={p.provider} type="button" className="oidc-btn" onClick={() => onSubmitOidc(p.provider)}>
                  <ProviderLogo name={p.provider} size={18} />
                  <span>Continue with {providerLabel(p.provider)}</span>
                </button>
              ))}
            </div>
            <div className="divider-text">or</div>
          </>
        )}

        {hasGroup(flow, 'password') && (
          <form onSubmit={onSubmitPassword} noValidate>
            {refreshing ? (
              <div
                className="row"
                style={{
                  gap: 10,
                  padding: '10px 12px',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  background: 'var(--surface-2)',
                  marginBottom: 12,
                }}
              >
                <Icons.User size={16} />
                <span className="mono small" style={{ flex: 1 }}>{identifier || idField?.value}</span>
              </div>
            ) : (
              <Field
                label={idField?.label || 'Work email'}
                required
                htmlFor="login-id"
                error={idErrors[0]}
              >
                <input
                  id="login-id"
                  name={idField?.name || 'identifier'}
                  type="email"
                  className={`input ${idErrors.length ? 'has-error' : ''}`}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="username"
                  autoFocus
                  required
                />
              </Field>
            )}

            <Field
              label="Password"
              required
              htmlFor="login-pw"
              error={pwErrors[0]}
              hintLink={
                refreshing ? undefined : <Link href="/recovery" className="field-hint-link">Forgot?</Link>
              }
            >
              <PasswordInput
                id="login-pw"
                name="password"
                value={password}
                onChange={setPassword}
                error={pwErrors.length > 0}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </Field>

            {!refreshing && (
              <div style={{ marginTop: 14 }}>
                <Checkbox checked={remember} onChange={setRemember}>
                  Keep me signed in for 30 days
                </Checkbox>
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 18 }} disabled={submitting}>
              {submitting
                ? <><span className="spinner" /> {refreshing ? 'Confirming…' : 'Signing in…'}</>
                : (refreshing ? 'Confirm' : 'Sign in')}
            </button>
          </form>
        )}

        {!refreshing && (hasGroup(flow, 'webauthn') || hasGroup(flow, 'totp')) && (
          <>
            <div className="divider-text" style={{ margin: '20px 0 16px' }}>or continue with</div>
            <div className="oidc-grid">
              {hasGroup(flow, 'webauthn') && (
                <button type="button" className="oidc-btn" onClick={() => setStep('webauthn')}>
                  <Icons.Fingerprint size={16} /> Passkey
                </button>
              )}
              {hasGroup(flow, 'totp') && (
                <button type="button" className="oidc-btn" onClick={() => setStep('totp')}>
                  <Icons.Shield size={16} /> Authenticator
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {!refreshing && (
        <div className="card-foot">
          Don&apos;t have an account?{' '}
          <Link href={`/register${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`}>
            Create account
          </Link>
        </div>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LoginPageContent />
    </Suspense>
  )
}
