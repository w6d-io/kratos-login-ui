'use client'

import { useState } from 'react'
import { BrandMark } from './BrandMark'

interface HeaderBrandProps {
  appName: string
  logoUrl: string | null
  logoSmallUrl: string | null
}

/**
 * Header identity: the install's full logo (small screens get the square
 * logo), else the square logo beside the name, else the letter tile. A logo
 * that fails to load falls back to the tile. Images are shown as-is — never
 * recoloured — so the owner supplies one that reads on both themes.
 */
export function HeaderBrand({ appName, logoUrl, logoSmallUrl }: HeaderBrandProps) {
  const [failed, setFailed] = useState(false)
  const onError = () => setFailed(true)

  if (logoUrl && !failed) {
    return (
      <div className="app-brand">
        <picture className={logoSmallUrl ? 'has-small' : undefined}>
          {logoSmallUrl && <source media="(max-width: 480px)" srcSet={logoSmallUrl} />}
          <img className="brand-logo" src={logoUrl} alt={appName} onError={onError} />
        </picture>
      </div>
    )
  }

  return (
    <div className="app-brand">
      {logoSmallUrl && !failed ? (
        <img className="brand-logo-small" src={logoSmallUrl} alt="" width={26} height={26} onError={onError} />
      ) : (
        <BrandMark size={26} />
      )}
      <span>{appName}</span>
    </div>
  )
}
