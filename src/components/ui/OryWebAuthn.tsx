'use client'

import { useEffect, useState } from 'react'
import type { AnyFlow } from '@/lib/kratos-flow'
import {
  getCsrfToken,
  getHiddenInputs,
  getScriptNodes,
  getTriggerButton,
} from '@/lib/kratos-flow'

declare global {
  interface Window {
    __oryWebAuthnInitialized?: boolean
  }
}

/**
 * Injects Kratos's webauthn.js (delivered as a flow script node, complete
 * with SRI integrity + nonce) and reports readiness. The script defines
 * window.oryPasskeyLogin / oryPasskeyRegistration /
 * oryPasskeySettingsRegistration / oryWebAuthnLogin and flips
 * window.__oryWebAuthnInitialized when done.
 */
export function useOryWebAuthn(flow: AnyFlow | null): boolean {
  const [ready, setReady] = useState(false)
  // Key the effect on the script srcs, not the flow object (re-fetches create
  // new objects with the same script node).
  const srcKey = getScriptNodes(flow).map((s) => s.src).join(',')
  useEffect(() => {
    if (!flow || window.__oryWebAuthnInitialized) {
      if (window.__oryWebAuthnInitialized) setReady(true)
      return
    }
    for (const s of getScriptNodes(flow)) {
      // Guard against double-injection (React strict mode, flow re-fetches).
      if (s.id && document.getElementById(s.id)) continue
      const el = document.createElement('script')
      el.src = s.src
      el.async = s.async ?? true
      if (s.referrerpolicy) el.referrerPolicy = s.referrerpolicy
      if (s.crossorigin) el.crossOrigin = s.crossorigin
      if (s.integrity) el.integrity = s.integrity
      if (s.type) el.type = s.type
      if (s.id) el.id = s.id
      if (s.nonce) el.nonce = s.nonce
      document.body.appendChild(el)
    }
    const timer = window.setInterval(() => {
      if (window.__oryWebAuthnInitialized) {
        setReady(true)
        window.clearInterval(timer)
      }
    }, 50)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcKey])
  return ready
}

/**
 * Native <form> wrapping a Kratos WebAuthn/passkey trigger. Ory's script
 * needs the group's hidden inputs (challenge + result) and the trigger to be
 * inside a real form: after the browser ceremony it fills the result input
 * and calls form.submit(), a plain POST to flow.ui.action that Kratos
 * answers with a 303 back to this UI (errors come back as flow messages).
 */
export function WebAuthnTriggerForm({
  flow,
  group,
  triggerName,
  className,
  disabled,
  extra,
  children,
}: {
  flow: AnyFlow
  /** Kratos node group whose hidden inputs to include, e.g. 'passkey'. */
  group: string
  /** Trigger button node name, e.g. 'passkey_login_trigger'. */
  triggerName: string
  /** className applied to the trigger button. */
  className?: string
  disabled?: boolean
  /** Extra hidden fields (e.g. registration traits) — override flow values. */
  extra?: Record<string, string>
  children?: React.ReactNode
}) {
  const ready = useOryWebAuthn(flow)
  const trigger = getTriggerButton(flow, triggerName)
  if (!trigger) return null

  const overrides = extra ?? {}
  // Include the flow's `default`-group hidden inputs too: on registration
  // Kratos echoes the traits captured in the profile step there, and they
  // must ride along with the passkey POST.
  const hidden = [...getHiddenInputs(flow, 'default'), ...getHiddenInputs(flow, group)]
    .filter((f) => !(f.name in overrides))
  const run = () => {
    const fn = (window as unknown as Record<string, unknown>)[trigger.onclickTrigger ?? '']
    if (typeof fn === 'function') (fn as () => void)()
  }

  return (
    <form method="POST" action={flow.ui.action} style={{ display: 'contents' }}>
      <input type="hidden" name="csrf_token" value={getCsrfToken(flow)} />
      {hidden.map((f) => (
        <input key={f.name} type="hidden" name={f.name} value={f.value} readOnly />
      ))}
      {Object.entries(overrides).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} readOnly />
      ))}
      {/* name/value on the button matter: webauthn triggers carry the
          ceremony options in `value`, and Ory's script locates the form via
          the trigger element. type=button — the script submits the form
          itself once the credential ceremony resolves. */}
      <button
        type="button"
        name={trigger.name}
        value={trigger.value}
        className={className}
        disabled={disabled || !ready}
        onClick={run}
      >
        {children ?? trigger.label ?? 'Continue'}
      </button>
    </form>
  )
}
