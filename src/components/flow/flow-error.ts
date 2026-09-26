/**
 * Kratos flow errors in words a person can act on. Every state ends in a way forward: start over,
 * wait, sign in, or go back — never a dead end with a stack of ids. The raw id stays available
 * for support, tucked away.
 */

export type ErrorAction = 'restart' | 'signin' | 'wait' | 'back'

export interface FriendlyError {
  tone: 'warn' | 'danger' | 'info'
  title: string
  body: string
  action: ErrorAction
}

export interface RawFlowError {
  id?: string
  code?: number
  status?: string
  reason?: string
  message?: string
}

export function describeFlowError(e: RawFlowError | null | undefined): FriendlyError {
  const id = (e?.id ?? '').toLowerCase()
  const code = e?.code
  const text = `${e?.reason ?? ''} ${e?.message ?? ''}`.toLowerCase()

  if (id === 'security_csrf_violation' || /csrf|anti-csrf/.test(text)) {
    return {
      tone: 'warn',
      title: 'This page was open for too long',
      body: 'For your security the sign-in form stopped working — usually because it was opened in another tab, or the browser blocked a cookie. Start again and it will work.',
      action: 'restart',
    }
  }
  if (id.includes('flow_expired') || id === 'self_service_flow_expired' || code === 410 || /expired/.test(text)) {
    return {
      tone: 'warn',
      title: 'That link or form has expired',
      body: 'Sign-in steps are only valid for a few minutes. Start again — anything you already set up is kept.',
      action: 'restart',
    }
  }
  if (code === 429 || /too many|rate limit/.test(text)) {
    return {
      tone: 'warn',
      title: 'Too many attempts',
      body: 'To protect your account we paused sign-in for a moment. Wait a minute, then try again.',
      action: 'wait',
    }
  }
  if (id === 'session_already_available' || /already (signed|logged) in/.test(text)) {
    return {
      tone: 'info',
      title: 'You are already signed in',
      body: 'This browser already has a session. Continue to where you were going, or sign out first to use another account.',
      action: 'back',
    }
  }
  if (id === 'session_inactive' || id === 'session_aal2_required' || code === 401) {
    return {
      tone: 'info',
      title: 'Please sign in again',
      body: 'Your session ended or needs to be confirmed. Sign in to carry on.',
      action: 'signin',
    }
  }
  if (id === 'self_service_flow_return_to_forbidden' || /return_to/.test(text)) {
    return {
      tone: 'danger',
      title: 'That destination isn’t allowed',
      body: 'The link you followed asked to send you somewhere this sign-in service doesn’t trust. Go back and open the app again from its usual address.',
      action: 'back',
    }
  }
  return {
    tone: 'danger',
    title: 'Something went wrong',
    body: 'We couldn’t finish that step. Start again; if it keeps happening, contact support with the reference below.',
    action: 'restart',
  }
}
