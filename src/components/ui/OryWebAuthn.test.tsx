import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { LoginFlow } from '@ory/client'
import { WebAuthnTriggerForm } from './OryWebAuthn'

// Ory's webauthn.js submits the passkey form natively: no X-Captcha-Token header, so the token rides
// in the body field the gateway also reads.

afterEach(cleanup)

const flow = {
  id: 'f1', ui: { action: '/self-service/login?flow=f1', method: 'POST', nodes: [
    { group: 'default', type: 'input', attributes: { name: 'csrf_token', type: 'hidden', value: 'c', node_type: 'input' }, messages: [], meta: {} },
    { group: 'passkey', type: 'input', attributes: { name: 'passkey_login_trigger', type: 'button', value: '{}', onclickTrigger: 'oryPasskeyLogin', node_type: 'input' }, messages: [], meta: {} },
  ] },
} as unknown as LoginFlow

const field = () => document.querySelector('input[name="transient_payload.captcha_token"]') as HTMLInputElement | null

describe('WebAuthnTriggerForm · bot-check token', () => {
  it('carries the token in transient_payload.captcha_token', () => {
    render(<WebAuthnTriggerForm flow={flow} group="passkey" triggerName="passkey_login_trigger" captchaToken="T1">Passkey</WebAuthnTriggerForm>)
    expect(field()?.value).toBe('T1')
    expect(field()?.type).toBe('hidden')
  })
  it('no token, no field; disabled while the check waits', () => {
    render(<WebAuthnTriggerForm flow={flow} group="passkey" triggerName="passkey_login_trigger" disabled>Passkey</WebAuthnTriggerForm>)
    expect(field()).toBeNull()
    expect((screen.getByRole('button', { name: /passkey/i }) as HTMLButtonElement).disabled).toBe(true)
  })
})
