'use client'

import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@ory/client'
import { Field } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Icons } from '@/components/ui/Icons'
import { PasswordRules } from '@/components/flow/Parts'
import { describeDevice, relativeTime } from '@/components/flow/device'
import type { FlowField } from '@/lib/kratos-flow'
import { fieldLabel } from '@/components/flow/labels'

export type SettingsTab = 'profile' | 'password' | 'mfa' | 'sessions' | 'danger'

const NAV: Array<{ id: SettingsTab; label: string; short: string; icon: keyof typeof Icons }> = [
  { id: 'profile', label: 'Profile', short: 'Profile', icon: 'User' },
  { id: 'password', label: 'Password', short: 'Password', icon: 'Lock' },
  { id: 'mfa', label: 'Two-step verification', short: '2-step', icon: 'Shield' },
  { id: 'sessions', label: 'Devices', short: 'Devices', icon: 'Monitor' },
  { id: 'danger', label: 'Delete account', short: 'Delete', icon: 'Trash' },
]

export function SettingsNav({ tab, setTab, mfaOn, hasPassword }: { tab: SettingsTab; setTab: (t: SettingsTab) => void; mfaOn: boolean; hasPassword: boolean }) {
  return (
    <nav className="settings-nav" aria-label="Account settings">
      <h2 className="settings-nav-title">Your account</h2>
      {NAV.filter((n) => n.id !== 'password' || hasPassword).map((n) => {
        const Icon = Icons[n.icon]
        return (
          <a
            key={n.id}
            href={`#${n.id}`}
            className="settings-nav-link"
            aria-current={tab === n.id ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); setTab(n.id) }}
          >
            <Icon size={15} />
            <span className="nav-long">{n.label}</span>
            <span className="nav-short" aria-hidden>{n.short}</span>
            {n.id === 'mfa' && (
              <span className={`badge ${mfaOn ? 'success' : 'warn'} nav-status`}>{mfaOn ? 'On' : 'Off'}</span>
            )}
          </a>
        )
      })}
      <div className="settings-nav-sep" />
      <a className="settings-nav-link" href="/account">
        <Icons.Users size={15} />
        <span>Organizations</span>
      </a>
      <a className="settings-nav-link" href="/logout">
        <Icons.LogOut size={15} />
        <span>Sign out</span>
      </a>
    </nav>
  )
}

export function Section({ id, title, description, children, footer, danger }: { id: string; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; danger?: boolean }) {
  return (
    <section className={`settings-section ${danger ? 'danger' : ''}`} aria-labelledby={`${id}-title`}>
      <div className="settings-section-head">
        <h2 id={`${id}-title`}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className="settings-section-body">{children}</div>
      {footer && <div className="settings-section-foot">{footer}</div>}
    </section>
  )
}

export function IdentityHeader({ displayName, email, verified, returnTo, mfaOn, onSetUpMfa, showMfaNudge = true }: {
  displayName: string
  email: string
  verified: boolean | null
  returnTo: string
  mfaOn: boolean
  onSetUpMfa: () => void
  showMfaNudge?: boolean
}) {
  const named = !!displayName && displayName !== email
  return (
    <div className="settings-section">
      <div className="settings-section-body">
        <div className="identity-hero">
          <div className="avatar" aria-hidden>{(displayName || email || '?').charAt(0).toUpperCase()}</div>
          <div className="identity-hero-meta">
            <div className="identity-hero-name">{named ? displayName : email || 'Your account'}</div>
            <div className="identity-hero-id">
              {named && <>{email}{' '}</>}
              {verified === true && <span className="badge success">Verified</span>}
              {verified === false && <a href="/verification" className="badge warn">Not verified — verify now</a>}
            </div>
          </div>
          {returnTo && (
            <a href={returnTo} className="btn btn-secondary btn-sm"><Icons.ArrowLeft size={14} /> Back to app</a>
          )}
        </div>
        {!mfaOn && showMfaNudge && (
          <div className="banner warn mt-4" style={{ marginBottom: 0 }} role="status">
            <div className="banner-icon"><Icons.Shield size={16} /></div>
            <div className="banner-body">
              <div className="banner-title">Add a second step to protect your account</div>
              <p>With two-step verification, a stolen password alone isn’t enough to get in.</p>
              <div className="banner-actions">
                <button type="button" className="btn-link" onClick={onSetUpMfa}>Set it up</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function ProfileSection({ traitFields, traits, setTrait, submitting, disabled, onSubmit, onReset, humanize, botCheck, botCheckPending }: {
  traitFields: FlowField[]
  traits: Record<string, string>
  setTrait: (name: string, value: string) => void
  submitting: boolean
  disabled: boolean
  onSubmit: (e: FormEvent) => void
  onReset: () => void
  humanize: (name: string) => string
  /** The bot check, drawn only while the email is being changed (saving sends a verification email). */
  botCheck?: ReactNode
  botCheckPending?: boolean
}) {
  return (
    <form onSubmit={(e) => { if (botCheckPending) { e.preventDefault(); return } onSubmit(e) }} noValidate>
      <Section
        id="profile"
        title="Profile"
        description="Your name and email, as the apps you sign in to see them."
        footer={(
          <>
            <span className="foot-note">Changing your email means verifying the new one.</span>
            <button type="button" className="btn btn-ghost" onClick={onReset} disabled={disabled}>Discard</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !!botCheckPending} aria-describedby={botCheckPending ? 'profile-bot-hint' : undefined}>
              {submitting ? <><span className="spinner" aria-hidden /> Saving…</> : 'Save changes'}
            </button>
          </>
        )}
      >
        {traitFields.map((f) => {
          const fieldId = `set-${f.name.replace(/\W/g, '-')}`
          const isEmail = f.type === 'email' || f.name.endsWith('email')
          return (
            <Field key={f.name} label={fieldLabel(f.label, humanize(f.name))} optional={!f.required && !isEmail} htmlFor={fieldId} error={f.errors[0]}>
              <input
                id={fieldId}
                name={f.name}
                type={isEmail ? 'email' : 'text'}
                className="input"
                value={traits[f.name] || ''}
                onChange={(e) => setTrait(f.name, e.target.value)}
                autoComplete={f.autocomplete || (isEmail ? 'email' : undefined)}
                autoCapitalize={isEmail ? 'none' : undefined}
              />
            </Field>
          )
        })}
        {botCheck && (
          <div className="mt-4">
            {botCheck}
            {botCheckPending && <p id="profile-bot-hint" className="small muted" style={{ margin: 'var(--space-2) 0 0' }}>A new email address gets a verification email: complete the bot check to save.</p>}
          </div>
        )}
      </Section>
    </form>
  )
}

export function PasswordSection({ value, setValue, email, error, submitting, onSubmit }: {
  value: string
  setValue: (v: string) => void
  email: string
  error?: string
  submitting: boolean
  onSubmit: (e: FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <Section
        id="password"
        title="Change password"
        description="Pick one you don’t use anywhere else. A password manager can create and remember it for you."
        footer={(
          <>
            <span className="foot-note">You may be asked to sign in again first.</span>
            <button type="submit" className="btn btn-primary" disabled={submitting || !value}>
              {submitting ? <><span className="spinner" aria-hidden /> Updating…</> : 'Update password'}
            </button>
          </>
        )}
      >
        {/* Hidden username so password managers file the new password under the right account. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <Field label="New password" htmlFor="new-pw" error={error} after={<PasswordRules password={value} identifier={email} id="new-pw-rules" />}>
          <PasswordInput id="new-pw" value={value} onChange={setValue} autoComplete="new-password" aria-describedby="new-pw-rules" required />
        </Field>
      </Section>
    </form>
  )
}

export function SessionsSection({ sessions, currentId, onRevoke, onRevokeOthers }: {
  sessions: Session[]
  currentId?: string
  onRevoke: (id: string) => void
  onRevokeOthers: () => void
}) {
  const others = sessions.filter((s) => s.id !== currentId).length
  return (
    <Section
      id="sessions"
      title="Devices"
      description="Where your account is signed in right now. Don’t recognise one? Sign it out and change your password."
      footer={others > 0 && (
        <button type="button" className="btn btn-secondary" onClick={onRevokeOthers}>
          Sign out of {others === 1 ? 'the other device' : `all ${others} other devices`}
        </button>
      )}
    >
      {sessions.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>No active sessions.</p>
      ) : sessions.map((s) => {
        const isCurrent = s.id === currentId
        const dev = (s as { devices?: Array<{ user_agent?: string; ip_address?: string; location?: string }> }).devices?.[0]
        const info = describeDevice(dev?.user_agent)
        const DeviceIcon = info.kind === 'phone' ? Icons.Smartphone : info.kind === 'tablet' ? Icons.Tablet : Icons.Laptop
        const where = dev?.location || dev?.ip_address
        return (
          <div key={s.id} className="settings-row">
            <div className="settings-row-icon" aria-hidden><DeviceIcon size={18} /></div>
            <div className="settings-row-content">
              <div className="settings-row-title">
                {info.label}
                {isCurrent && <span className="badge success">This device</span>}
              </div>
              <div className="settings-row-meta">
                Signed in {relativeTime(s.authenticated_at)}{where ? ` · ${where}` : ''}
              </div>
            </div>
            <div className="settings-row-actions">
              {isCurrent
                ? <a className="btn btn-secondary btn-sm" href="/logout">Sign out</a>
                : <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRevoke(s.id)} aria-label={`Sign out ${info.label}`}>Sign out</button>}
            </div>
          </div>
        )
      })}
    </Section>
  )
}

export function DangerSection({ helpUrl }: { helpUrl?: string | null }) {
  return (
    <Section id="danger" title="Delete account" description="Removes your account and access to every app that uses it. This can’t be undone." danger>
      <p className="muted" style={{ margin: 0 }}>
        Accounts are deleted by an administrator, so nothing is lost by accident.{' '}
        {helpUrl ? <a href={helpUrl} target="_blank" rel="noopener noreferrer">Ask for your account to be deleted</a> : 'Contact your administrator to ask for deletion.'}
      </p>
    </Section>
  )
}
