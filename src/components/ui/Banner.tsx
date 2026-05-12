import type { ReactNode } from 'react'
import { Icons } from './Icons'

export type BannerTone = 'info' | 'success' | 'warn' | 'danger'

interface BannerProps {
  tone?: BannerTone
  title?: ReactNode
  children?: ReactNode
  onDismiss?: () => void
}

export function Banner({ tone = 'info', title, children, onDismiss }: BannerProps) {
  const IconC =
    tone === 'danger' ? Icons.AlertCircle :
    tone === 'warn'   ? Icons.AlertTriangle :
    tone === 'success' ? Icons.CheckCircle :
    Icons.Info

  return (
    <div className={`banner ${tone}`} role={tone === 'danger' || tone === 'warn' ? 'alert' : 'status'}>
      <div className="banner-icon"><IconC size={16} /></div>
      <div className="banner-body">
        {title && <div className="banner-title">{title}</div>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button type="button" className="btn-icon" onClick={onDismiss} aria-label="Dismiss">
          <Icons.X size={14} />
        </button>
      )}
    </div>
  )
}
