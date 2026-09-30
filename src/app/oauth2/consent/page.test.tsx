import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const params = vi.hoisted(() => ({ value: 'consent_challenge=C1' }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(params.value) }))

import OAuthConsentPage from './page'

const assign = vi.fn()
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
const view = {
  client: { name: 'Claude Code', redirectHost: 'localhost:53682', registeredAt: null },
  account: 'ada@example.com',
  catalog: [{ scope: 'sites:read', group: 'sites' }],
  protectedActions: { offered: false, until: null, hours: 12 },
  signedInUntil: '2026-10-30T10:00:00Z',
}

beforeEach(() => {
  params.value = 'consent_challenge=C1'
  vi.stubGlobal('location', { ...window.location, assign, href: 'https://auth.example.com/oauth2/consent?consent_challenge=C1', origin: 'https://auth.example.com' })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); assign.mockReset() })

describe('/oauth2/consent', () => {
  it('loads the screen, Allow posts the decision and follows the Hydra URL', async () => {
    const f = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({ kind: 'consent', view }))
      .mockResolvedValueOnce(ok({ kind: 'redirect', to: 'https://hydra.example.com/oauth2/auth?consent_verifier=v' }))
    render(<OAuthConsentPage />)
    fireEvent.click(await screen.findByRole('button', { name: /allow/i }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://hydra.example.com/oauth2/auth?consent_verifier=v'))
    expect(String(f.mock.calls[0][0])).toBe('/api/oauth2/consent?consent_challenge=C1')
    const init = f.mock.calls[1][1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({ consent_challenge: 'C1', decision: 'allow', mode: 'all', protected_actions: false })
  })
  it('no session: sign in, back to this page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok({ kind: 'unauthenticated' }))
    render(<OAuthConsentPage />)
    await waitFor(() => expect(assign).toHaveBeenCalledWith(`/login?return_to=${encodeURIComponent('https://auth.example.com/oauth2/consent?consent_challenge=C1')}`))
  })
  it('refused: to the refused page with the reason only', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok({ kind: 'refused', reason: 'client_bound_elsewhere' }))
    render(<OAuthConsentPage />)
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/oauth2/refused?reason=client_bound_elsewhere'))
  })
  it('a failed submit keeps the screen with an error; nothing followed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok({ kind: 'consent', view })).mockRejectedValueOnce(new Error('offline'))
    render(<OAuthConsentPage />)
    fireEvent.click(await screen.findByRole('button', { name: /deny/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t save your answer/)
    expect(assign).not.toHaveBeenCalled()
  })
  it('no challenge: the request has ended, nothing fetched', async () => {
    params.value = ''
    const f = vi.spyOn(globalThis, 'fetch')
    render(<OAuthConsentPage />)
    expect(screen.getByRole('heading').textContent).toMatch(/has ended/)
    expect(f).not.toHaveBeenCalled()
  })
})
