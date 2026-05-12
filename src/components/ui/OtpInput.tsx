'use client'

import { useRef } from 'react'

interface OtpInputProps {
  value: string
  onChange: (v: string) => void
  length?: number
}

export function OtpInput({ value, onChange, length = 6 }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const chars = value.padEnd(length, ' ').slice(0, length).split('')
  const set = (i: number, c: string) => {
    const arr = chars.slice()
    arr[i] = c
    onChange(arr.join('').replace(/\s+$/, ''))
  }
  const handleChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '').slice(-1)
    if (!v) return set(i, ' ')
    set(i, v)
    if (i < length - 1) refs.current[i + 1]?.focus()
  }
  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (chars[i] !== ' ') {
        set(i, ' ')
        return
      }
      if (i > 0) refs.current[i - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus()
  }
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const txt = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (txt) {
      e.preventDefault()
      onChange(txt)
      refs.current[Math.min(txt.length, length - 1)]?.focus()
    }
  }
  return (
    <div className="otp" onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          inputMode="numeric"
          maxLength={1}
          value={chars[i].trim()}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKey(i, e)}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  )
}
