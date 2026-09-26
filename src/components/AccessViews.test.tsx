import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { EnrolView, ForbiddenView, AccessErrorView } from './AccessViews'

afterEach(cleanup)

const returnTo = 'https://payroll.test/pay'

describe('ForbiddenView', () => {
  it('names the site, who is signed in, and offers help, switch account and retry', () => {
    render(
      <ForbiddenView siteName="Payroll <b>" email="nina@example.com" helpUrl="https://payroll.test/help" returnTo={returnTo} origin="https://auth.test" alreadyAal2={false} />,
    )
    expect(screen.getByRole('heading').textContent).toBe("You don't have access to Payroll <b>")
    expect(screen.getByText('nina@example.com')).toBeTruthy()
    expect(screen.getByRole('link', { name: /ask for access/i }).getAttribute('href')).toBe('https://payroll.test/help')
    expect(screen.getByRole('link', { name: /switch account/i }).getAttribute('href')).toContain('/logout?return_to=')
    expect(screen.getByRole('link', { name: /try again/i }).getAttribute('href')).toBe(returnTo)
  })

  it('explains an aal2 refusal is not about 2FA, and works without help link or return_to', () => {
    render(<ForbiddenView siteName="this site" email={null} helpUrl={null} returnTo={null} origin="https://auth.test" alreadyAal2 />)
    expect(screen.getByText(/already confirmed/i)).toBeTruthy()
    expect(screen.getByText(/administrator/i)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /try again/i })).toBeNull()
  })
})

describe('EnrolView', () => {
  it('lists the methods Kratos offers and links to the prepared settings flow', () => {
    render(<EnrolView siteName="Payroll" email="nina@example.com" methods={['totp', 'webauthn', 'lookup_secret']} settingsUrl="/settings?flow=sf1#mfa" helpUrl={null} />)
    expect(screen.getByRole('heading').textContent).toBe('Set up two-factor sign-in to use Payroll')
    expect(screen.getByText(/authenticator app/i)).toBeTruthy()
    expect(screen.getByText(/security key/i)).toBeTruthy()
    expect(screen.getByText(/recovery codes/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /set up/i }).getAttribute('href')).toBe('/settings?flow=sf1#mfa')
  })

  it('says 2FA is unavailable when the platform enables no second factor', () => {
    render(<EnrolView siteName="Payroll" email={null} methods={[]} settingsUrl="/settings#mfa" helpUrl={null} />)
    expect(screen.getByText(/isn't available/i)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /set up/i })).toBeNull()
  })
})

describe('AccessErrorView', () => {
  it('offers a retry', () => {
    render(<AccessErrorView onRetry={() => {}} />)
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })
})

describe('AccessErrorView (unavailable)', () => {
  it('uses neutral copy when access cannot be checked right now', () => {
    render(<AccessErrorView unavailable onRetry={() => {}} />)
    expect(screen.getByRole('heading').textContent).toMatch(/can.t check your access right now/i)
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })
})
