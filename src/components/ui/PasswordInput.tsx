'use client'

import { useState } from 'react'
import { Icons } from './Icons'

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
}

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
}: PasswordInputProps) {
  const [show, setShow] = useState(false)
  return (
    <div className="input-group">
      <input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        className={`input ${error ? 'has-error' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        required={required}
      />
      <div className="input-group-affix">
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <Icons.EyeOff size={16} /> : <Icons.Eye size={16} />}
        </button>
      </div>
    </div>
  )
}
