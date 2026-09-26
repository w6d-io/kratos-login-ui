import { describe, it, expect, vi } from 'vitest'
import {
  classifySessionError,
  decideAccess,
  flowGroups,
  parseAccessParams,
  signInUrl,
  switchAccountUrl,
  STEP_UP_GROUPS,
  ENROL_GROUPS,
  resolveAccess,
  returnGuard,
  type AccessReasonResult,
  type JinbeReason,
} from './access'

const allowAll = () => true

function flow(groups: string[]) {
  return { ui: { nodes: groups.map((group) => ({ group, type: 'input', attributes: { name: 'x' } })) } }
}

describe('parseAccessParams', () => {
  it('reads return_to and site, and ignores any reason param (never trusted)', () => {
    const p = parseAccessParams(
      new URLSearchParams('site=payroll&return_to=https%3A%2F%2Fpayroll.test%2Fa&reason=ok'),
      allowAll,
    )
    expect(p).toEqual({ returnTo: 'https://payroll.test/a', site: 'payroll' })
  })

  it('drops a return_to that the allow-list refuses or that is not http(s)', () => {
    expect(parseAccessParams(new URLSearchParams('return_to=https://evil.test'), () => false).returnTo).toBeNull()
    expect(parseAccessParams(new URLSearchParams('return_to=javascript:alert(1)'), allowAll).returnTo).toBeNull()
  })

  it('keeps site only when it looks like a site name (display hint)', () => {
    expect(parseAccessParams(new URLSearchParams('site=<b>x</b>'), allowAll).site).toBeNull()
    expect(parseAccessParams(new URLSearchParams('site=Pay Roll'), allowAll).site).toBeNull()
  })
})

describe('classifySessionError', () => {
  it('maps Kratos whoami failures', () => {
    expect(classifySessionError({ response: { status: 401 } })).toEqual({ kind: 'none' })
    expect(classifySessionError({ response: { status: 403, data: { error: { id: 'session_aal2_required' } } } })).toEqual({ kind: 'aal2_required' })
    expect(classifySessionError({ response: { status: 500 } })).toEqual({ kind: 'error' })
    expect(classifySessionError(new Error('network'))).toEqual({ kind: 'error' })
  })
})

describe('decideAccess', () => {
  it('sends people without a session to sign in', () => {
    expect(decideAccess('needs_2fa', { kind: 'none' })).toBe('signin')
    expect(decideAccess('forbidden', { kind: 'none' })).toBe('signin')
  })

  it('steps up when Kratos already knows the identity has a second factor', () => {
    expect(decideAccess('needs_2fa', { kind: 'aal2_required' })).toBe('stepup')
  })

  it('checks available factors for an aal1 session', () => {
    expect(decideAccess('needs_2fa', { kind: 'session', aal: 'aal1', email: null })).toBe('check_factors')
  })

  it('treats needs_2fa with an aal2 session as a real permission problem', () => {
    expect(decideAccess('needs_2fa', { kind: 'session', aal: 'aal2', email: null })).toBe('forbidden')
  })

  it('shows no-access for forbidden regardless of AAL', () => {
    expect(decideAccess('forbidden', { kind: 'session', aal: 'aal1', email: null })).toBe('forbidden')
    expect(decideAccess('forbidden', { kind: 'aal2_required' })).toBe('forbidden')
  })

  it('surfaces errors', () => {
    expect(decideAccess('needs_2fa', { kind: 'error' })).toBe('error')
  })
})

describe('flowGroups', () => {
  it('lists the second-factor groups a flow offers, in a stable order', () => {
    expect(flowGroups(flow(['default', 'lookup_secret', 'totp', 'password']), STEP_UP_GROUPS)).toEqual(['totp', 'lookup_secret'])
    expect(flowGroups(flow(['default', 'profile', 'password']), ENROL_GROUPS)).toEqual([])
    expect(flowGroups(null, ENROL_GROUPS)).toEqual([])
  })

  it('does not count passkey (a first factor) as a second factor', () => {
    expect(flowGroups(flow(['passkey']), STEP_UP_GROUPS)).toEqual([])
  })
})

describe('urls', () => {
  it('builds sign-in and switch-account links that keep return_to', () => {
    expect(signInUrl('https://p.test/x')).toBe('/login?return_to=https%3A%2F%2Fp.test%2Fx')
    expect(signInUrl(null)).toBe('/login')
    expect(switchAccountUrl('https://auth.test', 'https://p.test/x')).toBe(
      '/logout?return_to=' + encodeURIComponent('https://auth.test/login?return_to=https%3A%2F%2Fp.test%2Fx'),
    )
  })
})

describe('resolveAccess', () => {
  const returnTo = 'https://payroll.test/pay'
  const params = { returnTo, site: 'payroll' }
  const self = 'https://auth.test/access?site=payroll&return_to=' + encodeURIComponent(returnTo)
  const session = (aal: string) => async () => ({ aal, email: 'nina@example.com' })
  const reject = (err: unknown) => async () => { throw err }
  const said = (reason: JinbeReason, minAal: 'aal1' | 'aal2' | null = null) => async (): Promise<AccessReasonResult> => ({ kind: 'reason', reason, minAal })
  const base = {
    selfUrl: self,
    accessReason: said('needs_2fa', 'aal2'),
    toSession: session('aal1'),
    stepUpUrl: (rt: string | null) => `KRATOS/login?aal=aal2&return_to=${rt}`,
    createLoginFlow: vi.fn(async () => ({ id: 'lf1', ...flow(['default', 'totp']) })),
    createSettingsFlow: vi.fn(async () => ({ id: 'sf1', ...flow(['profile', 'totp', 'lookup_secret']) })),
    mayReturn: () => true,
  }

  it('sends people to sign-in when jinbe says 401', async () => {
    const toSession = vi.fn(session('aal1'))
    const out = await resolveAccess(params, { ...base, toSession, accessReason: async () => ({ kind: 'unauthenticated' }) })
    expect(out).toEqual({ kind: 'redirect', to: signInUrl(returnTo) })
  })

  it('shows "can\'t check right now" when jinbe is unavailable, and never steps up blindly', async () => {
    const createLoginFlow = vi.fn(base.createLoginFlow)
    const out = await resolveAccess(params, { ...base, createLoginFlow, accessReason: async () => ({ kind: 'unavailable' }) })
    expect(out).toEqual({ kind: 'unavailable' })
    expect(createLoginFlow).not.toHaveBeenCalled()
  })

  it('treats a throwing lookup as unavailable', async () => {
    expect(await resolveAccess(params, { ...base, accessReason: reject(new Error('net')) })).toEqual({ kind: 'unavailable' })
  })

  it('sends the visitor back to return_to when jinbe says ok', async () => {
    expect(await resolveAccess(params, { ...base, accessReason: said('ok') })).toEqual({ kind: 'redirect', to: returnTo })
  })

  it('does not bounce forever when jinbe says ok but the gateway keeps refusing', async () => {
    expect(await resolveAccess(params, { ...base, accessReason: said('ok'), mayReturn: () => false })).toEqual({ kind: 'unavailable' })
  })

  it('shows no-access for forbidden and not_found', async () => {
    for (const r of ['forbidden', 'not_found'] as const) {
      expect(await resolveAccess(params, { ...base, accessReason: said(r) }))
        .toEqual({ kind: 'forbidden', email: 'nina@example.com', alreadyAal2: false })
    }
  })

  it('shows no-access without asking jinbe when site or return_to is missing', async () => {
    const accessReason = vi.fn(said('needs_2fa'))
    expect((await resolveAccess({ returnTo: null, site: 'payroll' }, { ...base, accessReason })).kind).toBe('forbidden')
    expect((await resolveAccess({ returnTo, site: null }, { ...base, accessReason })).kind).toBe('forbidden')
    expect(accessReason).not.toHaveBeenCalled()
  })

  it('needs_2fa: redirects to sign-in if the Kratos session is gone', async () => {
    const out = await resolveAccess(params, { ...base, toSession: reject({ response: { status: 401 } }) })
    expect(out).toEqual({ kind: 'redirect', to: signInUrl(returnTo) })
  })

  it('needs_2fa: steps up via Kratos when whoami says aal2 is required', async () => {
    const out = await resolveAccess(params, {
      ...base,
      toSession: reject({ response: { status: 403, data: { error: { id: 'session_aal2_required' } } } }),
    })
    expect(out).toEqual({ kind: 'redirect', to: `KRATOS/login?aal=aal2&return_to=${returnTo}` })
  })

  it('needs_2fa: opens the prepared aal2 login flow when the person has a second factor', async () => {
    const createLoginFlow = vi.fn(async () => ({ id: 'lf1', ...flow(['default', 'totp']) }))
    const out = await resolveAccess(params, { ...base, createLoginFlow })
    expect(createLoginFlow).toHaveBeenCalledWith(returnTo)
    expect(out).toEqual({ kind: 'redirect', to: '/login?flow=lf1' })
  })

  it('needs_2fa: guides to enrolment, returning straight to the site, when no second factor exists', async () => {
    const createSettingsFlow = vi.fn(async () => ({ id: 'sf1', ...flow(['profile', 'totp', 'lookup_secret']) }))
    const out = await resolveAccess(params, {
      ...base,
      createLoginFlow: async () => ({ id: 'lf1', ...flow(['default']) }),
      createSettingsFlow,
    })
    // Kratos upgrades the session to aal2 on enrolment, so coming back via
    // /access would misread the next state.
    expect(createSettingsFlow).toHaveBeenCalledWith(returnTo)
    expect(out).toEqual({ kind: 'enrol', settingsUrl: '/settings?flow=sf1#mfa', methods: ['totp', 'lookup_secret'], email: 'nina@example.com' })
  })

  it('needs_2fa: still offers enrolment via settings when the settings probe fails', async () => {
    const out = await resolveAccess(params, {
      ...base,
      createLoginFlow: async () => ({ id: 'lf1', ...flow([]) }),
      createSettingsFlow: reject(new Error('x')),
    })
    expect(out).toEqual({ kind: 'enrol', settingsUrl: '/settings?return_to=' + encodeURIComponent(returnTo) + '#mfa', methods: null, email: 'nina@example.com' })
  })

  it('needs_2fa: reports an error when the aal2 probe fails', async () => {
    expect(await resolveAccess(params, { ...base, createLoginFlow: reject(new Error('x')) })).toEqual({ kind: 'error' })
  })

  it('needs_2fa with an aal2 session is a real permission problem', async () => {
    expect(await resolveAccess(params, { ...base, toSession: session('aal2') }))
      .toEqual({ kind: 'forbidden', email: 'nina@example.com', alreadyAal2: true })
  })

  it('forbidden with no Kratos session still shows no-access (jinbe already vouched for the session state)', async () => {
    expect(await resolveAccess(params, { ...base, accessReason: said('forbidden'), toSession: reject({ response: { status: 401 } }) }))
      .toEqual({ kind: 'forbidden', email: null, alreadyAal2: false })
  })
})

describe('returnGuard', () => {
  it('allows one return per return_to within the window, then again after it', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    let t = 1_000
    const guard = (url: string) => returnGuard(url, storage, () => t)
    expect(guard('https://p.test/a')).toBe(true)
    expect(guard('https://p.test/a')).toBe(false)
    expect(guard('https://p.test/b')).toBe(true)
    t += 31_000
    expect(guard('https://p.test/a')).toBe(true)
  })

  it('allows the return when storage is unavailable', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(returnGuard('https://p.test/a', broken, () => 0)).toBe(true)
  })
})
