import { describe, it, expect } from 'vitest'
import { config, getThemeCssVariables, isReturnUrlAllowed } from './config'

describe('config', () => {
  it('should have default values', () => {
    expect(config.appName).toBeDefined()
    expect(config.theme).toBeDefined()
    expect(config.kratos).toBeDefined()
  })
})

describe('getThemeCssVariables', () => {
  it('should return CSS variables string', () => {
    const css = getThemeCssVariables()
    expect(css).toContain(':root')
    expect(css).toContain('--color-primary-500')
  })
})

describe('isReturnUrlAllowed', () => {
  it('should allow any URL when wildcard is configured', () => {
    expect(isReturnUrlAllowed('https://example.com')).toBe(true)
  })

  it('should handle various URL formats', () => {
    expect(isReturnUrlAllowed('https://example.com/path')).toBe(true)
  })
})
