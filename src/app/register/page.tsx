'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { RegistrationFlow, UpdateRegistrationFlowBody } from '@ory/client'
import { initFlowUrl } from '@/lib/ory'
import { Loading } from '@/components/Loading'
import { createBrowserClient } from '@/lib/kratos'
import { Banner } from '@/components/ui/Banner'
import { Field } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Checkbox } from '@/components/ui/Checkbox'
import { ProviderLogo, providerLabel } from '@/components/ui/ProviderLogo'
import {
  getCsrfToken,
  getInputs,
  getOidcProviders,
  hasGroup,
  handleContinueWith,
} from '@/lib/kratos-flow'
import { extractFlowBanners } from '@/lib/flow-messages'

function RegisterPageContent() {
  const [flow, setFlow] = useState<RegistrationFlow | null>(null)
  const [loading, setLoading] = useState(true)
  const [traits, setTraits] = useState<Record<string, string>>({})
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const flowId = searchParams.get('flow')
  const returnTo = searchParams.get('return_to') || ''
  const fetchingRef = useRef(false)

  const fetchFlow = useCallback((id: string) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    createBrowserClient()
      .getRegistrationFlow({ id })
      .then(({ data }) => {
        setFlow(data)
        // Pre-fill traits from existing values (Kratos echoes them on validation errors).
        const tr: Record<string, string> = {}
        for (const f of getInputs(data, 'profile')) {
          if (f.name.startsWith('traits.')) tr[f.name] = f.value
        }
        for (const f of getInputs(data, 'password')) {
          if (f.name.startsWith('traits.')) tr[f.name] = f.value
        }
        setTraits((prev) => ({ ...prev, ...tr }))
        setLoading(false)
        setNetworkError(null)
      })
      .catch((err) => {
        const status = err?.response?.status
        if (status === 403 || status === 404 || status === 410) {
          window.location.href = initFlowUrl('registration', returnTo)
          return
        }
        setNetworkError("Can't reach the server. Check your connection and try again.")
        setLoading(false)
      })
      .finally(() => { fetchingRef.current = false })
  }, [returnTo])

  useEffect(() => {
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

  const setTrait = (name: string, value: string) => setTraits((p) => ({ ...p, [name]: value }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!flow) return
    setSubmitting(true)
    setNetworkError(null)
    try {
      const traitsObj: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(traits)) {
        if (!k.startsWith('traits.')) continue
        const path = k.slice('traits.'.length).split('.')
        let cur = traitsObj
        for (let i = 0; i < path.length - 1; i++) {
          cur[path[i]] = (cur[path[i]] as Record<string, unknown>) || {}
          cur = cur[path[i]] as Record<string, unknown>
        }
        cur[path[path.length - 1]] = v
      }

      // If the flow already has a password group, submit method=password directly
      // with traits + password. Otherwise submit method=profile to advance Kratos
      // to the next step (which adds password inputs to the flow).
      const body = (hasPassword
        ? { method: 'password', password, traits: traitsObj, csrf_token: getCsrfToken(flow) }
        : { method: 'profile', traits: traitsObj, csrf_token: getCsrfToken(flow) }
      ) as unknown as UpdateRegistrationFlowBody

      const { data } = await createBrowserClient().updateRegistrationFlow({ flow: flow.id, updateRegistrationFlowBody: body })
      if (handleContinueWith(data, returnTo)) return
      fetchFlow(flow.id)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 400 || status === 422) fetchFlow(flow.id)
      else if (status === 410) window.location.href = initFlowUrl('registration', returnTo)
      else setNetworkError("Sign-up failed. Please try again.")
    } finally {
      setSubmitting(false)
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

  if (loading || !flow) return <Loading />

  // Password strength heuristic for the design's hint.
  const pwHint = (() => {
    if (password.length < 8) return null
    const variety = (/[A-Z]/.test(password) ? 1 : 0) + (/[0-9]/.test(password) ? 1 : 0) + (/[^A-Za-z0-9]/.test(password) ? 1 : 0)
    if (password.length < 12) return { tone: 'warn' as const, text: 'Okay — consider adding more variety.' }
    if (variety < 2) return { tone: 'warn' as const, text: 'Okay — try a longer mix of letters, numbers, and symbols.' }
    return { tone: 'success' as const, text: 'Strong password.' }
  })()

  return (
    <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
      <div className="card-head">
        <h1>Create your account</h1>
        <p>It only takes a minute.</p>
      </div>
      <div className="card-body">
        {networkError && <Banner tone="danger" title="Network error">{networkError}</Banner>}
        {banners.map((b, i) => <Banner key={i} tone={b.tone} title={b.title}>{b.body}</Banner>)}

        {oidc.length > 0 && (
          <>
            <div className={oidc.length === 1 ? '' : 'oidc-grid'}>
              {oidc.map((p) => (
                <button key={p.provider} type="button" className="oidc-btn" onClick={() => onSubmitOidc(p.provider)}>
                  <ProviderLogo name={p.provider} size={18} />
                  <span>Continue with {providerLabel(p.provider)}</span>
                </button>
              ))}
            </div>
            <div className="divider-text">or sign up with email</div>
          </>
        )}

        {(hasPassword || hasProfileStep || traitFields.length > 0) && (
          <form onSubmit={onSubmit} noValidate>
            {traitFields.map((f) => {
              const fieldId = `reg-${f.name.replace(/\W/g, '-')}`
              return (
                <Field
                  key={f.name}
                  label={f.label || humanize(f.name)}
                  required={f.required}
                  htmlFor={fieldId}
                  error={f.errors[0]}
                >
                  <input
                    id={fieldId}
                    name={f.name}
                    type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
                    className={`input ${f.errors.length ? 'has-error' : ''}`}
                    value={traits[f.name] || ''}
                    onChange={(e) => setTrait(f.name, e.target.value)}
                    autoComplete={f.autocomplete}
                    required={f.required}
                  />
                </Field>
              )
            })}

            {hasPassword && (
              <Field
                label="Password"
                required
                htmlFor="reg-pw"
                error={getInputs(flow, 'password').find((f) => f.name === 'password')?.errors[0]}
                hint={pwHint?.text}
              >
                <PasswordInput
                  id="reg-pw"
                  name="password"
                  value={password}
                  onChange={setPassword}
                  placeholder="At least 12 characters"
                  autoComplete="new-password"
                  required
                />
              </Field>
            )}

            {hasPassword && (
              <div style={{ marginTop: 14 }}>
                <Checkbox checked={accepted} onChange={setAccepted}>
                  I agree to the <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.
                </Checkbox>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              style={{ marginTop: 18 }}
              disabled={submitting || (hasPassword && !accepted)}
            >
              {submitting
                ? <><span className="spinner" /> {hasPassword ? 'Creating account…' : 'Continuing…'}</>
                : hasPassword ? 'Create account' : 'Continue'}
            </button>
          </form>
        )}
      </div>
      <div className="card-foot">
        Already have an account?{' '}
        <Link href={`/login${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`}>
          Sign in
        </Link>
      </div>
    </div>
  )
}

function humanize(name: string): string {
  // 'traits.email' → 'Email', 'traits.first_name' → 'First name'
  const last = name.split('.').pop() || name
  return last.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RegisterPageContent />
    </Suspense>
  )
}
