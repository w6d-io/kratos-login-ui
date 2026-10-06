'use client'

import { useState, type FormEvent } from 'react'
import { Section } from '@/components/settings/SettingsSections'
import { Banner } from '@/components/ui/Banner'
import { Field } from '@/components/ui/Field'
import { Icons } from '@/components/ui/Icons'
import { CopyButton } from '@/components/flow/Parts'
import { errorText, parseCreatedInvitation, shortDate, type Invitation, type OrgRoleOption } from '@/lib/account'
import { ConfirmAction, LoadError, LoadingLine, RoleChips, RolePicker, change, type Loaded } from './AccountParts'

/** Invite by email, with optional roles. The link is shown once, to be sent by the inviter. */
export function InviteSection({ orgId, orgName, options, pending, canWrite, onChanged, onRetry }: {
  orgId: string
  orgName: string
  options: OrgRoleOption[]
  pending: Loaded<Invitation[]>
  canWrite: boolean
  onChanged: () => void
  onRetry: () => void
}) {
  const [email, setEmail] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ email: string; link: string; expiresAt: string } | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setError('Enter their email address.'); return }
    setBusy(true)
    setError(null)
    const a = await change('POST', `organizations/${orgId}/invitations`, { email: email.trim(), roles })
    setBusy(false)
    const made = a.ok ? parseCreatedInvitation(a.data) : null
    if (!made) { setError(a.ok ? 'The invitation was made, but no link came back. Take it back and try again.' : errorText(a)); if (a.ok) onChanged(); return }
    setCreated({ email: made.invitation.email, link: made.link, expiresAt: made.invitation.expiresAt })
    setEmail('')
    setRoles([])
    onChanged()
  }

  const revoke = async (i: Invitation) => {
    setRevoking(i.id)
    setRevokeError(null)
    const a = await change('DELETE', `organizations/${orgId}/invitations/${i.id}`)
    setRevoking(null)
    if (a.ok) onChanged()
    else setRevokeError(errorText(a))
  }

  return (
    <Section
      id={`invite-${orgId}`}
      title="Invitations"
      description={`Bring someone into ${orgName}. They join when they accept, signed in with that email address.`}
    >
      {canWrite && (
        created ? (
          <div className="invite-created">
            <Banner tone="success" title={`Invitation ready for ${created.email}`}>
              Send them this link yourself. It’s shown only once{created.expiresAt ? ` and works until ${shortDate(created.expiresAt)}` : ''}.
            </Banner>
            <div className="secret">
              <code>{created.link}</code>
              <CopyButton text={created.link} label="Copy link" />
            </div>
            <div className="inline-actions mt-3">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCreated(null)}>Invite someone else</button>
            </div>
          </div>
        ) : (
          <form onSubmit={invite} noValidate className="invite-form">
            <Field label="Email address" htmlFor={`invite-email-${orgId}`} error={error ?? undefined}>
              <input
                id={`invite-email-${orgId}`}
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                placeholder="name@example.com"
              />
            </Field>
            {options.length > 0 && <RolePicker options={options} value={roles} onChange={setRoles} legend="Roles when they join (optional)" />}
            <div className="inline-actions mt-3">
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                {busy ? <><span className="spinner" aria-hidden /> Inviting…</> : <><Icons.Mail size={14} /> Create invitation</>}
              </button>
            </div>
          </form>
        )
      )}

      <h3 className="subhead">Waiting for an answer</h3>
      {revokeError && <Banner tone="danger" onDismiss={() => setRevokeError(null)}>{revokeError}</Banner>}
      {pending.kind === 'loading' && <LoadingLine />}
      {pending.kind === 'error' && <LoadError message={pending.message} onRetry={onRetry} />}
      {pending.kind === 'ok' && pending.data.length === 0 && <p className="muted" style={{ margin: 0 }}>No pending invitations.</p>}
      {pending.kind === 'ok' && pending.data.map((i) => (
        <div key={i.id} className="settings-row">
          <div className="settings-row-icon" aria-hidden><Icons.Mail size={18} /></div>
          <div className="settings-row-content">
            <div className="settings-row-title">{i.email}</div>
            <div className="settings-row-meta">
              <RoleChips roles={i.roles} empty="No roles" />
              {i.expiresAt && <> · Expires {shortDate(i.expiresAt)}</>}
              {i.invitedBy && <> · Invited by {i.invitedBy}</>}
            </div>
          </div>
          {canWrite && (
            <div className="settings-row-actions">
              <ConfirmAction
                label="Take back"
                ariaLabel={`Take back the invitation for ${i.email}`}
                question="The link will stop working."
                confirmLabel="Take back"
                busy={revoking === i.id}
                onConfirm={() => void revoke(i)}
              />
            </div>
          )}
        </div>
      ))}
    </Section>
  )
}
