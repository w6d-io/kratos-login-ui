'use client'

import { Banner } from '@/components/ui/Banner'
import { Icons } from '@/components/ui/Icons'
import { FlowCard } from '@/components/flow/FlowCard'
import { AccountChip } from '@/components/flow/Parts'
import { formatUntil } from '@/components/OAuthViews'
import type { StepUpRefusal, StepUpView } from '@/lib/oauth2-step-up'

const PROTECTED = 'publishing sites, changing sign-in emails and changing groups'

/** "12 more hours", or in days when whole ones (a personal key's 720 hours is "30 more days"). */
export function windowLength(hours: number): string {
  if (hours >= 48 && hours % 24 === 0) return `${hours / 24} more days`
  return `${hours} more ${hours === 1 ? 'hour' : 'hours'}`
}

interface ConfirmProps {
  view: StepUpView
  busy: boolean
  error: string | null
  switchHref: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * "Confirm two-step sign-in for <app>": the second factor was just proven (the page made sure of it);
 * confirming lets this assistant's sign-in (or key) do protected actions again for the window.
 */
export function StepUpConfirmView({ view, busy, error, switchHref, onConfirm, onCancel }: ConfirmProps) {
  const span = view.hours ? `for ${windowLength(view.hours)}` : 'again for a while'
  return (
    <FlowCard
      icon={<Icons.ShieldCheck size={20} />}
      title={<>Confirm two-step sign-in for {view.name}</>}
      subtitle={`Protected actions — ${PROTECTED} — will work ${span}.`}
    >
      {view.account && <AccountChip identifier={view.account} switchHref={switchHref} />}
      <dl className="consent-facts">
        <div>
          <dt>{view.kind === 'personal' ? 'Personal key' : 'App'}</dt>
          <dd>
            {view.name} {view.kind === 'oauth' && <span className="badge warn">Unverified name</span>}
            <span className="consent-fact-hint">
              {view.kind === 'personal' ? 'The key your assistant uses.' : 'The assistant that asked for this link.'}
            </span>
          </dd>
        </div>
      </dl>
      <p className="small muted" style={{ margin: '0 0 var(--space-4)' }}>
        Confirm only if your assistant just asked you to. Everything else it does is unchanged.
      </p>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="btn-row">
        <button type="button" className="btn btn-secondary btn-block" onClick={onCancel} disabled={busy}>
          <Icons.X size={16} /> Cancel
        </button>
        <button type="button" className="btn btn-primary btn-block" onClick={onConfirm} disabled={busy}>
          {busy ? <span className="spinner" aria-hidden /> : <Icons.Check size={16} />} Confirm
        </button>
      </div>
    </FlowCard>
  )
}

/** Refreshed: back to the assistant, which retries what it was doing. */
export function StepUpDoneView({ name, until }: { name: string | null; until: string | null }) {
  return (
    <FlowCard
      icon={<Icons.CheckCircle size={20} />}
      tone="success"
      title="Done — go back to your assistant and retry"
      subtitle={
        until
          ? `Protected actions work for ${name ?? 'your assistant'} until ${formatUntil(until)}. Ask it to try again.`
          : `Protected actions work again for ${name ?? 'your assistant'}. Ask it to try again.`
      }
    >
      <p className="small muted" style={{ margin: 0 }}>You can close this tab.</p>
    </FlowCard>
  )
}

export type StepUpEndKind = StepUpRefusal | 'cancelled' | 'expired' | 'unavailable' | 'stuck'

const ENDS: Record<StepUpEndKind, { title: string; body: string; warn?: boolean }> = {
  cancelled: { title: 'Nothing changed', body: 'Protected actions stay paused for your assistant. You can close this tab.' },
  expired: { title: 'This link has expired', body: 'It is valid for a few minutes and only once. Ask your assistant for a new one.' },
  unavailable: { title: 'We can’t confirm right now', body: 'Something on our side didn’t answer in time. Nothing changed — try again in a moment.' },
  stuck: { title: 'We couldn’t confirm your second factor', body: 'The confirmation didn’t stick. Try again, or ask your assistant for a new link.' },
  wrong_account: { title: 'This link is for another account', body: 'You’re signed in with a different account than the assistant uses. Switch account, or ask the assistant’s owner to open it.', warn: true },
  protected_actions_off: { title: 'Protected actions are turned off', body: 'An administrator has turned off protected actions for AI assistants, so there is nothing to confirm.', warn: true },
  protected_actions_not_allowed: { title: 'This assistant can’t do protected actions', body: 'It was connected without them. To allow them, connect it again (or create a new key) and tick protected actions.', warn: true },
  credential_gone: { title: 'This assistant is no longer connected', body: 'Its sign-in or key was disconnected or has expired. Connect it again from the assistant.', warn: true },
  mcp_disabled: { title: 'AI assistants are turned off', body: 'An administrator has turned off AI assistants for this platform.', warn: true },
  unknown: { title: 'This can’t be confirmed', body: 'The request was refused. Nothing changed.', warn: true },
}

/** Every way the page can end without a refresh. */
export function StepUpEndView({ kind, onRetry, switchHref }: { kind: StepUpEndKind; onRetry?: () => void; switchHref?: string }) {
  const end = ENDS[kind]
  return (
    <FlowCard icon={end.warn ? <Icons.Lock size={20} /> : <Icons.ShieldCheck size={20} />} tone={end.warn ? 'warn' : 'neutral'} title={end.title} subtitle={end.body}>
      {(onRetry || (kind === 'wrong_account' && switchHref)) && (
        <div className="form-actions" style={{ marginTop: 0 }}>
          {onRetry && (
            <button type="button" className="btn btn-primary btn-block" onClick={onRetry}>
              <Icons.RefreshCcw size={16} /> Try again
            </button>
          )}
          {kind === 'wrong_account' && switchHref && (
            <a href={switchHref} className="btn btn-secondary btn-block"><Icons.User size={16} /> Switch account</a>
          )}
        </div>
      )}
    </FlowCard>
  )
}
