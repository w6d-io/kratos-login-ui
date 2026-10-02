import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HeaderBrand } from './HeaderBrand'

afterEach(cleanup)

const FULL = 'https://cdn.example.com/full.png'
const SMALL = '/brand/icon.png'

describe('HeaderBrand', () => {
  it('shows the letter tile and the name when no logo is configured', () => {
    const { container } = render(<HeaderBrand appName="Example ID" logoUrl={null} logoSmallUrl={null} />)
    expect(container.querySelector('.brand-mark')).not.toBeNull()
    expect(screen.getByText('Example ID')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows the full logo with the app name as alt text and no tile', () => {
    const { container } = render(<HeaderBrand appName="Example ID" logoUrl={FULL} logoSmallUrl={null} />)
    const img = screen.getByRole('img', { name: 'Example ID' })
    expect(img.getAttribute('src')).toBe(FULL)
    expect(container.querySelector('.brand-mark')).toBeNull()
    expect(screen.queryByText('Example ID')).toBeNull()
  })

  it('swaps in the small logo on small screens', () => {
    const { container } = render(<HeaderBrand appName="Example ID" logoUrl={FULL} logoSmallUrl={SMALL} />)
    const source = container.querySelector('picture source')
    expect(source?.getAttribute('srcset')).toBe(SMALL)
    expect(source?.getAttribute('media')).toMatch(/max-width/)
  })

  it('uses the small logo in place of the tile when only the small one is set', () => {
    const { container } = render(<HeaderBrand appName="Example ID" logoUrl={null} logoSmallUrl={SMALL} />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe(SMALL)
    expect(container.querySelector('.brand-mark')).toBeNull()
    expect(screen.getByText('Example ID')).toBeTruthy()
  })

  it('falls back to the tile and name when the logo fails to load', () => {
    const { container } = render(<HeaderBrand appName="Example ID" logoUrl={FULL} logoSmallUrl={SMALL} />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.brand-mark')).not.toBeNull()
    expect(screen.getByText('Example ID')).toBeTruthy()
  })

  it('never recolours the image (no filter, no accent background)', () => {
    const { container } = render(<HeaderBrand appName="Example ID" logoUrl={FULL} logoSmallUrl={null} />)
    expect(container.querySelector('img')?.getAttribute('style') ?? '').not.toMatch(/filter/)
  })
})
