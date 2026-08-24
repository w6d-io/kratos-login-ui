import { describe, it, expect } from 'vitest'
import type { LoginFlow } from '@ory/client'
import {
  hasGroup,
  availableMethods,
  getScriptNodes,
  getTriggerButton,
  getHiddenInputs,
  getPasskeyCredentials,
} from './kratos-flow'

// Minimal flow shapes mirroring what Kratos returns when both password and
// code (passwordless_enabled) are configured. These predicates gate the
// "Sign in with a one-time code instead" / "Use password instead" fallback
// links on the login page.
function flowWithNodes(nodes: Array<{ group: string; name: string; type?: string }>): LoginFlow {
  return {
    ui: {
      nodes: nodes.map((n) => ({
        type: 'input',
        group: n.group,
        attributes: { name: n.name, type: n.type || 'text', node_type: 'input' },
        messages: [],
        meta: {},
      })),
    },
  } as unknown as LoginFlow
}

const mixedFlow = flowWithNodes([
  { group: 'default', name: 'csrf_token', type: 'hidden' },
  { group: 'default', name: 'identifier' },
  { group: 'code', name: 'method', type: 'submit' },
  { group: 'password', name: 'password', type: 'password' },
  { group: 'password', name: 'method', type: 'submit' },
])

// After method=code is submitted, Kratos moves to state=sent_email and
// drops the password group entirely.
const sentEmailFlow = flowWithNodes([
  { group: 'default', name: 'identifier', type: 'hidden' },
  { group: 'code', name: 'code' },
  { group: 'code', name: 'method', type: 'submit' },
  { group: 'code', name: 'resend', type: 'submit' },
  { group: 'default', name: 'csrf_token', type: 'hidden' },
])

describe('login method fallbacks (password <-> code)', () => {
  it('offers both password and code on a fresh mixed flow', () => {
    expect(hasGroup(mixedFlow, 'password')).toBe(true)
    expect(availableMethods(mixedFlow)).toContain('code')
    expect(availableMethods(mixedFlow)).toContain('password')
  })

  it('drops password after the code email is sent', () => {
    expect(hasGroup(sentEmailFlow, 'password')).toBe(false)
    expect(hasGroup(sentEmailFlow, 'code')).toBe(true)
    expect(availableMethods(sentEmailFlow)).toEqual(['code'])
  })
})

// ── Passkey node extraction ─────────────────────────────────────────────
// Fixture mirrors a live Kratos v1.3 login flow with the `passkey` method
// enabled (script node + trigger button + hidden challenge/result inputs).
const passkeyLoginFlow = {
  ui: {
    action: 'http://localhost:4433/self-service/login?flow=abc',
    nodes: [
      {
        type: 'script',
        group: 'webauthn',
        attributes: {
          src: 'http://localhost:4433/.well-known/ory/webauthn.js',
          async: true,
          referrerpolicy: 'no-referrer',
          crossorigin: 'anonymous',
          integrity: 'sha512-xxx',
          type: 'text/javascript',
          id: 'webauthn_script',
          nonce: 'nonce-1',
          node_type: 'script',
        },
        messages: [],
        meta: {},
      },
      {
        type: 'input',
        group: 'default',
        attributes: { name: 'csrf_token', type: 'hidden', value: 'tok', node_type: 'input' },
        messages: [],
        meta: {},
      },
      {
        type: 'input',
        group: 'passkey',
        attributes: {
          name: 'passkey_login_trigger',
          type: 'button',
          value: '',
          onclick: 'window.oryPasskeyLogin()',
          onclickTrigger: 'oryPasskeyLogin',
          node_type: 'input',
        },
        messages: [],
        meta: { label: { id: 1010021, text: 'Sign in with passkey', type: 'info' } },
      },
      {
        type: 'input',
        group: 'passkey',
        attributes: { name: 'passkey_login', type: 'hidden', node_type: 'input' },
        messages: [],
        meta: {},
      },
      {
        type: 'input',
        group: 'passkey',
        attributes: { name: 'passkey_challenge', type: 'hidden', value: '{"publicKey":{}}', node_type: 'input' },
        messages: [],
        meta: {},
      },
    ],
  },
} as unknown as LoginFlow

const passkeySettingsFlow = {
  ui: {
    nodes: [
      {
        type: 'input',
        group: 'passkey',
        attributes: { name: 'passkey_remove', type: 'submit', value: 'cred-id-1', node_type: 'input' },
        messages: [],
        meta: {
          label: {
            id: 1050012,
            text: 'Remove passkey',
            type: 'info',
            context: { display_name: 'MacBook Touch ID', added_at: '2026-08-01T00:00:00Z' },
          },
        },
      },
    ],
  },
} as unknown as LoginFlow

describe('passkey node extraction', () => {
  it('finds the webauthn.js script node with SRI attributes', () => {
    const scripts = getScriptNodes(passkeyLoginFlow)
    expect(scripts).toHaveLength(1)
    expect(scripts[0].src).toBe('http://localhost:4433/.well-known/ory/webauthn.js')
    expect(scripts[0].integrity).toBe('sha512-xxx')
    expect(scripts[0].id).toBe('webauthn_script')
  })

  it('extracts the trigger button with its onclickTrigger function name', () => {
    const t = getTriggerButton(passkeyLoginFlow, 'passkey_login_trigger')
    expect(t).not.toBeNull()
    expect(t!.onclickTrigger).toBe('oryPasskeyLogin')
    expect(t!.label).toBe('Sign in with passkey')
  })

  it('returns null for a missing or non-button trigger', () => {
    expect(getTriggerButton(passkeyLoginFlow, 'nope')).toBeNull()
    // passkey_login is hidden, not a button — must not match.
    expect(getTriggerButton(passkeyLoginFlow, 'passkey_login')).toBeNull()
  })

  it('collects the group hidden inputs, excluding csrf_token', () => {
    const hidden = getHiddenInputs(passkeyLoginFlow, 'passkey')
    expect(hidden.map((h) => h.name).sort()).toEqual(['passkey_challenge', 'passkey_login'])
    // Value-less result input normalizes to empty string.
    expect(hidden.find((h) => h.name === 'passkey_login')!.value).toBe('')
    expect(getHiddenInputs(passkeyLoginFlow, 'default')).toEqual([])
  })

  it('exposes passkey as an available method', () => {
    expect(availableMethods(passkeyLoginFlow)).toContain('passkey')
    expect(hasGroup(passkeyLoginFlow, 'passkey')).toBe(true)
  })

  it('lists registered passkeys from settings passkey_remove nodes', () => {
    const creds = getPasskeyCredentials(passkeySettingsFlow)
    expect(creds).toEqual([
      { id: 'cred-id-1', label: 'MacBook Touch ID', addedAt: '2026-08-01T00:00:00Z' },
    ])
    expect(getPasskeyCredentials(passkeyLoginFlow)).toEqual([])
  })
})
