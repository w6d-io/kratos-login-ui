'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  botCheckFor,
  gatewayTokenCookie,
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

/**
 * Everything a flow page needs: the widget to place in its form (null when this flow asks for no
 * check), the current token, whether a submit must wait for one, and `reset()` after each submit.
 */
export function useBotCheck(flow: BotCheckFlow, protection: SignInProtection | null): {
  widget: ReactNode
  token: string | null
  pending: boolean
  reset: () => void
} {
  const check = protection ? botCheckFor(protection, flow) : null
  const [token, setToken] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)
  const reset = useCallback(() => { setToken(null); setGeneration((g) => g + 1) }, [])
  const widget = check ? <BotCheckWidget key={generation} check={check} action={flow} onToken={setToken} /> : null
  return { widget, token, pending: !!check && !token, reset }
}

/** Hands the token to the gateway (recovery, verification): see gatewayTokenCookie. */
export function setGatewayToken(token: string | null): void {
  if (!token || typeof document === 'undefined') return
  document.cookie = gatewayTokenCookie(token, window.location.protocol === 'https:')
}
