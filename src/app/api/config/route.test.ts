import { describe, it, expect, afterEach, vi } from 'vitest'
import { GET } from './route'

afterEach(() => vi.unstubAllEnvs())

describe('GET /api/config', () => {
  it('exposes the runtime logo URLs next to the app name', async () => {
    vi.stubEnv('APP_NAME', 'Example ID')
    vi.stubEnv('LOGO_URL', 'https://cdn.example.com/full.png')
    vi.stubEnv('LOGO_SMALL_URL', '/brand/icon.png')
    const body = await GET().json()
    expect(body).toMatchObject({
      appName: 'Example ID',
      logoUrl: 'https://cdn.example.com/full.png',
      logoSmallUrl: '/brand/icon.png',
      faviconUrl: '/brand/icon.png',
    })
  })

  it('returns null logos for unset or unsafe values', async () => {
    vi.stubEnv('LOGO_URL', 'javascript:alert(1)')
    vi.stubEnv('LOGO_SMALL_URL', '')
    const body = await GET().json()
    expect(body.logoUrl).toBeNull()
    expect(body.logoSmallUrl).toBeNull()
  })
})
