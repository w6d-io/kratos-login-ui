'use client'

import { useState, type FormEvent } from 'react'
import { Section } from '@/components/settings/SettingsSections'
import { Banner } from '@/components/ui/Banner'
import { Field } from '@/components/ui/Field'
import { Icons } from '@/components/ui/Icons'
import { CopyButton } from '@/components/flow/Parts'
import { errorText, isDomain, parseApiKeys, parseDomain, parseDomains, shortDate, type ApiKey, type EmailDomain } from '@/lib/account'
import { ConfirmAction, LoadError, LoadingLine, change, useAccountGet } from './AccountParts'

const readKeys = (raw: unknown) => parseApiKeys(raw)

/** The organization's API keys: list and revoke. New keys come from the platform team. */
export function ApiKeysSection({ orgId, orgName, canRevoke }: { orgId: string; orgName: string; canRevoke: boolean }) {
  const { state, reload } = useAccountGet(`organizations/${orgId}/api-keys`, readKeys)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const revoke = async (k: ApiKey) => {
    setBusy(k.clientId)
    setError(null)
    const a = await change('DELETE', `organizations/${orgId}/api-keys/${encodeURIComponent(k.clientId)}`)
    setBusy(null)
    if (a.ok) reload()
    else setError(errorText(a))
  }

  return (
    <Section
      id={`keys-${orgId}`}
      title="API keys"
      description={`Keys that let programs act for ${orgName}. Keys are created by the platform team: ask them when you need a new one.`}
    >
      {error && <Banner tone="danger" onDismiss={() => setError(null)}>{error}</Banner>}
      {state.kind === 'loading' && <LoadingLine label="Loading keys…" />}
      {state.kind === 'error' && <LoadError message={state.message} onRetry={reload} />}
      {state.kind === 'ok' && state.data.length === 0 && <p className="muted" style={{ margin: 0 }}>No API keys.</p>}
      {state.kind === 'ok' && state.data.map((k) => {
        const name = k.label || k.clientId
        return (
          <div key={k.clientId} className="settings-row">
            <div className="settings-row-icon" aria-hidden><Icons.Key size={18} /></div>
            <div className="settings-row-content">
              <div className="settings-row-title">
                {name}
                {k.expired && <span className="badge warn">Expired</span>}
              </div>
              <div className="settings-row-meta">
                {k.lastUsedAt ? `Last used ${shortDate(k.lastUsedAt)}` : 'Never used'}
                {k.expiresAt && !k.expired && <> · Expires {shortDate(k.expiresAt)}</>}
                {k.createdBy && <> · Made by {k.createdBy}</>}
              </div>
            </div>
            {canRevoke && (
              <div className="settings-row-actions">
                <ConfirmAction
                  label="Revoke"
                  ariaLabel={`Revoke ${name}`}
                  question="Programs using it stop working at once."
                  confirmLabel="Revoke"
                  busy={busy === k.clientId}
                  onConfirm={() => void revoke(k)}
                />
              </div>
            )}
          </div>
        )
      })}
    </Section>
  )
}

function DomainRecord({ record }: { record: NonNullable<EmailDomain['record']> }) {
  return (
    <dl className="dns-record">
      <dt>Type</dt><dd><code>TXT</code></dd>
      <dt>Name</dt><dd><code>{record.name}</code> <CopyButton text={record.name} className="btn btn-ghost btn-sm" /></dd>
      <dt>Value</dt><dd><code>{record.value}</code> <CopyButton text={record.value} className="btn btn-ghost btn-sm" /></dd>
    </dl>
  )
}

/** Email domains proven by a DNS TXT record: people signing up with one join this organization. */
export function DomainsSection({ orgId, orgName, canWrite }: { orgId: string; orgName: string; canWrite: boolean }) {
  const { state, reload } = useAccountGet(`organizations/${orgId}/domains`, parseDomains)
  const [domain, setDomain] = useState('')
  const [claimError, setClaimError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const claim = async (e: FormEvent) => {
    e.preventDefault()
    const d = domain.trim().toLowerCase().replace(/^@/, '')
    if (!isDomain(d)) { setClaimError('Enter a domain, like example.com.'); return }
    setBusy('claim')
    setClaimError(null)
    const a = await change('POST', `organizations/${orgId}/domains`, { domain: d })
    setBusy(null)
    if (a.ok && parseDomain(a.data)) { setDomain(''); reload(); return }
    setClaimError(errorText(a))
  }

  const verify = async (d: EmailDomain) => {
    setBusy(d.domain)
    setNotice(null)
    const a = await change('POST', `organizations/${orgId}/domains/${d.domain}/verify`)
    setBusy(null)
    if (a.ok) { setNotice({ tone: 'success', text: `${d.domain} is verified.` }); reload() }
    else setNotice({ tone: 'danger', text: errorText(a) })
  }

  const release = async (d: EmailDomain) => {
    setBusy(d.domain)
    setNotice(null)
    const a = await change('DELETE', `organizations/${orgId}/domains/${d.domain}`)
    setBusy(null)
    if (a.ok) reload()
    else setNotice({ tone: 'danger', text: errorText(a) })
  }

  return (
    <Section
      id={`domains-${orgId}`}
      title="Email domains"
      description={`Prove you own a domain and people who sign up with an address there can join ${orgName} on apps that allow it.`}
    >
      {notice && <Banner tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Banner>}
      {state.kind === 'loading' && <LoadingLine label="Loading domains…" />}
      {state.kind === 'error' && <LoadError message={state.message} onRetry={reload} />}
      {state.kind === 'ok' && state.data.length === 0 && <p className="muted" style={{ margin: 0 }}>No domains yet.</p>}
      {state.kind === 'ok' && state.data.map((d) => (
        <div key={d.domain} className="settings-row">
          <div className="settings-row-icon" aria-hidden><Icons.Globe size={18} /></div>
          <div className="settings-row-content">
            <div className="settings-row-title">
              {d.domain}
              {d.verified ? <span className="badge success">Verified</span> : <span className="badge warn">Not verified yet</span>}
            </div>
            {!d.verified && d.record && (
              <>
                <div className="settings-row-meta">Add this record at your DNS provider, then check it.</div>
                <DomainRecord record={d.record} />
              </>
            )}
          </div>
          {canWrite && (
            <div className="settings-row-actions">
              {!d.verified && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void verify(d)} disabled={busy === d.domain}>
                  {busy === d.domain ? <><span className="spinner" aria-hidden /> Checking…</> : 'Check record'}
                </button>
              )}
              <ConfirmAction
                label="Release"
                ariaLabel={`Release ${d.domain}`}
                question="New sign-ups with it won’t join. People already here stay."
                confirmLabel="Release"
                busy={busy === d.domain}
                onConfirm={() => void release(d)}
              />
            </div>
          )}
        </div>
      ))}
      {canWrite && (
        <form onSubmit={claim} noValidate className="inline-form mt-4">
          <Field label="Add a domain" htmlFor={`domain-${orgId}`} error={claimError ?? undefined}>
            <input
              id={`domain-${orgId}`}
              className="input"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <button type="submit" className="btn btn-secondary" disabled={busy === 'claim'}>
            {busy === 'claim' ? <><span className="spinner" aria-hidden /> Adding…</> : <><Icons.Plus size={14} /> Add</>}
          </button>
        </form>
      )}
    </Section>
  )
}
