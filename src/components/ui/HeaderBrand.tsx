'use client'

import { useState } from 'react'
import { BrandMark } from './BrandMark'
import { LogoImage, useBrandLogo } from './BrandLogo'

/**
 * Header identity, from the install's logos:
 * - full logo that already shows the name (LOGO_SHOWS_NAME, default): the logo alone; on narrow
 *   screens the small logo replaces it (CSS swap, both in the markup so nothing loads late);
 * - LOGO_SHOWS_NAME=false: the small logo (else the full one) beside APP_NAME;
 * - only a small logo: it beside the name; no logo: the letter tile beside the name.
 * The tile appears only when no logo is configured or one fails to load — never while loading.
 */
export function HeaderBrand() {
  const brand = useBrandLogo()
  const [failed, setFailed] = useState(false)
  const onError = () => setFailed(true)
  const appName = brand?.appName ?? ''
  const full = !failed ? brand?.logoUrl ?? null : null
  const small = !failed ? brand?.logoSmallUrl ?? null : null

  if (full && brand?.logoShowsName) {
    return (
      <div className={`app-brand${small ? ' has-small' : ''}`}>
        <span className="header-logo-full">
          <LogoImage src={full} darkSrc={brand.logoDarkUrl} alt={appName} onError={onError} />
        </span>
        {small && <img className="header-logo-small" src={small} alt={appName} width={28} height={28} onError={onError} />}
      </div>
    )
  }

  return (
    <div className="app-brand">
      {small ? (
        <img className="brand-logo-small" src={small} alt="" width={26} height={26} onError={onError} />
      ) : full ? (
        <span className="header-logo-full">
          <LogoImage src={full} darkSrc={brand?.logoDarkUrl ?? null} alt="" onError={onError} />
        </span>
      ) : (
        <BrandMark size={26} />
      )}
      <span>{appName}</span>
    </div>
  )
}
