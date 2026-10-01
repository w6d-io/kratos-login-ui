import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const params = vi.hoisted(() => ({ value: 'req=abcdefghijklmnop1234' }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(params.value) }))

import OAuthStepUpPage from './page'

const assign = vi.fn()
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
const show = { kind: 'show', view: { kind: 'oauth', name: 'Claude Code', account: 'ada@example.com', hours: 12 } }
const HREF = 'https://auth.example.com/oauth2/step-up?req=abcdefghijklmnop1234'

beforeEach(() => {
  params.value = 'req=abcdefghijklmnop1234'
  window.sessionStorage.clear()
  vi.stubGlobal('location', { ...window.location, assign, reload: vi.fn(), href: HREF, origin: 'https://auth.example.com' })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); assign.mockReset() })

describe('/oauth2/step-up', () => {
  it('Confirm posts the request and ends on "go back to your assistant"', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok(show)).mockResolvedValueOnce(ok({ kind: 'done', name: 'Claude Code', until: null }))
    render(<OAuthStepUpPage />)
    fireEvent.click(await screen.findByRole('button', { name: /confirm/i }))
    expect(await screen.findByText('Done — go back to your assistant and retry')).toBeTruthy()
    expect(String(f.mock.calls[0][0])).toBe('/api/oauth2/step-up?req=abcdefghijklmnop1234')
    expect(JSON.parse(String((f.mock.calls[1][1] as RequestInit).body))).toEqual({ req: 'abcdefghijklmnop1234' })
  })
  it('Cancel posts nothing', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok(show))
    render(<OAuthStepUpPage />)
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }))
    expect(screen.getByRole('heading').textContent).toBe('Nothing changed')
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('a stale factor: to the refresh login — twice at most, then a retry instead of a loop', async () => {
    const refresh = { kind: 'refresh', to: 'https://auth.example.com/self-service/login/browser?aal=aal2&refresh=true' }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok(refresh))
    for (let i = 0; i < 2; i++) {
      render(<OAuthStepUpPage />)
      await waitFor(() => expect(assign).toHaveBeenCalledTimes(i + 1))
      cleanup()
    }
    render(<OAuthStepUpPage />)
    expect((await screen.findByRole('heading')).textContent).toMatch(/couldn’t confirm your second factor/)
    expect(assign).toHaveBeenCalledTimes(2)
  })
  it('signed out: sign in, back to the link', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok({ kind: 'unauthenticated' }))
    render(<OAuthStepUpPage />)
    await waitFor(() => expect(assign).toHaveBeenCalledWith(`/login?return_to=${encodeURIComponent(HREF)}`))
  })
  it('a refusal says why', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok({ kind: 'refused', reason: 'credential_gone' }))
    render(<OAuthStepUpPage />)
    expect((await screen.findByRole('heading')).textContent).toMatch(/no longer connected/)
  })
  it('a failed Confirm keeps the screen with an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok(show)).mockRejectedValueOnce(new Error('offline'))
    render(<OAuthStepUpPage />)
    fireEvent.click(await screen.findByRole('button', { name: /confirm/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t confirm/i)
  })
  it('no or bad req: expired, nothing fetched', () => {
    params.value = 'req=nope'
    const f = vi.spyOn(globalThis, 'fetch')
    render(<OAuthStepUpPage />)
    expect(screen.getByRole('heading').textContent).toBe('This link has expired')
    expect(f).not.toHaveBeenCalled()
  })
})
