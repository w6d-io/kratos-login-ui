import { describe, it, expect } from 'vitest'
import {
  accentPassesContrast,
  accentVars,
  brandingTarget,
  contrastRatio,
  hostFromReturnTo,
  isValidHost,
  sanitizeBranding,
} from './branding'

const allowAll = () => true

describe('hostFromReturnTo', () => {
  it('returns the lower-cased hostname of an allowed http(s) URL', () => {
    expect(hostFromReturnTo('https://Payroll.dev.example.com/x?y=1', allowAll)).toBe('payroll.dev.example.com')
  })

  it('rejects URLs the allow-list refuses', () => {
    expect(hostFromReturnTo('https://evil.example/', () => false)).toBeNull()
  })

  it('rejects non-http schemes, relative and garbage values', () => {
    expect(hostFromReturnTo('javascript:alert(1)', allowAll)).toBeNull()
    expect(hostFromReturnTo('/settings', allowAll)).toBeNull()
    expect(hostFromReturnTo('', allowAll)).toBeNull()
    expect(hostFromReturnTo(null, allowAll)).toBeNull()
  })
})

describe('isValidHost', () => {
  it('accepts DNS hostnames and refuses anything that could alter the upstream path', () => {
    expect(isValidHost('payroll.dev.example.com')).toBe(true)
    expect(isValidHost('localhost')).toBe(true)
    expect(isValidHost('a/../b')).toBe(false)
    expect(isValidHost('a?b')).toBe(false)
    expect(isValidHost('a%2fb')).toBe(false)
    expect(isValidHost('')).toBe(false)
    expect(isValidHost('x'.repeat(254))).toBe(false)
  })
})

describe('contrast', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
  })

  it('accepts the platform default and a mid blue, refuses pale and near-black accents', () => {
    expect(accentPassesContrast('#2256C4')).toBe(true)
    expect(accentPassesContrast('#2F6FEB')).toBe(true)
    expect(accentPassesContrast('#FFE600')).toBe(false) // white text unreadable
    expect(accentPassesContrast('#050505')).toBe(false) // invisible on dark surfaces
  })
})

describe('accentVars', () => {
  it('derives primary, hover and ring variables', () => {
    const v = accentVars('#2F6FEB')
    expect(v['--primary']).toBe('#2F6FEB')
    expect(v['--primary-hover']).toMatch(/^#[0-9A-F]{6}$/)
    expect(v['--primary-ring']).toBe('rgba(47, 111, 235, 0.18)')
  })

  it('picks the button label colour (white or ink) with the better contrast', () => {
    expect(accentVars('#2F6FEB')['--primary-fg']).toBe('#FFFFFF')
    expect(accentVars('#5EEAD4')['--primary-fg']).toBe('#0E1525')
    expect(accentPassesContrast('#5EEAD4')).toBe(false) // light teal: links unreadable on white cards
  })
})

describe('sanitizeBranding', () => {
  const good = {
    name: 'payroll',
    displayName: 'Payroll',
    logoUrl: '/api/public/sites/payroll/logo',
    accent: '#2F6FEB',
    welcome: 'Sign in to continue to Payroll',
    helpUrl: 'https://payroll.dev.example.com/help',
    minAal: 'aal2',
    scope: 'writes',
    defaultReturnUrl: 'https://payroll.dev.example.com/home',
    internalField: 'must not leak',
  }

  it('keeps valid fields and drops unknown ones', () => {
    const b = sanitizeBranding(good, 'payroll.dev.example.com')!
    expect(b).toEqual({
      host: 'payroll.dev.example.com',
      name: 'payroll',
      displayName: 'Payroll',
      hasLogo: true,
      accent: '#2F6FEB',
      welcome: 'Sign in to continue to Payroll',
      helpUrl: 'https://payroll.dev.example.com/help',
      minAal: 'aal2',
      scope: 'writes',
      defaultReturnUrl: 'https://payroll.dev.example.com/home',
      signUp: null,
    })
  })

  it('keeps only an http(s) defaultReturnUrl', () => {
    expect(sanitizeBranding({ ...good, defaultReturnUrl: 'javascript:alert(1)' }, 'h')!.defaultReturnUrl).toBeNull()
    expect(sanitizeBranding({ ...good, defaultReturnUrl: null }, 'h')!.defaultReturnUrl).toBeNull()
  })

  it('returns null for non-objects or a missing name', () => {
    expect(sanitizeBranding(null, 'h')).toBeNull()
    expect(sanitizeBranding('x', 'h')).toBeNull()
    expect(sanitizeBranding({ displayName: 'X' }, 'h')).toBeNull()
    expect(sanitizeBranding({ name: 'Bad Name!' }, 'h')).toBeNull()
  })

  it('falls back to the default accent when contrast fails or the value is malformed', () => {
    expect(sanitizeBranding({ ...good, accent: '#FFE600' }, 'h')!.accent).toBeNull()
    expect(sanitizeBranding({ ...good, accent: 'red;background:url(x)' }, 'h')!.accent).toBeNull()
  })

  it('refuses javascript: and other non-http help links', () => {
    expect(sanitizeBranding({ ...good, helpUrl: 'javascript:alert(1)' }, 'h')!.helpUrl).toBeNull()
    expect(sanitizeBranding({ ...good, helpUrl: 'data:text/html,x' }, 'h')!.helpUrl).toBeNull()
  })

  it('caps text lengths and strips control characters', () => {
    const b = sanitizeBranding({ ...good, welcome: 'a\u0000b\u202Ec' + 'x'.repeat(200), displayName: 'y'.repeat(200) }, 'h')!
    expect(b.welcome!.startsWith('abc')).toBe(true)
    expect(b.welcome!.length).toBeLessThanOrEqual(80)
    expect(b.displayName.length).toBeLessThanOrEqual(60)
  })

  it('falls back to name when displayName is empty', () => {
    expect(sanitizeBranding({ ...good, displayName: '  ' }, 'h')!.displayName).toBe('payroll')
  })

  it('refuses SVG logos and treats unknown minAal/scope as absent', () => {
    const b = sanitizeBranding({ ...good, logoUrl: '/logo.svg', minAal: 'aal9', scope: 'lol' }, 'h')!
    expect(b.hasLogo).toBe(false)
    expect(b.minAal).toBeNull()
    expect(b.scope).toBeNull()
  })
})

describe('brandingTarget', () => {
  it('unwraps one level of return_to when the URL points back at this UI (e.g. settings → /access)', () => {
    const inner = 'https://payroll.test/x'
    const own = 'https://auth.test'
    expect(brandingTarget(`${own}/access?site=payroll&return_to=${encodeURIComponent(inner)}`, own)).toBe(inner)
    expect(brandingTarget(inner, own)).toBe(inner)
    expect(brandingTarget(`${own}/settings`, own)).toBe(`${own}/settings`)
  })
})
