/**
 * Per-site branding (site-ux §11). Pure helpers shared by the server route
 * that talks to jinbe and the client that renders the result.
 *
 * Branding is cosmetic, never an access decision: every value coming from
 * jinbe is re-validated here, and anything doubtful falls back to the
 * platform default instead of blocking sign-in.
 */

export type MinAal = 'aal1' | 'aal2'
export type TwoFactorScope = 'none' | 'writes' | 'all' | 'routes'

/** What the browser receives. Never contains jinbe-internal fields or URLs. */
export interface SiteBranding {
  host: string
  name: string
  displayName: string
  /** True when jinbe has a logo; the browser loads it via /api/branding/logo. */
  hasLogo: boolean
  /** #RRGGBB that passed contrast checks, or null → platform accent. */
  accent: string | null
  welcome: string | null
  helpUrl: string | null
  minAal: MinAal | null
  scope: TwoFactorScope | null
}

const MAX_DISPLAY_NAME = 60
const MAX_WELCOME = 80
const HEX = /^#?([0-9a-fA-F]{6})$/
const SITE_NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/

// Accent checks: the primary-button label (white or ink, whichever reads
// better) must reach WCAG AA; links and focus rings must stay visible on the
// light card (white) and the dark card (globals.css [data-dark]
// --bg-elevated). The dark threshold matches what the platform default
// (#2256C4, 2.8:1) achieves.
const WHITE = '#FFFFFF'
const INK = '#0E1525'
const DARK_SURFACE = '#11151D'
const MIN_LABEL_CONTRAST = 4.5
const MIN_CONTRAST_ON_WHITE = 3
const MIN_CONTRAST_ON_DARK = 2.5

/** Hostname jinbe is queried with, or null when return_to is unusable. */
export function hostFromReturnTo(
  returnTo: string | null | undefined,
  isAllowed: (url: string) => boolean,
): string | null {
  if (!returnTo) return null
  let u: URL
  try {
    u = new URL(returnTo)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (!isAllowed(returnTo)) return null
  const host = u.hostname.toLowerCase()
  return isValidHost(host) ? host : null
}

export function isValidHost(host: string): boolean {
  return HOSTNAME.test(host)
}

/** Strip control and bidi-override characters, collapse spaces, cap length. */
function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, max) : null
}

function normaliseHex(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = HEX.exec(v.trim())
  return m ? `#${m[1].toUpperCase()}` : null
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function labelColour(hex: string): string {
  return contrastRatio(hex, WHITE) >= contrastRatio(hex, INK) ? WHITE : INK
}

export function accentPassesContrast(hex: string): boolean {
  return (
    contrastRatio(hex, labelColour(hex)) >= MIN_LABEL_CONTRAST &&
    contrastRatio(hex, WHITE) >= MIN_CONTRAST_ON_WHITE &&
    contrastRatio(hex, DARK_SURFACE) >= MIN_CONTRAST_ON_DARK
  )
}

/** CSS custom properties that re-theme primary buttons, links and focus rings. */
export function accentVars(hex: string): Record<string, string> {
  const [r, g, b] = rgb(hex)
  const dark = [r, g, b].map((c) => Math.round(c * 0.85).toString(16).padStart(2, '0')).join('').toUpperCase()
  return {
    '--primary': hex,
    '--primary-fg': labelColour(hex),
    '--primary-hover': `#${dark}`,
    '--primary-ring': `rgba(${r}, ${g}, ${b}, 0.18)`,
  }
}

function safeHttpUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2048) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

/** A logo reference jinbe may serve: any non-SVG path; bytes are sniffed again when proxied. */
export function isAcceptableLogoRef(v: unknown): v is string {
  if (typeof v !== 'string' || !v || v.length > 2048) return false
  try {
    const u = new URL(v, 'http://placeholder.invalid')
    return !/\.svgz?$/i.test(u.pathname)
  } catch {
    return false
  }
}

/** Validate jinbe's by-host response. Null means "use platform branding". */
export function sanitizeBranding(raw: unknown, host: string): SiteBranding | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string' || !SITE_NAME.test(r.name)) return null
  const accent = normaliseHex(r.accent)
  return {
    host,
    name: r.name,
    displayName: cleanText(r.displayName, MAX_DISPLAY_NAME) || r.name,
    hasLogo: isAcceptableLogoRef(r.logoUrl),
    accent: accent && accentPassesContrast(accent) ? accent : null,
    welcome: cleanText(r.welcome, MAX_WELCOME),
    helpUrl: safeHttpUrl(r.helpUrl),
    minAal: r.minAal === 'aal1' || r.minAal === 'aal2' ? r.minAal : null,
    scope: ['none', 'writes', 'all', 'routes'].includes(r.scope as string) ? (r.scope as TwoFactorScope) : null,
  }
}

/**
 * The URL whose host names the site. A return_to back into this UI (the
 * settings flow started from /access returns to /access) carries the real
 * destination one level down.
 */
export function brandingTarget(url: string, ownOrigin: string): string {
  try {
    const u = new URL(url)
    if (u.origin === ownOrigin) return u.searchParams.get('return_to') || url
  } catch {
    // fall through
  }
  return url
}
