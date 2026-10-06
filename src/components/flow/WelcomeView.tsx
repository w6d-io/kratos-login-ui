'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { FlowCard } from './FlowCard'
import { LastUsedBadge } from './Parts'
import { Icons } from '@/components/ui/Icons'

/** A site the signed-in person can open (structurally the flow side's MySite). */
export interface WelcomeSite {
  name: string
  displayName: string
  url: string
  hasLogo: boolean
  accent: string | null
}

/**
 * "Where to?" — shown when a flow finished without a return_to and the
 * visitor can reach several sites (or none, or jinbe is down). Redirects and
 * sign-in happen before this renders; it only draws the choice.
 */
export interface WelcomeViewProps {
  state:
    | { kind: 'choose'; sites: WelcomeSite[]; lastUsed: string | null }
    | { kind: 'empty' }
    | { kind: 'unavailable' }
  /** Called before navigating to the picked site (remembers the choice). */
  onPick: (site: WelcomeSite) => void
  onRetry: () => void
  /** Admin console (kuma) link, or null when not configured. */
  consoleUrl: string | null
}

/** Long lists get a filter; short ones don't need the extra field. */
const FILTER_FROM = 7

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** The site's logo, or its initial on a tint of its accent (text stays --color-text, so contrast holds). */
function SiteTile({ site }: { site: WelcomeSite }) {
  const [failed, setFailed] = useState(false)
  const host = hostOf(site.url)
  if (site.hasLogo && host && !failed) {
    return (
      <img
        className="site-tile"
        src={`/api/branding/logo?host=${encodeURIComponent(host)}`}
        alt=""
        width={32}
        height={32}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    )
  }
  const style = site.accent ? ({ '--tile-accent': site.accent } as CSSProperties) : undefined
  return <span className="site-tile" data-accent={site.accent ? '' : undefined} style={style} aria-hidden>{site.displayName.charAt(0).toUpperCase()}</span>
}

function Footer({ consoleUrl }: { consoleUrl: string | null }) {
  return (
    <span className="welcome-foot">
      <a href="/settings">Account settings</a>
      <a href="/account">Organizations</a>
      {consoleUrl && <a href={consoleUrl}>Admin console</a>}
      <a href="/logout">Sign out</a>
    </span>
  )
}

export function WelcomeView({ state, onPick, onRetry, consoleUrl }: WelcomeViewProps) {
  const [query, setQuery] = useState('')
  const sites = useMemo(() => (state.kind === 'choose' ? state.sites : []), [state])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sites
    return sites.filter((s) => s.displayName.toLowerCase().includes(q) || hostOf(s.url).includes(q))
  }, [sites, query])

  if (state.kind === 'unavailable') {
    return (
      <FlowCard
        icon={<Icons.Plug size={20} />}
        title="We can’t list your apps right now"
        subtitle="You’re signed in — nothing is wrong with your account. The list didn’t load; try again in a moment."
        footer={<Footer consoleUrl={consoleUrl} />}
      >
        <button type="button" className="btn btn-primary btn-block" onClick={onRetry}>
          <Icons.RefreshCcw size={16} /> Try again
        </button>
      </FlowCard>
    )
  }

  if (state.kind === 'empty') {
    return (
      <FlowCard
        icon={<Icons.Globe size={20} />}
        title="No apps yet"
        subtitle="You’re signed in, but your account hasn’t been given access to any app. Ask your administrator to add you — then come back here."
        footer={<Footer consoleUrl={consoleUrl} />}
      />
    )
  }

  return (
    <FlowCard
      icon={<Icons.Globe size={20} />}
      title="Where to?"
      subtitle="You’re signed in. Pick the app you want to open."
      footer={<Footer consoleUrl={consoleUrl} />}
    >
      {sites.length >= FILTER_FROM && (
        <div className="field" style={{ marginBottom: 'var(--space-4)' }}>
          <label htmlFor="site-filter" className="sr-only">Find an app</label>
          <input
            id="site-filter"
            type="search"
            className="input"
            placeholder="Find an app"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </div>
      )}
      {shown.length === 0 ? (
        <p className="muted text-center" role="status" style={{ margin: 0 }}>No app matches “{query}”.</p>
      ) : (
        <ul className="method-list" aria-label="Your apps" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {shown.map((s) => (
            <li key={s.name}>
              <a href={s.url} className="method-btn site-link" onClick={() => onPick(s)}>
                <SiteTile site={s} />
                <span className="method-btn-text">
                  <span>{s.displayName}</span>
                  <span className="method-btn-hint">{hostOf(s.url)}</span>
                </span>
                {state.lastUsed === s.name && <LastUsedBadge />}
                <Icons.ChevronRight size={16} className="method-btn-chevron" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </FlowCard>
  )
}
