import type { AgentJournalCursor } from '../../../shared/agent-session-journal-types'
import type { AgentSessionFailureWordsContext } from '../../../shared/agent-session-failure-words'
import type { StructuredAgentSessionHostSession } from './structured-agent-session-host-types'
import {
  acceptedNoLaterThan,
  recordStructuredAgentSessionStartFailure
} from './structured-agent-session-start-failure-row'
import {
  structuredAgentSessionStartFailure,
  type StructuredAgentSessionStartFailureCause
} from './structured-agent-session-failure-text'

/** A failed start before it is worded; the row is worded once, through the one wording point. */
export type DeliveryStartFailure = {
  startKey: string | null
  cause: StructuredAgentSessionStartFailureCause
}

export type DeliveryFailureContext = {
  sessions: ReadonlyMap<string, StructuredAgentSessionHostSession>
  conversationFence: (sessionId: string) => number
  failureTextContext: (sessionId: string) => AgentSessionFailureWordsContext
}

/** Rejects the queued messages a failed start was for, as one durable failure row. */
export async function recordStructuredAgentSessionDeliveryFailure(
  context: DeliveryFailureContext,
  sessionId: string,
  failure: DeliveryStartFailure,
  acceptedBy?: AgentJournalCursor
): Promise<void> {
  const session = context.sessions.get(sessionId)
  if (session) {
    await recordStructuredAgentSessionStartFailure(
      { journal: session.journal, fence: context.conversationFence(sessionId) },
      {
        startKey: failure.startKey,
        ...structuredAgentSessionStartFailure(
          failure.cause,
          context.failureTextContext(sessionId)
        )
      },
      acceptedBy && acceptedNoLaterThan(session.journal, acceptedBy)
    )
  }
}
