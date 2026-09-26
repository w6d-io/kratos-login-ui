import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { Icons } from './Icons'

interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  hintLink?: ReactNode
  error?: ReactNode
  /** Kept for callers; every field is required unless marked optional, so no asterisk is drawn. */
  required?: boolean
  optional?: boolean
  children: ReactNode
  htmlFor?: string
  /** Rendered under the control, after the error/hint (e.g. live password rules). */
  after?: ReactNode
}

/**
 * Label, control, then one line under it: the error when there is one, the hint otherwise. The
 * control is wired to that line with aria-describedby and marked aria-invalid, so a screen reader
 * reads the problem with the field instead of somewhere else on the page.
 */
export function Field({ label, hint, hintLink, error, optional, children, htmlFor, after }: FieldProps) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined
  const describedBy = error ? errorId : hint ? hintId : undefined

  const only = Children.count(children) === 1 ? Children.only(children) : null
  const control = only && isValidElement(only)
    ? cloneElement(only as ReactElement<Record<string, unknown>>, {
        'aria-describedby': joinIds((only.props as Record<string, unknown>)['aria-describedby'] as string | undefined, describedBy),
        'aria-invalid': error ? true : undefined,
      })
    : children

  return (
    <div className="field">
      {label && (
        <div className="field-label">
          <label htmlFor={htmlFor}>
            {label}
            {optional && <span className="opt"> (optional)</span>}
          </label>
          {hintLink}
        </div>
      )}
      {control}
      {error ? (
        <div className="field-error" id={errorId} role="alert">
          <Icons.AlertCircle size={13} /> <span>{error}</span>
        </div>
      ) : hint ? (
        <div className="field-hint" id={hintId}>{hint}</div>
      ) : null}
      {after}
    </div>
  )
}

export function joinIds(...ids: Array<string | undefined | null | false>): string | undefined {
  const s = ids.filter(Boolean).join(' ')
  return s || undefined
}
