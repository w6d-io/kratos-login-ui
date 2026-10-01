import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StepUpConfirmView, StepUpDoneView, StepUpEndView } from './OAuthStepUpViews'

afterEach(cleanup)
const view = { kind: 'oauth' as const, name: 'Claude Code', account: 'ada@example.com', hours: 12 }

describe('StepUpConfirmView', () => {
  it('names the app and the window, with Confirm and Cancel', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<StepUpConfirmView view={view} busy={false} error={null} switchHref="/logout" onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByRole('heading').textContent).toBe('Confirm two-step sign-in for Claude Code')
    expect(screen.getByText(/protected actions .* will work for 12 more hours/i)).toBeTruthy()
    expect(screen.getByText('Unverified name')).toBeTruthy()
    expect(screen.getByText('ada@example.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
  it('a personal key, no hours known; busy disables both buttons', () => {
    render(<StepUpConfirmView view={{ ...view, kind: 'personal', name: 'laptop', hours: null }} busy error="Nope" switchHref="/" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Personal key')).toBeTruthy()
    expect(screen.queryByText('Unverified name')).toBeNull()
    expect(screen.getByText(/will work again for a while/)).toBeTruthy()
    expect((screen.getByRole('button', { name: /confirm/i }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /cancel/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('Nope')
  })
})

describe('StepUpDoneView', () => {
  it('says to go back to the assistant and retry', () => {
    render(<StepUpDoneView name="Claude Code" until="2026-10-01T22:00:00Z" />)
    expect(screen.getByRole('heading').textContent).toBe('Done — go back to your assistant and retry')
    expect(screen.getByText(/Claude Code until/)).toBeTruthy()
  })
})

describe('StepUpEndView', () => {
  it('expired: ask for a new link, no buttons', () => {
    render(<StepUpEndView kind="expired" />)
    expect(screen.getByText(/ask your assistant for a new one/i)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('wrong account offers switching; unavailable offers retry', () => {
    const onRetry = vi.fn()
    render(<StepUpEndView kind="wrong_account" switchHref="/logout?x" />)
    expect(screen.getByRole('link', { name: /switch account/i }).getAttribute('href')).toBe('/logout?x')
    cleanup()
    render(<StepUpEndView kind="unavailable" onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalled()
  })
})
