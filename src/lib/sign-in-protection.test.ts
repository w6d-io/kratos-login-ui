import { describe, it, expect, vi } from 'vitest'
import {
  botCheckFor,
  DEFAULT_PROTECTED_TRAITS,
  captchaHeaders,
  gateRefusal,
  isProtectedTrait,
  isBotCheckRefusal,
  isTokenRefusal,
  isEmailChange,
  parseSignInProtection,
  signUpLimitText,
  UNKNOWN_PROTECTION,
} from './sign-in-protection'
import { createProtectionService } from './sign-in-protection-server'

const jinbeAnswer = {
  captcha: {
    provider: 'turnstile',
    configured: true,
    siteKey: '1x00000000000000000000AA',
    scriptUrl: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    flows: { registration: true, login: false, recovery: true, verification: false },
  },
  registration: { mode: 'allowlist', domains: ['corp.io', 'lab.io'] },
}

describe('parseSignInProtection', () => {
  it('reads jinbe\'s answer', () => {
    const p = parseSignInProtection(jinbeAnswer)
    expect(p.captcha).toEqual({
      provider: 'turnstile', siteKey: '1x00000000000000000000AA', scriptUrl: jinbeAnswer.captcha.scriptUrl,
      flows: { registration: true, login: false, recovery: true, verification: false },
    })
    expect(p.registration).toEqual({ mode: 'allowlist', domains: ['corp.io', 'lab.io'] })
    expect(botCheckFor(p, 'registration')).not.toBeNull()
    expect(botCheckFor(p, 'login')).toBeNull()
  })

  it('is idempotent: the browser re-parses what the API route already parsed', () => {
    const once = parseSignInProtection(jinbeAnswer)
    expect(parseSignInProtection(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })

  it('loads the widget only from its provider\'s own host, over https', () => {
    for (const scriptUrl of ['https://evil.example/api.js', 'http://challenges.cloudflare.com/turnstile/v0/api.js', 'javascript:alert(1)']) {
      expect(parseSignInProtection({ ...jinbeAnswer, captcha: { ...jinbeAnswer.captcha, scriptUrl } }).captcha).toBeNull()
    }
    expect(parseSignInProtection({ ...jinbeAnswer, captcha: { ...jinbeAnswer.captcha, provider: 'hcaptcha' } }).captcha).toBeNull()
  })

  it('no configured provider, garbage, or nothing: no widget and open sign-up (the server still decides)', () => {
    expect(parseSignInProtection({ ...jinbeAnswer, captcha: { ...jinbeAnswer.captcha, configured: false } }).captcha).toBeNull()
    expect(parseSignInProtection(null)).toEqual(UNKNOWN_PROTECTION)
    expect(parseSignInProtection({ registration: { mode: 'weird', domains: ['<b>x</b>', 'ok.io'] } }).registration).toEqual({ mode: 'open', domains: [] })
    expect(parseSignInProtection({ registration: { mode: 'allowlist', domains: ['<b>x</b>', 'ok.io'] } }).registration.domains).toEqual(['ok.io'])
  })
})

describe('signUpLimitText', () => {
  const reg = (registration: object) => ({ captcha: null, registration } as Parameters<typeof signUpLimitText>[0])
  it('says who may sign up', () => {
    expect(signUpLimitText(reg({ mode: 'open', domains: [] }))).toBeNull()
    expect(signUpLimitText(reg({ mode: 'closed', domains: [] }))).toBe('Sign-ups are closed. Ask an administrator to create your account.')
    expect(signUpLimitText(reg({ mode: 'allowlist', domains: ['corp.io'] }))).toBe('Sign-ups are limited to @corp.io addresses.')
    expect(signUpLimitText(reg({ mode: 'allowlist', domains: ['a.io', 'b.io', 'c.io'] }))).toBe('Sign-ups are limited to @a.io, @b.io and @c.io addresses.')
    expect(signUpLimitText(reg({ mode: 'allowlist', domains: [] }))).toMatch(/invited addresses/)
  })
})

describe('captchaHeaders', () => {
  it('puts the token in X-Captcha-Token, and nothing when there is no token', () => {
    expect(captchaHeaders('0.abc-DEF_1.x')).toEqual({ headers: { 'X-Captcha-Token': '0.abc-DEF_1.x' } })
    expect(captchaHeaders(null)).toBeUndefined()
    expect(captchaHeaders('')).toBeUndefined()
  })
  it('cannot be used to inject a header', () => {
    expect(captchaHeaders('a\r\nX-Evil: 1')).toEqual({ headers: { 'X-Captcha-Token': 'aX-Evil:1' } })
    expect(captchaHeaders('\r\n')).toBeUndefined()
  })
})

describe('gateRefusal', () => {
  const body = (error: Record<string, unknown>) => ({ error })
  it('reads the gateway bot-check refusals with their message', () => {
    expect(gateRefusal(body({ id: 'captcha_missing', code: 403, message: 'Please complete the bot check, then try again.' }), 403))
      .toEqual({ id: 'captcha_missing', message: 'Please complete the bot check, then try again.' })
    expect(gateRefusal(body({ id: 'captcha_invalid', code: 403 }), 403)?.message).toMatch(/did not pass/)
    expect(gateRefusal(body({ id: 'captcha_unavailable', message: '' }))?.message).toMatch(/unavailable/)
  })
  it('reads a rate limit with its wait', () => {
    expect(gateRefusal(body({ id: 'rate_limited', code: 429, message: 'Too many codes. Wait 12 minutes.', retry_after: 700.2 }), 429))
      .toEqual({ id: 'rate_limited', message: 'Too many codes. Wait 12 minutes.', retryAfter: 701 })
    expect(gateRefusal(body({ id: 'rate_limited', retry_after: 'soon' }), 429)).toEqual({ id: 'rate_limited', message: expect.stringMatching(/Too many codes/) })
  })
  it('reads a code sign-up the registration policy refuses, and unreadable sign-up settings', () => {
    expect(gateRefusal(body({ id: 'registration_not_allowed', code: 403, message: 'Sign-ups are limited to @example.com addresses.' }), 403))
      .toEqual({ id: 'registration_not_allowed', message: 'Sign-ups are limited to @example.com addresses.' })
    expect(gateRefusal(body({ id: 'registration_closed', code: 403 }), 403)?.message).toMatch(/closed/)
    expect(gateRefusal(body({ id: 'registration_disposable', code: 403 }), 403)?.message).toMatch(/email provider/)
    expect(gateRefusal(body({ id: 'settings_unavailable', code: 503, message: 'Sign-up is unavailable right now. Please try again in a minute.' }), 503))
      .toEqual({ id: 'settings_unavailable', message: 'Sign-up is unavailable right now. Please try again in a minute.' })
  })
  it('each id only under its own status', () => {
    expect(gateRefusal(body({ id: 'settings_unavailable' }), 403)).toBeNull()
    expect(gateRefusal(body({ id: 'registration_closed' }), 503)).toBeNull()
    expect(gateRefusal(body({ id: 'rate_limited' }), 403)).toBeNull()
    expect(gateRefusal(body({ id: 'toString' }), 403)).toBeNull()
  })
  it('ignores Kratos errors and other statuses', () => {
    expect(gateRefusal(body({ id: 'security_csrf_violation', code: 403 }), 403)).toBeNull()
    expect(gateRefusal(body({ id: 'captcha_missing' }), 400)).toBeNull()
    expect(gateRefusal({ ui: { messages: [] } }, 403)).toBeNull()
    expect(gateRefusal(null, 403)).toBeNull()
    expect(gateRefusal('nope', 429)).toBeNull()
  })
})

describe('isBotCheckRefusal', () => {
  it('spots the guard\'s bot-check messages only', () => {
    expect(isBotCheckRefusal({ ui: { messages: [{ id: 4000901 }] } })).toBe(true)
    expect(isBotCheckRefusal({ ui: { messages: [{ id: 4000902 }] } })).toBe(true)
    expect(isBotCheckRefusal({ ui: { messages: [{ id: 4000006 }] } })).toBe(false)
    expect(isBotCheckRefusal(null)).toBe(false)
  })
})

describe('protection service (server side)', () => {
  it('caches a good answer, caches a failure shorter, and never throws', async () => {
    let t = 0
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(jinbeAnswer), { status: 200 })) as unknown as typeof fetch
    const current = createProtectionService({ baseUrl: 'http://jinbe:8080/', fetchImpl, now: () => t, ttlMs: 10_000, errorTtlMs: 1_000 })
    expect((await current()).registration.mode).toBe('allowlist')
    t = 9_000
    await current()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((fetchImpl as unknown as { mock: { calls: [string][] } }).mock.calls[0][0]).toBe('http://jinbe:8080/api/public/sign-in-protection')

    const down = vi.fn(async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch
    const failing = createProtectionService({ baseUrl: 'http://jinbe:8080', fetchImpl: down, now: () => t, errorTtlMs: 1_000 })
    expect(await failing()).toEqual(UNKNOWN_PROTECTION)
    t += 500
    await failing()
    expect(down).toHaveBeenCalledTimes(1)
    t += 1_000
    await failing()
    expect(down).toHaveBeenCalledTimes(2)
  })

  it('without JINBE_PUBLIC_URL: unknown, no call', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    expect(await createProtectionService({ baseUrl: '', fetchImpl })()).toEqual(UNKNOWN_PROTECTION)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('protected traits', () => {
  it('jinbe\'s list when it gives one (names only); the default ids while it cannot say', () => {
    expect(parseSignInProtection({ ...jinbeAnswer, protectedTraits: ['person_uuid', 'org_ref', 'bad name', 7] }).protectedTraits).toEqual(['person_uuid', 'org_ref'])
    expect(parseSignInProtection(jinbeAnswer).protectedTraits).toEqual(DEFAULT_PROTECTED_TRAITS)
    expect(UNKNOWN_PROTECTION.protectedTraits).toEqual(['person_uuid', 'applicant_uuid'])
  })
  it('matches the trait and anything under it, never other fields', () => {
    expect(isProtectedTrait('traits.person_uuid', DEFAULT_PROTECTED_TRAITS)).toBe(true)
    expect(isProtectedTrait('traits.applicant_uuid.id', DEFAULT_PROTECTED_TRAITS)).toBe(true)
    expect(isProtectedTrait('traits.person_uuid_hint', DEFAULT_PROTECTED_TRAITS)).toBe(false)
    expect(isProtectedTrait('person_uuid', DEFAULT_PROTECTED_TRAITS)).toBe(false)
    expect(isProtectedTrait('traits.email', DEFAULT_PROTECTED_TRAITS)).toBe(false)
  })
})

describe('isTokenRefusal', () => {
  const err = (status: number, data: unknown) => ({ response: { status, data } })
  it('is the gateway refusing the token, or the hook refusing it in the flow', () => {
    expect(isTokenRefusal(err(403, { error: { id: 'captcha_missing', code: 403 } }))).toBe(true)
    expect(isTokenRefusal(err(403, { error: { id: 'captcha_invalid', code: 403 } }))).toBe(true)
    expect(isTokenRefusal(err(403, { error: { id: 'captcha_unavailable', code: 403 } }))).toBe(true)
    expect(isTokenRefusal(err(400, { ui: { messages: [{ id: 4000902 }] } }))).toBe(true)
  })
  it('keeps the token for anything else', () => {
    expect(isTokenRefusal(err(429, { error: { id: 'rate_limited', code: 429 } }))).toBe(false)
    expect(isTokenRefusal(err(403, { error: { id: 'registration_closed', code: 403 } }))).toBe(false)
    expect(isTokenRefusal(err(400, { ui: { messages: [{ id: 4000006 }] } }))).toBe(false)
    expect(isTokenRefusal(new Error('network'))).toBe(false)
    expect(isTokenRefusal(null)).toBe(false)
  })
})

describe('isEmailChange', () => {
  it('is a new, non-empty address (case and spaces do not count)', () => {
    expect(isEmailChange('ann@corp.io', 'bob@corp.io')).toBe(true)
    expect(isEmailChange('', 'bob@corp.io')).toBe(true)
    expect(isEmailChange('ann@corp.io', ' Ann@Corp.io ')).toBe(false)
    expect(isEmailChange('ann@corp.io', '')).toBe(false)
    expect(isEmailChange('ann@corp.io', undefined)).toBe(false)
  })
})
