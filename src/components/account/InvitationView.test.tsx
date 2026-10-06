import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InvitationView } from './InvitationView'
import type { InvitationState } from '@/lib/invitation'

afterEach(cleanup)

const view = (state: InvitationState, extra: Partial<Parameters<typeof InvitationView>[0]> = {}) =>
  render(<InvitationView state={state} busy={null} error={null} onAccept={() => {}} onDecline={() => {}} onRetry={() => {}} {...extra} />)

const invitation = { id: 'i', org: 'o', orgName: 'Acme', email: 'ann@x.co', roles: ['jinbe:member_manager'], invitedBy: 'olga@x.co', expiresAt: '' }

describe('InvitationView', () => {
  it('signed out: sign in or create an account, both coming back here', () => {
    view({ kind: 'signed-out', signInHref: '/si', registerHref: '/reg' })
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/si')
    expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe('/reg')
  })

  it('ready: shows the org, the roles, and answers', () => {
    const onAccept = vi.fn()
    const onDecline = vi.fn()
    view({ kind: 'ready', email: 'ann@x.co', invitation, switchHref: '/sw' }, { onAccept, onDecline })
    expect(screen.getByRole('heading', { name: 'Join Acme' })).toBeTruthy()
    expect(screen.getByText('Member manager')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(onAccept).toHaveBeenCalled()
    expect(onDecline).toHaveBeenCalled()
  })

  it('ready without a known invitation: accept only, no decline', () => {
    view({ kind: 'ready', email: 'ann@x.co', invitation: null, switchHref: '/sw' }, { error: 'This invitation is for another email address.' })
    expect(screen.getByRole('heading', { name: 'Join an organization' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull()
    expect(screen.getByRole('alert').textContent).toMatch(/another email address/)
  })

  it('wrong account, unverified, gone', () => {
    view({ kind: 'wrong-account', email: 'bob@x.co', switchHref: '/sw' })
    expect(screen.getByText('bob@x.co')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Use another account' }).getAttribute('href')).toBe('/sw')
    cleanup()
    view({ kind: 'unverified', email: 'ann@x.co', verifyHref: '/ver', invitation })
    expect(screen.getByRole('heading', { name: 'Verify your email to join Acme' })).toBeTruthy()
    expect(screen.getByText('Member manager')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Verify my email' }).getAttribute('href')).toBe('/ver')
    cleanup()
    view({ kind: 'gone' })
    expect(screen.getByRole('heading').textContent).toMatch(/can’t be used/)
  })
})
