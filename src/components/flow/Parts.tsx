'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Icons } from '@/components/ui/Icons'
import { evaluatePassword } from './password-rules'
import { cooldownUntil, formatCountdown, secondsLeft, setCooldownUntil } from './prefs'

/** Who this step is for, with a way out if it is the wrong account. */
export function AccountChip({ identifier, switchHref, switchLabel = 'Not you?' }: { identifier: string; switchHref?: string; switchLabel?: string }) {
  if (!identifier) return null
  return (
    <div className="account-chip">
      <span className="account-chip-avatar" aria-hidden>{identifier.charAt(0).toUpperCase()}</span>
      <span className="account-chip-id" title={identifier}>
        <span className="sr-only">Signed in as </span><span>{identifier}</span>
      </span>
      {switchHref && <a href={switchHref}>{switchLabel}</a>}
    </div>
  )
}

/** Content for a .method-btn: icon, title, optional hint and badge, chevron. */
export function MethodContent({ icon, title, hint, badge, chevron = true }: { icon: ReactNode; title: ReactNode; hint?: ReactNode; badge?: ReactNode; chevron?: boolean }) {
  return (
    <>
      <span className="method-btn-icon">{icon}</span>
      <span className="method-btn-text">
        <span>{title}</span>
        {hint && <span className="method-btn-hint">{hint}</span>}
      </span>
      {badge}
      {chevron && <Icons.ChevronRight size={16} className="method-btn-chevron" />}
    </>
  )
}

export function LastUsedBadge() {
  return <span className="badge info">Last used</span>
}

export function MethodButton({ onClick, disabled, ...content }: Parameters<typeof MethodContent>[0] & { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="method-btn" onClick={onClick} disabled={disabled}>
      <MethodContent {...content} />
    </button>
  )
}

/** Live password checklist + strength meter, shown while typing — not after a failed submit. */
export function PasswordRules({ password, identifier, id }: { password: string; identifier: string; id?: string }) {
  const report = evaluatePassword(password, identifier)
  return (
    <div id={id}>
      <div className="pw-meter" data-score={report.score} aria-hidden>
        <span /><span /><span /><span />
      </div>
      <ul className="pw-rules" aria-label="Password requirements">
        {report.rules.map((r) => (
          <li key={r.id} className="pw-rule" data-state={r.state}>
            {r.state === 'met' ? <Icons.CheckCircle size={13} /> : r.state === 'unmet' ? <Icons.AlertCircle size={13} /> : r.state === 'server' ? <Icons.ShieldCheck size={13} /> : <Icons.Info size={13} />}
            <span>
              {r.label}
              <span className="sr-only">{r.state === 'met' ? ' — done' : r.state === 'unmet' ? ' — not yet' : ''}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="pw-strength" aria-live="polite">
        {report.strength && <>Strength: <strong>{report.strength}</strong></>}
      </div>
    </div>
  )
}

/**
 * "Didn't get it? Resend" with a cooldown. The cooldown starts when the screen appears (a code was
 * just sent) and survives a reload, keyed by the flow; the button says how long is left instead of
 * silently doing nothing.
 */
export function ResendCode({
  onResend,
  cooldownKey,
  seconds = 30,
  prompt = 'Didn’t get it?',
  label = 'Resend code',
}: {
  onResend: () => void | Promise<unknown>
  cooldownKey: string
  seconds?: number
  prompt?: string
  label?: string
}) {
  // A stored deadline (even a past one) wins; otherwise the code was just sent — start now.
  // Rendered only on the client (after the flow loads), so reading storage here is safe.
  const [until, setUntil] = useState(() => {
    const stored = cooldownUntil(cooldownKey)
    if (stored) return stored
    const start = Date.now() + seconds * 1000
    setCooldownUntil(cooldownKey, start)
    return start
  })
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [sentAgain, setSentAgain] = useState(false)

  const left = secondsLeft(until, now)
  useEffect(() => {
    if (left <= 0) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [left])

  const resend = async () => {
    setBusy(true)
    try {
      await onResend()
      const next = Date.now() + seconds * 1000
      setCooldownUntil(cooldownKey, next)
      setUntil(next)
      setNow(Date.now())
      setSentAgain(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <p className="resend">
      {prompt}{' '}
      <button type="button" className="btn-link" onClick={resend} disabled={busy || left > 0}>
        {busy ? 'Sending…' : left > 0 ? <>{label} in <span className="countdown">{formatCountdown(left)}</span></> : label}
      </button>
      <span className="sr-only" aria-live="polite">{sentAgain ? 'A new code is on its way.' : ''}</span>
    </p>
  )
}

/** Copy to clipboard with a visible and announced "Copied". */
export function CopyButton({ text, label = 'Copy', className = 'btn btn-secondary btn-sm' }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(t)
  }, [copied])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      /* clipboard blocked: the text stays selectable on screen */
    }
  }
  return (
    <button type="button" className={className} onClick={copy}>
      {copied ? <Icons.Check size={14} /> : <Icons.Copy size={14} />}
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  )
}
