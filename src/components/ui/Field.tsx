import type { ReactNode } from 'react'
import { Icons } from './Icons'

interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  hintLink?: ReactNode
  error?: ReactNode
  required?: boolean
  optional?: boolean
  children: ReactNode
  htmlFor?: string
}

export function Field({ label, hint, hintLink, error, required, optional, children, htmlFor }: FieldProps) {
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          <span>
            {label}
            {required && <span className="req">*</span>}
            {optional && <span className="opt"> (optional)</span>}
          </span>
          {hintLink}
        </label>
      )}
      {children}
      {error && (
        <div className="field-error" role="alert">
          <Icons.AlertCircle size={12} /> {error}
        </div>
      )}
      {!error && hint && <div className="field-hint">{hint}</div>}
    </div>
  )
}
