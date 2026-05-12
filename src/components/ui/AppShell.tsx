'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { env } from 'next-runtime-env'
import { BrandMark } from './BrandMark'
import { Icons } from './Icons'

interface AppShellProps {
  children: ReactNode
  /** When true, removes the top padding (used by full-bleed layouts). */
  flush?: boolean
}

type Theme = 'light' | 'dark' | 'system'

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.dark = dark ? '1' : '0'
}

export function AppShell({ children, flush }: AppShellProps) {
  const appName = env('NEXT_PUBLIC_APP_NAME') || 'Acme ID'
  const [theme, setTheme] = useState<Theme>('system')
  const [open, setOpen] = useState<'theme' | null>(null)

  useEffect(() => {
    const stored = (localStorage.getItem('theme') as Theme | null) || 'system'
    setTheme(stored)
    applyTheme(stored)
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onChange = () => { if (stored === 'system') applyTheme('system') }
    mq?.addEventListener('change', onChange)
    return () => mq?.removeEventListener('change', onChange)
  }, [])

  const setMode = (t: Theme) => {
    setTheme(t)
    localStorage.setItem('theme', t)
    applyTheme(t)
    setOpen(null)
  }

  const ThemeIcon = theme === 'dark' ? Icons.Moon : theme === 'light' ? Icons.Sun : Icons.Monitor

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <BrandMark size={26} />
          <span>{appName}</span>
        </div>
        <div className="app-header-spacer" />
        <div className="app-header-actions">
          <div className="dropdown-anchor">
            <button
              type="button"
              className="btn-icon"
              onClick={() => setOpen((o) => (o === 'theme' ? null : 'theme'))}
              aria-label="Theme"
            >
              <ThemeIcon size={16} />
            </button>
            {open === 'theme' && (
              <div className="menu" onClick={() => setOpen(null)}>
                <button type="button" className={`menu-item ${theme === 'light' ? 'active' : ''}`} onClick={() => setMode('light')}>
                  <Icons.Sun size={14} /> Light {theme === 'light' && <Icons.Check size={12} className="check" />}
                </button>
                <button type="button" className={`menu-item ${theme === 'dark' ? 'active' : ''}`} onClick={() => setMode('dark')}>
                  <Icons.Moon size={14} /> Dark {theme === 'dark' && <Icons.Check size={12} className="check" />}
                </button>
                <button type="button" className={`menu-item ${theme === 'system' ? 'active' : ''}`} onClick={() => setMode('system')}>
                  <Icons.Monitor size={14} /> System {theme === 'system' && <Icons.Check size={12} className="check" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-main" style={flush ? { padding: 0 } : undefined}>{children}</main>

      <footer className="app-footer">
        <span className="app-footer-status">
          <span className="status-dot" />
          All systems operational
        </span>
        <span className="app-footer-spacer" />
        <a href="#privacy">Privacy</a>
        <a href="#terms">Terms</a>
        <span className="muted">Powered by Ory Kratos</span>
      </footer>
    </div>
  )
}
