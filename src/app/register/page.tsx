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
} from '@/lib/kratos-flow'
import { extractFlowBanners } from '@/lib/flow-messages'
import { RegisterView } from '@/components/login/RegisterView'
import { flowContext, resolveKratosError } from '@/lib/flow-nav'
import { applyNav, errorNavOptions, rememberFlowOrigin } from '@/lib/flow-nav-browser'
import { signInUrl } from '@/lib/access'

function RegisterPageContent() {
  const [flow, setFlow] = useState<RegistrationFlow | null>(null)
  const [loading, setLoading] = useState(true)
  const [traits, setTraits] = useState<Record<string, string>>({})
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  useBrandingReturnTo(flow?.return_to)
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
