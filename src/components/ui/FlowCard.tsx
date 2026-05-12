import type { ReactNode } from 'react'

interface FlowCardProps {
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Optional content rendered below the card (e.g. "Powered by Ory"). */
  tinyFoot?: ReactNode
}

export function FlowCard({ title, subtitle, children, footer, tinyFoot }: FlowCardProps) {
  return (
    <>
      <div className="card">
        {(title || subtitle) && (
          <div className="card-head">
            {title && <h1>{title}</h1>}
            {subtitle && <p>{subtitle}</p>}
          </div>
        )}
        <div className="card-body">{children}</div>
        {footer && <div className="card-foot">{footer}</div>}
      </div>
      {tinyFoot && <div className="card-tiny-foot">{tinyFoot}</div>}
    </>
  )
}
