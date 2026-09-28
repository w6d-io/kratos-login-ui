import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TwoStepSetupView, TwoStepStuckView } from './TwoStepViews'

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
