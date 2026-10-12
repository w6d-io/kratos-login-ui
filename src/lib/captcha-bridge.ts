import { BOT_CHECK_FLOWS, type BotCheckFlow } from './sign-in-protection'

/**
 * The bot-check page for apps (`/captcha?action=<flow>`): a mobile app, or any client that talks to
 * Kratos' API flows itself, opens it in a WebView (or an iframe) and gets one token solved for that
 * flow's action — the action jinbe checks, so a sign-in token never stands for a sign-up. The token
 * goes back to the host app as one message:
 *
 *   { type: 'captcha-token', action, token }      token null: this flow asks for no check
 *
 * delivered to every carrier present: React Native (`window.ReactNativeWebView.postMessage`), a
 * WKWebView handler named `captcha` (`window.webkit.messageHandlers.captcha.postMessage`), an Android
 * JavaScript interface named `Captcha` (`window.Captcha.postMessage`) and, inside an iframe, the
 * parent window. A token is one-use, about five minutes: solve right before the submit it goes on.
 */

export interface CaptchaMessage {
  type: 'captcha-token'
  action: BotCheckFlow
  token: string | null
}

/** The flow asked for, or null when it is not one the bot check knows. */
export function captchaAction(raw: string | null | undefined): BotCheckFlow | null {
  return (BOT_CHECK_FLOWS as readonly string[]).includes(raw ?? '') ? (raw as BotCheckFlow) : null
}

interface Carriers {
  ReactNativeWebView?: { postMessage: (data: string) => void }
  webkit?: { messageHandlers?: { captcha?: { postMessage: (data: unknown) => void } } }
  Captcha?: { postMessage: (data: string) => void }
  parent?: { postMessage: (data: unknown, targetOrigin: string) => void } | null
}

/** Hands the message to every carrier this page sits in; returns how many took it. */
export function deliverCaptcha(message: CaptchaMessage, w: Carriers & { parent?: unknown }, self: unknown = w): number {
  const json = JSON.stringify(message)
  let delivered = 0
  const tryIt = (fn: () => void) => { try { fn(); delivered++ } catch { /* that carrier is not there */ } }
  if (w.ReactNativeWebView) tryIt(() => w.ReactNativeWebView!.postMessage(json))
  const wk = w.webkit?.messageHandlers?.captcha
  if (wk) tryIt(() => wk.postMessage(message))
  if (w.Captcha) tryIt(() => w.Captcha!.postMessage(json))
  // Inside an iframe: the parent page. The token is one-use and bound to the flow's action; whoever
  // embeds the page has solved the challenge themselves, so any origin may receive it.
  const parent = w.parent as Carriers['parent']
  if (parent && parent !== self) tryIt(() => parent.postMessage(message, '*'))
  return delivered
}
