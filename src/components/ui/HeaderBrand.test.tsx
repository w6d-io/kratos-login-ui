import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HeaderBrand } from './HeaderBrand'
import { BrandLogoProvider, type BrandLogoConfig } from './BrandLogo'

afterEach(cleanup)

const FULL = 'https://cdn.example.com/full.png'
const DARK = 'https://cdn.example.com/full-dark.png'
const SMALL = '/brand/icon.png'
const cfg = (over: Partial<BrandLogoConfig> = {}): BrandLogoConfig => ({
  appName: 'Example ID', logoUrl: null, logoDarkUrl: null, logoSmallUrl: null, logoShowsName: true, ...over,
})
const show = (over: Partial<BrandLogoConfig> = {}) =>
  render(<BrandLogoProvider value={cfg(over)}><HeaderBrand /></BrandLogoProvider>)

describe('HeaderBrand', () => {
  it('no logo: the letter tile and the name', () => {
    const { container } = show()
    expect(container.querySelector('.brand-mark')).not.toBeNull()
    expect(screen.getByText('Example ID')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('full logo that already shows the name (default): logo only, alt = app name, no tile', () => {
    const { container } = show({ logoUrl: FULL })
    expect(screen.getByRole('img', { name: 'Example ID' }).getAttribute('src')).toBe(FULL)
    expect(container.querySelector('.brand-mark')).toBeNull()
    expect(screen.queryByText('Example ID')).toBeNull()
  })

  it('full logo + small logo: the small one is there for narrow screens (CSS swaps them)', () => {
    const { container } = show({ logoUrl: FULL, logoSmallUrl: SMALL })
    expect(container.querySelector('.header-logo-full img')?.getAttribute('src')).toBe(FULL)
    expect(container.querySelector('.header-logo-small')?.getAttribute('src')).toBe(SMALL)
    expect(container.querySelector('.app-brand')?.classList.contains('has-small')).toBe(true)
  })

  it('LOGO_SHOWS_NAME=false: the small logo next to the name', () => {
    const { container } = show({ logoUrl: FULL, logoSmallUrl: SMALL, logoShowsName: false })
    expect(container.querySelector('img')?.getAttribute('src')).toBe(SMALL)
    expect(screen.getByText('Example ID')).toBeTruthy()
  })

  it('LOGO_SHOWS_NAME=false without a small logo: the full logo next to the name', () => {
    const { container } = show({ logoUrl: FULL, logoShowsName: false })
    expect(container.querySelector('.header-logo-full img')?.getAttribute('src')).toBe(FULL)
    expect(screen.getByText('Example ID')).toBeTruthy()
  })

  it('only a small logo: it replaces the tile next to the name', () => {
    const { container } = show({ logoSmallUrl: SMALL })
    expect(container.querySelector('img')?.getAttribute('src')).toBe(SMALL)
    expect(container.querySelector('.brand-mark')).toBeNull()
    expect(screen.getByText('Example ID')).toBeTruthy()
  })

  it('a dark variant is rendered beside the light one (theme CSS picks)', () => {
    const { container } = show({ logoUrl: FULL, logoDarkUrl: DARK })
    expect(container.querySelector('img.logo-light')?.getAttribute('src')).toBe(FULL)
    expect(container.querySelector('img.logo-dark')?.getAttribute('src')).toBe(DARK)
    expect(container.querySelector('img.logo-dark')?.getAttribute('alt')).toBe('')
  })

  it('falls back to the tile and name when the logo fails to load — never before', () => {
    const { container } = show({ logoUrl: FULL, logoSmallUrl: SMALL })
    expect(container.querySelector('.brand-mark')).toBeNull()
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.brand-mark')).not.toBeNull()
    expect(screen.getByText('Example ID')).toBeTruthy()
  })
})
