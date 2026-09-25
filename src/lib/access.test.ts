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
} from './access'

const allowAll = () => true

function flow(groups: string[]) {
  return { ui: { nodes: groups.map((group) => ({ group, type: 'input', attributes: { name: 'x' } })) } }
}

describe('parseAccessParams', () => {
  it('reads reason, return_to and site', () => {
    const p = parseAccessParams(
      new URLSearchParams('site=payroll&return_to=https%3A%2F%2Fpayroll.test%2Fa&reason=needs_2fa'),
      allowAll,
    )
    expect(p).toEqual({ reason: 'needs_2fa', returnTo: 'https://payroll.test/a', site: 'payroll' })
  })

  it('defaults an unknown or missing reason to forbidden', () => {
    expect(parseAccessParams(new URLSearchParams('reason=admin'), allowAll).reason).toBe('forbidden')
    expect(parseAccessParams(new URLSearchParams(''), allowAll).reason).toBe('forbidden')
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
  const self = 'https://auth.test/access?site=payroll&reason=needs_2fa&return_to=' + encodeURIComponent(returnTo)
  const session = (aal: string) => async () => ({ aal, email: 'nina@example.com' })
  const reject = (err: unknown) => async () => { throw err }
  const base = {
    selfUrl: self,
    stepUpUrl: (rt: string | null) => `KRATOS/login?aal=aal2&return_to=${rt}`,
    createLoginFlow: vi.fn(async () => ({ id: 'lf1', ...flow(['default', 'totp']) })),
    createSettingsFlow: vi.fn(async () => ({ id: 'sf1', ...flow(['profile', 'totp', 'lookup_secret']) })),
  }

  it('redirects to sign-in without a session', async () => {
    const out = await resolveAccess({ reason: 'needs_2fa', returnTo, site: 'payroll' }, { ...base, toSession: reject({ response: { status: 401 } }) })
    expect(out).toEqual({ kind: 'redirect', to: signInUrl(returnTo) })
  })

  it('steps up via Kratos when whoami says aal2 is required', async () => {
    const out = await resolveAccess({ reason: 'needs_2fa', returnTo, site: null }, {
      ...base,
      toSession: reject({ response: { status: 403, data: { error: { id: 'session_aal2_required' } } } }),
    })
    expect(out).toEqual({ kind: 'redirect', to: `KRATOS/login?aal=aal2&return_to=${returnTo}` })
  })

  it('opens the prepared aal2 login flow when the person has a second factor', async () => {
    const createLoginFlow = vi.fn(async () => ({ id: 'lf1', ...flow(['default', 'totp']) }))
    const out = await resolveAccess({ reason: 'needs_2fa', returnTo, site: null }, { ...base, createLoginFlow, toSession: session('aal1') })
    expect(createLoginFlow).toHaveBeenCalledWith(returnTo)
    expect(out).toEqual({ kind: 'redirect', to: '/login?flow=lf1' })
  })

  it('guides to enrolment, returning straight to the site, when no second factor exists', async () => {
    const createSettingsFlow = vi.fn(async () => ({ id: 'sf1', ...flow(['profile', 'totp', 'lookup_secret']) }))
    const out = await resolveAccess({ reason: 'needs_2fa', returnTo, site: null }, {
      ...base,
      toSession: session('aal1'),
      createLoginFlow: async () => ({ id: 'lf1', ...flow(['default']) }),
      createSettingsFlow,
    })
    // Kratos upgrades the session to aal2 on enrolment, so coming back via
    // /access would misread the next state as "refused at aal2".
    expect(createSettingsFlow).toHaveBeenCalledWith(returnTo)
    expect(out).toEqual({ kind: 'enrol', settingsUrl: '/settings?flow=sf1#mfa', methods: ['totp', 'lookup_secret'], email: 'nina@example.com' })
  })

  it('still offers enrolment via settings when the settings probe fails', async () => {
    const out = await resolveAccess({ reason: 'needs_2fa', returnTo, site: null }, {
      ...base,
      toSession: session('aal1'),
      createLoginFlow: async () => ({ id: 'lf1', ...flow([]) }),
      createSettingsFlow: reject(new Error('x')),
    })
    expect(out).toEqual({ kind: 'enrol', settingsUrl: '/settings?return_to=' + encodeURIComponent(returnTo) + '#mfa', methods: null, email: 'nina@example.com' })
  })

  it('falls back to returning to /access when there is no return_to', async () => {
    const createSettingsFlow = vi.fn(async () => ({ id: 'sf1', ...flow(['totp']) }))
    await resolveAccess({ reason: 'needs_2fa', returnTo: null, site: null }, {
      ...base,
      toSession: session('aal1'),
      createLoginFlow: async () => ({ id: 'lf1', ...flow(['default']) }),
      createSettingsFlow,
    })
    expect(createSettingsFlow).toHaveBeenCalledWith(self)
  })

  it('reports an error when the aal2 probe fails', async () => {
    const out = await resolveAccess({ reason: 'needs_2fa', returnTo, site: null }, { ...base, toSession: session('aal1'), createLoginFlow: reject(new Error('x')) })
    expect(out).toEqual({ kind: 'error' })
  })

  it('shows no-access for forbidden, and for needs_2fa with an aal2 session', async () => {
    expect(await resolveAccess({ reason: 'forbidden', returnTo, site: null }, { ...base, toSession: session('aal1') }))
      .toEqual({ kind: 'forbidden', email: 'nina@example.com', alreadyAal2: false })
    expect(await resolveAccess({ reason: 'needs_2fa', returnTo, site: null }, { ...base, toSession: session('aal2') }))
      .toEqual({ kind: 'forbidden', email: 'nina@example.com', alreadyAal2: true })
  })
})
