import type { RegistrationFlow, UiNodeInputAttributes } from '@ory/client'

/**
 * How a new account will sign in — what the sign-up page promises on its first step.
 *
 * The flow's nodes are the truth, but Kratos v26's two-step sign-up only shows them on the second
 * step: the first one carries the profile fields and a `profile` submit, the same whichever methods
 * are on (verified against v26.2.0 with code-only and with password + code). For that first step the
 * page asks /api/sign-up-methods, which reads the identity schema: a method only works for sign-up
 * when a trait is its identifier (password, code) or display name (passkey), so the schema is what
 * Kratos can offer. The second step then shows what it does offer.
 */

export const SIGN_UP_METHODS = ['password', 'passkey', 'code'] as const
export type SignUpMethod = (typeof SIGN_UP_METHODS)[number]

/** The credential methods this flow shows right now, or null when it shows none yet (details step). */
export function offeredSignUpMethods(flow: RegistrationFlow | null): SignUpMethod[] | null {
  const found = new Set<SignUpMethod>()
  for (const n of flow?.ui?.nodes ?? []) {
    if (n.type !== 'input') continue
    const a = n.attributes as UiNodeInputAttributes
    if (n.group === 'password' && a.name === 'password') found.add('password')
    else if (n.group === 'passkey' || n.group === 'webauthn') found.add('passkey')
    else if (n.group === 'code' && (a.name === 'code' || (a.name === 'method' && a.value === 'code'))) found.add('code')
  }
  return found.size ? SIGN_UP_METHODS.filter((m) => found.has(m)) : null
}

type SchemaNode = { properties?: Record<string, SchemaNode>; 'ory.sh/kratos'?: { credentials?: Record<string, Record<string, unknown>> } }

/** What an identity schema lets Kratos offer for sign-up; null when it says nothing usable. */
export function schemaSignUpMethods(schema: unknown): SignUpMethod[] | null {
  const found = new Set<SignUpMethod>()
  const walk = (node: SchemaNode | undefined, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 6) return
    const c = node['ory.sh/kratos']?.credentials
    if (c?.password?.identifier === true) found.add('password')
    if (c?.code?.identifier === true) found.add('code')
    if (c?.passkey?.display_name === true || c?.webauthn?.identifier === true) found.add('passkey')
    for (const child of Object.values(node.properties ?? {})) walk(child, depth + 1)
  }
  walk((schema as { properties?: { traits?: SchemaNode } } | null)?.properties?.traits, 0)
  return found.size ? SIGN_UP_METHODS.filter((m) => found.has(m)) : null
}

/** Parses /api/sign-up-methods: known methods only, null when unknown. */
export function parseSignUpMethods(body: unknown): SignUpMethod[] | null {
  const list = (body as { methods?: unknown } | null)?.methods
  if (!Array.isArray(list)) return null
  const known = SIGN_UP_METHODS.filter((m) => list.includes(m))
  return known.length ? known : null
}

const PHRASES: Record<SignUpMethod, string> = {
  password: 'choose a password',
  passkey: 'add a passkey',
  code: 'get a 6-digit code by email',
}

/** The first step's "what comes next", in words that match the methods. */
export function nextStepText(methods: SignUpMethod[] | null): string {
  if (!methods?.length) return 'Next, you’ll choose how to sign in.'
  if (methods.length === 1 && methods[0] === 'code') return 'Next, we’ll email you a 6-digit code to confirm the address.'
  const phrases = methods.map((m) => PHRASES[m])
  const list = phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(', ')} or ${phrases[phrases.length - 1]}`
  return `Next, you’ll ${list}.`
}
