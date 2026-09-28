import { beforeEach, describe, expect, it, vi } from 'vitest'

const envVars: Record<string, string | undefined> = {}
vi.mock('next-runtime-env', () => ({ env: (k: string) => envVars[k] }))

import { isReturnUrlAllowed } from './config'
import {
  flowContext,
  landingUrl,
  recallFlowContext,
  rememberFlowContext,
  resolveContinueWith,
  resolveKratosError,
  restartGuard,
  safeKratosRedirect,
  safeReturnTo,
  secondFactorGroups,
  withReturnTo,
  type ErrorNavOptions,
} from './flow-nav'

const ORIGIN = 'https://auth.example.com'
const KRATOS = 'https://auth.example.com'

function memStore() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

beforeEach(() => {
  for (const k of Object.keys(envVars)) delete envVars[k]
  envVars.NEXT_PUBLIC_KRATOS_BROWSER_URL = KRATOS
  envVars.NEXT_PUBLIC_ALLOWED_RETURN_URLS = 'https://*.example.com'
  envVars.NEXT_PUBLIC_DEFAULT_RETURN_URL = 'https://app.example.com/'
})

describe('isReturnUrlAllowed (escaped, single-label globs)', () => {
  it('accepts exactly one label for *', () => {
    expect(isReturnUrlAllowed('https://app.example.com/x')).toBe(true)
    expect(isReturnUrlAllowed('https://a.b.example.com/')).toBe(false)
    expect(isReturnUrlAllowed('https://example.com/')).toBe(false)
  })
  it('does not treat dots as regex wildcards', () => {
    envVars.NEXT_PUBLIC_ALLOWED_RETURN_URLS = 'https://*.dev.example.com'
    expect(isReturnUrlAllowed('https://kuma.dev.example.com/')).toBe(true)
    expect(isReturnUrlAllowed('https://aXdevXexampleXcom/')).toBe(false)
    expect(isReturnUrlAllowed('https://a.devXexample.com/')).toBe(false)
  })
  it('anchors the whole origin: suffix and userinfo tricks are refused', () => {
    envVars.NEXT_PUBLIC_ALLOWED_RETURN_URLS = 'https://*.dev.example.com'
    expect(isReturnUrlAllowed('https://x.dev.example.com.evil.com/')).toBe(false)
    expect(isReturnUrlAllowed('https://x.dev.example.com@evil.com/')).toBe(false)
    expect(isReturnUrlAllowed('https://evil.com/?x=.dev.example.com')).toBe(false)
    expect(isReturnUrlAllowed('https://evil.com/#https://x.dev.example.com')).toBe(false)
  })
  it('rejects look-alike hosts the old regex matched', () => {
    expect(isReturnUrlAllowed('https://attacker-example.com/')).toBe(false)
    expect(isReturnUrlAllowed('https://example.com.evil.io/')).toBe(false)
  })
  it('rejects scheme mismatch, credentials and non-http schemes', () => {
    expect(isReturnUrlAllowed('http://app.example.com/')).toBe(false)
    expect(isReturnUrlAllowed('https://user:pw@app.example.com/')).toBe(false)
    envVars.NEXT_PUBLIC_ALLOWED_RETURN_URLS = '*'
    expect(isReturnUrlAllowed('javascript:alert(1)')).toBe(false)
    expect(isReturnUrlAllowed('data:text/html,x')).toBe(false)
    expect(isReturnUrlAllowed('https://anything.io/')).toBe(true)
  })
  it('matches exact origins, including the port', () => {
    envVars.NEXT_PUBLIC_ALLOWED_RETURN_URLS = 'http://localhost:3001, https://x.io/'
    expect(isReturnUrlAllowed('http://localhost:3001/a')).toBe(true)
    expect(isReturnUrlAllowed('http://localhost:3002/a')).toBe(false)
    expect(isReturnUrlAllowed('https://x.io/p')).toBe(true)
    expect(isReturnUrlAllowed('https://x.io.evil/')).toBe(false)
  })
})

describe('safeReturnTo / landingUrl', () => {
  it('keeps same-origin paths and allowed URLs, refuses the rest', () => {
    expect(safeReturnTo('/settings#mfa', ORIGIN)).toBe(`${ORIGIN}/settings#mfa`)
    expect(safeReturnTo('//evil.io/x', ORIGIN)).toBeNull()
    expect(safeReturnTo('/\\evil.io', ORIGIN)).toBeNull()
    expect(safeReturnTo('https://evil.io/', ORIGIN)).toBeNull()
    expect(safeReturnTo('javascript:alert(1)', ORIGIN)).toBeNull()
    expect(safeReturnTo('https://app.example.com/p?q=1', ORIGIN)).toBe('https://app.example.com/p?q=1')
  })
  it('without a valid return_to lands on /welcome — never a static default, never /login', () => {
    expect(landingUrl('https://app.example.com/p', ORIGIN)).toBe('https://app.example.com/p')
    expect(landingUrl(`${ORIGIN}/login?x=1`, ORIGIN)).toBe(`${ORIGIN}/welcome`)
    expect(landingUrl(null, ORIGIN)).toBe(`${ORIGIN}/welcome`)
    expect(landingUrl('https://evil.io', ORIGIN)).toBe(`${ORIGIN}/welcome`)
  })
  it('accepts Kratos redirects on the Kratos origin only', () => {
    expect(safeKratosRedirect('https://kratos.example.net/self-service/login/browser', ORIGIN, 'https://kratos.example.net')).toMatch(/^https:\/\/kratos/)
    expect(safeKratosRedirect('https://evil.io/', ORIGIN, KRATOS)).toBeNull()
    expect(safeKratosRedirect('javascript:alert(1)', ORIGIN, KRATOS)).toBeNull()
  })
})

describe('flow context', () => {
  it('reads return_to / aal / refresh from the flow, not the URL', () => {
    expect(flowContext({ return_to: 'https://app.example.com/x', requested_aal: 'aal2', refresh: false })).toEqual({
      returnTo: 'https://app.example.com/x',
      aal: 'aal2',
    })
  })
  it('round-trips through storage for a later 410', () => {
    const s = memStore()
    rememberFlowContext('f1', { returnTo: 'https://app.example.com/', aal: 'aal2', refresh: true }, s)
    expect(recallFlowContext('f1', s)).toEqual({ returnTo: 'https://app.example.com/', aal: 'aal2', refresh: true })
    expect(recallFlowContext('nope', s)).toEqual({})
  })
  it('withReturnTo only fills a missing return_to', () => {
    expect(withReturnTo(`${KRATOS}/self-service/login/browser?aal=aal2`, `${ORIGIN}/settings?flow=1`)).toBe(
      `${KRATOS}/self-service/login/browser?aal=aal2&return_to=${encodeURIComponent(`${ORIGIN}/settings?flow=1`)}`,
    )
    const kept = `${KRATOS}/self-service/login/browser?return_to=https%3A%2F%2Fa.example.com`
    expect(withReturnTo(kept, 'https://b.example.com')).toBe(kept)
  })
  it('counts only real second factors', () => {
    expect(secondFactorGroups({ ui: { nodes: [{ group: 'default' }] } })).toEqual([])
    expect(secondFactorGroups({ ui: { nodes: [{ group: 'default' }, { group: 'webauthn', type: 'script' }] } })).toEqual([])
    expect(secondFactorGroups({ ui: { nodes: [{ group: 'default' }, { group: 'totp' }, { group: 'lookup_secret' }] } })).toEqual(['totp', 'lookup_secret'])
  })
})

describe('restartGuard', () => {
  it('allows three restarts a minute, then stops the loop', () => {
    const s = memStore()
    let t = 1_000_000
    const now = () => t
    expect([1, 2, 3].map(() => restartGuard('login', s, now))).toEqual([true, true, true])
    expect(restartGuard('login', s, now)).toBe(false)
    expect(restartGuard('settings', s, now)).toBe(true)
    t += 61_000
    expect(restartGuard('login', s, now)).toBe(true)
  })
})

function opts(over: Partial<ErrorNavOptions> = {}): ErrorNavOptions {
  return {
    kind: 'login',
    ctx: { returnTo: 'https://app.example.com/page', aal: 'aal2' },
    origin: ORIGIN,
    kratosBase: KRATOS,
    mayRestart: () => true,
    fallbackMessage: 'failed',
    ...over,
  }
}
const kerr = (status: number, data: unknown) => ({ response: { status, data } })

describe('resolveKratosError', () => {
  it('410 with a replacement flow goes to that flow', () => {
    const a = resolveKratosError(kerr(410, { error: { id: 'self_service_flow_expired' }, use_flow_id: '680522a8-c661-4c99-9f8f-632409c2d2d7' }), opts({ ctx: { returnTo: 'https://app.example.com/page' } }))
    expect(a).toEqual({ kind: 'redirect', to: '/login?flow=680522a8-c661-4c99-9f8f-632409c2d2d7' })
  })
  it('410 on a step-up restarts keeping return_to and aal2 (Kratos\' replacement drops aal2)', () => {
    const a = resolveKratosError(kerr(410, { error: { id: 'self_service_flow_expired' }, use_flow_id: '680522a8-c661-4c99-9f8f-632409c2d2d7' }), opts())
    expect(a.kind).toBe('redirect')
    const u = new URL((a as { to: string }).to)
    expect(u.pathname).toBe('/self-service/login/browser')
    expect(u.searchParams.get('return_to')).toBe('https://app.example.com/page')
    expect(u.searchParams.get('aal')).toBe('aal2')
  })
  it('CSRF violation restarts; the loop guard stops a restart storm', () => {
    expect(resolveKratosError(kerr(403, { error: { id: 'security_csrf_violation' } }), opts()).kind).toBe('redirect')
    expect(resolveKratosError(kerr(403, { error: { id: 'security_csrf_violation' } }), opts({ mayRestart: () => false })).kind).toBe('error')
  })
  it('session_aal2_required adds return_to to Kratos\' bare step-up URL', () => {
    const a = resolveKratosError(
      kerr(403, { error: { id: 'session_aal2_required' }, redirect_browser_to: `${KRATOS}/self-service/login/browser?aal=aal2` }),
      opts({ kind: 'settings', authReturnTo: `${ORIGIN}/settings?flow=abc` }),
    )
    const u = new URL((a as { to: string }).to)
    expect(u.searchParams.get('aal')).toBe('aal2')
    expect(u.searchParams.get('return_to')).toBe(`${ORIGIN}/settings?flow=abc`)
  })
  it('session_refresh_required follows Kratos\' refresh URL', () => {
    const to = `${KRATOS}/self-service/login/browser?refresh=true&return_to=${encodeURIComponent(`${KRATOS}/self-service/settings?flow=x`)}`
    expect(resolveKratosError(kerr(403, { error: { id: 'session_refresh_required' }, redirect_browser_to: to }), opts({ kind: 'settings' }))).toEqual({ kind: 'redirect', to })
  })
  it('browser_location_change_required follows redirect_browser_to', () => {
    const to = `${KRATOS}/self-service/login/browser?aal=aal2&return_to=x`
    expect(resolveKratosError(kerr(422, { error: { id: 'browser_location_change_required' }, redirect_browser_to: to }), opts())).toEqual({ kind: 'redirect', to })
  })
  it('refuses a redirect_browser_to off the allowed origins', () => {
    const a = resolveKratosError(kerr(422, { error: { id: 'browser_location_change_required' }, redirect_browser_to: 'https://evil.io/' }), opts())
    expect(a.kind).not.toBe('redirect')
  })
  it('session_already_available lands on return_to', () => {
    expect(resolveKratosError(kerr(400, { error: { id: 'session_already_available' } }), opts())).toEqual({ kind: 'redirect', to: 'https://app.example.com/page' })
  })
  it('expired session on settings goes to sign-in, then back to settings', () => {
    const a = resolveKratosError(kerr(401, { error: { id: 'session_inactive' } }), opts({ kind: 'settings', authReturnTo: `${ORIGIN}/settings` }))
    expect(new URL((a as { to: string }).to).searchParams.get('return_to')).toBe(`${ORIGIN}/settings`)
  })
  it('a 400 carrying an already-expired step-up flow restarts it (Kratos v1.3 quirk)', () => {
    const flow = { id: 'f', requested_aal: 'aal2', expires_at: '2026-01-01T00:00:00Z', ui: { nodes: [], messages: [{ id: 4000001 }] } }
    const a = resolveKratosError(kerr(400, flow), opts({ now: () => Date.parse('2026-01-01T00:00:21Z') }))
    expect(new URL((a as { to: string }).to).searchParams.get('aal')).toBe('aal2')
  })
  it('validation errors render the returned flow', () => {
    const flow = { id: 'f', ui: { nodes: [] } }
    expect(resolveKratosError(kerr(400, flow), opts())).toEqual({ kind: 'flow', flow })
  })
  it('network failure shows the fallback message', () => {
    expect(resolveKratosError(new Error('boom'), opts())).toEqual({ kind: 'error', message: 'failed' })
  })
})

describe('resolveContinueWith', () => {
  const base = { origin: ORIGIN, kratosBase: KRATOS }
  it('follows redirect_browser_to to the flow\'s return_to', () => {
    const data = { continue_with: [{ action: 'redirect_browser_to', redirect_browser_to: 'https://app.example.com/p' }] }
    expect(resolveContinueWith(data, { ...base, returnTo: 'https://app.example.com/p' })).toEqual({ kind: 'redirect', to: 'https://app.example.com/p' })
  })
  it('never follows Kratos\' default_browser_return_url when the flow had no return_to', () => {
    const data = { continue_with: [{ action: 'redirect_browser_to', redirect_browser_to: 'https://app.example.com/' }] }
    expect(resolveContinueWith(data, base)).toEqual({ kind: 'redirect', to: `${ORIGIN}/welcome` })
    expect(resolveContinueWith(data, { ...base, returnTo: 'https://evil.io/' })).toEqual({ kind: 'redirect', to: `${ORIGIN}/welcome` })
    const root = { continue_with: [{ action: 'redirect_browser_to', redirect_browser_to: `${ORIGIN}/` }] }
    expect(resolveContinueWith(root, base)).toEqual({ kind: 'redirect', to: `${ORIGIN}/welcome` })
  })
  it('still follows flow hops (settings, Kratos) without a return_to', () => {
    const s = { continue_with: [{ action: 'redirect_browser_to', redirect_browser_to: `${ORIGIN}/settings?flow=s9` }] }
    expect(resolveContinueWith(s, base)).toEqual({ kind: 'redirect', to: `${ORIGIN}/settings?flow=s9` })
    const k = { continue_with: [{ action: 'redirect_browser_to', redirect_browser_to: `${KRATOS}/self-service/settings?flow=s9` }] }
    expect(resolveContinueWith(k, base)).toEqual({ kind: 'redirect', to: `${KRATOS}/self-service/settings?flow=s9` })
  })
  it('settings: does not yank the user to verification after enabling 2FA', () => {
    const data = {
      continue_with: [
        { action: 'show_verification_ui', flow: { id: 'v1' } },
        { action: 'redirect_browser_to', redirect_browser_to: 'https://app.example.com/site' },
      ],
    }
    expect(resolveContinueWith(data, { ...base, returnTo: 'https://app.example.com/site', skipVerification: true })).toEqual({ kind: 'redirect', to: 'https://app.example.com/site' })
    expect(resolveContinueWith(data, base)).toEqual({ kind: 'redirect', to: '/verification?flow=v1' })
  })
  it('settings: a redirect back to the same flow is a re-render', () => {
    const data = { continue_with: [{ action: 'redirect_browser_to', redirect_browser_to: `${ORIGIN}/settings?flow=s1` }] }
    expect(resolveContinueWith(data, { ...base, currentSettingsFlowId: 's1' })).toEqual({ kind: 'refetch' })
  })
  it('session without directives lands on return_to (never /login)', () => {
    expect(resolveContinueWith({ session: {} }, { ...base, returnTo: `${ORIGIN}/login` })).toEqual({ kind: 'redirect', to: `${ORIGIN}/welcome` })
    expect(resolveContinueWith({}, base)).toBeNull()
  })
  it('keeps the settings tab across show_settings_ui', () => {
    expect(resolveContinueWith({ continue_with: [{ action: 'show_settings_ui', flow: { id: 's2' } }] }, { ...base, hash: '#mfa' })).toEqual({
      kind: 'redirect',
      to: '/settings?flow=s2#mfa',
    })
  })
})
