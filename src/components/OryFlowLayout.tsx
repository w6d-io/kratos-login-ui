'use client'

import type { ReactNode } from 'react'

/**
 * Thin wrapper around flow content. The page-level shell (header, footer,
 * brand, locale/theme) lives in AppShell — this component is now a no-op
 * passthrough preserved for backwards compatibility with existing pages.
 */
interface OryFlowLayoutProps {
  children: ReactNode
}

export function OryFlowLayout({ children }: OryFlowLayoutProps) {
  return <>{children}</>
}
