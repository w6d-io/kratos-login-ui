'use client'

import { useEffect, useRef, type ReactNode } from 'react'

interface FlowCardProps {
  /** A small icon tile above the title — what kind of step this is at a glance. */
  icon?: ReactNode
  tone?: 'neutral' | 'success' | 'warn' | 'danger'
  title: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
  footer?: ReactNode
}

/**
 * The one card every sign-in step is drawn in. When a step appears and nothing inside it took
 * focus (no autofocus field), focus moves to its heading, so keyboard and screen-reader users
 * land on the new step instead of wherever the old one left them.
 */
export function FlowCard({ icon, tone = 'neutral', title, subtitle, children, footer }: FlowCardProps) {
  const card = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const active = document.activeElement
    if (!card.current || (active && active !== document.body && card.current.contains(active))) return
    // Leave focus alone if the person is working elsewhere on the page (e.g. the theme menu).
    if (active && active !== document.body && !active.closest('.card')) return
    heading.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div className="card" ref={card}>
      <div className={`card-head ${children ? '' : 'solo'}`}>
        {icon && <div className={`card-icon ${tone === 'neutral' ? '' : tone}`} aria-hidden>{icon}</div>}
        <h1 ref={heading} tabIndex={-1}>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="card-body">{children}</div>}
      {footer && <div className="card-foot">{footer}</div>}
    </div>
  )
}
