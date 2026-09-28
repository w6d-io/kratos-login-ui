import { kratosBrowserBase } from './kratos'
import { isReturnUrlAllowed } from './config'
import { rememberOriginHost } from './landing'
import { restartGuard, type ErrorNavOptions, type FlowContext, type FlowKind, type NavAction } from './flow-nav'

/** sessionStorage, or null when the browser blocks it (the getter itself can throw). */
export function sessionStore(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Browser defaults for resolveKratosError. */
export function errorNavOptions(kind: FlowKind, ctx: FlowContext, fallbackMessage: string, authReturnTo?: string): ErrorNavOptions {
  return {
    kind,
    ctx,
    authReturnTo,
    origin: window.location.origin,
    kratosBase: kratosBrowserBase(),
    mayRestart: () => restartGuard(kind, sessionStore()),
    fallbackMessage,
  }
}

export function continueNavOptions() {
  return { origin: window.location.origin, kratosBase: kratosBrowserBase() }
}

export interface NavHandlers<F> {
  setFlow: (flow: F) => void
  refetch: () => void
  setError: (message: string) => void
}

/** Apply a NavAction. Returns true when the page is navigating away. */
export function applyNav<F>(action: NavAction | null, h: NavHandlers<F>): boolean {
  if (!action) return false
  switch (action.kind) {
    case 'redirect':
      window.location.assign(action.to)
      return true
    case 'flow':
      h.setFlow(action.flow as F)
      return false
    case 'refetch':
      h.refetch()
      return false
    case 'error':
      h.setError(action.message)
      return false
  }
}

/** Remember the site this flow started from (for /welcome), from document.referrer. */
export function rememberFlowOrigin(): void {
  rememberOriginHost(document.referrer, window.location.origin, kratosBrowserBase(), isReturnUrlAllowed, sessionStore())
}
