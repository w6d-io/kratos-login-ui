import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { OtpInput } from './OtpInput'
import { Field } from './Field'
import { PasswordInput } from './PasswordInput'
import { brandingStyle } from './Branding'
import { ResendCode } from '@/components/flow/Parts'
import type { SiteBranding } from '@/lib/branding'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

function Otp({ onSubmit }: { onSubmit: () => void }) {
  const [v, setV] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
      <OtpInput id="c" value={v} onChange={setV} />
      <output data-testid="v">{v}</output>
    </form>
  )
}

describe('OtpInput', () => {
  beforeEach(() => {
    // jsdom has no requestSubmit; dispatch a submit event like the browser would.
    HTMLFormElement.prototype.requestSubmit = function () { this.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })) }
  })

  it('offers the OS one-time-code autofill on the first box only', () => {
    render(<Otp onSubmit={() => {}} />)
    const boxes = screen.getAllByRole('textbox')
    expect(boxes).toHaveLength(6)
    expect(boxes[0].getAttribute('autocomplete')).toBe('one-time-code')
    expect(boxes[1].getAttribute('autocomplete')).toBe('off')
  })

  it('spreads a pasted code across the boxes and submits once', () => {
    const submit = vi.fn()
    render(<Otp onSubmit={submit} />)
    fireEvent.paste(screen.getByRole('group'), { clipboardData: { getData: () => 'Code: 123-456' } })
    expect(screen.getByTestId('v').textContent).toBe('123456')
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('spreads an autofilled code typed into the first box', () => {
    const submit = vi.fn()
    render(<Otp onSubmit={submit} />)
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '654321' } })
    expect(screen.getByTestId('v').textContent).toBe('654321')
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('moves back on Backspace from an empty box', () => {
    render(<Otp onSubmit={() => {}} />)
    const boxes = screen.getAllByRole('textbox')
    fireEvent.change(boxes[0], { target: { value: '1' } })
    fireEvent.change(boxes[1], { target: { value: '2' } })
    fireEvent.keyDown(boxes[2], { key: 'Backspace' })
    expect(screen.getByTestId('v').textContent).toBe('1')
    expect(document.activeElement).toBe(boxes[1])
  })
})

describe('Field', () => {
  it('ties the error to the control and marks it invalid', () => {
    render(<Field label="Email" htmlFor="e" error="Not an email"><input id="e" /></Field>)
    const input = screen.getByLabelText('Email')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe('e-error')
    expect(document.getElementById('e-error')?.textContent).toContain('Not an email')
  })

  it('points at the hint when there is no error', () => {
    render(<Field label="Email" htmlFor="e" hint="Work address"><input id="e" /></Field>)
    expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBe('e-hint')
  })
})

describe('PasswordInput', () => {
  it('toggles visibility with a pressed-state button', () => {
    render(<PasswordInput id="p" value="secret" onChange={() => {}} />)
    const toggle = screen.getByRole('button', { name: /show password/i })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByDisplayValue('secret').getAttribute('type')).toBe('text')
    expect(screen.getByRole('button', { name: /hide password/i }).getAttribute('aria-pressed')).toBe('true')
  })

  it('warns while Caps Lock is on', () => {
    render(<PasswordInput id="p" value="" onChange={() => {}} />)
    const input = document.getElementById('p')!
    fireEvent.keyDown(input, { key: 'A', modifierCapsLock: true })
    expect(screen.getByText(/caps lock is on/i)).toBeTruthy()
    expect(input.getAttribute('aria-describedby')).toContain('p-caps')
    fireEvent.blur(input)
    expect(screen.queryByText(/caps lock is on/i)).toBeNull()
  })
})

describe('ResendCode', () => {
  function memoryStorage(): Storage {
    const m = new Map<string, string>()
    return { get length() { return m.size }, clear: () => m.clear(), getItem: (k) => m.get(k) ?? null, key: () => null, removeItem: (k) => { m.delete(k) }, setItem: (k, v) => { m.set(k, String(v)) } }
  }

  it('waits out the cooldown, then resends and restarts it', async () => {
    vi.stubGlobal('localStorage', memoryStorage())
    vi.useFakeTimers()
    const resend = vi.fn(async () => {})
    render(<ResendCode onResend={resend} cooldownKey="t" seconds={3} />)
    const btn = screen.getByRole('button')
    expect(btn.textContent).toMatch(/resend code in 0:03/i)
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { vi.advanceTimersByTime(3100) })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
    await act(async () => { fireEvent.click(btn) })
    expect(resend).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button').textContent).toMatch(/in 0:03/)
    expect(screen.getByText(/new code is on its way/i)).toBeTruthy()
  })
})

describe('brandingStyle', () => {
  const base: SiteBranding = { host: 'x.test', name: 'x', displayName: 'X', hasLogo: false, accent: null, welcome: null, helpUrl: null, minAal: null, scope: null }

  it('is empty without an accent', () => {
    expect(brandingStyle(base)).toBeUndefined()
    expect(brandingStyle(null)).toBeUndefined()
  })

  it('maps a vetted accent to buttons, and to links only when it reads as text', () => {
    const dark = brandingStyle({ ...base, accent: '#1F4FB0' }) as Record<string, string>
    expect(dark['--brand-accent']).toBe('#1F4FB0')
    expect(dark['--brand-on-accent']).toBe('#FFFFFF')
    expect(dark['--brand-link']).toBe('#1F4FB0')
    const mid = brandingStyle({ ...base, accent: '#3B82F6' }) as Record<string, string>
    expect(mid['--brand-link']).toBeUndefined()
  })
})
