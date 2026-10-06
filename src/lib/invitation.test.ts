import { describe, expect, it, vi } from 'vitest'
import { acceptOutcome, resolveInvitationState, type InvitationDeps } from './invitation'

const ORG = '11111111-2222-4333-8444-555555555555'
const INV = '22222222-2222-4333-8444-555555555555'
const token = 'a'.repeat(43)
const urls = { signIn: '/si', register: '/reg', verify: '/ver', switchAccount: '/sw' }
const answer = (status: number, data: unknown = null) => ({ ok: status >= 200 && status < 300, status, data })
const deps = (o: Partial<InvitationDeps>): InvitationDeps => ({
  token,
  me: { email: 'ann@x.co', verified: true },
  // An older jinbe: the look-up route itself is not there.
  byToken: vi.fn(async () => answer(404, { message: 'Route GET:/api/me/invitations/by-token not found', error: 'Not Found', statusCode: 404 })),
  accept: vi.fn(async () => answer(500)),
  mine: vi.fn(async () => answer(200, { invitations: [] })),
  urls,
  ...o,
})
const pending = (id: string, orgName: string) => ({ id, org: ORG, email: 'ann@x.co', roles: ['jinbe:viewer'], organizationName: orgName, invitedBy: { email: 'o@x.co' } })

describe('resolveInvitationState', () => {
  it('needs a well-formed token', async () => {
    expect(await resolveInvitationState(deps({ token: null }))).toEqual({ kind: 'bad-link' })
    expect(await resolveInvitationState(deps({ token: 'short' }))).toEqual({ kind: 'bad-link' })
  })

  it('offers sign-in or sign-up when signed out', async () => {
    expect(await resolveInvitationState(deps({ me: null }))).toEqual({ kind: 'signed-out', signInHref: '/si', registerHref: '/reg' })
  })

  it('looks the token up: the invitation before any click, verified or not', async () => {
    const accept = vi.fn(async () => answer(200))
    const mine = vi.fn(async () => answer(200, { invitations: [] }))
    const byToken = vi.fn(async () => answer(200, { invitation: pending(INV, 'Acme'), verified: true }))
    expect(await resolveInvitationState(deps({ byToken, accept, mine }))).toMatchObject({ kind: 'ready', invitation: { id: INV, orgName: 'Acme', invitedBy: 'o@x.co' } })
    expect(byToken).toHaveBeenCalledWith(token)
    expect(accept).not.toHaveBeenCalled()
    expect(mine).not.toHaveBeenCalled()
    const unverified = await resolveInvitationState(deps({ byToken: async () => answer(200, { invitation: pending(INV, 'Acme'), verified: false }) }))
    expect(unverified).toMatchObject({ kind: 'unverified', verifyHref: '/ver', invitation: { orgName: 'Acme' } })
  })

  it('says when the token is gone or for another address, and when jinbe is down', async () => {
    expect(await resolveInvitationState(deps({ byToken: async () => answer(404, { code: 'invitation_not_found' }) }))).toEqual({ kind: 'gone' })
    expect(await resolveInvitationState(deps({ byToken: async () => answer(403, { code: 'invitation_other_address' }) }))).toEqual({ kind: 'wrong-account', email: 'ann@x.co', switchHref: '/sw' })
    expect(await resolveInvitationState(deps({ byToken: async () => answer(401) }))).toMatchObject({ kind: 'signed-out' })
    expect(await resolveInvitationState(deps({ byToken: async () => answer(503) }))).toEqual({ kind: 'unavailable' })
  })

  it('older jinbe: asks about an unverified address: wrong account, gone, or verify first', async () => {
    const me = { email: 'ann@x.co', verified: false }
    expect(await resolveInvitationState(deps({ me, accept: async () => answer(403, { code: 'invitation_other_address' }) }))).toEqual({ kind: 'wrong-account', email: 'ann@x.co', switchHref: '/sw' })
    expect(await resolveInvitationState(deps({ me, accept: async () => answer(404, { code: 'invitation_not_found' }) }))).toEqual({ kind: 'gone' })
    expect(await resolveInvitationState(deps({ me, accept: async () => answer(403, { code: 'email_not_verified' }) }))).toEqual({ kind: 'unverified', email: 'ann@x.co', verifyHref: '/ver' })
    expect(await resolveInvitationState(deps({ me, accept: async () => answer(503) }))).toMatchObject({ kind: 'unverified' })
  })

  it('older jinbe: shows the invitation when exactly one is pending, and never accepts before the click', async () => {
    const accept = vi.fn(async () => answer(200))
    const one = await resolveInvitationState(deps({ accept, mine: async () => answer(200, { invitations: [pending(INV, 'Acme')] }) }))
    expect(one).toMatchObject({ kind: 'ready', email: 'ann@x.co', invitation: { id: INV, orgName: 'Acme', roles: ['jinbe:viewer'] } })
    expect(accept).not.toHaveBeenCalled()
    const two = await resolveInvitationState(deps({ mine: async () => answer(200, { invitations: [pending(INV, 'Acme'), pending(ORG, 'Beta')] }) }))
    expect(two).toMatchObject({ kind: 'ready', invitation: null })
    expect(await resolveInvitationState(deps({ mine: async () => answer(503) }))).toEqual({ kind: 'unavailable' })
  })
})

describe('acceptOutcome', () => {
  const me = { email: 'ann@x.co', verified: true }
  it('lands on the org, or says what went wrong', () => {
    expect(acceptOutcome(answer(200, { organization: { id: ORG }, roles: [], dropped: ['jinbe:owner'] }), me, urls)).toEqual({ kind: 'joined', to: `/account?joined=${ORG}&dropped=jinbe%3Aowner#org-${ORG}` })
    expect(acceptOutcome(answer(404), me, urls)).toEqual({ kind: 'state', state: { kind: 'gone' } })
    expect(acceptOutcome(answer(401), me, urls)).toEqual({ kind: 'signed-out' })
    expect(acceptOutcome(answer(503), me, urls)).toMatchObject({ kind: 'error' })
  })
})
