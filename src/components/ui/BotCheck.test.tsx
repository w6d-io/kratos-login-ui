import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import type { RegistrationFlow } from '@ory/client'
import { useBotCheck, setGatewayToken } from './BotCheck'
import { parseSignInProtection, type SignInProtection } from '@/lib/sign-in-protection'
import { RegisterView, SignUpClosedView } from '@/components/login/RegisterView'

afterEach(cleanup)

const protection = (flows: Partial<Record<string, boolean>>): SignInProtection => parseSignInProtection({
  captcha: {
    provider: 'turnstile', configured: true, siteKey: '1x00000000000000000000AA',
    scriptUrl: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    flows: { registration: false, login: false, recovery: false, verification: false, ...flows },
  },
  registration: { mode: 'open', domains: [] },
})

/** A Turnstile stand-in: records render options so the test can solve or expire the challenge. */
let rendered: Array<Record<string, (t?: string) => void> & { sitekey: string; action: string }> = []
beforeEach(() => {
  rendered = []
  window.turnstile = {
    render: vi.fn((_el: HTMLElement, opts: Record<string, unknown>) => { rendered.push(opts as never); return `w${rendered.length}` }),
    remove: vi.fn(),
  }
  // jsdom never loads remote scripts: fire `load` on the tag the loader appends.
  vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
    setTimeout(() => (node as HTMLScriptElement).onload?.(new Event('load')), 0)
    return node
  })
})
afterEach(() => vi.restoreAllMocks())

function Probe({ p, flow }: { p: SignInProtection | null; flow: 'registration' | 'login' }) {
  const bot = useBotCheck(flow, p)
  return (
    <div>
      {bot.widget}
      <span data-testid="state">{bot.widget ? (bot.pending ? 'pending' : `token:${bot.token}`) : 'none'}</span>
      <button onClick={bot.reset}>reset</button>
    </div>
  )
}

describe('useBotCheck', () => {
  it('draws nothing for a flow that asks for no check, or while the settings are unknown', () => {
    render(<Probe p={protection({ registration: true })} flow="login" />)
    expect(screen.getByTestId('state').textContent).toBe('none')
    cleanup()
    render(<Probe p={null} flow="registration" />)
    expect(screen.getByTestId('state').textContent).toBe('none')
  })

  it('renders Turnstile with the site key and the flow as action; a solved challenge gives the token; reset asks again', async () => {
    render(<Probe p={protection({ registration: true })} flow="registration" />)
    expect(screen.getByTestId('state').textContent).toBe('pending')
    await waitFor(() => expect(rendered).toHaveLength(1))
    expect(rendered[0]).toMatchObject({ sitekey: '1x00000000000000000000AA', action: 'registration' })
    act(() => rendered[0].callback('XXXX.DUMMY.TOKEN.XXXX'))
    expect(screen.getByTestId('state').textContent).toBe('token:XXXX.DUMMY.TOKEN.XXXX')
    act(() => rendered[0]['expired-callback']())
    expect(screen.getByTestId('state').textContent).toBe('pending')
    act(() => rendered[0].callback('second'))
    act(() => screen.getByText('reset').click())
    expect(screen.getByTestId('state').textContent).toBe('pending')
    await waitFor(() => expect(rendered).toHaveLength(2))
    expect(window.turnstile!.remove).toHaveBeenCalledWith('w1')
  })

  it('says so when the widget cannot load', async () => {
    rendered = []
    render(<Probe p={protection({ registration: true })} flow="registration" />)
    await waitFor(() => expect(rendered).toHaveLength(1))
    act(() => rendered[0]['error-callback']())
    expect(screen.getByRole('alert').textContent).toMatch(/could not load/i)
  })
})

describe('gateway token', () => {
  it('lands in the stl_kcap cookie (scoped to /self-service, so read back through the setter)', () => {
    const written: string[] = []
    const d = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!
    Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: (v: string) => { written.push(v) } })
    try {
      setGatewayToken('tok.1')
      setGatewayToken(null)
    } finally {
      Object.defineProperty(document, 'cookie', d)
    }
    expect(written).toEqual(['stl_kcap=tok.1; Path=/self-service; Max-Age=600; SameSite=Strict'])
  })
})

const flow = { id: 'f', ui: { nodes: [], action: '', method: 'POST' }, return_to: '' } as unknown as RegistrationFlow
const baseProps = {
  flow, banners: [], networkError: null, submitting: false, oidc: [],
  traitFields: [{ name: 'traits.email', type: 'email', value: '', required: true, errors: [], label: 'E-Mail' }] as never,
  traits: {}, setTrait: () => {}, password: 'x', setPassword: () => {}, accepted: true, setAccepted: () => {},
  hasPassword: true, hasProfileStep: false, hasPasskey: false, returnTo: '', onSubmit: () => {}, onSubmitOidc: () => {},
}

describe('RegisterView', () => {
  it('waits for the bot check before creating the account', () => {
    render(<RegisterView {...baseProps} botCheck={<div data-testid="widget" />} botCheckPending />)
    expect(screen.getByTestId('widget')).toBeTruthy()
    expect((screen.getByRole('button', { name: /create account/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/complete the bot check/i)).toBeTruthy()
    cleanup()
    render(<RegisterView {...baseProps} botCheck={<div data-testid="widget" />} botCheckPending={false} />)
    expect((screen.getByRole('button', { name: /create account/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('says who may sign up under the email field', () => {
    render(<RegisterView {...baseProps} signUpLimit="Sign-ups are limited to @corp.io addresses." />)
    expect(screen.getByText(/limited to @corp\.io addresses/)).toBeTruthy()
  })

  it('closed: a card that says so and points to sign in', () => {
    render(<SignUpClosedView message="Sign-ups are closed. Ask an administrator to create your account." signInHref="/login" />)
    expect(screen.getByRole('heading', { name: /sign-ups are closed/i })).toBeTruthy()
    expect(screen.getByText(/ask an administrator/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /go to sign in/i }).getAttribute('href')).toBe('/login')
  })
})
