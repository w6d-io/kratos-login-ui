'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { BrandLogos } from '@/lib/brand-logo'

/**
 * The install's logos (LOGO_* env, validated server-side in layout.tsx), shared with every card
 * and the header. Images are shown as supplied, never recoloured: a light and a dark variant are
 * both rendered and the theme CSS (`[data-dark]`, set before paint) shows one, so a theme switch
 * never flashes. Without a dark variant, the logo sits on a light neutral plate in dark mode.
 */

export type BrandLogoConfig = Omit<BrandLogos, 'faviconUrl'> & { appName: string }

const BrandLogoContext = createContext<BrandLogoConfig | null>(null)

export function BrandLogoProvider({ value, children }: { value: BrandLogoConfig; children: ReactNode }) {
  return <BrandLogoContext.Provider value={value}>{children}</BrandLogoContext.Provider>
}

export function useBrandLogo(): BrandLogoConfig | null {
  return useContext(BrandLogoContext)
}

interface LogoImageProps {
  src: string
  darkSrc: string | null
  alt: string
  onError: () => void
}

/** Light + optional dark variant; the dark copy is decorative (alt="") so the name is read once. */
export function LogoImage({ src, darkSrc, alt, onError }: LogoImageProps) {
  if (!darkSrc) {
    return (
      <span className="logo-plate">
        <img className="logo-img" src={src} alt={alt} onError={onError} />
      </span>
    )
  }
  return (
    <>
      <img className="logo-img logo-light" src={src} alt={alt} onError={onError} />
      <img className="logo-img logo-dark" src={darkSrc} alt="" onError={onError} />
    </>
  )
}

/** The full logo leading the sign-in card, in a fixed-height slot so nothing moves as it loads. */
export function CardBrand() {
  const brand = useBrandLogo()
  const [failed, setFailed] = useState(false)
  if (!brand?.logoUrl || failed) return null
  return (
    <div className="card-brand">
      <LogoImage src={brand.logoUrl} darkSrc={brand.logoDarkUrl} alt={brand.appName} onError={() => setFailed(true)} />
    </div>
  )
}
