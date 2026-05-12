import { env } from 'next-runtime-env'

/**
 * Runtime configuration.
 *
 * Reads via `next-runtime-env`'s `env()` function — values are injected by
 * `<PublicEnvScript />` in the root layout at request time, NOT at build time.
 * This means the same Docker image works in any environment with no rebuild;
 * the chart sets container env vars and the UI picks them up immediately.
 *
 * `env()` returns the runtime value on the client and `process.env.X` on the
 * server (where it's available natively).
 */

// Helper that returns a getter — config is a Proxy so each access is fresh.
// Avoids stale captures during SSR/hydration.
function makeConfig() {
  return {
    get appName(): string { return env('NEXT_PUBLIC_APP_NAME') || 'Auth' },
    get logoUrl(): string { return env('NEXT_PUBLIC_LOGO_URL') || '/logo.svg' },
    get faviconUrl(): string { return env('NEXT_PUBLIC_FAVICON_URL') || '/favicon.ico' },

    get theme() {
      return {
        primaryColor:    env('NEXT_PUBLIC_THEME_PRIMARY_COLOR')    || '3B82F6',
        darkMode:        env('NEXT_PUBLIC_THEME_DARK_MODE')        !== 'false',
        backgroundColor: env('NEXT_PUBLIC_THEME_BACKGROUND_COLOR') || '111827',
      }
    },

    get kratos() {
      const browser = env('NEXT_PUBLIC_KRATOS_BROWSER_URL') || 'http://kratos:4433'
      // KRATOS_PUBLIC_URL is server-only (no NEXT_PUBLIC_ prefix); server side reads
      // process.env directly. Client side never needs publicUrl.
      const publicUrl = (typeof process !== 'undefined' && process.env.KRATOS_PUBLIC_URL) || browser
      return { browserUrl: browser, publicUrl }
    },

    get defaultReturnUrl(): string { return env('NEXT_PUBLIC_DEFAULT_RETURN_URL') || '/' },
    get allowedReturnUrls(): string[] {
      return (env('NEXT_PUBLIC_ALLOWED_RETURN_URLS') || '*').split(',').map(s => s.trim())
    },

    get texts() {
      return {
        loginTitle:                env('NEXT_PUBLIC_LOGIN_TITLE')                || 'Welcome back',
        loginSubtitle:             env('NEXT_PUBLIC_LOGIN_SUBTITLE')             || 'Sign in to your account',
        registerTitle:             env('NEXT_PUBLIC_REGISTER_TITLE')             || 'Create account',
        registerSubtitle:          env('NEXT_PUBLIC_REGISTER_SUBTITLE')          || 'Get started with your account',
        recoveryTitle:             env('NEXT_PUBLIC_RECOVERY_TITLE')             || 'Reset password',
        recoverySubtitle:          env('NEXT_PUBLIC_RECOVERY_SUBTITLE')          || 'Enter your email to reset your password',
        verificationTitle:         env('NEXT_PUBLIC_VERIFICATION_TITLE')         || 'Verify your email',
        verificationSubtitle:      env('NEXT_PUBLIC_VERIFICATION_SUBTITLE')      || 'Enter the code sent to your email',
        verificationSuccessTitle:  env('NEXT_PUBLIC_VERIFICATION_SUCCESS_TITLE') || 'Email verified',
        verificationSuccessSubtitle: env('NEXT_PUBLIC_VERIFICATION_SUCCESS_SUBTITLE') || 'Your email has been verified',
      }
    },

    get footer() {
      return {
        text:  env('NEXT_PUBLIC_FOOTER_TEXT') || '',
        links: parseJsonSafe<Array<{ label: string; url: string }>>(env('NEXT_PUBLIC_FOOTER_LINKS'), []),
      }
    },
  }
}

export const config = makeConfig()

function parseJsonSafe<T>(value: string | undefined, defaultValue: T): T {
  if (!value) return defaultValue
  try {
    return JSON.parse(value) as T
  } catch {
    return defaultValue
  }
}

// Generate CSS variables for theming
export function getThemeCssVariables(): string {
  const primary = config.theme.primaryColor
  return `
    :root {
      --color-primary-50: #eff6ff;
      --color-primary-100: #dbeafe;
      --color-primary-200: #bfdbfe;
      --color-primary-300: #93c5fd;
      --color-primary-400: #60a5fa;
      --color-primary-500: #${primary};
      --color-primary-600: #2563eb;
      --color-primary-700: #1d4ed8;
      --color-primary-800: #1e40af;
      --color-primary-900: #1e3a8a;
    }
  `
}

// Validate return URL against allowed patterns
export function isReturnUrlAllowed(url: string): boolean {
  if (config.allowedReturnUrls.includes('*')) return true
  
  try {
    const parsed = new URL(url)
    return config.allowedReturnUrls.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
        return regex.test(parsed.origin)
      }
      return parsed.origin === pattern
    })
  } catch {
    return false
  }
}
