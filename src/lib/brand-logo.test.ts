import { describe, it, expect } from 'vitest'
import { readBrandLogos, safeLogoUrl } from './brand-logo'

describe('safeLogoUrl', () => {
  it('accepts https URLs and root-relative paths', () => {
    expect(safeLogoUrl('https://cdn.example.com/logo.png')).toBe('https://cdn.example.com/logo.png')
    expect(safeLogoUrl('  /brand/logo.svg ')).toBe('/brand/logo.svg')
  })

  it('ignores http, protocol-relative, javascript:, data: and junk', () => {
    for (const v of ['http://cdn.example.com/logo.png', '//evil.example.com/x.png', '/\\evil.example.com', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'logo.png', '', '   ', undefined, '/a\nb']) {
      expect(safeLogoUrl(v)).toBeNull()
    }
  })
})

describe('readBrandLogos', () => {
  const from = (vars: Record<string, string>) => readBrandLogos((k) => vars[k])

  it('returns nothing (letter tile) and the stock favicon when unset', () => {
    expect(from({})).toEqual({ logoUrl: null, logoDarkUrl: null, logoSmallUrl: null, faviconUrl: '/favicon.ico', logoShowsName: true })
  })

  it('reads LOGO_URL and LOGO_SMALL_URL; the favicon defaults to the small logo', () => {
    expect(from({ LOGO_URL: 'https://cdn.example.com/full.png', LOGO_SMALL_URL: '/brand/icon.png' })).toEqual({
      logoUrl: 'https://cdn.example.com/full.png',
      logoDarkUrl: null,
      logoSmallUrl: '/brand/icon.png',
      faviconUrl: '/brand/icon.png',
      logoShowsName: true,
    })
  })

  it('prefers FAVICON_URL, then the legacy NEXT_PUBLIC_ names', () => {
    expect(from({ LOGO_SMALL_URL: '/icon.png', FAVICON_URL: '/fav.ico' }).faviconUrl).toBe('/fav.ico')
    expect(from({ NEXT_PUBLIC_FAVICON_URL: '/legacy.ico', LOGO_SMALL_URL: '/icon.png' }).faviconUrl).toBe('/legacy.ico')
    expect(from({ NEXT_PUBLIC_LOGO_URL: 'https://cdn.example.com/legacy.png' }).logoUrl).toBe('https://cdn.example.com/legacy.png')
  })

  it('drops invalid values and falls through to the next candidate', () => {
    expect(from({ LOGO_URL: 'http://cdn.example.com/x.png', LOGO_SMALL_URL: 'javascript:x', FAVICON_URL: '//x.example.com/f.ico' })).toEqual({
      logoUrl: null,
      logoDarkUrl: null,
      logoSmallUrl: null,
      faviconUrl: '/favicon.ico',
      logoShowsName: true,
    })
  })

  it('reads LOGO_DARK_URL (validated) and LOGO_SHOWS_NAME (default true)', () => {
    expect(from({ LOGO_DARK_URL: 'https://cdn.example.com/dark.png' }).logoDarkUrl).toBe('https://cdn.example.com/dark.png')
    expect(from({ LOGO_DARK_URL: 'http://cdn.example.com/dark.png' }).logoDarkUrl).toBeNull()
    for (const v of ['false', 'FALSE', '0', 'no']) expect(from({ LOGO_SHOWS_NAME: v }).logoShowsName).toBe(false)
    for (const v of ['true', '1', '', 'yes']) expect(from({ LOGO_SHOWS_NAME: v }).logoShowsName).toBe(true)
  })
})
