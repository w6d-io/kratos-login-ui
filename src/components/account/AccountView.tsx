'use client'

import { Section } from '@/components/settings/SettingsSections'
import { Banner } from '@/components/ui/Banner'
import { Icons } from '@/components/ui/Icons'
import { roleText, shortDate, type Invitation, type MyOrg } from '@/lib/account'
import { RoleChips } from './AccountParts'
import { OrgPanel } from './OrgPanel'

export interface AccountMe {
  id: string
  email: string
  verified: boolean
}

export const INVITATIONS_TAB = 'invitations'

export interface AccountViewProps {
  me: AccountMe
  orgs: MyOrg[]
  invitations: Invitation[]
  /** An org id, or INVITATIONS_TAB. */
  selected: string | null
  onSelect: (tab: string) => void
  /** Just joined through an invitation: roles the inviter could no longer give are named. */
  joined: { orgId: string; dropped: string[] } | null
  onDismissJoined: () => void
  onAccept: (i: Invitation) => void
  onDecline: (i: Invitation) => void
  /** The invitation being answered, and the last answer's problem. */
  answering: string | null
  answerError: string | null
  verifyHref: string
}

function Nav({ orgs, invitations, selected, onSelect }: Pick<AccountViewProps, 'orgs' | 'invitations' | 'selected' | 'onSelect'>) {
  const link = (tab: string, label: string, icon: keyof typeof Icons, badge?: number) => {
    const Icon = Icons[icon]
    return (
      <a
        key={tab}
        href={tab === INVITATIONS_TAB ? '#invitations' : `#org-${tab}`}
        className="settings-nav-link"
        aria-current={selected === tab ? 'page' : undefined}
        onClick={(e) => { e.preventDefault(); onSelect(tab) }}
      >
        <Icon size={15} />
        <span className="nav-org">{label}</span>
        {badge ? <span className="badge info nav-status">{badge}</span> : null}
      </a>
    )
  }
  return (
    <nav className="settings-nav" aria-label="Your organizations">
      <h2 className="settings-nav-title">Your organizations</h2>
      {invitations.length > 0 && link(INVITATIONS_TAB, 'Invitations', 'Inbox', invitations.length)}
      {orgs.map((o) => link(o.id, o.name, 'Users'))}
      <div className="settings-nav-sep" />
      <a className="settings-nav-link" href="/settings">
        <Icons.Settings size={15} />
        <span>Account settings</span>
      </a>
      <a className="settings-nav-link" href="/logout">
        <Icons.LogOut size={15} />
        <span>Sign out</span>
      </a>
    </nav>
  )
}

export function MyInvitations({ invitations, onAccept, onDecline, answering }: Pick<AccountViewProps, 'invitations' | 'onAccept' | 'onDecline' | 'answering'>) {
  return (
    <Section id="invitations" title="Invitations for you" description="Join an organization to work on what its members share.">
      {invitations.map((i) => (
        <div key={i.id} className="settings-row">
          <div className="settings-row-icon" aria-hidden><Icons.Inbox size={18} /></div>
          <div className="settings-row-content">
            <div className="settings-row-title">{i.orgName || 'An organization'}</div>
            <div className="settings-row-meta">
              {i.invitedBy ? <>From {i.invitedBy} · </> : null}
              <RoleChips roles={i.roles} empty="No roles yet" />
              {i.expiresAt && <> · Until {shortDate(i.expiresAt)}</>}
            </div>
          </div>
          <div className="settings-row-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onAccept(i)} disabled={!!answering} aria-label={`Accept the invitation to ${i.orgName || 'this organization'}`}>
              {answering === i.id ? <><span className="spinner" aria-hidden /> Joining…</> : 'Accept'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDecline(i)} disabled={!!answering} aria-label={`Decline the invitation to ${i.orgName || 'this organization'}`}>Decline</button>
          </div>
        </div>
      ))}
    </Section>
  )
}

export function AccountView(props: AccountViewProps) {
  const { me, orgs, invitations, selected, joined } = props
  const org = orgs.find((o) => o.id === selected) ?? null
  const joinedOrg = joined ? orgs.find((o) => o.id === joined.orgId) : null
  const empty = orgs.length === 0 && invitations.length === 0

  return (
    <div className="settings">
      <Nav orgs={orgs} invitations={invitations} selected={selected} onSelect={props.onSelect} />
      <div className="settings-content">
        {joined && (
          <Banner tone={joined.dropped.length ? 'warn' : 'success'} title={`You joined ${joinedOrg?.name ?? 'the organization'}`} onDismiss={props.onDismissJoined}>
            {joined.dropped.length
              ? `Some roles in the invitation weren’t given, because the person who invited you can no longer give them: ${joined.dropped.map(roleText).join(', ')}. Ask them or an owner.`
              : null}
          </Banner>
        )}
        {props.answerError && <Banner tone="danger">{props.answerError}</Banner>}
        {!me.verified && (
          <Banner tone="warn" title="Verify your email address" actions={<a className="btn-link" href={props.verifyHref}>Verify now</a>}>
            Invitations sent to {me.email || 'you'} show up here once your address is verified.
          </Banner>
        )}
        {empty && (
          <Section id="no-orgs" title="No organizations yet" description="An organization is a group of people who share the same things in an app.">
            <p className="muted" style={{ margin: 0 }}>When someone invites you to one, the invitation shows up here.</p>
          </Section>
        )}
        {selected === INVITATIONS_TAB && invitations.length > 0 && (
          <MyInvitations invitations={invitations} onAccept={props.onAccept} onDecline={props.onDecline} answering={props.answering} />
        )}
        {org && <OrgPanel key={org.id} org={org} myId={me.id} />}
      </div>
    </div>
  )
}
