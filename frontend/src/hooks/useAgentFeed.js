import { useCallback, useRef, useState } from 'react'
import { useWebSocket } from './useWebSocket'

/**
 * Maps events that don't carry an explicit `agent` field back to the agent
 * that produces them, so the activity feed can colour every event correctly.
 */
export const AGENT_OF_EVENT = {
  persona_updated: 'SpecializationAgent',
  version_alert: 'VersionPatrolAgent',
  sub_query_progress: 'QueryDecompositionAgent',
  query_intent: 'QueryDecompositionAgent',
  escalation_decision: 'EscalationAgent',
}

/**
 * Wraps the resilient WebSocket stream and derives higher-level UI state:
 *  - `activeAgent`: which agent is currently "thinking" (drives the pulsing
 *    indicators), auto-clearing on completion or after a safety timeout.
 *
 * Keeps the underlying `useWebSocket` event log + connection status intact.
 */
export function useAgentFeed(onEvent) {
  const [activeAgent, setActiveAgent] = useState(null)
  const timerRef = useRef(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const handle = useCallback((e) => {
    const agent = e.agent || AGENT_OF_EVENT[e.event]

    if (e.event === 'agent_thinking' && agent) {
      setActiveAgent(agent)
      clearTimeout(timerRef.current)
      // Safety net: clear the indicator if no completion event arrives.
      timerRef.current = setTimeout(() => setActiveAgent(null), 9000)
    } else if (
      e.event === 'query_complete' ||
      e.event === 'persona_updated' ||
      e.event === 'agent_error'
    ) {
      clearTimeout(timerRef.current)
      setActiveAgent(null)
    }

    onEventRef.current?.(e)
  }, [])

  const { events, connected } = useWebSocket(handle)
  return { events, connected, activeAgent }
}
