import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AccountView, INVITATIONS_TAB, type AccountViewProps } from './AccountView'
import type { MyOrg } from '@/lib/account'

const ORG = '11111111-2222-4333-8444-555555555555'
const ME = '66666666-7777-4888-9999-aaaaaaaaaaaa'
const BOB = '77777777-7777-4888-9999-aaaaaaaaaaaa'

const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status })
let routes: Record<string, (init?: RequestInit) => Response>

beforeEach(() => {
  routes = {
    [`GET organizations/${ORG}/users`]: () => json(200, { data: [
      { id: ME, traits: { email: 'me@x.co', name: 'Me' }, roles: ['jinbe:member_manager'] },
      { id: BOB, traits: { email: 'bob@x.co', name: 'Bob' }, roles: ['jinbe:viewer'] },
    ] }),
    [`GET organizations/${ORG}/roles`]: () => json(200, { roles: [
      { role: 'jinbe:owner', permissions: [], assignable: false },
      { role: 'jinbe:viewer', permissions: [], assignable: true },
      { role: 'jinbe:auditor', permissions: [], assignable: true },
    ] }),
    [`GET organizations/${ORG}/invitations`]: () => json(200, { invitations: [] }),
    [`GET organizations/${ORG}/api-keys`]: () => json(200, { data: [{ client_id: 'k1', label: 'Build server' }] }),
    [`GET organizations/${ORG}/domains`]: () => json(200, { domains: [] }),
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url.replace('/api/account/', '')}`
    return routes[key]?.(init) ?? json(404, { error: 'not_found' })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const org = (permissions: string[]): MyOrg => ({ id: ORG, name: 'Acme', roles: ['jinbe:member_manager'], permissions })
const props = (o: Partial<AccountViewProps>): AccountViewProps => ({
  me: { id: ME, email: 'me@x.co', verified: true },
  orgs: [org(['org.members:read', 'org.members:write', 'org.keys:read'])],
  invitations: [],
  selected: ORG,
  onSelect: () => {},
  joined: null,
  onDismissJoined: () => {},
  onAccept: () => {},
  onDecline: () => {},
  answering: null,
  answerError: null,
  verifyHref: '/ver',
  ...o,
})

describe('AccountView', () => {
  it('shows what my permissions allow: members with actions, keys without revoke', async () => {
    render(<AccountView {...props({})} />)
    await screen.findByText('Bob')
    expect(screen.getByRole('button', { name: 'Change roles of Bob' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove Bob' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove Me' })).toBeNull()
    await screen.findByText('Build server')
    expect(screen.queryByRole('button', { name: /Revoke/ })).toBeNull()
    expect(screen.getByText(/created by the platform team/)).toBeTruthy()
  })

  it('hides everything a plain member may not see', () => {
    render(<AccountView {...props({ orgs: [org([])] })} />)
    expect(screen.queryByRole('heading', { name: 'Members' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'API keys' })).toBeNull()
    expect(screen.getByText(/You’re a member here/)).toBeTruthy()
  })

  it('shows the one-time invitation link with a copy button', async () => {
    routes[`POST organizations/${ORG}/invitations`] = (init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ email: 'new@x.co', roles: ['jinbe:viewer'] })
      return json(201, { invitation: { id: BOB, org: ORG, email: 'new@x.co', roles: ['jinbe:viewer'], expiresAt: '2026-10-13T00:00:00Z' }, token: 't'.repeat(43), link: 'https://id.test/invitation?token=abc' })
    }
    render(<AccountView {...props({})} />)
    await screen.findByText('Bob')
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'new@x.co' } })
    const invite = screen.getByRole('heading', { name: 'Invitations' }).closest('section')!
    await waitFor(() => expect(within(invite).getByText('Viewer')).toBeTruthy())
    fireEvent.click(within(invite).getByText('Viewer'))
    fireEvent.click(screen.getByRole('button', { name: /Create invitation/ }))
    expect(await screen.findByText('https://id.test/invitation?token=abc')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy()
    expect(screen.getByText(/shown only once/)).toBeTruthy()
  })

  it('shows a role refusal in words', async () => {
    routes[`PUT organizations/${ORG}/users/${BOB}/roles`] = () => json(403, { error: 'Forbidden', refused: [{ role: 'jinbe:auditor', reason: 'grant_exceeds_own' }] })
    render(<AccountView {...props({})} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Change roles of Bob' }))
    const editor = screen.getByRole('group', { name: 'Roles for Bob' })
    fireEvent.click(within(editor).getByText('Auditor'))
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }))
    expect(await screen.findByText(/Auditor: you can only give a role whose rights you hold yourself/)).toBeTruthy()
  })

  it('lists my invitations to accept or decline, and nudges an unverified address', () => {
    const onAccept = vi.fn()
    const invitation = { id: BOB, org: ORG, orgName: 'Beta', email: 'me@x.co', roles: [], invitedBy: 'olga@x.co', expiresAt: '' }
    render(<AccountView {...props({ orgs: [], invitations: [invitation], selected: INVITATIONS_TAB, onAccept, me: { id: ME, email: 'me@x.co', verified: false } })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Accept the invitation to Beta' }))
    expect(onAccept).toHaveBeenCalledWith(invitation)
    expect(screen.getByRole('link', { name: 'Verify now' }).getAttribute('href')).toBe('/ver')
  })

  it('names roles that were dropped on joining', () => {
    render(<AccountView {...props({ joined: { orgId: ORG, dropped: ['jinbe:owner'] } })} />)
    expect(screen.getByText(/You joined Acme/)).toBeTruthy()
    expect(screen.getByText(/can no longer give them: Owner/)).toBeTruthy()
  })
})
