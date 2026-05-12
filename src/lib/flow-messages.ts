import type { LoginFlow, RegistrationFlow, RecoveryFlow, VerificationFlow, SettingsFlow } from '@ory/client'
import type { BannerTone } from '@/components/ui/Banner'

export interface FlowBanner {
  tone: BannerTone
  title: string
  body: string
}

type AnyFlow = LoginFlow | RegistrationFlow | RecoveryFlow | VerificationFlow | SettingsFlow

/**
 * Extract banner-worthy messages from a flow.
 *
 * Ory message ids (selected, see https://www.ory.sh/docs/kratos/concepts/ui-user-interface)
 *   1010002 — Sign in successful
 *   1010003 — User is already logged in
 *   1060001 — Recovery email sent
 *   1060002 — Recovery code sent
 *   1080001 — Verification email sent
 *   4000005 — Invalid credentials
 *   4000006 — Provided credentials are invalid
 *   4000007 — Account does not exist (or has been disabled)
 *   4000010 — Account already exists
 *   4040001 — Flow expired
 */
export function extractFlowBanners(flow: AnyFlow | null): FlowBanner[] {
  if (!flow) return []
  const messages = (flow.ui?.messages || []) as Array<{ id: number; type: string; text: string; context?: any }>

  const banners: FlowBanner[] = []
  for (const m of messages) {
    const tone: BannerTone =
      m.type === 'error' ? 'danger' :
      m.type === 'info' ? 'info' :
      m.type === 'success' ? 'success' : 'warn'

    const known = mapKnownMessage(m.id)
    banners.push({
      tone,
      title: known?.title || (tone === 'danger' ? 'Something went wrong' : 'Notice'),
      body: m.text || known?.body || '',
    })
  }

  // Detect flow expired by expires_at (Kratos returns a 410 on submission of
  // an expired flow, but on initial load we can warn proactively).
  const expiresAt = (flow as any).expires_at as string | undefined
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    banners.push({
      tone: 'warn',
      title: 'Your session timed out',
      body: 'For your security we restarted the flow. Please try again.',
    })
  }

  return banners
}

function mapKnownMessage(id: number): { title: string; body: string } | null {
  switch (id) {
    case 1010003:
      return { title: 'You are already signed in', body: 'A session already exists in this browser.' }
    case 1060001:
      return { title: 'Recovery email sent', body: 'Check your inbox for the recovery link.' }
    case 1060002:
      return { title: 'Recovery code sent', body: 'Check your inbox for the 6-digit code.' }
    case 1080001:
      return { title: 'Verification email sent', body: 'Check your inbox for the verification link.' }
    case 4000005:
    case 4000006:
      return { title: 'Invalid credentials', body: 'The email or password you entered is incorrect.' }
    case 4000007:
      return { title: 'Account unavailable', body: 'This account does not exist or has been disabled.' }
    case 4000010:
      return { title: 'Account already exists', body: 'An account with this email already exists. Try signing in.' }
    case 4040001:
      return { title: 'Your session timed out', body: 'For your security we restarted the flow. Please try again.' }
    default:
      return null
  }
}

/**
 * Detect OIDC-cancelled state from URL search params: oathkeeper / kratos
 * redirects back with `error=login_required` or similar after provider cancel.
 */
export function detectUrlBanner(searchParams: URLSearchParams): FlowBanner | null {
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  if (!error) return null
  if (error === 'login_required' || error === 'access_denied') {
    return {
      tone: 'warn',
      title: 'Sign-in cancelled',
      body: errorDescription || 'You cancelled sign-in with your provider. Try again or use a different method.',
    }
  }
  return {
    tone: 'danger',
    title: 'Sign-in error',
    body: errorDescription || error,
  }
}
