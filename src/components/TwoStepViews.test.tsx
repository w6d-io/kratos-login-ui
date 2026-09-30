import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TwoStepSetupView, TwoStepStuckView, TwoStepUncheckedView } from './TwoStepViews'

afterEach(cleanup)

describe('TwoStepSetupView', () => {
  it('says why, who, where next — and offers no skip, only signing out', () => {
    render(
      <TwoStepSetupView email="root@example.com" destinationName="Kuma" signOutHref="/logout?return_to=x">
        <div>totp row</div>
      </TwoStepSetupView>,
    )
    expect(screen.getByRole('heading').textContent).toBe('Set up two-step sign-in to continue')
    expect(screen.getByText(/administrator access/i)).toBeTruthy()
    expect(screen.getByText(/go on to Kuma/)).toBeTruthy()
    expect(screen.getByText('root@example.com')).toBeTruthy()
    expect(screen.getByText('totp row')).toBeTruthy()
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0].textContent).toMatch(/sign out/i)
    expect(screen.queryByText(/skip|later/i)).toBeNull()
  })
  it('shows an error banner when there is one', () => {
    render(<TwoStepSetupView email={null} destinationName={null} error="Can't reach the server." signOutHref="/logout"><div /></TwoStepSetupView>)
    expect(screen.getByText("Can't reach the server.")).toBeTruthy()
    expect(screen.getByText(/where you were headed/)).toBeTruthy()
  })
})

describe('TwoStepStuckView', () => {
  it('offers retry and sign out', () => {
    const onRetry = vi.fn()
    render(<TwoStepStuckView onRetry={onRetry} signOutHref="/logout" />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /sign out/i }).getAttribute('href')).toBe('/logout')
  })
})

describe('TwoStepUncheckedView', () => {
  it('says it could not check, and offers retry, adding a factor anyway, and sign out — no "continue"', () => {
    const onRetry = vi.fn()
    render(<TwoStepUncheckedView onRetry={onRetry} settingsHref="/settings?return_to=x#mfa" signOutHref="/logout" />)
    expect(screen.getByRole('heading').textContent).toBe('We couldn’t check your sign-in security')
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /second factor/i }).getAttribute('href')).toBe('/settings?return_to=x#mfa')
    expect(screen.getByRole('link', { name: /sign out/i }).getAttribute('href')).toBe('/logout')
    expect(screen.queryByText(/continue anyway|skip/i)).toBeNull()
  })
})

describe('TwoStepSetupView for an app', () => {
  it('gives the app as the reason, not an administrator role', () => {
    render(<TwoStepSetupView email={null} destinationName={null} signOutHref="/logout" forApp><div /></TwoStepSetupView>)
    expect(screen.getByRole('heading').textContent).toBe('Set up two-step sign-in to connect the app')
    expect(screen.queryByText(/administrator access/i)).toBeNull()
  })
})
