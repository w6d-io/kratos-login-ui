import type {
  LoginFlow,
  RegistrationFlow,
  RecoveryFlow,
  VerificationFlow,
  SettingsFlow,
  UiNode,
  UiNodeInputAttributes,
} from '@ory/client'

/**
 * Helpers to read Kratos flow UI nodes and turn them into shape our forms
 * understand. Kratos v26 returns flow.ui.nodes — each node has:
 *   - group:    'default' | 'password' | 'oidc' | 'totp' | 'webauthn' | 'lookup_secret' | 'profile' | 'code' | 'link' | ...
 *   - type:     'input' | 'a' (anchor) | 'img' | 'text' | 'script'
 *   - attributes: input-specific (name, type, value, disabled, required, label, ...)
 *   - meta.label.text: human-readable label
 *   - messages: per-node validation messages
 */

export type AnyFlow = LoginFlow | RegistrationFlow | RecoveryFlow | VerificationFlow | SettingsFlow

export interface FlowField {
  name: string
  type: string
  value: string
  required?: boolean
  disabled?: boolean
  label?: string
  autocomplete?: string
  pattern?: string
  errors: string[]
}

export interface OidcProvider {
  /** name attribute value: 'provider' for OIDC submit. */
  name: string
  /** provider id e.g. 'google', 'github', 'gitlab'. */
  provider: string
  /** label from Kratos (e.g. "Sign in with Google"). */
  label: string
}

/** CSRF token value extracted from flow.ui.nodes[].attributes when group='default'. */
export function getCsrfToken(flow: AnyFlow | null): string {
  if (!flow) return ''
  for (const n of flow.ui?.nodes ?? []) {
    const attrs = n.attributes as UiNodeInputAttributes
    if (attrs?.name === 'csrf_token' && typeof attrs.value === 'string') {
      return attrs.value
    }
  }
  return ''
}

/** All input nodes in a given Kratos group, normalized for form rendering. */
export function getInputs(flow: AnyFlow | null, group: string): FlowField[] {
  if (!flow) return []
  return (flow.ui?.nodes ?? [])
    .filter((n) => n.type === 'input' && n.group === group)
    .map((n) => mapInput(n))
    .filter((f) => f.name !== 'csrf_token')
}

/** Find a single input by name (any group). */
export function getInput(flow: AnyFlow | null, name: string): FlowField | null {
  if (!flow) return null
  for (const n of flow.ui?.nodes ?? []) {
    if (n.type !== 'input') continue
    const attrs = n.attributes as UiNodeInputAttributes
    if (attrs.name === name) return mapInput(n)
  }
  return null
}

/** OIDC providers available in this flow (from Kratos `oidc` group). */
export function getOidcProviders(flow: AnyFlow | null): OidcProvider[] {
  if (!flow) return []
  const out: OidcProvider[] = []
  for (const n of flow.ui?.nodes ?? []) {
    if (n.group !== 'oidc' || n.type !== 'input') continue
    const attrs = n.attributes as UiNodeInputAttributes
    if (attrs.name !== 'provider') continue
    out.push({
      name: attrs.name,
      provider: String(attrs.value ?? ''),
      label: n.meta?.label?.text || `Continue with ${attrs.value}`,
    })
  }
  return out
}

/** Kratos v26 returns flow-level messages; per-node messages live on each node.messages. */
export function getFlowLevelMessages(flow: AnyFlow | null): Array<{ id: number; text: string; type: 'info' | 'success' | 'error' }> {
  if (!flow) return []
  return ((flow.ui?.messages || []) as Array<{ id: number; text: string; type: string }>).map((m) => ({
    id: m.id,
    text: m.text,
    type: (m.type as 'info' | 'success' | 'error') || 'info',
  }))
}

export function getNodeErrors(flow: AnyFlow | null, name: string): string[] {
  const f = getInput(flow, name)
  return f?.errors ?? []
}

/** True if a particular method is offered (e.g. flow has `password` group nodes). */
export function hasGroup(flow: AnyFlow | null, group: string): boolean {
  if (!flow) return false
  return (flow.ui?.nodes ?? []).some((n) => n.group === group)
}

/** Available auth methods on a login flow (after identifier-first or for second-factor). */
export function availableMethods(flow: LoginFlow | null): Array<'password' | 'oidc' | 'totp' | 'webauthn' | 'lookup_secret' | 'code'> {
  if (!flow) return []
  const groups = new Set<string>()
  for (const n of flow.ui?.nodes ?? []) {
    if (n.group && n.group !== 'default') groups.add(n.group)
  }
  return Array.from(groups) as never
}

function mapInput(n: UiNode): FlowField {
  const attrs = n.attributes as UiNodeInputAttributes
  return {
    name: attrs.name,
    type: (attrs.type as string) || 'text',
    value: attrs.value === undefined || attrs.value === null ? '' : String(attrs.value),
    required: attrs.required,
    disabled: attrs.disabled,
    label: n.meta?.label?.text,
    autocomplete: (attrs as { autocomplete?: string }).autocomplete,
    pattern: (attrs as { pattern?: string }).pattern,
    errors: (n.messages || [])
      .filter((m) => m.type === 'error')
      .map((m) => m.text),
  }
}

/**
 * Follow a Kratos `continue_with` chain returned on flow update success.
 * Returns true if a navigation was issued (caller should stop further work).
 *
 * Possible actions per Kratos v26 docs:
 *  - redirect_browser_to: navigate to URL (after registration / login complete)
 *  - show_verification_ui: navigate to /verification?flow=...
 *  - show_recovery_ui:     navigate to /recovery?flow=...
 *  - show_settings_ui:     navigate to /settings?flow=... (post-recovery)
 *  - set_ory_session_token: a token-based action (no UI) — caller may store
 *
 * If the flow ALSO returns a `session` field, the user is logged in; we
 * follow the redirect URL or fall back to returnTo.
 */
type ContinueAction = {
  action: string
  redirect_browser_to?: string
  flow?: { id: string }
  ory_session_token?: string
}

export function handleContinueWith(
  data: unknown,
  returnTo?: string,
): boolean {
  const cw = (data as { continue_with?: ContinueAction[] }).continue_with
  if (cw && Array.isArray(cw)) {
    for (const c of cw) {
      switch (c.action) {
        case 'redirect_browser_to':
          if (c.redirect_browser_to) {
            window.location.href = c.redirect_browser_to
            return true
          }
          break
        case 'show_verification_ui':
          if (c.flow?.id) {
            window.location.href = `/verification?flow=${c.flow.id}`
            return true
          }
          break
        case 'show_recovery_ui':
          if (c.flow?.id) {
            window.location.href = `/recovery?flow=${c.flow.id}`
            return true
          }
          break
        case 'show_settings_ui':
          if (c.flow?.id) {
            // Preserve the active settings tab via the URL hash so a
            // refresh chain (TOTP enroll past privileged_session_max_age,
            // password change, etc.) lands the user back on the section
            // they were operating on instead of the default 'profile'.
            const hash = typeof window !== 'undefined' ? window.location.hash : ''
            window.location.href = `/settings?flow=${c.flow.id}${hash}`
            return true
          }
          break
        // set_ory_session_token: token actions don't trigger nav by themselves.
      }
    }
  }
  // No continue_with directives — if a session is present we treat as success.
  if ((data as { session?: unknown }).session) {
    window.location.href = returnTo || '/'
    return true
  }
  return false
}
