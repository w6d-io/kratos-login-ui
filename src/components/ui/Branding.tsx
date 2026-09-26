'use client'

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { accentVars, brandingTarget, contrastRatio, type SiteBranding } from '@/lib/branding'
import { Icons } from './Icons'

/**
 * Per-site branding for every page under AppShell. The site is picked from a
 * return_to — the URL's own `return_to` on first load, or the Kratos flow's
 * `return_to` once a page has fetched its flow (Kratos redirects to
 * `?flow=<id>` and drops the query param). The server route validates it
 * and asks jinbe; any failure keeps platform branding.
 *
 * Branding never replaces the platform identity: the header brand and the
 * sign-in domain line stay, so a branded page can't pass for a site's own
 * login form.
 */

interface BrandingState {
  branding: SiteBranding | null
  setReturnTo: (url: string) => void
}

const BrandingContext = createContext<BrandingState>({ branding: null, setReturnTo: () => {} })

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [returnTo, setReturnTo] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('return_to'),
  )
  const [branding, setBranding] = useState<SiteBranding | null>(null)

  useEffect(() => {
    if (!returnTo) return
    const ctl = new AbortController()
    const target = brandingTarget(returnTo, window.location.origin)
    fetch(`/api/branding?return_to=${encodeURIComponent(target)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { branding?: SiteBranding | null } | null) => setBranding(d?.branding ?? null))
      .catch(() => {})
    return () => ctl.abort()
  }, [returnTo])

  return <BrandingContext.Provider value={{ branding, setReturnTo }}>{children}</BrandingContext.Provider>
}

export function useBranding() {
  return useContext(BrandingContext)
}

/** Pages call this with their flow's return_to so branding follows the flow. */
export function useBrandingReturnTo(url: string | null | undefined) {
  const { setReturnTo } = useBranding()
  useEffect(() => {
    if (url) setReturnTo(url)
  }, [url, setReturnTo])
}

/**
 * Inline custom properties for a site's vetted accent; base.css maps them onto --color-primary*
 * (buttons, both themes) and, in the light theme, the focus ring — and links too when the accent
 * reads as text (4.5:1 on white). Absent accent → undefined, platform palette.
 */
export function brandingStyle(b: SiteBranding | null): CSSProperties | undefined {
  if (!b?.accent) return undefined
  const v = accentVars(b.accent)
  const style: Record<string, string> = {
    '--brand-accent': v['--primary'],
    '--brand-accent-hover': v['--primary-hover'],
    '--brand-on-accent': v['--primary-fg'],
  }
  if (contrastRatio(b.accent, '#FFFFFF') >= 4.5) style['--brand-link'] = b.accent
  return style as CSSProperties
}

export function SiteBrand() {
  const { branding } = useBranding()
  const [logoFailed, setLogoFailed] = useState(false)
  if (!branding) return null
  return (
    <div className="site-brand">
      {branding.hasLogo && !logoFailed && (
        <img
          className="site-brand-logo"
          src={`/api/branding/logo?host=${encodeURIComponent(branding.host)}`}
          alt=""
          width={40}
          height={40}
          referrerPolicy="no-referrer"
          onError={() => setLogoFailed(true)}
        />
      )}
      <div className="site-brand-text">
        <div className="site-brand-name">{branding.displayName}</div>
        {branding.welcome && <div className="site-brand-welcome">{branding.welcome}</div>}
      </div>
      {branding.helpUrl && (
        <a className="site-brand-help" href={branding.helpUrl} target="_blank" rel="noopener noreferrer">
          Need help?<span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  )
}

const noopSubscribe = () => () => {}

/** "🔒 auth.example.com · <Platform> account" — shown on every page, branded or not. */
export function SignInDomain({ appName }: { appName: string }) {
  const host = useSyncExternalStore(noopSubscribe, () => window.location.host, () => '')
  return (
    <p className="signin-domain">
      <Icons.Lock size={12} />
      <span>
        {host && <strong>{host}</strong>}
        {host && ' · '}
        {appName} account
      </span>
    </p>
  )
}
