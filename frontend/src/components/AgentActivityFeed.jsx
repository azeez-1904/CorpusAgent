const AGENT_COLORS = {
  SpecializationAgent: 'text-purple',
  VersionPatrolAgent: 'text-orange',
  QueryDecompositionAgent: 'text-accent',
  EscalationAgent: 'text-green',
}

const EVENT_ICONS = {
  persona_updated: '🧠',
  version_alert: '🔔',
  sub_query_progress: '🧩',
  agent_thinking: '⚙️',
  escalation_decision: '🚦',
  query_intent: '🎯',
  document_uploaded: '📄',
  query_complete: '✅',
  system_ready: '🟢',
  agent_error: '⚠️',
}

function describe(e) {
  switch (e.event) {
    case 'persona_updated':
      return `Specialised as ${e.domain}`
    case 'version_alert':
      return `${e.doc_title}: ${e.change_summary}`
    case 'sub_query_progress':
      return `Sub-query ${e.index}/${e.total}: ${e.sub_query}`
    case 'agent_thinking':
      return e.message
    case 'escalation_decision':
      return e.reason
    case 'query_intent':
      return `Intent: ${e.intent}${e.years?.length ? ` (${e.years.join(', ')})` : ''}`
    case 'document_uploaded':
      return `Uploaded ${e.title} ${e.version}${e.sensitive ? ' 🔒' : ''}`
    case 'query_complete':
      return `Answered via ${e.route} in ${e.latency_ms} ms`
    case 'system_ready':
      return e.message
    case 'agent_error':
      return `Error: ${e.message}`
    default:
      return e.event
  }
}

function timeOf(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}

export default function AgentActivityFeed({ events, connected }) {
  const ordered = [...events].reverse()
  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-surface">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="text-sm font-semibold text-ink">Agent Activity</span>
        <span
          className={`ml-auto flex items-center gap-1.5 text-xs ${
            connected ? 'text-green' : 'text-muted'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${connected ? 'bg-green' : 'bg-muted'} ${
              connected ? 'animate-pulse' : ''
            }`}
          />
          {connected ? 'live' : 'reconnecting'}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {ordered.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-muted">
            Waiting for agent activity…
          </p>
        )}
        {ordered.map((e, i) => {
          const color = AGENT_COLORS[e.agent] || 'text-ink'
          const thinking = e.event === 'agent_thinking'
          return (
            <div
              key={i}
              className="animate-slide-in rounded-lg border border-white/5 bg-bg/50 p-2.5"
            >
              <div className="flex items-center gap-2">
                <span>{EVENT_ICONS[e.event] || '•'}</span>
                {e.agent && (
                  <span className={`text-xs font-semibold ${color}`}>{e.agent}</span>
                )}
                {thinking && (
                  <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                )}
                <span className="ml-auto font-mono text-[10px] text-muted">
                  {timeOf(e.timestamp)}
                </span>
              </div>
              <p className="mt-1 text-xs leading-snug text-muted">{describe(e)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
