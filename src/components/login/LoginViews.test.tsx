import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { LoginFlow } from '@ory/client'
import { CodeView } from './LoginViews'

// Code sign-in emails the code on the FIRST submit (the address), so the bot check sits there: the
// gateway refuses that submit without a token, before Kratos sends anything.

afterEach(cleanup)

const input = (group: string, name: string, type = 'text') => ({ group, type: 'input', attributes: { name, type, value: '', node_type: 'input' }, messages: [], meta: {} })
const flow = (sent: boolean) => ({
  id: 'f1', return_to: '', requested_aal: 'aal1', refresh: false,
  ui: { action: '/self-service/login?flow=f1', method: 'POST', nodes: [input('default', 'csrf_token', 'hidden'), input('code', 'identifier'), ...(sent ? [input('code', 'code')] : [])] },
}) as unknown as LoginFlow
const noop = () => {}
const view = (over: Record<string, unknown>) => (
  <CodeView banners={[]} networkError={null} submitting={false} setStep={noop} flow={flow(false)} identifier="ann@corp.io" setIdentifier={noop}
    code="" setCode={noop} methods={['code']} onSubmitCodeRequest={noop} onSubmitCodeVerify={noop} onResend={noop} onChangeEmail={noop}
    botCheck={<div data-testid="widget" />} {...over} />
)

describe('CodeView · bot check', () => {
  it('address step: the widget is there and "Email me a code" waits for its token', () => {
    const onSubmitCodeRequest = vi.fn((e: Event) => e.preventDefault())
    const { rerender } = render(view({ botCheckPending: true, onSubmitCodeRequest }))
    expect(screen.getByTestId('widget')).toBeTruthy()
    const button = () => screen.getByRole('button', { name: /email me a code/i }) as HTMLButtonElement
    expect(button().disabled).toBe(true)
    fireEvent.submit(button().closest('form')!)
    expect(onSubmitCodeRequest).not.toHaveBeenCalled()
    rerender(view({ botCheckPending: false, onSubmitCodeRequest }))
    expect(button().disabled).toBe(false)
    fireEvent.click(button())
    expect(onSubmitCodeRequest).toHaveBeenCalled()
  })

  it('code step: a resend waits for a fresh token too', () => {
    const { rerender } = render(view({ flow: flow(true), botCheckPending: true }))
    expect(screen.queryByRole('button', { name: /resend code/i })).toBeNull()
    expect(screen.getByText(/to send another code/i)).toBeTruthy()
    rerender(view({ flow: flow(true), botCheckPending: false }))
    expect(screen.getByRole('button', { name: /resend code/i })).toBeTruthy()
  })

  it('no check on this flow: nothing waits', () => {
    render(view({ botCheck: null, botCheckPending: false }))
    expect(screen.queryByTestId('widget')).toBeNull()
    expect((screen.getByRole('button', { name: /email me a code/i }) as HTMLButtonElement).disabled).toBe(false)
  })
})
