import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RegistrationFlow } from '@ory/client'
import { RegisterView, credentialStepText } from './RegisterView'

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

describe('RegisterView · details step', () => {
  const fields = [
    { name: 'traits.email', type: 'email', value: '', required: true, errors: [], label: 'Email' },
    { name: 'traits.name', type: 'text', value: '', required: false, errors: [], label: 'Name' },
  ] as never
  const details = (over: Record<string, unknown> = {}) => props({ traitFields: fields, traits: {}, hasProfileStep: true, ...over })

  it('asks for the email (required) and "Your name" (optional), nothing else', () => {
    render(<RegisterView {...details()} />)
    expect(screen.getByLabelText(/^email/i)).toBeTruthy()
    const name = screen.getByLabelText(/your name/i) as HTMLInputElement
    expect(name.getAttribute('autocomplete')).toBe('name')
    expect(screen.getByText(/optional/i)).toBeTruthy()
    expect(document.querySelectorAll('input.input')).toHaveLength(2)
  })

  it('code-only sign-up: says the next step is an emailed code, not a password or passkey', () => {
    render(<RegisterView {...details({ upcoming: ['code'] })} />)
    const step = screen.getByText(/step 1 of 2/i).textContent ?? ''
    expect(step).toMatch(/email you a 6-digit code/i)
    expect(step).not.toMatch(/password|passkey/i)
  })

  it('password and code: names both; unknown: promises nothing specific', () => {
    const { rerender } = render(<RegisterView {...details({ upcoming: ['password', 'code'] })} />)
    expect(screen.getByText(/step 1 of 2/i).textContent).toMatch(/choose a password or get a 6-digit code by email/i)
    rerender(<RegisterView {...details({ upcoming: null })} />)
    expect(screen.getByText(/step 1 of 2/i).textContent).toMatch(/choose how to sign in/i)
  })

  it('keeps the allow-list hint under the email', () => {
    render(<RegisterView {...details({ signUpLimit: 'Sign-ups are limited to @corp.io addresses.' })} />)
    expect(screen.getByText(/limited to @corp\.io addresses/i)).toBeTruthy()
  })

  it('credential step copy names only what is offered', () => {
    expect(credentialStepText(true, false, true)).toMatch(/password, or get a 6-digit code/i)
    expect(credentialStepText(true, false, true)).not.toMatch(/passkey/i)
    expect(credentialStepText(true, true, false)).toMatch(/passkey/i)
    render(<RegisterView {...props({ codeStage: 'send', hasPassword: true, onSendCode: () => {} })} />)
    expect(screen.getByText(/set a password, or get a 6-digit code by email instead/i)).toBeTruthy()
  })

  it('a protected-trait refusal from the server shows as a form error', () => {
    const refused = { ...flow, ui: { ...flow.ui, messages: [{ id: 4000915, type: 'error', text: 'This sign-up sets account details only an administrator can set.' }] } } as unknown as RegistrationFlow
    render(<RegisterView {...details({ flow: refused, banners: [{ tone: 'danger', title: 'This sign-up sets account details only an administrator can set.', body: '', id: 4000915 }] })} />)
    expect(screen.getByText(/only an administrator can set/i)).toBeTruthy()
  })
})
