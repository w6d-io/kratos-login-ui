import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { LoginFlow, RecoveryFlow } from '@ory/client'
import { CodeView, PasswordView } from './LoginViews'
import { RecoveryView } from './EmailCodeViews'

// Every way back to sign-in from a flow card keeps the destination: a bare /login starts a
// fresh flow without return_to, and the sign-in then ends on the "Where to?" picker.

afterEach(cleanup)

const RT = 'https://echo.example.com/private?x=1'
const input = (group: string, name: string, type = 'text') => ({ group, type: 'input', attributes: { name, type, value: '', node_type: 'input' }, messages: [], meta: {} })
const loginFlow = (groups: string[]) => ({
  id: 'f1', return_to: RT, requested_aal: 'aal1', refresh: false,
  ui: { action: '/self-service/login?flow=f1', method: 'POST', nodes: [input('default', 'csrf_token', 'hidden'), input('default', 'identifier'), ...groups.map((g) => input(g, g === 'password' ? 'password' : 'identifier'))] },
}) as unknown as LoginFlow
const noop = () => {}
const base = { banners: [], networkError: null, submitting: false, setStep: noop }

describe('links back to sign-in carry return_to', () => {
  it('email-code step: "All sign-in options"', () => {
    render(<CodeView {...base} flow={loginFlow(['code'])} identifier="" setIdentifier={noop} code="" setCode={noop} methods={['code']}
      onSubmitCodeRequest={noop} onSubmitCodeVerify={noop} onResend={noop} onChangeEmail={noop} />)
    expect(screen.getByRole('link', { name: /all sign-in options/i }).getAttribute('href')).toBe(`/login?return_to=${encodeURIComponent(RT)}`)
  })
  it('password step: "Forgot password?" and "Create an account"', () => {
    render(<PasswordView {...base} flow={loginFlow(['password'])} identifier="" setIdentifier={noop} password="" setPassword={noop} refreshing={false}
      knownIdentifier="" oidc={[]} methods={['password']} returnTo={RT} onSubmitPassword={noop} onSubmitOidc={noop} />)
    expect(screen.getByRole('link', { name: /forgot password/i }).getAttribute('href')).toBe(`/recovery?return_to=${encodeURIComponent(RT)}`)
    expect(screen.getByRole('link', { name: /create an account/i }).getAttribute('href')).toBe(`/register?return_to=${encodeURIComponent(RT)}`)
  })
  it('recovery: "Back to sign in" (and plain /login without a destination)', () => {
    const flow = (rt?: string) => ({ id: 'r1', return_to: rt, state: 'choose_method', ui: { action: '/x', method: 'POST', nodes: [input('code', 'email')] } }) as unknown as RecoveryFlow
    const props = { banners: [], networkError: null, submitting: false, email: '', setEmail: noop, onSubmitRequest: noop, stage: 'request' as const, code: '', setCode: noop, onSubmitCode: noop, onChangeEmail: noop, onResend: noop }
    render(<RecoveryView {...props} flow={flow(RT)} />)
    expect(screen.getByRole('link', { name: /back to sign in/i }).getAttribute('href')).toBe(`/login?return_to=${encodeURIComponent(RT)}`)
    cleanup()
    render(<RecoveryView {...props} flow={flow()} />)
    expect(screen.getByRole('link', { name: /back to sign in/i }).getAttribute('href')).toBe('/login')
  })
})
