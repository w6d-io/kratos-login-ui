'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { SettingsFlow, UpdateSettingsFlowBody, Session } from '@ory/client'
import { initFlowUrl } from '@/lib/ory'
import { Loading } from '@/components/Loading'
import { createBrowserClient } from '@/lib/kratos'
import { Banner } from '@/components/ui/Banner'
import { Field } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Icons } from '@/components/ui/Icons'
import {
  getCsrfToken,
  getInputs,
  getInput,
  hasGroup,
  handleContinueWith,
} from '@/lib/kratos-flow'
import { extractFlowBanners } from '@/lib/flow-messages'

type Tab = 'profile' | 'password' | 'mfa' | 'sessions' | 'danger'

const NAV: Array<{ id: Tab; label: string; icon: keyof typeof Icons }> = [
  { id: 'profile',  label: 'Profile',     icon: 'User' },
  { id: 'password', label: 'Password',    icon: 'Lock' },
  { id: 'mfa',      label: 'Two-factor',  icon: 'Shield' },
  { id: 'sessions', label: 'Sessions',    icon: 'Monitor' },
  { id: 'danger',   label: 'Danger zone', icon: 'AlertTriangle' },
]

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
      if (status === 400 || status === 422) fetchFlow(flow.id)
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
      if (status === 400 || status === 422) fetchFlow(flow.id)
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

  return (
    <div className="settings">
      <aside className="settings-nav">
        <h2>Settings</h2>
        {NAV.map((n) => {
          const Icon = Icons[n.icon]
          return (
            <button
              key={n.id}
              type="button"
              className={`settings-nav-link ${tab === n.id ? 'active' : ''}`}
              onClick={() => setTab(n.id)}
            >
              <Icon size={15} />
              <span>{n.label}</span>
            </button>
          )
        })}
        <div style={{ height: 12 }} />
        <a className="settings-nav-link" href="/logout">
          <Icons.LogOut size={15} />
          <span>Sign out</span>
        </a>
      </aside>

      <section className="settings-content">
        {networkError && <Banner tone="danger" title="Error">{networkError}</Banner>}
        {banners.map((b, i) => <Banner key={i} tone={b.tone} title={b.title}>{b.body}</Banner>)}

        {/* Identity hero — visible on all tabs */}
        <div className="settings-section">
          <div className="settings-section-body">
            <div className="identity-hero">
              <div className="avatar">{(displayName || email || '?').charAt(0).toUpperCase()}</div>
              <div className="identity-hero-meta">
                <div className="identity-hero-name">{displayName || 'Your account'}</div>
                <div className="identity-hero-id">{email}</div>
              </div>
            </div>
          </div>
        </div>

        {tab === 'profile' && (
          <div className="settings-section">
            <div className="settings-section-head">
              <h3>Profile</h3>
              <p>How others see you in the app.</p>
            </div>
            <div className="settings-section-body">
              <form onSubmit={submitProfile} noValidate>
                {traitFields.map((f) => {
                  const fieldId = `set-${f.name.replace(/\W/g, '-')}`
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
                        type={f.type === 'email' ? 'email' : 'text'}
                        className={`input ${f.errors.length ? 'has-error' : ''}`}
                        value={traits[f.name] || ''}
                        onChange={(e) => setTrait(f.name, e.target.value)}
                        autoComplete={f.autocomplete}
                      />
                    </Field>
                  )
                })}
                <div className="btn-row mt-4">
                  <button type="submit" className="btn btn-primary" disabled={submitting === 'profile'}>
                    {submitting === 'profile' ? <><span className="spinner" /> Saving…</> : 'Save changes'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => fetchFlow(flow.id)} disabled={!!submitting}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {tab === 'password' && hasGroup(flow, 'password') && (
          <div className="settings-section">
            <div className="settings-section-head">
              <h3>Password</h3>
              <p>Use at least 12 characters with a mix of letters, numbers, and symbols.</p>
            </div>
            <div className="settings-section-body">
              <form onSubmit={submitPassword} noValidate>
                <Field
                  label="New password"
                  required
                  htmlFor="new-pw"
                  error={getInput(flow, 'password')?.errors?.[0]}
                  hint="Must be at least 12 characters and not match a known compromised password. Kratos may ask you to sign in again before applying."
                >
                  <PasswordInput id="new-pw" value={newPw} onChange={setNewPw} autoComplete="new-password" required />
                </Field>
                <div className="btn-row mt-4">
                  <button type="submit" className="btn btn-primary" disabled={submitting === 'password' || !newPw}>
                    {submitting === 'password' ? <><span className="spinner" /> Updating…</> : 'Update password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {tab === 'mfa' && (
          <>
            <div className="settings-section">
              <div className="settings-section-head">
                <h3>Two-factor authentication</h3>
                <p>Add a second factor to keep your account secure.</p>
              </div>
              <div className="settings-section-body">
                <MfaTotpSection flow={flow} onChanged={() => fetchFlow(flow.id)} />
                <MfaWebauthnSection flow={flow} onChanged={() => fetchFlow(flow.id)} />
                <MfaLookupSection flow={flow} onChanged={() => fetchFlow(flow.id)} />
              </div>
            </div>
          </>
        )}

        {tab === 'sessions' && (
          <div className="settings-section">
            <div className="settings-section-head">
              <h3>Active sessions</h3>
              <p>Devices currently signed into your account.</p>
            </div>
            <div className="settings-section-body">
              {/* Always show the current session — Kratos's listMySessions
                  may return empty for users with no extra devices, but the
                  user is by definition signed in HERE. */}
              {(() => {
                const all = sessions.length > 0 ? sessions : (session ? [session] : [])
                const merged = (() => {
                  if (!session) return all
                  return all.some((s) => s.id === session.id) ? all : [session, ...all]
                })()
                if (merged.length === 0) {
                  return <p className="muted">No active sessions.</p>
                }
                return merged.map((s) => {
                  const isCurrent = s.id === session?.id
                  return (
                    <div key={s.id} className="settings-row">
                      <div className="device-icon"><Icons.Laptop size={18} /></div>
                      <div className="settings-row-content">
                        <div className="settings-row-title">
                          {(s as { devices?: Array<{ user_agent?: string }> }).devices?.[0]?.user_agent || 'Unknown device'}
                          {isCurrent && <span className="badge success">This device</span>}
                        </div>
                        <div className="settings-row-meta">
                          Last active {s.authenticated_at ? new Date(s.authenticated_at).toLocaleString() : '—'}
                        </div>
                      </div>
                      {isCurrent ? (
                        <a className="btn btn-secondary" href="/logout">Sign out</a>
                      ) : (
                        <button className="btn btn-secondary" onClick={() => revokeSession(s.id)}>Revoke</button>
                      )}
                    </div>
                  )
                })
              })()}
              {sessions.filter((s) => s.id !== session?.id).length > 0 && (
                <button className="btn btn-secondary mt-4" onClick={revokeAllOther}>
                  Revoke all other sessions
                </button>
              )}
            </div>
          </div>
        )}

        {tab === 'danger' && (
          <div className="settings-section danger">
            <div className="settings-section-head">
              <h3>Danger zone</h3>
              <p>Irreversible actions on your account.</p>
            </div>
            <div className="settings-section-body">
              <div className="settings-row">
                <div className="settings-row-content">
                  <div className="settings-row-title">Delete account</div>
                  <div className="settings-row-meta">
                    Permanently remove your account and all associated data. This cannot be undone.
                  </div>
                </div>
                <button className="btn btn-danger" disabled>
                  <Icons.Trash size={14} /> Delete account
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
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
    <div className="settings-row">
      <div className="settings-row-content">
        <div className="settings-row-title">
          Authenticator app {enrolled && <span className="badge success">Enabled</span>}
        </div>
        <div className="settings-row-meta">
          Generate one-time codes with apps like 1Password, Authy, or Google Authenticator.
        </div>
        {!enrolled && totpInput && (
          <div className="mt-3" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {qrSrc && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <img src={qrSrc} alt="TOTP QR code" width={160} height={160} style={{ borderRadius: 8, border: '1px solid var(--border)' }} />
                <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                  Scan with your authenticator app, or enter the secret manually:
                  {secret && <div className="mono mt-1" style={{ wordBreak: 'break-all' }}>{secret}</div>}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className={`input ${totpErr ? 'has-error' : ''}`}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                style={{ maxWidth: 180, fontFamily: 'var(--font-mono)', textAlign: 'center', letterSpacing: 4 }}
              />
              <button className="btn btn-primary" onClick={() => submit('verify')} disabled={submitting || code.length < 6}>
                {submitting ? <span className="spinner" /> : 'Verify & enable'}
              </button>
            </div>
            {(totpErr || flowLevelErrs.length > 0) && (
              <div className="field-error" style={{ color: 'var(--danger)', fontSize: 13 }}>
                {totpErr || flowLevelErrs[0]}
                <span className="muted" style={{ marginLeft: 6 }}>
                  · Codes rotate every 30s — wait for a new one if you mistyped.
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      {enrolled && (
        <button className="btn btn-secondary" onClick={() => submit('unlink')} disabled={submitting}>
          Disable
        </button>
      )}
    </div>
  )
}

function MfaWebauthnSection({ flow }: { flow: SettingsFlow; onChanged: () => void }) {
  if (!hasGroup(flow, 'webauthn')) return null
  const remove = getInput(flow, 'webauthn_remove')
  const enrolled = !!remove
  return (
    <div className="settings-row">
      <div className="settings-row-content">
        <div className="settings-row-title">
          Passkeys & security keys {enrolled && <span className="badge success">Active</span>}
        </div>
        <div className="settings-row-meta">
          Use Face ID, Touch ID, or a hardware security key to sign in without a password.
        </div>
        <div className="settings-row-meta mt-1" style={{ color: 'var(--warn)' }}>
          Coming soon — passkey enrollment requires a browser credential prompt
          that this UI does not implement yet.
        </div>
      </div>
      <button className="btn btn-secondary" disabled>
        <Icons.Plus size={14} /> Add a passkey
      </button>
    </div>
  )
}

function MfaLookupSection({ flow, onChanged }: { flow: SettingsFlow; onChanged: () => void }) {
  if (!hasGroup(flow, 'lookup_secret')) return null
  const [submitting, setSubmitting] = useState(false)
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
    <div className="settings-row">
      <div className="settings-row-content">
        <div className="settings-row-title">Backup codes</div>
        <div className="settings-row-meta">
          Use these once if you lose access to your other methods. Store them somewhere safe.
        </div>
        {codes.length > 0 && (
          <>
            <div className="codes-grid mt-3">
              {codes.map((c, i) => (
                <div key={i}><span className="num">{i + 1}</span><span className="code">{c}</span></div>
              ))}
            </div>
            {confirm && (
              <button className="btn btn-primary mt-3" disabled={submitting} onClick={() => submit('confirm')}>
                I&apos;ve saved them — confirm
              </button>
            )}
          </>
        )}
      </div>
      <div className="btn-row">
        {reveal && !codesText && (
          <button className="btn btn-secondary" disabled={submitting} onClick={() => submit('reveal')}>
            View codes
          </button>
        )}
        {regenerate && (
          <button className="btn btn-secondary" disabled={submitting} onClick={() => submit('regenerate')}>
            Generate new set
          </button>
        )}
      </div>
    </div>
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
