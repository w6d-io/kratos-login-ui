import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProfileSection } from './SettingsSections'

// Changing the email sends a verification email: that save waits for the bot check. Other saves don't.

afterEach(cleanup)

const fields = [{ name: 'traits.email', type: 'email', value: '', required: true, errors: [], label: 'E-Mail' }] as never
const view = (over: Record<string, unknown>) => (
  <ProfileSection traitFields={fields} traits={{ 'traits.email': 'bob@corp.io' }} setTrait={() => {}} submitting={false} disabled={false}
    onSubmit={(e) => e.preventDefault()} onReset={() => {}} humanize={(n) => n} {...over} />
)

describe('ProfileSection · bot check on an email change', () => {
  it('no widget, save enabled, when the email is not changing', () => {
    render(view({}))
    expect(screen.queryByTestId('widget')).toBeNull()
    expect((screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('widget shown and save waits for its token', () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault())
    const { rerender } = render(view({ onSubmit, botCheck: <div data-testid="widget" />, botCheckPending: true }))
    expect(screen.getByTestId('widget')).toBeTruthy()
    const save = () => screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement
    expect(save().disabled).toBe(true)
    expect(screen.getByText(/verification email/i)).toBeTruthy()
    fireEvent.submit(save().closest('form')!)
    expect(onSubmit).not.toHaveBeenCalled()
    rerender(view({ onSubmit, botCheck: <div data-testid="widget" />, botCheckPending: false }))
    expect(save().disabled).toBe(false)
    fireEvent.click(save())
    expect(onSubmit).toHaveBeenCalled()
  })
})
