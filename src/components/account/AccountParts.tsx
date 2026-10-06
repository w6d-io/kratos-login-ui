'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Checkbox } from '@/components/ui/Checkbox'
import { initFlowUrl } from '@/lib/ory'
import { accountApi, errorText, roleLabel, roleText, type ApiAnswer, type OrgRoleOption } from '@/lib/account'

/** The session ended while on the page: sign in again, coming back here. */
export function signInAgain() {
  window.location.assign(initFlowUrl('login', window.location.href))
}

export type Loaded<T> = { kind: 'loading' } | { kind: 'ok'; data: T } | { kind: 'error'; message: string }

/** One GET through /api/account, parsed (`parse` must be stable: a module function); reload() asks again. A 401 sends the person to sign in. */
export function useAccountGet<T>(path: string | null, parse: (raw: unknown) => T): { state: Loaded<T>; reload: () => void } {
  const [state, setState] = useState<Loaded<T>>({ kind: 'loading' })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) return
    let live = true
    void accountApi('GET', path).then((a) => {
      if (!live) return
      if (a.status === 401) { signInAgain(); return }
      setState(a.ok ? { kind: 'ok', data: parse(a.data) } : { kind: 'error', message: errorText(a, 'This didn’t load. Try again in a moment.') })
    })
    return () => { live = false }
  }, [path, tick, parse])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { state, reload }
}

/** Runs one change; returns the answer, after sending a 401 to sign in. */
export async function change(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<ApiAnswer> {
  const a = await accountApi(method, path, body)
  if (a.status === 401) signInAgain()
  return a
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <p className="muted" role="alert" style={{ margin: 0 }}>
      {message}{' '}
      <button type="button" className="btn-link" onClick={onRetry}>Try again</button>
    </p>
  )
}

export function LoadingLine({ label = 'Loading…' }: { label?: string }) {
  return <p className="muted" role="status" style={{ margin: 0 }}><span className="spinner" aria-hidden /> {label}</p>
}

export function RoleChips({ roles, empty = 'No roles' }: { roles: string[]; empty?: string }) {
  if (roles.length === 0) return <span className="muted">{empty}</span>
  return (
    <span className="role-chips">
      {roles.map((r) => <span key={r} className="badge" title={roleLabel(r).hint ?? undefined}>{roleText(r)}</span>)}
    </span>
  )
}

/**
 * The org roles to tick. A role the person may not hand out stays unticked; one already held may
 * still be taken away (a removal needs only the right to manage members).
 */
export function RolePicker({ options, value, held = [], onChange, legend }: {
  options: OrgRoleOption[]
  value: string[]
  held?: string[]
  onChange: (roles: string[]) => void
  legend: string
}) {
  const shown = options.filter((o) => o.assignable || held.includes(o.role))
  if (shown.length === 0) return <p className="muted small" style={{ margin: 0 }}>There are no roles you can give here.</p>
  return (
    <fieldset className="role-picker">
      <legend className="field-label">{legend}</legend>
      {shown.map((o) => {
        const { hint } = roleLabel(o.role)
        const on = value.includes(o.role)
        const locked = !o.assignable && !on
        return (
          <div key={o.role} className={locked ? 'role-option locked' : 'role-option'}>
            {locked ? (
              <span className="small muted">{roleText(o.role)} — you can’t give this role</span>
            ) : (
              <Checkbox checked={on} onChange={(c) => onChange(c ? [...value, o.role] : value.filter((r) => r !== o.role))}>
                {roleText(o.role)}{hint && <span className="muted"> — {hint}</span>}
              </Checkbox>
            )}
          </div>
        )
      })}
    </fieldset>
  )
}

/** A destructive action that asks once, in place, before it runs. */
export function ConfirmAction({ label, question, confirmLabel, onConfirm, busy, ariaLabel }: {
  label: string
  question: ReactNode
  confirmLabel: string
  onConfirm: () => void
  busy?: boolean
  ariaLabel?: string
}) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAsking(true)} aria-label={ariaLabel} disabled={busy}>{label}</button>
  }
  return (
    <span className="confirm-inline" role="group" aria-label={ariaLabel ?? label}>
      <span className="small">{question}</span>
      <button type="button" className="btn btn-danger btn-sm" onClick={() => { setAsking(false); onConfirm() }} disabled={busy}>{confirmLabel}</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsking(false)}>Cancel</button>
    </span>
  )
}
