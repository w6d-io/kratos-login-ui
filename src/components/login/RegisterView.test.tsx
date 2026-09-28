import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RegistrationFlow } from '@ory/client'
import { RegisterView } from './RegisterView'

afterEach(cleanup)

const flow = { id: 'f1', ui: { nodes: [], action: '', method: 'POST' }, return_to: '' } as unknown as RegistrationFlow
const hiddenEmail = [{ name: 'traits.email', type: 'hidden', value: 'ann@corp.io', required: true, errors: [], label: '' }] as never
const props = (over: Record<string, unknown> = {}) => ({
  flow, banners: [], networkError: null, submitting: false, oidc: [], traitFields: hiddenEmail,
  traits: { 'traits.email': 'ann@corp.io' }, setTrait: () => {}, password: '', setPassword: () => {},
  accepted: false, setAccepted: () => {}, hasPassword: false, hasProfileStep: false, hasPasskey: false,
  returnTo: '', onSubmit: () => {}, onSubmitOidc: () => {}, ...over,
})

describe('RegisterView · email-code sign-up', () => {
  it('credential step with only a code on offer: one button sends it, no bot check yet (sending creates nothing)', () => {
    const onSendCode = vi.fn()
    render(<RegisterView {...props({ codeStage: 'send', onSendCode, botCheck: <div data-testid="widget" /> })} />)
    expect(screen.getByRole('heading', { name: /choose how you’ll sign in/i })).toBeTruthy()
    expect(screen.queryByTestId('widget')).toBeNull()
    expect(screen.queryByRole('button', { name: /^continue$/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /email me a code/i }))
    expect(onSendCode).toHaveBeenCalled()
  })

  it('credential step with a password too: the code is the alternative', () => {
    render(<RegisterView {...props({ codeStage: 'send', hasPassword: true, onSendCode: () => {} })} />)
    expect(document.getElementById('reg-pw')).not.toBeNull()
    expect(screen.getByRole('button', { name: /email me a code instead/i })).toBeTruthy()
  })

  it('code sent: the code, the terms and the bot check gate "Create account"; resend is there', () => {
    const onSubmitCode = vi.fn((e: Event) => e.preventDefault())
    const view = (over: Record<string, unknown>) => (
      <RegisterView {...props({ codeStage: 'enter', code: '123456', setCode: () => {}, onSubmitCode, onResendCode: () => {}, botCheck: <div data-testid="widget" />, ...over })} />
    )
    const { rerender } = render(view({ accepted: false, botCheckPending: true }))
    expect(screen.getByRole('heading', { name: /check your email/i })).toBeTruthy()
    expect(screen.getByText('ann@corp.io')).toBeTruthy()
    expect(screen.getByTestId('widget')).toBeTruthy()
    const submit = () => screen.getByRole('button', { name: /create account/i }) as HTMLButtonElement
    expect(submit().disabled).toBe(true)
    expect(screen.getByText(/tick the box/i)).toBeTruthy()
    rerender(view({ accepted: true, botCheckPending: true }))
    expect(submit().disabled).toBe(true)
    expect(screen.getByText(/complete the bot check/i)).toBeTruthy()
    rerender(view({ accepted: true, botCheckPending: false, code: '123' }))
    expect(submit().disabled).toBe(true)
    rerender(view({ accepted: true, botCheckPending: false }))
    expect(submit().disabled).toBe(false)
    fireEvent.click(submit())
    expect(onSubmitCode).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /resend code/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /use a different email/i }).getAttribute('href')).toBe('/register')
  })

  it('a full code does not submit itself while the bot check (or the terms) still wait', () => {
    const onSubmitCode = vi.fn((e: Event) => e.preventDefault())
    const view = (over: Record<string, unknown>) => (
      <RegisterView {...props({ codeStage: 'enter', code: '123456', setCode: () => {}, onSubmitCode, botCheck: <div />, accepted: true, ...over })} />
    )
    const { rerender } = render(view({ botCheckPending: true }))
    rerender(view({ botCheckPending: true, accepted: false }))
    expect(onSubmitCode).not.toHaveBeenCalled()
    // Everything there: the full code submits on its own, as elsewhere.
    rerender(view({ botCheckPending: false, accepted: true }))
    expect(onSubmitCode).toHaveBeenCalledTimes(1)
  })

  it('after the hook refused the bot check, says the code is spent and to send a new one', () => {
    const refused = { ...flow, ui: { ...flow.ui, messages: [{ id: 4000902, type: 'error', text: 'The bot check did not pass or has expired.' }] } } as unknown as RegistrationFlow
    render(<RegisterView {...props({ flow: refused, codeStage: 'enter', code: '', setCode: () => {}, onSubmitCode: () => {}, onResendCode: () => {} })} />)
    expect(screen.getByRole('status').textContent).toMatch(/send a new code/i)
  })
})
