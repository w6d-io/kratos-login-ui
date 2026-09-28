import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WelcomeView, type WelcomeSite } from './WelcomeView'

afterEach(cleanup)

const site = (name: string, extra: Partial<WelcomeSite> = {}): WelcomeSite => ({
  name, displayName: name[0].toUpperCase() + name.slice(1), url: `https://${name}.example.test/`, hasLogo: false, accent: null, ...extra,
})

describe('WelcomeView', () => {
  it('links every site, marks the last used one, and remembers the pick before navigating', () => {
    const onPick = vi.fn()
    const sites = [site('payroll'), site('wiki', { hasLogo: true })]
    render(<WelcomeView state={{ kind: 'choose', sites, lastUsed: 'payroll' }} onPick={onPick} onRetry={() => {}} consoleUrl={null} />)
    const link = screen.getByRole('link', { name: /payroll/i })
    expect(link.getAttribute('href')).toBe('https://payroll.example.test/')
    expect(link.textContent).toMatch(/last used/i)
    expect(document.querySelector('img')!.getAttribute('src')).toBe('/api/branding/logo?host=wiki.example.test')
    fireEvent.click(link)
    expect(onPick).toHaveBeenCalledWith(sites[0])
  })

  it('offers a filter only for long lists', () => {
    const many = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'payroll'].map((n) => site(n))
    render(<WelcomeView state={{ kind: 'choose', sites: many, lastUsed: null }} onPick={() => {}} onRetry={() => {}} consoleUrl={null} />)
    fireEvent.change(screen.getByLabelText(/find an app/i), { target: { value: 'pay' } })
    expect(screen.getAllByRole('link', { name: /example\.test/ })).toHaveLength(1)
  })

  it('shows the console link when empty and a retry when unavailable', () => {
    const onRetry = vi.fn()
    const { rerender } = render(<WelcomeView state={{ kind: 'empty' }} onPick={() => {}} onRetry={onRetry} consoleUrl="https://console.test/" />)
    expect(screen.getByRole('link', { name: /admin console/i }).getAttribute('href')).toBe('https://console.test/')
    rerender(<WelcomeView state={{ kind: 'unavailable' }} onPick={() => {}} onRetry={onRetry} consoleUrl={null} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: /admin console/i })).toBeNull()
  })
})
