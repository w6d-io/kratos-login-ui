import { describe, it, expect, beforeEach, vi } from 'vitest'
import { evaluatePassword, tooSimilarToIdentifier } from './password-rules'
import { cooldownUntil, formatCountdown, lastMethod, rememberMethod, secondsLeft, setCooldownUntil } from './prefs'
import { describeDevice, relativeTime } from './device'
import { describeFlowError } from './flow-error'
import { fieldLabel } from './labels'

describe('evaluatePassword', () => {
  it('shows every rule idle before anything is typed', () => {
    const r = evaluatePassword('', 'nina@example.com')
    expect(r.score).toBe(0)
    expect(r.strength).toBe('')
    expect(r.rules.map((x) => x.state)).toEqual(['idle', 'idle', 'server'])
    expect(r.ready).toBe(false)
  })

  it('flags a short password live, not after submit', () => {
    const r = evaluatePassword('abc', 'nina@example.com')
    expect(r.rules[0].state).toBe('unmet')
    expect(r.strength).toBe('Too short')
    expect(r.score).toBe(1)
  })

  it('flags a password built on the email', () => {
    const r = evaluatePassword('nina2024!!', 'nina@example.com')
    expect(r.rules[1].state).toBe('unmet')
    expect(r.ready).toBe(false)
    expect(r.rules[1].label).toMatch(/email/)
  })

  it('never claims the breach check passed — only the server knows', () => {
    expect(evaluatePassword('Tr0ub4dor&3-horse-staple', 'x@y.z').rules[2].state).toBe('server')
  })

  it('scores length and variety', () => {
    expect(evaluatePassword('correcthorse', '').score).toBe(3)
    expect(evaluatePassword('Correct-horse-battery-7', '').score).toBe(4)
    expect(evaluatePassword('aaaaaaaaaaaa', '').score).toBe(1)
    expect(evaluatePassword('abcdefgh', '').ready).toBe(true)
  })

  it('honours a custom minimum', () => {
    expect(evaluatePassword('abcdefghij', '', 12).rules[0]).toMatchObject({ state: 'unmet', label: 'At least 12 characters' })
  })

  it('ignores identifier fragments too short to matter', () => {
    expect(tooSimilarToIdentifier('passwordab', 'ab@example.com')).toBe(false)
    expect(tooSimilarToIdentifier('', 'nina@example.com')).toBe(false)
  })
})

// Node 25 ships its own (disabled) localStorage that shadows jsdom's; use an in-memory one.
function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k) },
    setItem: (k, v) => { m.set(k, String(v)) },
  }
}

describe('prefs', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()) })

  it('remembers the last sign-in method and rejects junk', () => {
    expect(lastMethod()).toBeNull()
    rememberMethod('passkey')
    expect(lastMethod()).toBe('passkey')
    rememberMethod('oidc:google')
    expect(lastMethod()).toBe('oidc:google')
    window.localStorage.setItem('auth:last-method', '<script>')
    expect(lastMethod()).toBeNull()
  })

  it('counts down in whole seconds and formats m:ss', () => {
    expect(secondsLeft(10_500, 10_000)).toBe(1)
    expect(secondsLeft(9_000, 10_000)).toBe(0)
    expect(formatCountdown(0)).toBe('0:00')
    expect(formatCountdown(59)).toBe('0:59')
    expect(formatCountdown(61)).toBe('1:01')
  })

  it('persists a cooldown and reads garbage as none', () => {
    setCooldownUntil('recovery', 123)
    expect(cooldownUntil('recovery')).toBe(123)
    window.localStorage.setItem('auth:cooldown:x', 'nope')
    expect(cooldownUntil('x')).toBe(0)
    expect(cooldownUntil('missing')).toBe(0)
  })
})

describe('describeDevice', () => {
  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', 'Chrome on macOS', 'desktop'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'Safari on iOS', 'phone'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0', 'Edge on Windows', 'desktop'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36', 'Chrome on Android', 'phone'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', 'Firefox on Linux', 'desktop'],
    ['', 'Unknown device', 'desktop'],
  ])('%s → %s', (ua, label, kind) => {
    expect(describeDevice(ua)).toEqual({ label, kind })
  })
})

describe('relativeTime', () => {
  const now = Date.parse('2026-09-26T12:00:00Z')
  it('reads like speech', () => {
    expect(relativeTime('2026-09-26T11:59:30Z', now)).toBe('just now')
    expect(relativeTime('2026-09-26T11:55:00Z', now)).toBe('5 minutes ago')
    expect(relativeTime('2026-09-25T12:00:00Z', now)).toBe('yesterday')
    expect(relativeTime(null, now)).toBe('unknown')
    expect(relativeTime('garbage', now)).toBe('unknown')
  })
})

describe('describeFlowError', () => {
  it('turns CSRF into a restart, not a scare', () => {
    expect(describeFlowError({ id: 'security_csrf_violation', code: 403 })).toMatchObject({ action: 'restart', tone: 'warn' })
  })
  it('recognises expiry, rate limits, existing sessions and bad return_to', () => {
    expect(describeFlowError({ id: 'self_service_flow_expired' }).action).toBe('restart')
    expect(describeFlowError({ code: 429 }).action).toBe('wait')
    expect(describeFlowError({ id: 'session_already_available' }).action).toBe('back')
    expect(describeFlowError({ id: 'self_service_flow_return_to_forbidden' }).tone).toBe('danger')
    expect(describeFlowError({ id: 'session_inactive' }).action).toBe('signin')
  })
  it('falls back to a generic, still actionable state', () => {
    expect(describeFlowError(null)).toMatchObject({ title: 'Something went wrong', action: 'restart' })
  })
})

describe('fieldLabel', () => {
  it('normalises Kratos e-mail titles and keeps everything else', () => {
    expect(fieldLabel('E-Mail', 'x')).toBe('Email')
    expect(fieldLabel('email address', 'x')).toBe('Email')
    expect(fieldLabel('Name', 'x')).toBe('Name')
    expect(fieldLabel(undefined, 'Fallback')).toBe('Fallback')
  })
})
