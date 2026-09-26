/**
 * What the password field shows while the person types, so Kratos' rules are met BEFORE submit
 * instead of discovered after it. Mirrors Kratos' default password policy:
 *   - minimum length (min_password_length, default 8);
 *   - not too similar to the identifier (identifier_similarity_check_enabled, default on);
 *   - not in a breach corpus (haveibeenpwned_enabled, default on) — only the server can check,
 *     so that rule is shown as "checked when you continue", never as met.
 * The strength score is advice only; Kratos decides.
 */

export type RuleState = 'met' | 'unmet' | 'idle' | 'server'

export interface PasswordRule {
  id: 'length' | 'identifier' | 'breach'
  label: string
  state: RuleState
}

export interface PasswordReport {
  rules: PasswordRule[]
  /** 0 = nothing typed, 1 weak … 4 strong. */
  score: 0 | 1 | 2 | 3 | 4
  strength: '' | 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong'
  /** Every rule the browser can check is met. */
  ready: boolean
}

export const DEFAULT_MIN_LENGTH = 8

/** The part of an email (or the whole identifier) a password must not echo. */
function identifierParts(identifier: string): string[] {
  const id = identifier.trim().toLowerCase()
  if (!id) return []
  const local = id.split('@')[0]
  return [...new Set([id, local])].filter((p) => p.length >= 3)
}

export function tooSimilarToIdentifier(password: string, identifier: string): boolean {
  const pw = password.toLowerCase()
  if (!pw) return false
  return identifierParts(identifier).some((part) => pw.includes(part) || (pw.length >= 4 && part.includes(pw)))
}

function variety(password: string): number {
  return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length
}

export function evaluatePassword(password: string, identifier = '', minLength = DEFAULT_MIN_LENGTH): PasswordReport {
  const typed = password.length > 0
  const longEnough = password.length >= minLength
  const similar = tooSimilarToIdentifier(password, identifier)
  const rules: PasswordRule[] = [
    { id: 'length', label: `At least ${minLength} characters`, state: !typed ? 'idle' : longEnough ? 'met' : 'unmet' },
    {
      id: 'identifier',
      label: identifier.includes('@') ? 'Not based on your email address' : 'Not based on your username',
      state: !typed ? 'idle' : similar ? 'unmet' : 'met',
    },
    { id: 'breach', label: 'Not a known leaked password (checked when you continue)', state: 'server' },
  ]

  let score: PasswordReport['score'] = 0
  if (typed) {
    if (!longEnough || similar) score = 1
    else {
      const points = (password.length >= 12 ? 1 : 0) + (password.length >= 16 ? 1 : 0) + (variety(password) >= 3 ? 1 : 0)
      score = Math.min(4, 2 + points) as PasswordReport['score']
      if (/^(.)\1+$/.test(password)) score = 1
    }
  }
  const strength: PasswordReport['strength'] = !typed ? '' : !longEnough ? 'Too short' : (['', 'Weak', 'Fair', 'Good', 'Strong'] as const)[score]
  return { rules, score, strength, ready: longEnough && !similar }
}
