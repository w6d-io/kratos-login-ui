import { describe, expect, it, vi } from 'vitest'
import { forgetDestination, lastSiteChoice, originHosts, recallDestination, rememberDestination, rememberOriginHost, rememberSiteChoice, resolveWelcome, type WelcomeDeps } from './landing'
import { fetchMySites, kratosSessionCookies, sanitizeSite, type MySite } from './sites-server'

const allowed = (url: string) => /^https:\/\/[a-z0-9-]+\.example\.com(\/|$)/.test(url)
const site = (name: string): MySite => ({ name, displayName: name.toUpperCase(), url: `https://${name}.example.com/`, hasLogo: false, accent: null })

function memStore() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

function deps(over: Partial<WelcomeDeps> = {}): WelcomeDeps {
  return {
    rememberedDestination: () => null,
    originHosts: [],
    landingFor: async () => null,
    mySites: async () => ({ kind: 'sites', sites: [site('a'), site('b')] }),
    lastChoice: () => null,
    mayAutoRedirect: () => true,
    selfUrl: 'https://auth.example.com/welcome',
    ...over,
  }
}

describe('resolveWelcome', () => {
  it('lands on the page this sign-in started for before any site landing or picker', async () => {
    const landingFor = vi.fn(async () => 'https://pay.example.com/home')
    const mySites = vi.fn(async () => ({ kind: 'sites' as const, sites: [site('a'), site('b')] }))
    const o = await resolveWelcome(deps({ rememberedDestination: () => 'https://a.example.com/private?x=1', originHosts: ['pay.example.com'], landingFor, mySites }))
    expect(o).toEqual({ kind: 'redirect', to: 'https://a.example.com/private?x=1' })
    expect(landingFor).not.toHaveBeenCalled()
    expect(mySites).not.toHaveBeenCalled()
  })
  it('remembered page but the loop guard tripped (it keeps refusing) → the usual landing', async () => {
    const o = await resolveWelcome(deps({ rememberedDestination: () => 'https://a.example.com/private', mayAutoRedirect: (u) => u !== 'https://a.example.com/private' }))
    expect(o.kind).toBe('choose')
  })
  it('goes to the originating site\'s defaultReturnUrl first', async () => {
    const landingFor = vi.fn(async (h: string) => (h === 'pay.example.com' ? 'https://pay.example.com/home' : null))
    const o = await resolveWelcome(deps({ originHosts: ['nope.example.com', 'pay.example.com'], landingFor }))
    expect(o).toEqual({ kind: 'redirect', to: 'https://pay.example.com/home' })
  })
  it('exactly one reachable site → straight there', async () => {
    expect(await resolveWelcome(deps({ mySites: async () => ({ kind: 'sites', sites: [site('a')] }) }))).toEqual({ kind: 'redirect', to: 'https://a.example.com/' })
  })
  it('one site but the loop guard tripped → picker instead of bouncing', async () => {
    const o = await resolveWelcome(deps({ mySites: async () => ({ kind: 'sites', sites: [site('a')] }), mayAutoRedirect: () => false }))
    expect(o.kind).toBe('choose')
  })
  it('several sites → picker, last choice first', async () => {
    const o = await resolveWelcome(deps({ lastChoice: () => 'b' }))
    expect(o).toEqual({ kind: 'choose', sites: [site('b'), site('a')], lastUsed: 'b' })
    const stale = await resolveWelcome(deps({ lastChoice: () => 'gone' }))
    expect(stale).toEqual({ kind: 'choose', sites: [site('a'), site('b')], lastUsed: null })
  })
  it('no sites → empty; jinbe down → unavailable (never an empty list); no session → sign in, back here', async () => {
    expect(await resolveWelcome(deps({ mySites: async () => ({ kind: 'sites', sites: [] }) }))).toEqual({ kind: 'empty' })
    expect(await resolveWelcome(deps({ mySites: async () => ({ kind: 'unavailable' }) }))).toEqual({ kind: 'unavailable' })
    expect(await resolveWelcome(deps({ mySites: async () => { throw new Error('x') } }))).toEqual({ kind: 'unavailable' })
    expect(await resolveWelcome(deps({ mySites: async () => ({ kind: 'unauthenticated' }) }))).toEqual({
      kind: 'signin',
      to: `/login?return_to=${encodeURIComponent('https://auth.example.com/welcome')}`,
    })
  })
})

describe('remembered destination', () => {
  it('recalls within 30 minutes, forgets after, on forget, and survives blocked storage', () => {
    const s = memStore()
    let t = 1_000_000
    rememberDestination('https://a.example.com/private?x=1', s, () => t)
    t += 29 * 60_000
    expect(recallDestination(s, () => t)).toBe('https://a.example.com/private?x=1')
    t += 2 * 60_000
    expect(recallDestination(s, () => t)).toBeNull()
    rememberDestination('https://a.example.com/p', s, () => t)
    forgetDestination(s)
    expect(recallDestination(s, () => t)).toBeNull()
    s.setItem('kratos:destination', '{"url":1}')
    expect(recallDestination(s)).toBeNull()
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(() => rememberDestination('https://a.example.com/', broken)).not.toThrow()
    expect(() => forgetDestination(broken)).not.toThrow()
    expect(recallDestination(broken)).toBeNull()
  })
})

describe('origin host and last choice', () => {
  it('remembers an allowed referrer on another host only', () => {
    const s = memStore()
    rememberOriginHost('https://auth.example.com/login', 'https://auth.example.com', 'https://auth.example.com', allowed, s)
    expect(originHosts('auth.example.com', s)).toEqual(['auth.example.com'])
    rememberOriginHost('https://evil.io/x', 'https://auth.example.com', 'https://auth.example.com', allowed, s)
    expect(originHosts('auth.example.com', s)).toEqual(['auth.example.com'])
    rememberOriginHost('https://pay.example.com/p?q=1', 'https://auth.example.com', 'https://auth.example.com', allowed, s)
    expect(originHosts('auth.example.com:443', s)).toEqual(['pay.example.com', 'auth.example.com'])
  })
  it('stores the last pick and survives blocked storage', () => {
    const s = memStore()
    rememberSiteChoice('pay', s)
    expect(lastSiteChoice(s)).toBe('pay')
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(() => rememberSiteChoice('x', broken)).not.toThrow()
    expect(lastSiteChoice(broken)).toBeNull()
  })
})

describe('sites-server', () => {
  it('forwards only the Kratos session cookies', () => {
    expect(kratosSessionCookies('a=1; ory_kratos_session=s; csrf_token_x=c; ory_kratos_session_2=t')).toBe('ory_kratos_session=s; ory_kratos_session_2=t')
    expect(kratosSessionCookies('a=1')).toBeNull()
  })
  it('drops sites off the allow-list or with bad fields', () => {
    expect(sanitizeSite({ name: 'pay', displayName: 'Pay', url: 'https://pay.example.com/', accent: '#2F6FEB', logoUrl: '/api/public/sites/pay/logo' }, allowed)).toEqual({
      name: 'pay', displayName: 'Pay', url: 'https://pay.example.com/', hasLogo: true, accent: '#2F6FEB',
    })
    expect(sanitizeSite({ name: 'pay', url: 'https://evil.io/' }, allowed)).toBeNull()
    expect(sanitizeSite({ name: 'pay', url: 'javascript:alert(1)' }, allowed)).toBeNull()
    expect(sanitizeSite({ name: 'Bad!', url: 'https://pay.example.com/' }, allowed)).toBeNull()
  })
  it('maps jinbe answers: 200 list, 401, 503 → unavailable, no cookie → unauthenticated', async () => {
    const call = (status: number, body: unknown) => fetchMySites({
      baseUrl: 'http://jinbe',
      cookieHeader: 'ory_kratos_session=s',
      isAllowed: allowed,
      fetchImpl: (async (url: string, init: RequestInit) => {
        expect(url).toBe('http://jinbe/api/public/sites/mine')
        expect((init.headers as Record<string, string>).cookie).toBe('ory_kratos_session=s')
        return new Response(JSON.stringify(body), { status })
      }) as unknown as typeof fetch,
    })
    expect(await call(200, [{ name: 'a', displayName: 'A', url: 'https://a.example.com/' }])).toEqual({ kind: 'sites', sites: [{ name: 'a', displayName: 'A', url: 'https://a.example.com/', hasLogo: false, accent: null }] })
    expect(await call(401, { error: 'unauthenticated' })).toEqual({ kind: 'unauthenticated' })
    expect(await call(503, { error: 'policy_unavailable' })).toEqual({ kind: 'unavailable' })
    expect(await call(200, { not: 'a list' })).toEqual({ kind: 'unavailable' })
    expect(await fetchMySites({ baseUrl: 'http://jinbe', cookieHeader: 'x=1', isAllowed: allowed })).toEqual({ kind: 'unauthenticated' })
    expect(await fetchMySites({ baseUrl: '', cookieHeader: 'ory_kratos_session=s', isAllowed: allowed })).toEqual({ kind: 'unavailable' })
  })
})
