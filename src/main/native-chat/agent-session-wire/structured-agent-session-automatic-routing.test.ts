import { describe, expect, it, vi } from 'vitest'
import { prepareAutomaticRoutingMessage } from '../../../shared/automatic-routing-instructions'
import {
  attach,
  CALLER,
  envelope,
  hostTestState
} from './structured-agent-session-host-test-harness'
import { HOST_TEST_SESSION as SESSION } from './structured-agent-session-host-test-data'
import type { AgentJournalMessageItem } from '../../../shared/agent-session-journal-types'

describe('automatic routing in native message delivery', () => {
  it('delivers routing instructions while retaining the original user message and receipt', async () => {
    const { host, dispatch } = hostTestState()
    host.deps.prepareUserMessage = (record, body) =>
      prepareAutomaticRoutingMessage(body, { automatic: { enabled: true } }, record.provider)
    await attach()
    const body: AgentJournalMessageItem = {
      kind: 'message',
      role: 'user',
      blocks: [{ type: 'text', text: 'Review this change.' }]
    }
    expect(
      await host.send(CALLER, { envelope: envelope('agentSession.send', { body }), body })
    ).toMatchObject({ ok: true })
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce())
    const delivered = dispatch.mock.calls[0]?.[0].body
    expect(delivered?.blocks).toHaveLength(2)
    expect(delivered?.blocks[1]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('--primary-agent codex')
    })
    const history = await host.history({ sessionId: SESSION, direction: 'tail' })
    if (!history.ok) {
      throw new Error('Journal history unavailable')
    }
    expect(
      history.page.items.some(
        (item) =>
          item.body.kind === 'message' &&
          JSON.stringify(item.body.blocks) === JSON.stringify(body.blocks)
      )
    ).toBe(true)
    expect(body.blocks).toHaveLength(1)
  })
  it('keeps supervised-worker messages outside automatic routing', async () => {
    const { host, dispatch } = hostTestState()
    host.deps.prepareUserMessage = (record, body) =>
      prepareAutomaticRoutingMessage(body, { automatic: { enabled: true } }, record.provider, true)
    await attach()
    const body: AgentJournalMessageItem = {
      kind: 'message',
      role: 'user',
      blocks: [{ type: 'text', text: 'Worker follow-up.' }]
    }
    await host.send(CALLER, { envelope: envelope('agentSession.send', { body }), body })
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce())
    expect(dispatch.mock.calls[0]?.[0].body.blocks).toEqual(body.blocks)
  })
})
