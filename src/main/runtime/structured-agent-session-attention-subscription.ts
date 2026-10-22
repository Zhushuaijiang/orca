import type { StructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-host'
import type { StructuredAttentionMobileDelivery } from './structured-agent-session-mobile-attention'

/** Lives exactly as long as the host: teardown drops the host and its subscribers together. */
export function subscribeHostAttentionDelivery(
  host: StructuredAgentSessionHost,
  delivery: StructuredAttentionMobileDelivery
): void {
  host.subscribeTurnCompletions({
    id: 'host-attention-delivery',
    includePrompts: true,
    emit: (event) => {
      if (event.type === 'end') {
        return
      }
      const sessionId =
        event.type === 'prompt' ? event.prompt.sessionId : event.completion.sessionId
      delivery.deliver(event, host.readStatusSummary(sessionId))
    },
    onState: delivery.reconcile
  })
}
