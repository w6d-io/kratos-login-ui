'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  botCheckFor,
  parseSignInProtection,
  UNKNOWN_PROTECTION,
  type BotCheckFlow,
  type SignInProtection,
} from '@/lib/sign-in-protection'

/**
 * The bot-check widget (Cloudflare Turnstile, hCaptcha, or reCAPTCHA v3 which has no widget) and the
 * token it produces. The token is one-use: after every submit the page calls `reset()` for a new one.
 * The server (jinbe, from a Kratos hook or the gateway) checks it; this component only obtains it.
 */

interface WidgetApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string | number
  remove?: (id: string | number) => void
  reset?: (id?: string | number) => void
}

interface RecaptchaApi {
  ready: (cb: () => void) => void
  execute: (siteKey: string, opts: { action: string }) => Promise<string>
}

declare global {
  interface Window {
    turnstile?: WidgetApi
    hcaptcha?: WidgetApi
    grecaptcha?: RecaptchaApi
  }
}

const scripts = new Map<string, Promise<void>>()

function loadScript(src: string): Promise<void> {
  const known = scripts.get(src)
  if (known) return known
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => { scripts.delete(src); reject(new Error('bot check script failed to load')) }
    document.head.appendChild(s)
  })
  scripts.set(src, p)
  return p
}

/** reCAPTCHA v3 executes against a script loaded with `render=<site key>`. */
function scriptUrlFor(check: NonNullable<SignInProtection['captcha']>): string {
  if (check.provider !== 'recaptcha') return check.scriptUrl
  const u = new URL(check.scriptUrl)
  u.searchParams.set('render', check.siteKey)
  return u.toString()
}

/** Sign-in protection settings for this page; `null` until known. */
export function useSignInProtection(fetchImpl: typeof fetch = fetch): SignInProtection | null {
  const [value, setValue] = useState<SignInProtection | null>(null)
  useEffect(() => {
    let live = true
    fetchImpl('/api/sign-in-protection', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (live) setValue(body ? parseSignInProtection(body) : UNKNOWN_PROTECTION) })
      .catch(() => { if (live) setValue(UNKNOWN_PROTECTION) })
    return () => { live = false }
  }, [fetchImpl])
  return value
}

export function BotCheckWidget({ check, action, onToken }: {
  check: NonNullable<SignInProtection['captcha']>
  action: BotCheckFlow
  onToken: (token: string | null) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const tokenCb = useRef(onToken)
  useEffect(() => { tokenCb.current = onToken }, [onToken])

  useEffect(() => {
    let widgetId: string | number | undefined
    let api: WidgetApi | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    let live = true
    loadScript(scriptUrlFor(check))
      .then(() => {
        if (!live) return
        if (check.provider === 'recaptcha') {
          const g = window.grecaptcha
          if (!g) throw new Error('reCAPTCHA did not load')
          // v3 tokens expire after two minutes: fetch one now and refresh it before that.
          const run = () => g.ready(() => { void g.execute(check.siteKey, { action }).then((t) => live && tokenCb.current(t)).catch(() => live && setFailed(true)) })
          run()
          timer = setInterval(run, 100_000)
          return
        }
        api = check.provider === 'turnstile' ? window.turnstile : window.hcaptcha
        if (!api || !box.current) throw new Error('bot check did not load')
        widgetId = api.render(box.current, {
          sitekey: check.siteKey,
          ...(check.provider === 'turnstile' ? { action, theme: 'auto', 'refresh-expired': 'auto' } : {}),
          callback: (t: string) => tokenCb.current(t),
          'expired-callback': () => tokenCb.current(null),
          'error-callback': () => { tokenCb.current(null); setFailed(true) },
        })
      })
      .catch(() => { if (live) setFailed(true) })
    return () => {
      live = false
      if (timer) clearInterval(timer)
      if (api?.remove && widgetId !== undefined) {
        try { api.remove(widgetId) } catch { /* already gone */ }
      }
    }
  }, [check, action])

  return (
    <div className="bot-check" data-provider={check.provider}>
      {check.provider !== 'recaptcha' && <div ref={box} />}
      {failed && (
        <p className="small muted" role="alert" style={{ margin: 'var(--space-2) 0 0' }}>
          The bot check could not load. Check your connection or disable a blocker for this page, then reload.
        </p>
      )}
    </div>
  )
}

const normAddress = (a: string | null | undefined): string => (a ?? '').trim().toLowerCase()

export interface BotCheck {
  /** The widget to place in the form; null when this flow asks for no check. */
  widget: ReactNode
  token: string | null
  /** A submit must wait: the flow asks for the check and there is no token yet. */
  pending: boolean
  /** Drop the token and ask the widget for a new one. */
  reset: () => void
  /**
   * The token for this submit (null when the flow asks for none), KEPT for the flow's next steps: the
   * gateway turns a verified token into a pass for this Kratos flow and this address. `address` is
   * the one the submit carries; the first one binds the token.
   */
  use: (address?: string | null) => string | null
  /**
   * A token nobody used yet, for a submit that needs one of its own (a resend: the pass covers one
   * email). Resets the widget and resolves with its next token; null when the flow asks for none.
   */
  fresh: () => Promise<string | null>
}

/**
 * Everything a flow page needs to carry the bot-check token through one Kratos flow.
 *
 * One token per flow: the address step, the code, the password, the details step all send the same
 * token, so nobody solves the check again on each step. A new token is asked for only when the
 * gateway would refuse the old one: a resend (`fresh()`), another address than the one the token was
 * first used with (`address` changes), a refusal of the token (the page calls `reset()`), or a new
 * flow (`flowId` changes). The widget refreshing an expired token on its own is fine too.
 */
export function useBotCheck(
  flow: BotCheckFlow,
  protection: SignInProtection | null,
  opts: { flowId?: string | null; address?: string | null; enabled?: boolean } = {},
): BotCheck {
  const found = protection ? botCheckFor(protection, flow) : null
  const check = opts.enabled === false ? null : found
  const [token, setToken] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)
  // Submits run from closures of an earlier render (the sign-up code is sent after the details
  // step): read the latest token, not the one that render saw.
  const latest = useRef<string | null>(null)
  const bound = useRef<string | null>(null)
  const waiters = useRef<Array<(t: string | null) => void>>([])
  const onToken = useCallback((t: string | null) => {
    latest.current = t
    setToken(t)
    if (t) {
      const w = waiters.current
      waiters.current = []
      w.forEach((resolve) => resolve(t))
    }
  }, [])
  const reset = useCallback(() => {
    latest.current = null
    bound.current = null
    setToken(null)
    setGeneration((g) => g + 1)
  }, [])
  const enabled = !!check
  const use = useCallback((address?: string | null) => {
    if (!enabled) return null
    const a = normAddress(address)
    if (a && latest.current && bound.current === null) bound.current = a
    return latest.current
  }, [enabled])
  const fresh = useCallback((): Promise<string | null> => {
    if (!enabled) return Promise.resolve(null)
    reset()
    return new Promise((resolve) => { waiters.current.push(resolve) })
  }, [enabled, reset])

  // A new flow: the old token's pass belongs to the old one.
  const flowId = opts.flowId ?? null
  const lastFlow = useRef(flowId)
  useEffect(() => {
    if (lastFlow.current !== null && flowId !== null && flowId !== lastFlow.current) reset()
    if (flowId !== null) lastFlow.current = flowId
  }, [flowId, reset])

  // Another address than the token was used with: the gateway would refuse it, ask for a new one now.
  const address = normAddress(opts.address)
  useEffect(() => {
    if (bound.current !== null && address && address !== bound.current) reset()
  }, [address, reset])

  const widget = check ? <BotCheckWidget key={generation} check={check} action={flow} onToken={onToken} /> : null
  return { widget, token, pending: !!check && !token, reset, use, fresh }
}
