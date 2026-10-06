'use client'

import { useState } from 'react'
import { Section } from '@/components/settings/SettingsSections'
import { Banner } from '@/components/ui/Banner'
import { Icons } from '@/components/ui/Icons'
import { errorText, parseRefusals, refusalText, type Member, type OrgRoleOption } from '@/lib/account'
import { ConfirmAction, LoadError, LoadingLine, RoleChips, RolePicker, change, type Loaded } from './AccountParts'

const same = (a: string[], b: string[]) => a.length === b.length && a.every((r) => b.includes(r))

/** One member's roles, edited in place. A refusal is shown role by role. */
function RoleEditor({ orgId, member, options, onSaved, onClose }: {
  orgId: string
  member: Member
  options: OrgRoleOption[]
  onSaved: () => void
  onClose: () => void
}) {
  const [value, setValue] = useState(member.roles)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])

  const save = async () => {
    setBusy(true)
    setProblems([])
    const a = await change('PUT', `organizations/${orgId}/users/${member.id}/roles`, { roles: value })
    setBusy(false)
    if (a.ok) { onSaved(); return }
    const refused = parseRefusals(a.data)
    setProblems(refused.length ? refused.map(refusalText) : [errorText(a)])
  }

  return (
    <div className="member-edit">
      <RolePicker options={options} value={value} held={member.roles} onChange={setValue} legend={`Roles for ${member.name || member.email}`} />
      {problems.length > 0 && (
        <Banner tone="danger" title="These roles weren’t changed">
          {problems.length === 1 ? problems[0] : <>{problems.map((p) => <span key={p} style={{ display: 'block' }}>{p}</span>)}</>}
        </Banner>
      )}
      <div className="inline-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || same(value, member.roles)}>
          {busy ? <><span className="spinner" aria-hidden /> Saving…</> : 'Save roles'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </div>
  )
}

export function MembersSection({ orgId, orgName, members, options, myId, canWrite, onChanged, onRetry }: {
  orgId: string
  orgName: string
  members: Loaded<Member[]>
  options: OrgRoleOption[]
  myId: string
  canWrite: boolean
  onChanged: () => void
  onRetry: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const remove = async (m: Member) => {
    setBusy(m.id)
    setError(null)
    const a = await change('DELETE', `organizations/${orgId}/users/${m.id}`)
    setBusy(null)
    if (a.ok) onChanged()
    else setError(errorText(a))
  }

  return (
    <Section id={`members-${orgId}`} title="Members" description={`The people in ${orgName}. Their roles decide what they can do here.`}>
      {error && <Banner tone="danger" onDismiss={() => setError(null)}>{error}</Banner>}
      {members.kind === 'loading' && <LoadingLine label="Loading members…" />}
      {members.kind === 'error' && <LoadError message={members.message} onRetry={onRetry} />}
      {members.kind === 'ok' && members.data.length === 0 && <p className="muted" style={{ margin: 0 }}>No members yet.</p>}
      {members.kind === 'ok' && members.data.map((m) => {
        const me = m.id === myId
        return (
          <div key={m.id} className="settings-row">
            <div className="settings-row-icon" aria-hidden><Icons.User size={18} /></div>
            <div className="settings-row-content">
              <div className="settings-row-title">
                {m.name || m.email}
                {me && <span className="badge info">You</span>}
                {!m.active && <span className="badge warn">Disabled</span>}
              </div>
              <div className="settings-row-meta">
                {m.name && <>{m.email} · </>}
                <RoleChips roles={m.roles} />
              </div>
              {editing === m.id && (
                <RoleEditor orgId={orgId} member={m} options={options} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged() }} />
              )}
            </div>
            {canWrite && editing !== m.id && (
              <div className="settings-row-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(m.id)} aria-label={`Change roles of ${m.name || m.email}`}>Change roles</button>
                {!me && (
                  <ConfirmAction
                    label="Remove"
                    ariaLabel={`Remove ${m.name || m.email}`}
                    question={<>Remove {m.name || m.email} from {orgName}? Their account stays.</>}
                    confirmLabel="Remove"
                    busy={busy === m.id}
                    onConfirm={() => void remove(m)}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}
    </Section>
  )
}
