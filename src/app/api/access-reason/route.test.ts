import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchAccessReason = vi.fn()
vi.mock('@/lib/access-reason-server', () => ({ fetchAccessReason: (o: unknown) => fetchAccessReason(o) }))

import { GET } from './route'

const rt = 'https://payroll.test/pay'
const req = (qs: string, cookie?: string) =>
  new Request(`http://ui/api/access-reason${qs}`, { headers: cookie ? { cookie } : {} })

beforeEach(() => fetchAccessReason.mockReset())

describe('GET /api/access-reason', () => {
  it('asks jinbe with site, return_to and the incoming cookie header, never cached', async () => {
    fetchAccessReason.mockResolvedValue({ kind: 'reason', reason: 'needs_2fa', minAal: 'aal2' })
    const res = await GET(req(`?site=payroll&return_to=${encodeURIComponent(rt)}&reason=forbidden`, 'ory_kratos_session=s'))
    expect(fetchAccessReason).toHaveBeenCalledWith(expect.objectContaining({ site: 'payroll', url: rt, cookieHeader: 'ory_kratos_session=s' }))
    expect(await res.json()).toEqual({ kind: 'reason', reason: 'needs_2fa', minAal: 'aal2' })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('answers forbidden without asking when site or return_to is missing or invalid', async () => {
    for (const qs of ['', '?site=payroll', `?return_to=${encodeURIComponent(rt)}`, '?site=payroll&return_to=javascript:alert(1)']) {
      expect(await (await GET(req(qs))).json()).toEqual({ kind: 'reason', reason: 'forbidden', minAal: null })
    }
    expect(fetchAccessReason).not.toHaveBeenCalled()
  })
})
