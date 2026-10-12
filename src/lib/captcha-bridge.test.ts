import { describe, expect, it, vi } from 'vitest'
import { captchaAction, deliverCaptcha } from './captcha-bridge'

// The bot-check page for apps: one token for one flow's action, handed to whichever host carries the page.

describe('captcha bridge', () => {
  it('knows the four flows and nothing else', () => {
    expect(captchaAction('registration')).toBe('registration')
    expect(captchaAction('login')).toBe('login')
    expect(captchaAction('settings')).toBeNull()
    expect(captchaAction(null)).toBeNull()
  })

  it('hands the message to React Native, WKWebView, an Android interface and a parent frame', () => {
    const rn = vi.fn(); const wk = vi.fn(); const android = vi.fn(); const parent = vi.fn()
    const msg = { type: 'captcha-token' as const, action: 'registration' as const, token: 't' }
    const w = { ReactNativeWebView: { postMessage: rn }, webkit: { messageHandlers: { captcha: { postMessage: wk } } }, Captcha: { postMessage: android }, parent: { postMessage: parent } }
    expect(deliverCaptcha(msg, w)).toBe(4)
    expect(rn).toHaveBeenCalledWith(JSON.stringify(msg))
    expect(wk).toHaveBeenCalledWith(msg)
    expect(android).toHaveBeenCalledWith(JSON.stringify(msg))
    expect(parent).toHaveBeenCalledWith(msg, '*')
  })

  it('a top-level page (its own parent) with no carrier delivers nothing, and a failing carrier does not stop the others', () => {
    const w: Record<string, unknown> = {}
    w.parent = w
    expect(deliverCaptcha({ type: 'captcha-token', action: 'login', token: 't' }, w as never)).toBe(0)
    const ok = vi.fn()
    expect(deliverCaptcha({ type: 'captcha-token', action: 'login', token: 't' }, { ReactNativeWebView: { postMessage: () => { throw new Error('x') } }, Captcha: { postMessage: ok } })).toBe(1)
    expect(ok).toHaveBeenCalled()
  })
})
