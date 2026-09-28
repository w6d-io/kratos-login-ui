import { describe, expect, it } from 'vitest'
import type { LoginFlow } from '@ory/client'
import { extractFlowBanners } from './flow-messages'

const flowWith = (messages: Array<{ id: number; text: string; type: string }>) => ({ ui: { messages, nodes: [] } }) as unknown as LoginFlow

describe('extractFlowBanners — account enumeration', () => {
  it('does not echo "account does not exist" for code sign-in', () => {
    const [b] = extractFlowBanners(flowWith([{ id: 4000035, text: 'This account does not exist or has not setup sign in with code.', type: 'error' }]))
    expect(b.tone).toBe('info')
    expect(b.id).toBe(4000035)
    expect(`${b.title} ${b.body}`).not.toMatch(/does not exist/i)
  })
  it('keeps the generic invalid-credentials message', () => {
    const [b] = extractFlowBanners(flowWith([{ id: 4000006, text: 'The provided credentials are invalid.', type: 'error' }]))
    expect(b.body).toMatch(/invalid/)
  })
})
