import type { OryClientConfiguration } from '@ory/elements-react'
import { env } from 'next-runtime-env'

// Browser uses window.location.origin so it works on any deployment domain.
// Server-side SSR falls back to NEXT_PUBLIC_KRATOS_BROWSER_URL injected by
// next-runtime-env's <PublicEnvScript /> at request time (NOT build time).

/** Build flow initiation URL — uses relative path so it works on any domain */
export function initFlowUrl(
  flowType: string,
  returnTo?: string,
  opts?: { refresh?: boolean; aal?: 'aal1' | 'aal2' },
): string {
  const base = `/self-service/${flowType}/browser`
  const params = new URLSearchParams()
  if (returnTo) params.set('return_to', returnTo)
  // refresh=true forces Kratos to bump authenticated_at even if a session
  // already exists — required for sensitive settings ops (TOTP enroll,
  // password change) past privileged_session_max_age. Without this, Kratos
  // 303s back to return_to without re-auth and the next sensitive call
  // 403s again, looping the user.
  if (opts?.refresh) params.set('refresh', 'true')
  if (opts?.aal) params.set('aal', opts.aal)
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

/** Origin of the current page. Browser-side: window.location.origin (always
 * matches the actual host). Server-side: runtime-injected env. */
function getOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return env('NEXT_PUBLIC_KRATOS_BROWSER_URL') || ''
}

export function getOryConfig(): OryClientConfiguration {
  const origin = getOrigin()
  const appName = env('NEXT_PUBLIC_APP_NAME') || ''
  const defaultReturnUrl = env('NEXT_PUBLIC_DEFAULT_RETURN_URL') || '/'
  return {
    project: {
      name: appName,
      default_locale: 'en',
      default_redirect_url: defaultReturnUrl,
      error_ui_url: `${origin}/error`,
      login_ui_url: `${origin}/login`,
      registration_ui_url: `${origin}/register`,
      recovery_ui_url: `${origin}/recovery`,
      verification_ui_url: `${origin}/verification`,
      settings_ui_url: `${origin}/settings`,
      recovery_enabled: true,
      verification_enabled: true,
      registration_enabled: true,
      locale_behavior: 'force_default',
    },
    sdk: {
      url: origin,
    },
  }
}

/** @deprecated The const is captured at module-load time and may be stale.
 * Always call `getOryConfig()` at render time for correct runtime origin. */
export const oryConfig = getOryConfig()
