import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ConsentForm, RefusedView } from './OAuthViews'
import type { ConsentView } from '@/lib/oauth2'

afterEach(cleanup)

const view = (over: Partial<ConsentView> = {}): ConsentView => ({
  client: { name: 'Claude Code', redirectHost: 'localhost:53682', registeredAt: '2026-09-30T10:00:00Z' },
  account: 'ada@example.com',
  catalog: [{ scope: 'sites:read', group: 'sites', label: 'Read sites' }, { scope: 'sites:apply', group: 'sites', label: 'Publish sites', protected: true }, { scope: 'users:read', group: 'users' }],
  protectedActions: { offered: true, until: '2026-09-30T22:00:00Z', hours: 12 },
  signedInUntil: '2026-10-30T10:00:00Z',
  ...over,
})
const renderForm = (v = view(), onDecide = vi.fn()) => {
  render(<ConsentForm view={v} platformName="example" busy={null} error={null} switchHref="/logout?return_to=x" onDecide={onDecide} />)
  return onDecide
}

describe('ConsentForm', () => {
  it('says who asks (unverified), where it sends you back, as whom — with Allow and Deny', () => {
    renderForm()
    expect(screen.getByRole('heading').textContent).toBe('Claude Code wants to act as you')
    expect(screen.getByText('Unverified name')).toBeTruthy()
    expect(screen.getByText('localhost:53682')).toBeTruthy()
    expect(screen.getByText(/app running on this computer/i)).toBeTruthy()
    expect(screen.getByText('ada@example.com')).toBeTruthy()
    expect(screen.getByRole('link', { name: /not you/i }).getAttribute('href')).toBe('/logout?return_to=x')
    expect(screen.getByRole('button', { name: /allow/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /deny/i })).toBeTruthy()
  })
  it('all my permissions by default; Allow sends mode all with protected actions', () => {
    const onDecide = renderForm()
    expect((screen.getByRole('radio', { name: /all my permissions/i }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /allow/i }))
    expect(onDecide).toHaveBeenCalledWith({ decision: 'allow', mode: 'all', scopes: [], protectedActions: true })
  })
  it('choose permissions: grouped checklist, Allow disabled until one is ticked, sends only the ticked ones', () => {
    const onDecide = renderForm()
    fireEvent.click(screen.getByRole('radio', { name: /choose permissions/i }))
    const allowBtn = screen.getByRole('button', { name: /allow/i }) as HTMLButtonElement
    expect(allowBtn.disabled).toBe(true)
    expect(screen.getByText(/tick at least one/i)).toBeTruthy()
    const sites = screen.getByRole('group', { name: /sites/i })
    expect(within(sites).getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.getByRole('group', { name: /users/i })).toBeTruthy()
    expect(within(sites).getByText('Publish sites')).toBeTruthy()
    expect(within(sites).getByText('Protected action')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /sites:read/ }))
    expect(allowBtn.disabled).toBe(false)
    fireEvent.click(allowBtn)
    expect(onDecide).toHaveBeenCalledWith({ decision: 'allow', mode: 'chosen', scopes: ['sites:read'], protectedActions: true })
  })
  it('select all in a group, then clear it', () => {
    renderForm()
    fireEvent.click(screen.getByRole('radio', { name: /choose permissions/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Select all Sites' }))
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(3) // 2 sites + protected actions
    fireEvent.click(screen.getByRole('button', { name: 'Clear Sites' }))
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(1)
  })
  it('protected actions: explains the 12-hour window; unticking sends false', () => {
    const onDecide = renderForm()
    expect(screen.getByText(/counts for them\s+for 12 hours/)).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /publishing sites/i }))
    fireEvent.click(screen.getByRole('button', { name: /allow/i }))
    expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ protectedActions: false }))
  })
  it('protected actions not offered: no checkbox, never sent as true', () => {
    const onDecide = renderForm(view({ protectedActions: { offered: false, until: null, hours: 12 } }))
    expect(screen.queryByText(/protected actions/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /allow/i }))
    expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ protectedActions: false }))
  })
  it('no permission held: choosing is disabled, all my permissions still possible', () => {
    renderForm(view({ catalog: [] }))
    expect((screen.getByRole('radio', { name: /choose permissions/i }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText(/hold no permission it asked for/i)).toBeTruthy()
  })
  it('Deny sends deny', () => {
    const onDecide = renderForm()
    fireEvent.click(screen.getByRole('button', { name: /deny/i }))
    expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ decision: 'deny' }))
  })
  it('busy: both buttons disabled', () => {
    render(<ConsentForm view={view()} platformName="example" busy="allow" error="x" switchHref="/" onDecide={vi.fn()} />)
    expect((screen.getByRole('button', { name: /allow/i }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /deny/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('x')
  })
})

describe('RefusedView', () => {
  it.each([
    ['mcp_disabled', /turned off/i],
    ['oauth_disabled', /signing in from an app is turned off/i],
    ['group_not_allowed', /your groups/i],
    ['client_bound_elsewhere', /someone else/i],
  ] as const)('%s: says why and offers the way back to the app', (kind, title) => {
    render(<RefusedView kind={kind} returnHref="/oauth2/return" retryHref={null} />)
    expect(screen.getByRole('heading').textContent).toMatch(title)
    expect(screen.getByRole('link', { name: /return to your app/i }).getAttribute('href')).toBe('/oauth2/return')
  })
  it('expired without a return: says to start again, no button', () => {
    render(<RefusedView kind="expired" returnHref={null} retryHref={null} />)
    expect(screen.getByText(/start signing in again/i)).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
  it('unavailable: retry', () => {
    render(<RefusedView kind="unavailable" returnHref={null} retryHref="/oauth2/login?login_challenge=L" />)
    expect(screen.getByRole('link', { name: /try again/i }).getAttribute('href')).toBe('/oauth2/login?login_challenge=L')
  })
})
