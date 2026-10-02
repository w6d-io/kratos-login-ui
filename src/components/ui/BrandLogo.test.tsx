import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BrandLogoProvider, CardBrand, type BrandLogoConfig } from './BrandLogo'
import { FlowCard } from '@/components/flow/FlowCard'
import { Loading } from '@/components/Loading'

afterEach(cleanup)

const FULL = 'https://cdn.example.com/full.png'
const cfg = (over: Partial<BrandLogoConfig> = {}): BrandLogoConfig => ({
  appName: 'Example ID', logoUrl: FULL, logoDarkUrl: null, logoSmallUrl: null, logoShowsName: true, ...over,
})
const withLogo = (ui: React.ReactNode, over: Partial<BrandLogoConfig> = {}) =>
  render(<BrandLogoProvider value={cfg(over)}>{ui}</BrandLogoProvider>)

describe('CardBrand', () => {
  it('renders nothing without a full logo (or outside a provider)', () => {
    expect(render(<CardBrand />).container.innerHTML).toBe('')
    cleanup()
    expect(withLogo(<CardBrand />, { logoUrl: null }).container.innerHTML).toBe('')
  })

  it('shows the full logo with the app name as alt, in a reserved-height slot', () => {
    const { container } = withLogo(<CardBrand />)
    expect(screen.getByRole('img', { name: 'Example ID' }).getAttribute('src')).toBe(FULL)
    expect(container.querySelector('.card-brand')).not.toBeNull()
  })

  it('without a dark variant the logo sits on a neutral plate (readable in dark mode); with one, no plate', () => {
    expect(withLogo(<CardBrand />).container.querySelector('.logo-plate')).not.toBeNull()
    cleanup()
    const { container } = withLogo(<CardBrand />, { logoDarkUrl: 'https://cdn.example.com/dark.png' })
    expect(container.querySelector('.logo-plate')).toBeNull()
    expect(container.querySelector('img.logo-dark')).not.toBeNull()
  })

  it('collapses when the image fails to load', () => {
    const { container } = withLogo(<CardBrand />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('.card-brand')).toBeNull()
  })
})

describe('FlowCard with a logo', () => {
  it('leads with the logo above the title; the step icon becomes a compact secondary mark', () => {
    const { container } = withLogo(<FlowCard icon={<svg data-testid="icon" />} title="Sign in" subtitle="Welcome back." />)
    const head = container.querySelector('.card-head')!
    const order = Array.from(head.querySelectorAll('.card-brand, h1, .card-icon')).map((e) => e.className.split(' ')[0] || e.tagName)
    expect(order[0]).toBe('card-brand')
    expect(container.querySelector('.card-icon')?.classList.contains('compact')).toBe(true)
    expect(screen.getByRole('heading').textContent).toBe('Sign in')
  })

  it('unchanged without a logo: big icon tile, no brand slot', () => {
    const { container } = withLogo(<FlowCard icon={<svg />} title="Sign in" />, { logoUrl: null })
    expect(container.querySelector('.card-brand')).toBeNull()
    expect(container.querySelector('.card-icon')?.classList.contains('compact')).toBe(false)
  })
})

describe('Loading with a logo', () => {
  it('reserves the same logo slot so the card does not jump when the flow arrives', () => {
    const { container } = withLogo(<Loading />)
    expect(container.querySelector('.card-loading .card-brand')).not.toBeNull()
  })
})
