'use client'

import { ORG_PERMISSIONS as P, can, parseInvitations, parseMembers, parseRoleOptions, type MyOrg, type OrgRoleOption } from '@/lib/account'
import { RoleChips, useAccountGet } from './AccountParts'
import { MembersSection } from './MembersSection'
import { InviteSection } from './InviteSection'
import { ApiKeysSection, DomainsSection } from './KeysDomainsSections'

const NO_OPTIONS: OrgRoleOption[] = []

/**
 * One organization: what I hold there, then each part my permissions let me see. jinbe decides
 * every call anyway; a hidden part only spares a refusal.
 */
export function OrgPanel({ org, myId }: { org: MyOrg; myId: string }) {
  const readMembers = can(org, P.membersRead)
  const writeMembers = can(org, P.membersWrite)
  const members = useAccountGet(readMembers ? `organizations/${org.id}/users` : null, parseMembers)
  const roles = useAccountGet(readMembers ? `organizations/${org.id}/roles` : null, parseRoleOptions)
  const pending = useAccountGet(readMembers ? `organizations/${org.id}/invitations` : null, parseInvitations)
  const options = roles.state.kind === 'ok' ? roles.state.data : NO_OPTIONS
  // The members list has every org role I hold here (all apps); me/orgs?app=jinbe only jinbe's.
  const mine = members.state.kind === 'ok' ? members.state.data.find((m) => m.id === myId)?.roles ?? org.roles : org.roles
  const nothing = !readMembers && !can(org, P.keysRead)

  return (
    <>
      <div className="settings-section">
        <div className="settings-section-body">
          <div className="identity-hero">
            <div className="avatar" aria-hidden>{org.name.charAt(0).toUpperCase()}</div>
            <div className="identity-hero-meta">
              <h2 className="identity-hero-name" style={{ margin: 0 }}>{org.name}</h2>
              <div className="identity-hero-id">Your roles: <RoleChips roles={mine} empty="member, no roles" /></div>
            </div>
          </div>
          {nothing && (
            <p className="muted mt-4" style={{ marginBottom: 0 }}>
              You’re a member here. Managing members and keys is up to the people with those roles.
            </p>
          )}
        </div>
      </div>

      {readMembers && (
        <MembersSection
          orgId={org.id}
          orgName={org.name}
          members={members.state}
          options={options}
          myId={myId}
          canWrite={writeMembers}
          onChanged={members.reload}
          onRetry={members.reload}
        />
      )}
      {readMembers && (
        <InviteSection
          orgId={org.id}
          orgName={org.name}
          options={options}
          pending={pending.state}
          canWrite={writeMembers}
          onChanged={pending.reload}
          onRetry={pending.reload}
        />
      )}
      {can(org, P.keysRead) && <ApiKeysSection orgId={org.id} orgName={org.name} canRevoke={can(org, P.keysRevoke)} />}
      {readMembers && <DomainsSection orgId={org.id} orgName={org.name} canWrite={writeMembers} />}
    </>
  )
}
