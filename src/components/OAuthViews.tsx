'use client'

import { useId, useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Checkbox } from '@/components/ui/Checkbox'
import { Icons } from '@/components/ui/Icons'
import { FlowCard } from '@/components/flow/FlowCard'
import { AccountChip } from '@/components/flow/Parts'
import { groupScopes, scopeHint, type ConsentDecision, type ConsentView, type RefusedKind } from '@/lib/oauth2'

/** "14:05" (or "Today, 14:05"), or "Tue 1 Oct, 14:05" when it is not today. */
export function formatUntil(iso: string, now: Date = new Date(), today = ''): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === now.toDateString()
    ? `${today}${time}`
    : `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`
}

interface ConsentFormProps {
  view: ConsentView
  platformName: string
  busy: 'allow' | 'deny' | null
  error: string | null
  switchHref: string
  onDecide: (d: ConsentDecision) => void
}

/**
 * "<app> wants to act as you": who asks (its self-chosen name, flagged unverified), where the
 * answer goes (an app on this computer), for which account, with all your permissions or the
 * ones you tick, and whether protected actions work for the next hours. Allow / Deny.
 */
export function ConsentForm({ view, platformName, busy, error, switchHref, onDecide }: ConsentFormProps) {
  const [mode, setMode] = useState<'all' | 'chosen'>('all')
  const [picked, setPicked] = useState<string[]>([])
  const [protectedActions, setProtectedActions] = useState(true)
  const ids = useId()
  const groups = groupScopes(view.catalog)
  const entries = new Map(view.catalog.map((c) => [c.scope, c]))
  const offered = new Set(entries.keys())
  const scopes = picked.filter((s) => offered.has(s))
  const noneHeld = view.catalog.length === 0
  const canAllow = !busy && (mode === 'all' || scopes.length > 0)
  const pa = view.protectedActions

  const toggle = (scope: string, on: boolean) => setPicked((p) => (on ? [...new Set([...p, scope])] : p.filter((s) => s !== scope)))
  const toggleGroup = (list: string[], on: boolean) => setPicked((p) => (on ? [...new Set([...p, ...list])] : p.filter((s) => !list.includes(s))))
  const decide = (decision: 'allow' | 'deny') =>
    onDecide({ decision, mode, scopes: mode === 'chosen' ? scopes : [], protectedActions: pa.offered && protectedActions })

  return (
    <FlowCard
      icon={<Icons.Plug size={20} />}
      title={<>{view.client.name} wants to act as you</>}
      subtitle={`An app on this computer asks to use your ${platformName} account. Allow it only if you just started signing in from that app.`}
      footer={<span className="small">You can disconnect it at any time from Connections in the console.</span>}
    >
      {view.account && <AccountChip identifier={view.account} switchHref={switchHref} />}

      <dl className="consent-facts">
        <div>
          <dt>App</dt>
          <dd>
            {view.client.name} <span className="badge warn">Unverified name</span>
            <span className="consent-fact-hint">The app chose this name itself.</span>
          </dd>
        </div>
        {view.client.redirectHost && (
          <div>
            <dt>Sends you back to</dt>
            <dd>
              <code>{view.client.redirectHost}</code>
              <span className="consent-fact-hint">An app running on this computer.</span>
            </dd>
          </div>
        )}
        {view.client.registeredAt && (
          <div>
            <dt>Registered</dt>
            <dd>{formatUntil(view.client.registeredAt, new Date(), 'Today, ')}</dd>
          </div>
        )}
      </dl>

      {error && <Banner tone="danger">{error}</Banner>}

      <form onSubmit={(e) => { e.preventDefault(); if (canAllow) decide('allow') }}>
        <fieldset className="consent-section">
          <legend className="field-label">What it may do</legend>
          <div className="choice-list">
            <label className="choice">
              <input type="radio" name={`${ids}-mode`} value="all" checked={mode === 'all'} onChange={() => setMode('all')} />
              <span className="choice-text">
                <span>All my permissions</span>
                <span className="choice-hint">Whatever you can do, now and as your access changes.</span>
              </span>
            </label>
            <label className="choice">
              <input type="radio" name={`${ids}-mode`} value="chosen" checked={mode === 'chosen'} onChange={() => setMode('chosen')} disabled={noneHeld} />
              <span className="choice-text">
                <span>Choose permissions</span>
                <span className="choice-hint">{noneHeld ? 'You hold no permission it asked for.' : 'Only the ones you tick, among those you hold.'}</span>
              </span>
            </label>
          </div>
          <p className="field-hint">Checked again on every call: when you lose a permission, the app loses it too.</p>
        </fieldset>

        {mode === 'chosen' && (
          <div className="consent-section" role="group" aria-label="Chosen permissions">
            {groups.map((g) => {
              const all = g.scopes.every((s) => scopes.includes(s))
              return (
                <fieldset key={g.group} className="scope-group">
                  <legend>
                    <span>{g.label}</span>
                    <button type="button" className="btn-link small" onClick={() => toggleGroup(g.scopes, !all)} aria-label={`${all ? 'Clear' : 'Select all'} ${g.label}`}>
                      {all ? 'Clear' : 'Select all'}
                    </button>
                  </legend>
                  {g.scopes.map((s) => {
                    const e = entries.get(s)
                    return (
                      <Checkbox key={s} checked={scopes.includes(s)} onChange={(on) => toggle(s, on)}>
                        <span className="scope-row">
                          <span className="scope-title">
                            {e?.label ?? <code className="scope-name">{s}</code>}
                            <span className={`badge ${scopeHint(s) === 'Read only' ? '' : 'info'}`}>{scopeHint(s)}</span>
                            {e?.protected && <span className="badge warn">Protected action</span>}
                          </span>
                          {e?.label && <code className="scope-name">{s}</code>}
                        </span>
                      </Checkbox>
                    )
                  })}
                </fieldset>
              )
            })}
            {scopes.length === 0 && <p className="field-hint" id={`${ids}-none`}>Tick at least one permission, or choose all your permissions.</p>}
          </div>
        )}

        {pa.offered && (
          <fieldset className="consent-section">
            <legend className="field-label">Protected actions</legend>
            <Checkbox checked={protectedActions} onChange={setProtectedActions}>
              Allow publishing sites, changing sign-in emails and changing groups
              {pa.until ? <> until <strong>{formatUntil(pa.until)}</strong></> : null}
            </Checkbox>
            <p className="field-hint">
              These normally need a second factor from the last few minutes. The one you just confirmed counts for them
              for {pa.hours} hours. After that the app can still do everything else;
              to do them again, sign in again from the app.
            </p>
          </fieldset>
        )}

        {view.signedInUntil && (
          <p className="small muted" style={{ margin: 'var(--space-4) 0 0' }}>
            <Icons.Clock size={13} aria-hidden /> The app stays signed in until {formatUntil(view.signedInUntil)} at most, then asks you to sign in again.
          </p>
        )}

        <div className="btn-row" style={{ marginTop: 'var(--space-5)' }}>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => decide('deny')} disabled={!!busy}>
            {busy === 'deny' ? <span className="spinner" aria-hidden /> : <Icons.X size={16} />} Deny
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={!canAllow}
            aria-describedby={mode === 'chosen' && scopes.length === 0 ? `${ids}-none` : undefined}
          >
            {busy === 'allow' ? <span className="spinner" aria-hidden /> : <Icons.Check size={16} />} Allow
          </button>
        </div>
      </form>
    </FlowCard>
  )
}

const REFUSED: Record<RefusedKind, { title: string; body: string }> = {
  mcp_disabled: {
    title: 'AI assistants are turned off',
    body: 'An administrator has turned off AI assistants for this platform, so no app can sign in with your account.',
  },
  oauth_disabled: {
    title: 'Signing in from an app is turned off',
    body: 'An administrator has turned off signing in with a browser for AI assistants. Ask them, or use a personal key from the console.',
  },
  group_not_allowed: {
    title: 'AI assistants aren’t enabled for your groups',
    body: 'A platform administrator chooses which groups may use AI assistants. Ask them to add one of your groups.',
  },
  client_bound_elsewhere: {
    title: 'This app is already signed in as someone else',
    body: 'This registration of the app belongs to another account. Sign out of the app, then connect it again so it registers afresh.',
  },
  not_mcp_client: {
    title: 'This app can’t sign in here',
    body: 'Only AI assistant apps can sign in this way.',
  },
  pkce_required: {
    title: 'This app’s sign-in isn’t secure enough',
    body: 'The app didn’t use the protected sign-in method this platform requires. Update the app, then sign in again from it.',
  },
  invalid_target: {
    title: 'This app asked for the wrong server',
    body: 'The app asked to use a server this sign-in doesn’t cover. Check the server address configured in the app.',
  },
  wrong_account: {
    title: 'This sign-in belongs to another account',
    body: 'You’re signed in with a different account than the one that started this sign-in. Start again from the app.',
  },
  unknown: {
    title: 'This app can’t sign in with your account',
    body: 'The sign-in was refused. Nothing was shared with the app.',
  },
  expired: {
    title: 'This sign-in request has ended',
    body: 'It expired or was already used. Start signing in again from the app.',
  },
  unavailable: {
    title: 'We can’t finish signing in right now',
    body: 'Something on our side didn’t answer in time. Nothing was shared with the app — try again in a moment.',
  },
}

/**
 * Why the app could not sign in, calmly, and the way back: "Return to your app" follows Hydra's
 * reject URL (kept server-side, in a cookie), so the app learns it was refused and stops waiting.
 */
export function RefusedView({ kind, returnHref, retryHref }: { kind: RefusedKind; returnHref: string | null; retryHref: string | null }) {
  const copy = REFUSED[kind]
  const warn = kind !== 'expired' && kind !== 'unavailable'
  return (
    <FlowCard icon={warn ? <Icons.Lock size={20} /> : <Icons.Plug size={20} />} tone={warn ? 'warn' : 'neutral'} title={copy.title} subtitle={copy.body}>
      <div className="form-actions" style={{ marginTop: 0 }}>
        {retryHref && (
          <a href={retryHref} className="btn btn-primary btn-block">
            <Icons.RefreshCcw size={16} /> Try again
          </a>
        )}
        {returnHref ? (
          <a href={returnHref} className={`btn ${retryHref ? 'btn-secondary' : 'btn-primary'} btn-block`}>
            <Icons.ArrowLeft size={16} /> Return to your app
          </a>
        ) : (
          !retryHref && <p className="small muted" style={{ margin: 0 }}>You can close this tab.</p>
        )}
      </div>
    </FlowCard>
  )
}
