'use client'

import { useEffect, useRef } from 'react'

interface OtpInputProps {
  value: string
  onChange: (v: string) => void
  length?: number
  /** id of the first box, so a <label htmlFor> focuses it. */
  id?: string
  autoFocus?: boolean
  /** Submit the enclosing form once every box is filled (typed, pasted or autofilled). */
  autoSubmit?: boolean
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

/**
 * One box per digit, but it behaves like one field: paste or SMS/email autofill anywhere fills
 * them all, typing moves on, Backspace moves back, arrows move freely. The first box carries
 * autocomplete="one-time-code" so the OS offers the code it just received.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  id,
  autoFocus = true,
  autoSubmit = true,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const submitted = useRef<string | null>(null)
  const chars = value.padEnd(length, ' ').slice(0, length).split('')

  useEffect(() => {
    if (value.length < length || !/^\d+$/.test(value)) {
      submitted.current = null
      return
    }
    if (!autoSubmit || submitted.current === value) return
    submitted.current = value
    refs.current[0]?.form?.requestSubmit()
  }, [value, length, autoSubmit])

  const focus = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(length - 1, i))]
    el?.focus()
    el?.select()
  }

  /** Write `digits` starting at box `from`, then focus the box after the last one written. */
  const fill = (from: number, digits: string) => {
    const arr = chars.slice()
    const d = digits.slice(0, length - from)
    for (let k = 0; k < d.length; k++) arr[from + k] = d[k]
    onChange(arr.join('').replace(/\s+$/, ''))
    focus(from + d.length)
  }

  const handleChange = (i: number, raw: string) => {
    let digits = raw.replace(/\D/g, '')
    // Typing over a filled first box (its maxLength is open) appends; keep only the new digit.
    if (digits.length === 2 && chars[i].trim()) digits = digits.replace(chars[i], '')
    if (!digits) {
      const arr = chars.slice()
      arr[i] = ' '
      onChange(arr.join('').replace(/\s+$/, ''))
      return
    }
    // A whole code arriving in one box (autofill, IME) is spread across all of them.
    if (digits.length > 1) return fill(digits.length >= length ? 0 : i, digits)
    fill(i, digits)
  }

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && chars[i] === ' ' && i > 0) {
      e.preventDefault()
      const arr = chars.slice()
      arr[i - 1] = ' '
      onChange(arr.join('').replace(/\s+$/, ''))
      focus(i - 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focus(i - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      focus(i + 1)
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!digits) return
    e.preventDefault()
    fill(0, digits)
  }

  const half = length % 2 === 0 ? length / 2 : -1
  return (
    <div
      className="otp"
      role="group"
      aria-label={`${length}-digit code`}
      aria-describedby={describedBy}
      data-invalid={invalid || undefined}
      onPaste={handlePaste}
    >
      {Array.from({ length }).map((_, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i === half && <span className="otp-gap" aria-hidden />}
          <input
            ref={(el) => { refs.current[i] = el }}
            id={i === 0 ? id : undefined}
            name={i === 0 ? 'code' : undefined}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            autoFocus={autoFocus && i === 0}
            // maxLength stays open on the first box so OS autofill can drop the whole code in it.
            maxLength={i === 0 ? length : 1}
            value={chars[i].trim()}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            onFocus={(e) => e.target.select()}
            aria-label={`Digit ${i + 1} of ${length}`}
            aria-invalid={invalid || undefined}
          />
        </span>
      ))}
    </div>
  )
}
