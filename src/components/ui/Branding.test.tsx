import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { BrandingProvider, SignInDomain, SiteBrand, useBranding, useBrandingReturnTo } from './Branding'
import type { SiteBranding } from '@/lib/branding'

const payroll: SiteBranding = {
  host: 'payroll.test',
  name: 'payroll',
  displayName: 'Payroll <img src=x onerror=alert(1)>',
  hasLogo: true,
  accent: '#2F6FEB',
  welcome: '<script>alert(1)</script> Welcome',
  helpUrl: 'https://payroll.test/help',
  minAal: 'aal2',
  scope: 'writes',
}

function mockFetch(branding: SiteBranding | null) {
  const f = vi.fn(async () => new Response(JSON.stringify({ branding })))
  vi.stubGlobal('fetch', f)
  return f
}

function Reporter({ url }: { url: string | null }) {
  useBrandingReturnTo(url)
  const { branding } = useBranding()
  return <span data-testid="accent">{branding?.accent ?? 'default'}</span>
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('BrandingProvider', () => {
  it('fetches branding for a reported return_to and exposes it', async () => {
    const f = mockFetch(payroll)
    render(<BrandingProvider><Reporter url="https://payroll.test/x" /><SiteBrand /></BrandingProvider>)
    await waitFor(() => expect(screen.getByTestId('accent').textContent).toBe('#2F6FEB'))
    expect(f).toHaveBeenCalledWith('/api/branding?return_to=https%3A%2F%2Fpayroll.test%2Fx', expect.anything())
  })

  it('renders branding text escaped, logo from our proxy only', async () => {
    mockFetch(payroll)
    const { container } = render(<BrandingProvider><Reporter url="https://payroll.test/" /><SiteBrand /></BrandingProvider>)
    await waitFor(() => expect(screen.getByText(/Welcome/)).toBeTruthy())
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(container.querySelector('img')!.getAttribute('src')).toBe('/api/branding/logo?host=payroll.test')
    expect(screen.getByText(/Payroll <img/)).toBeTruthy()
    const help = screen.getByRole('link', { name: /help/i })
    expect(help.getAttribute('rel')).toContain('noopener')
  })

  it('stays on platform branding when the lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    render(<BrandingProvider><Reporter url="https://payroll.test/" /><SiteBrand /></BrandingProvider>)
    await act(async () => {})
    expect(screen.getByTestId('accent').textContent).toBe('default')
  })

  it('does not fetch without a return_to', async () => {
    const f = mockFetch(payroll)
    render(<BrandingProvider><Reporter url={null} /></BrandingProvider>)
    await act(async () => {})
    expect(f).not.toHaveBeenCalled()
  })
})

describe('SignInDomain', () => {
  it('always shows the platform sign-in host, branded or not', async () => {
    mockFetch(payroll)
    render(<BrandingProvider><Reporter url="https://payroll.test/" /><SignInDomain appName="example" /></BrandingProvider>)
    await waitFor(() => expect(screen.getByText(/example account/)).toBeTruthy())
    expect(screen.getByText(window.location.host, { exact: false })).toBeTruthy()
  })
})
