import { describe, expect, it } from 'vitest'
import { buildMyOrgs, errorText, isInvitationLink, joinedUrl, parseApiKeys, parseCreatedInvitation, parseDomains, parseMembers, refusalText, roleText } from './account'

const A = '11111111-2222-4333-8444-555555555555'
const B = '22222222-2222-4333-8444-555555555555'

describe('buildMyOrgs', () => {
  it('joins names, my permissions and my roles; a missing part gives less, never more', () => {
    const orgs = buildMyOrgs(
      { organizations: [B, A, A], names: { [A]: 'Acme', [B]: 'Beta' } },
      { orgPermissions: { [A]: ['org.members:read', 'org.members:write'] } },
      { organizations: [{ id: A, roles: ['jinbe:owner', 'bad role'] }] },
    )
    expect(orgs).toEqual([
      { id: A, name: 'Acme', roles: ['jinbe:owner'], permissions: ['org.members:read', 'org.members:write'] },
      { id: B, name: 'Beta', roles: [], permissions: [] },
    ])
    expect(buildMyOrgs({ organizations: [A] }, null, null)[0]).toMatchObject({ name: 'Unnamed organization', permissions: [] })
  })
})

describe('roles and refusals in words', () => {
  it('names roles plainly', () => {
    expect(roleText('jinbe:member_manager')).toBe('Member manager')
    expect(roleText('shop:order_editor')).toBe('Order editor (shop)')
  })

  it('says why a role was refused', () => {
    expect(refusalText({ role: 'jinbe:owner', reason: 'grant_exceeds_own', missing: [] })).toBe('Owner: you can only give a role whose rights you hold yourself.')
    expect(refusalText({ role: 'shop:editor', reason: 'org_not_entitled', missing: [] })).toMatch(/doesn’t use that app/)
    expect(errorText({ ok: false, status: 403, data: { refused: [{ role: 'jinbe:owner', reason: 'grant_permission_missing' }] } })).toMatch(/can’t change roles/)
  })

  it('turns jinbe codes and outages into sentences', () => {
    expect(errorText({ ok: false, status: 409, data: { code: 'already_member' } })).toBe('This person is already a member.')
    expect(errorText({ ok: false, status: 422, data: { error: 'record_not_found' } })).toMatch(/TXT record isn’t there yet/)
    expect(errorText({ ok: false, status: 0, data: null })).toMatch(/can’t reach/)
    expect(errorText({ ok: false, status: 403, data: { error: 'Forbidden' } })).toBe('You’re not allowed to do this here.')
  })
})

describe('parsers', () => {
  it('reads members, the one-time link, keys and domains', () => {
    expect(parseMembers({ data: [{ id: A, traits: { email: 'b@x.co' }, roles: ['jinbe:viewer'] }, { id: 'nope', traits: {} }, { id: B, traits: { email: 'a@x.co', name: 'Ann' }, state: 'inactive' }] }))
      .toEqual([{ id: B, email: 'a@x.co', name: 'Ann', roles: [], active: false }, { id: A, email: 'b@x.co', name: '', roles: ['jinbe:viewer'], active: true }])
    const invitation = { id: A, org: B, email: 'a@x.co', roles: [], invitedBy: { id: null, email: 'o@x.co' }, expiresAt: '2026-10-13T00:00:00Z' }
    expect(parseCreatedInvitation({ invitation, token: 't'.repeat(43), link: 'https://id.test/invitation?token=abc' })?.link).toBe('https://id.test/invitation?token=abc')
    expect(parseCreatedInvitation({ invitation, token: 't'.repeat(43), link: null })?.link).toBe('t'.repeat(43))
    expect(parseCreatedInvitation({ invitation: {}, token: 'x' })).toBeNull()
    const keys = parseApiKeys({ data: [{ client_id: 'k1', label: 'CI', expires_at: '2026-01-01T00:00:00Z' }, { client_id: '../x' }] }, Date.parse('2026-10-06'))
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatchObject({ clientId: 'k1', label: 'CI', expired: true })
    expect(parseDomains({ domains: [{ domain: 'x.co', verified: false, record: { name: '_auth-verify.x.co', type: 'TXT', value: 'auth-verify=1' } }, { domain: 'y.co', verified: true }] }))
      .toEqual([{ domain: 'x.co', verified: false, record: { name: '_auth-verify.x.co', value: 'auth-verify=1' } }, { domain: 'y.co', verified: true, record: null }])
  })
})

describe('links', () => {
  it('recognises this UI’s own invitation link only', () => {
    const t = 'a'.repeat(43)
    expect(isInvitationLink(`https://id.test/invitation?token=${t}`, 'https://id.test')).toBe(true)
    expect(isInvitationLink(`https://evil.test/invitation?token=${t}`, 'https://id.test')).toBe(false)
    expect(isInvitationLink('https://id.test/invitation?token=short', 'https://id.test')).toBe(false)
    expect(isInvitationLink(`https://id.test/welcome?token=${t}`, 'https://id.test')).toBe(false)
    expect(isInvitationLink(null, 'https://id.test')).toBe(false)
  })

  it('lands an accepted invitation on its org, naming dropped roles', () => {
    expect(joinedUrl(A, ['jinbe:owner', 'x'])).toBe(`/account?joined=${A}&dropped=jinbe%3Aowner#org-${A}`)
    expect(joinedUrl(A, [])).toBe(`/account?joined=${A}#org-${A}`)
  })
})
