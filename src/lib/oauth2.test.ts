import { describe, it, expect } from 'vitest'
import { allowedRedirect, groupScopes, isRefusedKind, refusalReason, validChallenge } from './oauth2'

const origins = { self: 'https://auth.example.com', hydra: 'https://hydra.example.com/', kratos: null }

describe('validChallenge', () => {
  it('takes Hydra-shaped tokens only', () => {
    expect(validChallenge('abc_DEF-123.x~=')).toBe('abc_DEF-123.x~=')
    expect(validChallenge('')).toBeNull()
    expect(validChallenge(null)).toBeNull()
    expect(validChallenge('a b')).toBeNull()
    expect(validChallenge('a&b=c')).toBeNull()
    expect(validChallenge('x'.repeat(4097))).toBeNull()
  })
})

describe('refusalReason', () => {
  it('maps known reasons, folds mcp_group_not_allowed, and reads the rest as unknown', () => {
    expect(refusalReason('mcp_disabled')).toBe('mcp_disabled')
    expect(refusalReason('mcp_group_not_allowed')).toBe('group_not_allowed')
    expect(refusalReason('client_bound_elsewhere')).toBe('client_bound_elsewhere')
    expect(refusalReason('<script>')).toBe('unknown')
    expect(refusalReason(42)).toBe('unknown')
  })
})

describe('allowedRedirect (no open redirect)', () => {
  it('passes this UI, Hydra and local paths', () => {
    expect(allowedRedirect('/login?return_to=x', origins)).toBe('/login?return_to=x')
    expect(allowedRedirect('https://auth.example.com/self-service/login/browser?aal=aal2', origins)).toBe('https://auth.example.com/self-service/login/browser?aal=aal2')
    expect(allowedRedirect('https://hydra.example.com/oauth2/auth?login_verifier=v', origins)).toBe('https://hydra.example.com/oauth2/auth?login_verifier=v')
  })
  it('passes Kratos only when it is configured', () => {
    const k = { ...origins, kratos: 'https://kratos.example.com' }
    expect(allowedRedirect('https://kratos.example.com/self-service/login/browser', origins)).toBeNull()
    expect(allowedRedirect('https://kratos.example.com/self-service/login/browser', k)).not.toBeNull()
  })
  it.each([
    'http://localhost:53682/callback?code=x',
    'https://evil.example.org/',
    'https://hydra.example.com.evil.io/',
    'https://user@hydra.example.com/',
    '//evil.example.org/x',
    '/\\evil.example.org',
    'javascript:alert(1)',
    'data:text/html,x',
    'http://hydra.example.com/oauth2/auth',
    '',
  ])('refuses %s', (to) => {
    expect(allowedRedirect(to, origins)).toBeNull()
  })
  it('refuses non-strings and a missing Hydra setting', () => {
    expect(allowedRedirect(undefined, origins)).toBeNull()
    expect(allowedRedirect({ to: '/' }, origins)).toBeNull()
    expect(allowedRedirect('https://hydra.example.com/oauth2/auth', { self: null, hydra: null, kratos: null })).toBeNull()
  })
})

describe('groupScopes', () => {
  it('groups by resource with readable labels, reads first', () => {
    const g = groupScopes([
      { scope: 'users:update', group: 'users' },
      { scope: 'sites:apply', group: 'sites' },
      { scope: 'users:read', group: 'users' },
      { scope: 'audit:read', group: 'audit' },
    ])
    expect(g.map((x) => x.label)).toEqual(['Audit trail', 'Sites', 'Users'])
    expect(g[2].scopes).toEqual(['users:read', 'users:update'])
  })
})

describe('isRefusedKind', () => {
  it('knows refusals plus expired/unavailable, nothing else', () => {
    expect(isRefusedKind('group_not_allowed')).toBe(true)
    expect(isRefusedKind('expired')).toBe(true)
    expect(isRefusedKind('unavailable')).toBe(true)
    expect(isRefusedKind('toString')).toBe(false)
    expect(isRefusedKind(undefined)).toBe(false)
  })
})
