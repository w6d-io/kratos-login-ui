'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useBrandingReturnTo } from '@/components/ui/Branding'
import type { SettingsFlow, UpdateSettingsFlowBody, Session } from '@ory/client'
import { initFlowUrl } from '@/lib/ory'
import { Loading } from '@/components/Loading'
import { createBrowserClient } from '@/lib/kratos'
import {
  getCsrfToken,
  getInputs,
  getInput,
  getPasskeyCredentials,
  hasGroup,
  handleContinueWith,
} from '@/lib/kratos-flow'
import { extractFlowBanners } from '@/lib/flow-messages'
import { FlowMessages } from '@/components/flow/FlowMessages'
import { DangerSection, IdentityHeader, PasswordSection, ProfileSection, Section, SessionsSection, SettingsNav, type SettingsTab } from '@/components/settings/SettingsSections'
import { BackupCodesRow, PasskeysRow, TotpRow } from '@/components/settings/MfaViews'

type Tab = SettingsTab

function SettingsPageContent() {
  const [flow, setFlow] = useState<SettingsFlow | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  // Persist active tab in the URL hash so a redirect through Kratos's
  // privileged-session refresh (e.g. clicking "Verify & enable" past
  // the 15-min window) brings the user back to the same tab. The HTTP
  // redirect chain Kratos issues drops the URL fragment, so we also
  // mirror the tab into sessionStorage. SSR returns 'profile'; the
  // hash/storage read happens in useEffect to avoid a hydration
  // mismatch warning when the client lands on /settings#mfa.
  const validTabs: Tab[] = ['profile', 'password', 'mfa', 'sessions', 'danger']
  const STORE_KEY = 'kratos:settings:tab'
  const [tab, setTabRaw] = useState<Tab>('profile')
  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#/, '')
    if (validTabs.includes(fromHash as Tab)) {
      setTabRaw(fromHash as Tab)
      window.sessionStorage.setItem(STORE_KEY, fromHash)
      return
    }
    const fromStore = window.sessionStorage.getItem(STORE_KEY) || ''
    if (validTabs.includes(fromStore as Tab)) {
      setTabRaw(fromStore as Tab)
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${fromStore}`)
      // Single-shot restore: clear so the tab isn't sticky across days
      // / sessions when the user later opens /settings without a hash.
      window.sessionStorage.removeItem(STORE_KEY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const setTab = (t: Tab) => {
    setTabRaw(t)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${t}`)
      window.sessionStorage.setItem(STORE_KEY, t)
    }
  }
  const [traits, setTraits] = useState<Record<string, string>>({})
  const [newPw, setNewPw] = useState('')
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  useBrandingReturnTo(flow?.return_to)
  const flowId = searchParams.get('flow')
  const returnTo = searchParams.get('return_to') || ''
  const fetchingRef = useRef(false)

  const loadSession = useCallback(async () => {
    try {
      const { data } = await createBrowserClient().toSession()
      setSession(data)
    } catch { /* not signed in */ }
  }, [])

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await createBrowserClient().listMySessions()
      setSessions(data || [])
    } catch { /* not signed in or empty */ }
  }, [])

  const fetchFlow = useCallback((id: string) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    createBrowserClient()
      .getSettingsFlow({ id })
      .then(({ data }) => {
        setFlow(data)
        // Seed trait state from BOTH the identity object (full traits) AND
        // the profile-group inputs. The form only renders fields exposed by
        // the schema, but on submit we MUST send the full traits object —
        // missing keys would clear them.
        const tr: Record<string, string> = {}
        const idTraits = (data as { identity?: { traits?: Record<string, unknown> } }).identity?.traits || {}
        const flatten = (obj: Record<string, unknown>, prefix: string) => {
          for (const [k, v] of Object.entries(obj)) {
            const key = `${prefix}.${k}`
            if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v as Record<string, unknown>, key)
            else if (v !== null && v !== undefined) tr[key] = String(v)
          }
        }
        flatten(idTraits, 'traits')
        // Profile-group inputs override (they reflect the latest server-side
        // state including pending validation echoes).
        for (const f of getInputs(data, 'profile')) {
          if (f.name.startsWith('traits.') && f.value) tr[f.name] = f.value
        }
        setTraits((prev) => ({ ...prev, ...tr }))
        setLoading(false)
        setNetworkError(null)
      })
      .catch((err) => {
        const status = err?.response?.status
        if (status === 403 || status === 404 || status === 410) {
          window.location.href = initFlowUrl('settings', returnTo)
          return
        }
        setNetworkError("Can't reach the server. Check your connection.")
        setLoading(false)
      })
      .finally(() => { fetchingRef.current = false })
  }, [returnTo])

  useEffect(() => {
    if (!flowId) {
      window.location.href = initFlowUrl('settings', returnTo)
      return
    }
    fetchFlow(flowId)
    loadSession()
    loadSessions()
  }, [flowId, returnTo, fetchFlow, loadSession, loadSessions])

  const banners = useMemo(() => extractFlowBanners(flow), [flow])
  const traitFields = useMemo(() => flow ? getInputs(flow, 'profile').filter((f) => f.name.startsWith('traits.')) : [], [flow])
  const setTrait = (name: string, value: string) => setTraits((p) => ({ ...p, [name]: value }))

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!flow) return
    setSubmitting('profile')
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
      const body = { method: 'profile', traits: traitsObj, csrf_token: getCsrfToken(flow) } as unknown as UpdateSettingsFlowBody
      const { data } = await createBrowserClient().updateSettingsFlow({ flow: flow.id, updateSettingsFlowBody: body })
      if (handleContinueWith(data)) return
      fetchFlow(flow.id)
    } catch (err: unknown) {
      const e2 = err as { response?: { status?: number; data?: { redirect_browser_to?: string } } }
      const status = e2?.response?.status
      const redirect = e2?.response?.data?.redirect_browser_to
      if (status === 422 && redirect) window.location.href = redirect
      else if (status === 400 || status === 422) fetchFlow(flow.id)
      else if (status === 403 && redirect) window.location.href = redirect
      else if (status === 403) {
        window.location.href = `/login?refresh=true&return_to=${encodeURIComponent(window.location.href)}`
      }
      else if (status === 410) window.location.href = initFlowUrl('settings', returnTo)
      else setNetworkError('Profile update failed.')
    } finally { setSubmitting(null) }
  }

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!flow) return
    setSubmitting('password')
    setNetworkError(null)
    try {
      const body = { method: 'password', password: newPw, csrf_token: getCsrfToken(flow) } as UpdateSettingsFlowBody
      const { data } = await createBrowserClient().updateSettingsFlow({ flow: flow.id, updateSettingsFlowBody: body })
      setNewPw('')
      // Kratos may chain into a refresh login flow via continue_with on 403.
      if (handleContinueWith(data)) return
      fetchFlow(flow.id)
    } catch (err: unknown) {
      const e2 = err as { response?: { status?: number; data?: { redirect_browser_to?: string } } }
      const status = e2?.response?.status
      const redirect = e2?.response?.data?.redirect_browser_to
      if (status === 422 && redirect) window.location.href = redirect
      else if (status === 400 || status === 422) fetchFlow(flow.id)
      else if (status === 403 && redirect) {
        // Privileged session expired — Kratos returns redirect to /login?refresh=true.
        window.location.href = redirect
      }
      else if (status === 403) {
        // Fallback: trigger refresh login manually.
        window.location.href = `/login?refresh=true&return_to=${encodeURIComponent(window.location.href)}`
      }
      else if (status === 410) window.location.href = initFlowUrl('settings', returnTo)
      else setNetworkError('Password update failed.')
    } finally { setSubmitting(null) }
  }

  const revokeSession = async (id: string) => {
    try {
      await createBrowserClient().disableMySession({ id })
      loadSessions()
    } catch { setNetworkError('Could not revoke session.') }
  }
  const revokeAllOther = async () => {
    try {
      await createBrowserClient().disableMyOtherSessions()
      loadSessions()
    } catch { setNetworkError('Could not revoke sessions.') }
  }

  if (loading || !flow) return <Loading />

  const identity = (session?.identity || (flow as { identity?: { traits?: Record<string, unknown>; id?: string } }).identity)
  const email = (identity?.traits as { email?: string } | undefined)?.email || ''
  const name = (identity?.traits as { name?: string | { first?: string; last?: string } } | undefined)?.name
  const displayName = typeof name === 'string' ? name : name ? `${name.first || ''} ${name.last || ''}`.trim() : email
  const addresses = (identity as { verifiable_addresses?: Array<{ value?: string; verified?: boolean }> } | undefined)?.verifiable_addresses
  const verified = addresses?.find((a) => a.value === email)?.verified ?? null
  const mfaOn = !!getInput(flow, 'totp_unlink') || getPasskeyCredentials(flow).length > 0
  // Always list the current session — listMySessions may return only the others.
  const allSessions = (() => {
    const all = sessions.length > 0 ? sessions : (session ? [session] : [])
    if (!session) return all
    return all.some((s) => s.id === session.id) ? all : [session, ...all]
  })()

  return (
    <div className="settings">
      <SettingsNav tab={tab} setTab={setTab} mfaOn={mfaOn} hasPassword={hasGroup(flow, 'password')} />

      <div className="settings-content">
        <FlowMessages banners={banners} networkError={networkError} />
        <IdentityHeader displayName={displayName} email={email} verified={verified} returnTo={returnTo} mfaOn={mfaOn} onSetUpMfa={() => setTab('mfa')} showMfaNudge={tab !== 'mfa'} />

        {tab === 'profile' && (
          <ProfileSection
            traitFields={traitFields}
            traits={traits}
            setTrait={setTrait}
            submitting={submitting === 'profile'}
            disabled={!!submitting}
            onSubmit={submitProfile}
            onReset={() => fetchFlow(flow.id)}
            humanize={humanize}
          />
        )}

        {tab === 'password' && hasGroup(flow, 'password') && (
          <PasswordSection
            value={newPw}
            setValue={setNewPw}
            email={email}
            error={getInput(flow, 'password')?.errors?.[0]}
            submitting={submitting === 'password'}
            onSubmit={submitPassword}
          />
        )}

        {tab === 'mfa' && (
          <Section
            id="mfa"
            title="Two-step verification"
            description="After your password, you’ll confirm with something only you have. Turn on at least one method, then save your backup codes."
          >
            <MfaTotpSection flow={flow} onChanged={() => fetchFlow(flow.id)} />
            <MfaWebauthnSection flow={flow} onChanged={() => fetchFlow(flow.id)} />
            <MfaLookupSection flow={flow} account={email} onChanged={() => fetchFlow(flow.id)} />
          </Section>
        )}

        {tab === 'sessions' && (
          <SessionsSection sessions={allSessions} currentId={session?.id} onRevoke={revokeSession} onRevokeOthers={revokeAllOther} />
        )}

        {tab === 'danger' && <DangerSection />}
      </div>
    </div>
  )
}

function MfaTotpSection({ flow, onChanged }: { flow: SettingsFlow; onChanged: () => void }) {
  const totpInput = getInput(flow, 'totp_code')
  const totpUnlink = getInput(flow, 'totp_unlink')
  const enrolled = !!totpUnlink
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // QR + secret are exposed by Kratos as separate UI nodes when enrolling.
  const qrNode = (flow.ui?.nodes ?? []).find(
    (n) => n.group === 'totp' && n.type === 'img' && (n.attributes as { id?: string }).id === 'totp_qr',
  )
  const qrSrc = (qrNode?.attributes as { src?: string } | undefined)?.src
  const secretNode = (flow.ui?.nodes ?? []).find(
    (n) => n.group === 'totp' && n.type === 'text' && (n.attributes as { id?: string }).id === 'totp_secret_key',
  )
  const secret = (secretNode?.attributes as { text?: { text?: string } } | undefined)?.text?.text

  const submit = async (action: 'verify' | 'unlink') => {
    setSubmitting(true)
    try {
      const body = action === 'verify'
        ? { method: 'totp', totp_code: code, csrf_token: getCsrfToken(flow) }
        : { method: 'totp', totp_unlink: true, csrf_token: getCsrfToken(flow) }
      const { data } = await createBrowserClient().updateSettingsFlow({ flow: flow.id, updateSettingsFlowBody: body as UpdateSettingsFlowBody })
      // Kratos may chain into a refresh login flow via continue_with on 403.
      if (handleContinueWith(data)) return
      setCode('')
      onChanged()
    } catch (err: unknown) {
      // Privileged-session check: TOTP enroll/unlink is sensitive, so Kratos
      // requires a recent re-auth (privileged_session_max_age, default 15m).
      // When stale, it returns 403 with redirect_browser_to → /login?refresh=true.
      const e2 = err as { response?: { status?: number; data?: { redirect_browser_to?: string } } }
      const status = e2?.response?.status
      const redirect = e2?.response?.data?.redirect_browser_to
      if (status === 403 && redirect) window.location.href = redirect
      else if (status === 403) {
        window.location.href = `/login?refresh=true&return_to=${encodeURIComponent(window.location.href)}`
      } else if (status === 410) window.location.reload()
      else {
        // 400/422: Kratos returned the updated flow with field-level errors
        // (e.g. "the provided code did not match"). Re-fetch so the input
        // surfaces them. Also clear the stale code so the user sees the
        // error prompt clearly and re-enters a fresh one (TOTP rotates 30s).
        setCode('')
        onChanged()
      }
    } finally { setSubmitting(false) }
  }

  const totpErr = totpInput?.errors?.[0]
  const flowLevelErrs = (flow.ui?.messages || [])
    .filter((m) => m.type === 'error')
    .map((m) => m.text)

  return (
    <TotpRow
      enrolled={enrolled}
      canEnrol={!!totpInput}
      qrSrc={qrSrc}
      secret={secret}
      code={code}
      setCode={setCode}
      submitting={submitting}
      error={totpErr || flowLevelErrs[0]}
      onVerify={() => submit('verify')}
      onUnlink={() => submit('unlink')}
    />
  )
}

function MfaWebauthnSection({ flow, onChanged }: { flow: SettingsFlow; onChanged: () => void }) {
  const [submitting, setSubmitting] = useState<string | null>(null)
  if (!hasGroup(flow, 'passkey')) return null
  const passkeys = getPasskeyCredentials(flow)

  const removePasskey = async (id: string) => {
    setSubmitting(id)
    try {
      const body = { method: 'passkey', passkey_remove: id, csrf_token: getCsrfToken(flow) } as UpdateSettingsFlowBody
      const { data } = await createBrowserClient().updateSettingsFlow({ flow: flow.id, updateSettingsFlowBody: body })
      if (handleContinueWith(data)) return
      onChanged()
    } catch (err: unknown) {
      // Same privileged-session dance as TOTP: removal is sensitive, Kratos
      // 403s with redirect_browser_to → /login?refresh=true when stale.
      const e2 = err as { response?: { status?: number; data?: { redirect_browser_to?: string } } }
      const status = e2?.response?.status
      const redirect = e2?.response?.data?.redirect_browser_to
      if (status === 403 && redirect) window.location.assign(redirect)
      else if (status === 403) {
        window.location.assign(`/login?refresh=true&return_to=${encodeURIComponent(window.location.href)}`)
      } else if (status === 410) window.location.reload()
      else onChanged()
    } finally { setSubmitting(null) }
  }

  return <PasskeysRow flow={flow} passkeys={passkeys} removing={submitting} onRemove={removePasskey} />
}

function MfaLookupSection({ flow, account, onChanged }: { flow: SettingsFlow; account: string; onChanged: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  if (!hasGroup(flow, 'lookup_secret')) return null
  const reveal = getInput(flow, 'lookup_secret_reveal')
  const regenerate = getInput(flow, 'lookup_secret_regenerate')
  const confirm = getInput(flow, 'lookup_secret_confirm')

  // Codes node text content (after reveal/regenerate, Kratos appends a text node).
  const codesNode = (flow.ui?.nodes ?? []).find(
    (n) => n.group === 'lookup_secret' && n.type === 'text' && (n.attributes as { id?: string }).id === 'lookup_secret_codes',
  )
  const codesText = (codesNode?.attributes as { text?: { text?: string } } | undefined)?.text?.text
  const codes = codesText?.split(/[,\s]+/).filter(Boolean) || []

  const submit = async (kind: 'reveal' | 'regenerate' | 'confirm') => {
    setSubmitting(true)
    try {
      const body = {
        method: 'lookup_secret',
        ...(kind === 'reveal' ? { lookup_secret_reveal: true } : {}),
        ...(kind === 'regenerate' ? { lookup_secret_regenerate: true } : {}),
        ...(kind === 'confirm' ? { lookup_secret_confirm: true } : {}),
        csrf_token: getCsrfToken(flow),
      } as UpdateSettingsFlowBody
      const { data } = await createBrowserClient().updateSettingsFlow({ flow: flow.id, updateSettingsFlowBody: body })
      if (handleContinueWith(data)) return
      onChanged()
    } catch (err: unknown) {
      // Same privileged-session redirect as TOTP — Kratos returns 403 with
      // redirect_browser_to when the session is stale (>privileged_session_max_age).
      const e2 = err as { response?: { status?: number; data?: { redirect_browser_to?: string } } }
      const status = e2?.response?.status
      const redirect = e2?.response?.data?.redirect_browser_to
      if (status === 403 && redirect) window.location.href = redirect
      else if (status === 403) {
        window.location.href = `/login?refresh=true&return_to=${encodeURIComponent(window.location.href)}`
      } else if (status === 410) window.location.reload()
      else onChanged()
    } finally { setSubmitting(false) }
  }

  return (
    <BackupCodesRow
      codes={codes}
      account={account}
      canReveal={!!reveal && !codesText}
      canRegenerate={!!regenerate}
      needsConfirm={!!confirm}
      submitting={submitting}
      onReveal={() => submit('reveal')}
      onRegenerate={() => submit('regenerate')}
      onConfirm={() => submit('confirm')}
    />
  )
}

function humanize(name: string): string {
  const last = name.split('.').pop() || name
  return last.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SettingsPageContent />
    </Suspense>
  )
}
