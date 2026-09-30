import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const jar = vi.hoisted(() => ({ has: vi.fn(() => false) }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))

import OAuthRefusedPage from './page'

afterEach(() => { cleanup(); jar.has.mockReset() })

const show = async (sp: Record<string, string>) => render(await OAuthRefusedPage({ searchParams: Promise.resolve(sp) }))

describe('/oauth2/refused', () => {
  it('a parked reject URL: "Return to your app" goes through /oauth2/return, never a URL from the query', async () => {
    jar.has.mockReturnValue(true)
    await show({ reason: 'mcp_disabled', to: 'https://evil.example.org' })
    expect(screen.getByRole('heading').textContent).toMatch(/turned off/i)
    expect(screen.getByRole('link', { name: /return to your app/i }).getAttribute('href')).toBe('/oauth2/return')
    expect(document.body.innerHTML).not.toContain('evil')
  })
  it('an unknown reason reads as a plain refusal', async () => {
    await show({ reason: '<b>x</b>' })
    expect(screen.getByRole('heading').textContent).toMatch(/can’t sign in with your account/)
  })
  it('unavailable retries the same (validated) login challenge', async () => {
    await show({ reason: 'unavailable', login_challenge: 'L1' })
    expect(screen.getByRole('link', { name: /try again/i }).getAttribute('href')).toBe('/oauth2/login?login_challenge=L1')
    cleanup()
    await show({ reason: 'unavailable', login_challenge: 'a"b' })
    expect(screen.queryByRole('link', { name: /try again/i })).toBeNull()
  })
})
