import type { ReactNode } from 'react'

interface CheckboxProps {
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
}

export function Checkbox({ checked, onChange, children }: CheckboxProps) {
  return (
    <label className="checkbox-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="checkbox-mark">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  )
}
