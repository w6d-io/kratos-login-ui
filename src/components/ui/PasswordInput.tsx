'use client'

import { useState, type KeyboardEvent } from 'react'
import { Icons } from './Icons'
import { joinIds } from './Field'

interface PasswordInputProps {
  id?: string
  name?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  error?: boolean
  autoComplete?: string
  required?: boolean
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

/** Password field with a show/hide toggle and a Caps Lock warning while it has focus. */
export function PasswordInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  autoFocus,
  error,
  autoComplete = 'current-password',
  required,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: PasswordInputProps) {
  const [show, setShow] = useState(false)
  const [caps, setCaps] = useState(false)
  const capsId = id ? `${id}-caps` : undefined
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.('CapsLock') ?? false)

  return (
    <>
      <div className="input-group">
        <input
          id={id}
          name={name}
          type={show ? 'text' : 'password'}
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          onKeyUp={onKey}
          onBlur={() => setCaps(false)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required={required}
          aria-invalid={invalid || error || undefined}
          aria-describedby={joinIds(describedBy, caps && capsId)}
        />
        <div className="input-affix">
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
            aria-controls={id}
          >
            {show ? <Icons.EyeOff size={16} /> : <Icons.Eye size={16} />}
          </button>
        </div>
      </div>
      {caps && (
        <div className="caps-hint" id={capsId}>
          <Icons.ArrowUp size={13} /> Caps Lock is on
        </div>
      )}
    </>
  )
}
