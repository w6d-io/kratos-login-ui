'use client'

import Image from 'next/image'
import { config } from '@/lib/config'

interface LogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: { width: 32, height: 32 },
  md: { width: 48, height: 48 },
  lg: { width: 64, height: 64 },
}

export function Logo({ className = '', size = 'md' }: LogoProps) {
  const { width, height } = sizes[size]

  // Check if it's an external URL or SVG (SVGs don't need optimization)
  const isExternal = config.logoUrl.startsWith('http')
  const isSvg = config.logoUrl.endsWith('.svg')

  return (
    <Image
      src={config.logoUrl}
      alt={config.appName}
      width={width}
      height={height}
      className={className}
      unoptimized={isExternal || isSvg}
    />
  )
}
