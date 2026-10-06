'use client'

import { FlowCard } from '@/components/flow/FlowCard'
import { AccountChip } from '@/components/flow/Parts'
import { Banner } from '@/components/ui/Banner'
import { Icons } from '@/components/ui/Icons'
import { roleLabel, roleText } from '@/lib/account'
import type { InvitationState } from '@/lib/invitation'

export interface InvitationViewProps {
  state: InvitationState
  busy: 'accept' | 'decline' | null
  error: string | null
  onAccept: () => void
  onDecline: () => void
  onRetry: () => void
}

const toAccount = <a href="/account">Your organizations</a>

function Roles({ roles }: { roles: string[] }) {
  if (roles.length === 0) return <p className="muted small" style={{ margin: 0 }}>You’ll join as a member. Roles can be given later.</p>
  return (
    <ul className="invite-roles">
      {roles.map((r) => {
        const { hint } = roleLabel(r)
        return <li key={r}><strong>{roleText(r)}</strong>{hint && <span className="muted"> — {hint}</span>}</li>
      })}
    </ul>
  )
}

/** The page an invitation link opens (/invitation?token=…); the state is worked out by the page. */
export function InvitationView({ state, busy, error, onAccept, onDecline, onRetry }: InvitationViewProps) {
  switch (state.kind) {
    case 'bad-link':
      return (
        <FlowCard icon={<Icons.AlertTriangle size={20} />} tone="warn" title="This link is incomplete" subtitle="Open the invitation link exactly as you received it, or ask for a new one." footer={toAccount} />
      )

    case 'signed-out':
      return (
        <FlowCard
          icon={<Icons.Mail size={20} />}
          title="You’re invited to an organization"
          subtitle="Sign in with the email address the invitation was sent to. New here? Create an account with that address."
        >
          <div className="secondary-actions" style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <a className="btn btn-primary btn-block" href={state.signInHref}>Sign in</a>
            <a className="btn btn-secondary btn-block" href={state.registerHref}>Create an account</a>
          </div>
        </FlowCard>
      )

    case 'unverified':
      return (
        <FlowCard
          icon={<Icons.Mail size={20} />}
          tone="warn"
          title={state.invitation?.orgName ? `Verify your email to join ${state.invitation.orgName}` : 'Verify your email address first'}
          subtitle={`To accept, confirm that ${state.email || 'your address'} is yours. You’ll come back here afterwards.`}
        >
          {state.invitation && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <div className="field-label">Your roles there</div>
              <Roles roles={state.invitation.roles} />
            </div>
          )}
          <a className="btn btn-primary btn-block" href={state.verifyHref}>Verify my email</a>
        </FlowCard>
      )

    case 'wrong-account':
      return (
        <FlowCard
          icon={<Icons.User size={20} />}
          tone="warn"
          title="This invitation is for another address"
          subtitle="Sign in with the email address the invitation was sent to."
          footer={toAccount}
        >
          <AccountChip identifier={state.email} />
          <a className="btn btn-primary btn-block mt-4" href={state.switchHref}>Use another account</a>
        </FlowCard>
      )

    case 'gone':
      return (
        <FlowCard
          icon={<Icons.Clock size={20} />}
          tone="warn"
          title="This invitation can’t be used"
          subtitle="It has expired, was taken back, or was already used. Ask the person who invited you for a new one."
          footer={toAccount}
        />
      )

    case 'declined':
      return (
        <FlowCard icon={<Icons.Check size={20} />} title="Invitation declined" subtitle={`You won’t join ${state.orgName || 'the organization'}.`} footer={toAccount} />
      )

    case 'unavailable':
      return (
        <FlowCard icon={<Icons.Plug size={20} />} title="We can’t open this invitation right now" subtitle="Try again in a moment. The link still works." footer={toAccount}>
          <button type="button" className="btn btn-primary btn-block" onClick={onRetry}><Icons.RefreshCcw size={16} /> Try again</button>
        </FlowCard>
      )

    case 'ready': {
      const inv = state.invitation
      return (
        <FlowCard
          icon={<Icons.Users size={20} />}
          title={inv?.orgName ? `Join ${inv.orgName}` : 'Join an organization'}
          subtitle={inv?.invitedBy ? `${inv.invitedBy} invited you. You’ll share what its members work on.` : 'You’ve been invited. You’ll share what its members work on.'}
          footer={<a href="/account">Not now</a>}
        >
          <AccountChip identifier={state.email} switchHref={state.switchHref} />
          {inv && (
            <div className="mt-4">
              <div className="field-label">Your roles there</div>
              <Roles roles={inv.roles} />
            </div>
          )}
          {error && <div className="mt-4"><Banner tone="danger">{error}</Banner></div>}
          <div className="mt-5" style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <button type="button" className="btn btn-primary btn-block" onClick={onAccept} disabled={!!busy}>
              {busy === 'accept' ? <><span className="spinner" aria-hidden /> Joining…</> : 'Accept invitation'}
            </button>
            {inv && (
              <button type="button" className="btn btn-secondary btn-block" onClick={onDecline} disabled={!!busy}>
                {busy === 'decline' ? <><span className="spinner" aria-hidden /> Declining…</> : 'Decline'}
              </button>
            )}
          </div>
        </FlowCard>
      )
    }
  }
}
