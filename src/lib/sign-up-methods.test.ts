import { describe, it, expect, vi } from 'vitest'
import type { RegistrationFlow } from '@ory/client'
import { nextStepText, offeredSignUpMethods, parseSignUpMethods, schemaSignUpMethods } from './sign-up-methods'
import { createSignUpMethodsService } from './sign-up-methods-server'
import { registrationTraitFields } from './kratos-flow'
import { DEFAULT_PROTECTED_TRAITS, isProtectedTrait } from './sign-in-protection'

// Node lists as Kratos v26.2.0 returns them for the sandbox's identity schema (email, name,
// person_uuid, applicant_uuid): the details step is the same whatever the methods; the second step
// shows them.
type N = [group: string, name: string, type: string, value?: string]
const flow = (nodes: N[]) => ({
  id: 'f', ui: { action: '', method: 'POST', nodes: nodes.map(([group, name, type, value]) => ({ type: 'input', group, attributes: { name, type, value, node_type: 'input' }, messages: [], meta: {} })) },
}) as unknown as RegistrationFlow
const details = flow([
  ['default', 'csrf_token', 'hidden'], ['default', 'traits.email', 'email'], ['default', 'traits.name', 'text'],
  ['default', 'traits.person_uuid', 'text'], ['default', 'traits.applicant_uuid', 'text'], ['profile', 'method', 'submit', 'profile'],
])
const echoed: N[] = [['default', 'traits.email', 'hidden'], ['default', 'traits.name', 'hidden'], ['default', 'traits.person_uuid', 'hidden'], ['default', 'traits.applicant_uuid', 'hidden']]
const codeOnlyStep2 = flow([...echoed, ['code', 'method', 'submit', 'code'], ['profile', 'screen', 'submit', 'previous']])
const passwordStep2 = flow([...echoed, ['code', 'method', 'submit', 'code'], ['password', 'password', 'password'], ['password', 'method', 'submit', 'password'], ['profile', 'screen', 'submit', 'previous']])
const codeSent = flow([...echoed, ['code', 'code', 'text'], ['code', 'resend', 'submit', 'code'], ['code', 'method', 'submit', 'code']])

const credentials = (c: Record<string, unknown>) => ({ properties: { traits: { properties: {
  email: { type: 'string', 'ory.sh/kratos': { credentials: c } }, name: { type: 'string' }, person_uuid: { type: 'string' },
} } } })
const SANDBOX_SCHEMA = credentials({ code: { identifier: true, via: 'email' } })

describe('offeredSignUpMethods', () => {
  it('the details step shows no method (Kratos v26 two-step): unknown, not "none"', () => {
    expect(offeredSignUpMethods(details)).toBeNull()
    expect(offeredSignUpMethods(null)).toBeNull()
  })
  it('the second step: code only, or password and code; a sent code is still the code method', () => {
    expect(offeredSignUpMethods(codeOnlyStep2)).toEqual(['code'])
    expect(offeredSignUpMethods(passwordStep2)).toEqual(['password', 'code'])
    expect(offeredSignUpMethods(codeSent)).toEqual(['code'])
  })
})

describe('schemaSignUpMethods', () => {
  it('sandbox and dev schema (code identifier only): code', () => {
    expect(schemaSignUpMethods(SANDBOX_SCHEMA)).toEqual(['code'])
  })
  it('password and code identifiers, passkey display name, webauthn identifier', () => {
    expect(schemaSignUpMethods(credentials({ password: { identifier: true }, code: { identifier: true, via: 'email' } }))).toEqual(['password', 'code'])
    expect(schemaSignUpMethods(credentials({ passkey: { display_name: true } }))).toEqual(['passkey'])
    expect(schemaSignUpMethods(credentials({ webauthn: { identifier: true }, password: { identifier: true } }))).toEqual(['password', 'passkey'])
  })
  it('nothing usable: null', () => {
    expect(schemaSignUpMethods({})).toBeNull()
    expect(schemaSignUpMethods(null)).toBeNull()
    expect(schemaSignUpMethods(credentials({ totp: { account_name: true } }))).toBeNull()
  })
  it('parse: known names only', () => {
    expect(parseSignUpMethods({ methods: ['code', 'magic'] })).toEqual(['code'])
    expect(parseSignUpMethods({ methods: null })).toBeNull()
    expect(parseSignUpMethods('x')).toBeNull()
  })
})

describe('nextStepText', () => {
  it('code only: the email code, no password or passkey promised', () => {
    const t = nextStepText(['code'])
    expect(t).toMatch(/email you a 6-digit code/)
    expect(t).not.toMatch(/password|passkey/)
  })
  it('names what is offered', () => {
    expect(nextStepText(['password', 'code'])).toBe('Next, you’ll choose a password or get a 6-digit code by email.')
    expect(nextStepText(['password', 'passkey', 'code'])).toBe('Next, you’ll choose a password, add a passkey or get a 6-digit code by email.')
    expect(nextStepText(['password'])).toBe('Next, you’ll choose a password.')
  })
  it('unknown: promises nothing specific', () => {
    expect(nextStepText(null)).toBe('Next, you’ll choose how to sign in.')
  })
})

describe('registrationTraitFields', () => {
  const hidden = (n: string) => isProtectedTrait(n, DEFAULT_PROTECTED_TRAITS)
  it('asks only what a person knows: email and name, never the protected ids', () => {
    expect(registrationTraitFields(details, hidden).map((f) => f.name)).toEqual(['traits.email', 'traits.name'])
    expect(registrationTraitFields(passwordStep2, hidden).map((f) => f.name)).toEqual(['traits.email', 'traits.name'])
  })
  it('a list from jinbe with another trait hides that one too', () => {
    expect(registrationTraitFields(details, (n) => isProtectedTrait(n, ['name'])).map((f) => f.name)).toEqual(['traits.email', 'traits.person_uuid', 'traits.applicant_uuid'])
  })
})

describe('createSignUpMethodsService', () => {
  const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
  it('reads the default schema from Kratos /schemas and caches it', async () => {
    const fetchImpl = answer([{ id: 'other', schema: {} }, { id: 'default', schema: SANDBOX_SCHEMA }])
    let t = 0
    const current = createSignUpMethodsService({ baseUrl: 'http://kratos:4433/', fetchImpl, now: () => t })
    expect(await current()).toEqual(['code'])
    t = 30_000
    await current()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((fetchImpl as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]).toBe('http://kratos:4433/schemas')
  })
  it('the only schema counts as the default; several without a default, an error or Kratos down: null', async () => {
    expect(await createSignUpMethodsService({ baseUrl: 'http://k', fetchImpl: answer([{ id: 'person', schema: SANDBOX_SCHEMA }]) })()).toEqual(['code'])
    expect(await createSignUpMethodsService({ baseUrl: 'http://k', fetchImpl: answer([{ id: 'a', schema: SANDBOX_SCHEMA }, { id: 'b', schema: {} }]) })()).toBeNull()
    expect(await createSignUpMethodsService({ baseUrl: 'http://k', fetchImpl: answer({}, 500) })()).toBeNull()
    const down = vi.fn(async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    expect(await createSignUpMethodsService({ baseUrl: 'http://k', fetchImpl: down })()).toBeNull()
  })
})
