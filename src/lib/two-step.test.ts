import { describe, it, expect, vi } from 'vitest'
import { blindPassGuard, gateJustPassed, markGatePassed, resolveGate, stepUpGuard, type GateDeps } from './two-step'
import { fetchSecondFactor, parseSecondFactor, type SecondFactorResult } from './second-factor-server'

const DEST = 'https://kuma.test/users'
const SELF = `https://auth.test/two-step?return_to=${encodeURIComponent(DEST)}`

function deps(status: SecondFactorResult | Error, mayStepUp = true, mayContinueUnchecked = true): GateDeps {
  return {
    status: async () => { if (status instanceof Error) throw status; return status },
    destination: DEST,
    stepUpUrl: (rt) => `https://kratos.test/self-service/login/browser?aal=aal2&return_to=${encodeURIComponent(rt)}`,
    selfUrl: SELF,
    mayStepUp: () => mayStepUp,
    mayContinueUnchecked: () => mayContinueUnchecked,
  }
}
const st = (required: boolean, enrolled: boolean, aal: 'aal1' | 'aal2' = 'aal1'): SecondFactorResult =>
  ({ kind: 'status', required, enrolled, methods: enrolled ? ['totp'] : [], aal })

describe('resolveGate', () => {
  it('privileged account without a second factor → enrolment, never the destination', async () => {
    expect(await resolveGate(deps(st(true, false)))).toEqual({ kind: 'enrol' })
  })
  it('added to a 2FA group before enrolling → enrolment, naming the groups that wait for it', async () => {
    expect(await resolveGate(deps({ ...st(true, false), awaitingGroups: ['staff-developers'] } as SecondFactorResult))).toEqual({ kind: 'enrol', joining: ['staff-developers'] })
  })
  it('privileged account with TOTP at aal1 → step-up that comes back to the gate', async () => {
    const o = await resolveGate(deps(st(true, true)))
    expect(o.kind).toBe('stepup')
    expect(new URL((o as { to: string }).to).searchParams.get('return_to')).toBe(SELF)
  })
  it('privileged account at aal2 → destination', async () => {
    expect(await resolveGate(deps(st(true, true, 'aal2')))).toEqual({ kind: 'continue', to: DEST })
  })
  it('a normal account without 2FA is never prompted', async () => {
    expect(await resolveGate(deps(st(false, false)))).toEqual({ kind: 'continue', to: DEST })
  })
  it('jinbe down / policy unavailable → the sign-in finishes (server-side still refuses)', async () => {
    expect(await resolveGate(deps({ kind: 'unavailable' }))).toEqual({ kind: 'continue', to: DEST })
    expect(await resolveGate(deps(new Error('network')))).toEqual({ kind: 'continue', to: DEST })
  })
  it('jinbe still unanswering on a second pass for the same destination → unchecked, never another loop', async () => {
    expect(await resolveGate(deps({ kind: 'unavailable' }, true, false))).toEqual({ kind: 'unchecked' })
    expect(await resolveGate(deps(new Error('network'), true, false))).toEqual({ kind: 'unchecked' })
    // An answer always wins over the guard.
    expect(await resolveGate(deps(st(false, false), true, false))).toEqual({ kind: 'continue', to: DEST })
  })
  it('no session → sign in, landing on the destination (through the gate again)', async () => {
    const o = await resolveGate(deps({ kind: 'unauthenticated' }))
    expect(o).toEqual({ kind: 'signin', to: `/login?return_to=${encodeURIComponent(DEST)}` })
  })
  it('stepped up twice and still aal1 → stuck, no bouncing', async () => {
    expect(await resolveGate(deps(st(true, true), false))).toEqual({ kind: 'stuck' })
  })
})

describe('stepUpGuard', () => {
  it('allows two automatic step-ups a minute', () => {
    const m = new Map<string, string>()
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
    let t = 1_000_000
    const now = () => t
    expect(stepUpGuard(s, now)).toBe(true)
    expect(stepUpGuard(s, now)).toBe(true)
    expect(stepUpGuard(s, now)).toBe(false)
    t += 61_000
    expect(stepUpGuard(s, now)).toBe(true)
    expect(stepUpGuard(null, now)).toBe(true)
  })
})

describe('blindPassGuard', () => {
  it('one unchecked pass per destination every five minutes', () => {
    const m = new Map<string, string>()
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
    let t = 1_000_000
    const now = () => t
    expect(blindPassGuard(DEST, s, now)).toBe(true)
    expect(blindPassGuard(DEST, s, now)).toBe(false)
    expect(blindPassGuard('https://other.test/', s, now)).toBe(true)
    t += 5 * 60_000 + 1
    expect(blindPassGuard(DEST, s, now)).toBe(true)
    expect(blindPassGuard(DEST, null, now)).toBe(true)
  })
})

describe('second-factor server client', () => {
  it('reads jinbe\'s answer strictly; anything odd is unavailable', () => {
    expect(parseSecondFactor({ secondFactorRequired: true, hasSecondFactor: false, methods: ['totp', 'bogus'], aal: 'aal1' }))
      .toEqual({ kind: 'status', required: true, enrolled: false, methods: ['totp'], aal: 'aal1' })
    expect(parseSecondFactor({ secondFactorRequired: true, hasSecondFactor: false, methods: [], aal: 'aal1', awaitingGroups: ['staff-developers', '<b>x</b>', 3] }))
      .toEqual({ kind: 'status', required: true, enrolled: false, methods: [], aal: 'aal1', awaitingGroups: ['staff-developers'] })
    expect(parseSecondFactor({ secondFactorRequired: 'yes' })).toEqual({ kind: 'unavailable' })
    expect(parseSecondFactor(null)).toEqual({ kind: 'unavailable' })
    expect((parseSecondFactor({ secondFactorRequired: false, hasSecondFactor: true, aal: 'weird' }) as { aal: string }).aal).toBe('aal1')
  })
  it('forwards only the Kratos session cookies and maps statuses', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ secondFactorRequired: false, hasSecondFactor: false, methods: [], aal: 'aal1' }), { status: 200 }))
    const r = await fetchSecondFactor({ baseUrl: 'http://jinbe/', cookieHeader: 'ory_kratos_session=a; _ga=x', fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(r.kind).toBe('status')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://jinbe/api/public/second-factor')
    expect((init.headers as Record<string, string>).cookie).toBe('ory_kratos_session=a')
    const call = (status: number) => fetchSecondFactor({ baseUrl: 'http://jinbe', cookieHeader: 'ory_kratos_session=a', fetchImpl: (async () => new Response('{}', { status })) as unknown as typeof fetch })
    expect(await call(401)).toEqual({ kind: 'unauthenticated' })
    expect(await call(503)).toEqual({ kind: 'unavailable' })
    expect(await fetchSecondFactor({ baseUrl: '', cookieHeader: 'ory_kratos_session=a' })).toEqual({ kind: 'unavailable' })
    expect(await fetchSecondFactor({ baseUrl: 'http://jinbe', cookieHeader: '_ga=x' })).toEqual({ kind: 'unauthenticated' })
  })
})

describe('resolveGate — an app signing in (must_enrol)', () => {
  it('any account without a second factor enrols; with one at aal1 steps up; at aal2 continues', async () => {
    expect(await resolveGate({ ...deps(st(false, false)), mustEnrol: true })).toEqual({ kind: 'enrol' })
    expect((await resolveGate({ ...deps(st(false, true)), mustEnrol: true })).kind).toBe('stepup')
    expect(await resolveGate({ ...deps(st(false, true, 'aal2')), mustEnrol: true })).toEqual({ kind: 'continue', to: DEST })
  })
})

describe('markGatePassed / gateJustPassed', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } } }
  it('lets the next page skip its own check once, for that URL, within 10 s', () => {
    const s = mem()
    markGatePassed('https://auth.x/welcome', s, () => 1_000)
    expect(gateJustPassed('https://auth.x/other', s, () => 2_000)).toBe(false)
    markGatePassed('https://auth.x/welcome', s, () => 1_000)
    expect(gateJustPassed('https://auth.x/welcome', s, () => 2_000)).toBe(true)
    // one use
    expect(gateJustPassed('https://auth.x/welcome', s, () => 2_000)).toBe(false)
    markGatePassed('https://auth.x/welcome', s, () => 1_000)
    expect(gateJustPassed('https://auth.x/welcome', s, () => 12_000)).toBe(false)
    expect(gateJustPassed('https://auth.x/welcome', null)).toBe(false)
  })
})
