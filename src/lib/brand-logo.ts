/**
 * The install's own logos, read at runtime (one image serves every install):
 *   LOGO_URL        full logo / wordmark: top of every sign-in card, and the header
 *   LOGO_DARK_URL   optional dark-theme variant of LOGO_URL
 *   LOGO_SMALL_URL  square icon: header on small screens, favicon, apple-touch-icon
 *   FAVICON_URL     optional, defaults to LOGO_SMALL_URL
 *   LOGO_SHOWS_NAME false when LOGO_URL has no name in it: the header then shows
 *                   the small logo beside APP_NAME (default true)
 * The older NEXT_PUBLIC_LOGO_URL / NEXT_PUBLIC_FAVICON_URL still work as fallbacks.
 * Only https URLs and root-relative paths are accepted; anything else is ignored.
 */

export interface BrandLogos {
  logoUrl: string | null
  logoDarkUrl: string | null
  logoSmallUrl: string | null
  faviconUrl: string
  logoShowsName: boolean
}

export function safeLogoUrl(v: string | null | undefined): string | null {
  const s = (v ?? '').trim()
  if (!s || s.length > 2048 || /[\u0000-\u001F\u007F\\]/.test(s)) return null
  if (s.startsWith('/') && !s.startsWith('//')) return s
  try {
    return new URL(s).protocol === 'https:' ? s : null
  } catch {
    return null
  }
}

function first(get: (k: string) => string | undefined, keys: string[]): string | null {
  for (const k of keys) {
    const v = safeLogoUrl(get(k))
    if (v) return v
  }
  return null
}

export function readBrandLogos(get: (k: string) => string | undefined = (k) => process.env[k]): BrandLogos {
  const logoSmallUrl = first(get, ['LOGO_SMALL_URL'])
  return {
    logoUrl: first(get, ['LOGO_URL', 'NEXT_PUBLIC_LOGO_URL']),
    logoDarkUrl: first(get, ['LOGO_DARK_URL']),
    logoSmallUrl,
    faviconUrl: first(get, ['FAVICON_URL', 'NEXT_PUBLIC_FAVICON_URL']) ?? logoSmallUrl ?? '/favicon.ico',
    logoShowsName: !/^(false|0|no)$/i.test((get('LOGO_SHOWS_NAME') ?? '').trim()),
  }
}
