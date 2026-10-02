'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { env } from 'next-runtime-env'
import { config } from '@/lib/config'
import { HeaderBrand } from './HeaderBrand'
import { BrandLogoProvider } from './BrandLogo'
import type { BrandLogos } from '@/lib/brand-logo'
import { Icons } from './Icons'
import { BrandingProvider, SignInDomain, SiteBrand, brandingStyle, useBranding } from './Branding'

interface AppShellProps {
  children: ReactNode
  /** Install logos from the LOGO_* env (validated server-side); absent → letter tile. */
  logos?: Omit<BrandLogos, 'faviconUrl'>
}

type Theme = 'light' | 'dark' | 'system'

const THEMES: Array<{ id: Theme; label: string; icon: keyof typeof Icons }> = [
  { id: 'light', label: 'Light', icon: 'Sun' },
  { id: 'dark', label: 'Dark', icon: 'Moon' },
  { id: 'system', label: 'Match system', icon: 'Monitor' },
]

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.dark = dark ? '1' : '0'
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('theme')
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

export function AppShell(props: AppShellProps) {
  return (
    <BrandingProvider>
      <Shell {...props} />
    </BrandingProvider>
  )
}

function ThemeMenu() {
  const [theme, setTheme] = useState<Theme>('system')
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const stored = readTheme()
    setTheme(stored)
    applyTheme(stored)
  }, [])

  // Follow the OS while on "system".
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq?.addEventListener('change', onChange)
    return () => mq?.removeEventListener('change', onChange)
  }, [theme])

  // Close on outside click and Escape; Escape returns focus to the trigger.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!anchor.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    anchor.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (t: Theme) => {
    setTheme(t)
    try { localStorage.setItem('theme', t) } catch { /* private mode */ }
    applyTheme(t)
    setOpen(false)
    trigger.current?.focus()
  }

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(anchor.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }

  const Current = Icons[THEMES.find((t) => t.id === theme)?.icon ?? 'Monitor']
  return (
    <div className="dropdown-anchor" ref={anchor}>
      <button
        ref={trigger}
        type="button"
        className="btn-icon"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Colour theme: ${THEMES.find((t) => t.id === theme)?.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Current size={16} />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Colour theme" onKeyDown={onMenuKey}>
          {THEMES.map((t) => {
            const I = Icons[t.icon]
            return (
              <button key={t.id} type="button" role="menuitemradio" aria-checked={theme === t.id} className="menu-item" onClick={() => choose(t.id)}>
                <I size={14} /> {t.label} {theme === t.id && <Icons.Check size={12} className="check" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Shell({ children, logos }: AppShellProps) {
  const { branding } = useBranding()
  const appName = env('NEXT_PUBLIC_APP_NAME') || 'Acme ID'
  const wide = usePathname()?.startsWith('/settings') ?? false
  const footer = config.footer
  const links = footer.links.filter((l) => typeof l?.url === 'string' && /^(https?:\/\/|\/(?!\/))/.test(l.url))

  const brandLogo = {
    appName,
    logoUrl: logos?.logoUrl ?? null,
    logoDarkUrl: logos?.logoDarkUrl ?? null,
    logoSmallUrl: logos?.logoSmallUrl ?? null,
    logoShowsName: logos?.logoShowsName ?? true,
  }

  return (
    <BrandLogoProvider value={brandLogo}>
      <div className="app" style={brandingStyle(branding)} data-branded={branding?.accent ? '' : undefined}>
        <a href="#main" className="skip-link">Skip to content</a>
        <header className="app-header">
          <HeaderBrand />
          <div className="app-header-spacer" />
          <ThemeMenu />
        </header>

        <main className="app-main" id="main">
          <div className={`flow-column ${wide ? 'wide' : ''}`}>
            {!wide && <SiteBrand />}
            {children}
            <SignInDomain appName={appName} />
          </div>
        </main>

        {(footer.text || links.length > 0) && (
          <footer className="app-footer">
            {footer.text && <span>{footer.text}</span>}
            <span className="app-footer-spacer" />
            {links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>
            ))}
          </footer>
        )}
      </div>
    </BrandLogoProvider>
  )
}
