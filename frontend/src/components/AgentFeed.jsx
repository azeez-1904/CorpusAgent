import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  BellRing,
  Boxes,
  Brain,
  CheckCircle2,
  Cog,
  FileUp,
  Power,
  Radio,
  Shuffle,
  Target,
  X,
} from 'lucide-react'
import { AGENT_OF_EVENT } from '../hooks/useAgentFeed'

const AGENT_STYLES = {
  SpecializationAgent: { text: 'text-purple', dot: 'bg-purple', ring: 'ring-purple/30' },
  VersionPatrolAgent: { text: 'text-orange', dot: 'bg-orange', ring: 'ring-orange/30' },
  QueryDecompositionAgent: { text: 'text-blue', dot: 'bg-blue', ring: 'ring-blue/30' },
  EscalationAgent: { text: 'text-cyan', dot: 'bg-cyan', ring: 'ring-cyan/30' },
}
const DEFAULT_STYLE = { text: 'text-ink', dot: 'bg-muted', ring: 'ring-white/10' }

const EVENT_ICON = {
  persona_updated: Brain,
  version_alert: BellRing,
  sub_query_progress: Boxes,
  agent_thinking: Cog,
  escalation_decision: Shuffle,
  query_intent: Target,
  document_uploaded: FileUp,
  query_complete: CheckCircle2,
  system_ready: Power,
  agent_error: AlertTriangle,
}

function describe(e) {
  switch (e.event) {
    case 'persona_updated':
      return `Corpus analyzed — specialized as ${e.domain || 'expert'}`
    case 'version_alert':
      return `${e.doc_title}: ${e.change_summary || 'new version detected'}`
    case 'sub_query_progress':
      return `Sub-query ${e.index}/${e.total}: ${e.sub_query}`
    case 'agent_thinking':
      return e.message || 'Thinking…'
    case 'escalation_decision':
      return e.reason || 'Routing decision made'
    case 'query_intent':
      return `Intent: ${e.intent}${e.years?.length ? ` (${e.years.join(', ')})` : ''}`
    case 'document_uploaded':
      return `Indexed ${e.title} ${e.version}${e.sensitive ? ' 🔒' : ''} · ${e.chunks ?? 0} chunks`
    case 'query_complete':
      return `Answered via ${e.route} in ${e.latency_ms} ms`
    case 'system_ready':
      return e.message || 'Backend online'
    case 'agent_error':
      return `Error: ${e.message}`
    default:
      return e.event
  }
}

function agentOf(e) {
  return e.agent || AGENT_OF_EVENT[e.event] || null
}
function timeOf(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function AgentFeed({ events, connected, activeAgent }) {
  const ordered = [...events].reverse()

  return (
    <div className="panel flex h-full flex-col rounded-2xl">
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
        <Radio size={15} className={activeAgent ? 'text-green' : 'text-muted'} />
        <span className="text-sm font-bold text-ink">Agent Activity</span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px]">
          <span className="relative flex h-2 w-2">
            {(activeAgent || connected) && (
              <motion.span
                className={`absolute inline-flex h-full w-full rounded-full ${
                  activeAgent ? 'bg-green' : 'bg-green/60'
                }`}
                animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                connected ? 'bg-green' : 'bg-muted'
              }`}
            />
          </span>
          <span className={connected ? 'text-green' : 'text-muted'}>
            {activeAgent ? 'working' : connected ? 'live' : 'offline'}
          </span>
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {ordered.length === 0 && (
          <p className="px-1 py-8 text-center text-xs text-muted">
            Waiting for agent activity…
          </p>
        )}
        <AnimatePresence initial={false}>
          {ordered.map((e, i) => {
            const agent = agentOf(e)
            const style = AGENT_STYLES[agent] || DEFAULT_STYLE
            const Icon = EVENT_ICON[e.event] || Radio
            const isThinking = e.event === 'agent_thinking' && agent === activeAgent && i === 0
            return (
              <motion.div
                key={`${e.timestamp}-${i}`}
                layout
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', damping: 24, stiffness: 280 }}
                className={`rounded-lg border border-white/8 bg-card/50 p-2.5 ring-1 ring-inset ${style.ring}`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon size={13} className={style.text} />
                  {agent ? (
                    <span className={`text-[11px] font-semibold ${style.text}`}>{agent}</span>
                  ) : (
                    <span className="text-[11px] font-semibold text-muted">system</span>
                  )}
                  <span className="ml-auto font-mono text-[9px] text-muted">
                    {timeOf(e.timestamp)}
                  </span>
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-muted">{describe(e)}</p>
                {isThinking && (
                  <div className="mt-1.5 flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className={`h-1 w-1 animate-bounce-dot rounded-full ${style.dot}`}
                        style={{ animationDelay: `${d * 0.16}s` }}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      <VersionToasts events={events} />
    </div>
  )
}

/* ---------------------------------------------------------------------------
   Version alert toasts — pop in bottom-right, auto-dismiss after 6s.
--------------------------------------------------------------------------- */
function VersionToasts({ events }) {
  const [toasts, setToasts] = useState([])
  const [seen] = useState(() => new Set())

  useEffect(() => {
    const alert = [...events].reverse().find((e) => e.event === 'version_alert')
    if (!alert) return
    const key = `${alert.doc_title}-${alert.timestamp}`
    if (seen.has(key)) return
    seen.add(key)
    const toast = { ...alert, key }
    setToasts((prev) => [...prev, toast])
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.key !== key))
    }, 6000)
    return () => clearTimeout(timer)
  }, [events, seen])

  const dismiss = (key) => setToasts((prev) => prev.filter((t) => t.key !== key))

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.key}
            initial={{ opacity: 0, x: 80, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className="edge-accent pointer-events-auto rounded-xl border border-orange/40 bg-card/95 p-3 shadow-glow-orange backdrop-blur"
          >
            <div className="flex items-center gap-2">
              <BellRing size={14} className="text-orange" />
              <span className="text-[12px] font-bold text-ink">Version update</span>
              <button
                onClick={() => dismiss(t.key)}
                className="ml-auto text-muted transition hover:text-ink"
              >
                <X size={13} />
              </button>
            </div>
            <p className="mt-1 text-[12px] font-semibold text-orange">{t.doc_title}</p>
            {(t.old_version || t.new_version) && (
              <p className="mt-0.5 font-mono text-[11px] text-muted">
                {t.old_version} → {t.new_version}
              </p>
            )}
            {t.change_summary && (
              <p className="mt-1 line-clamp-2 text-[11px] text-muted">{t.change_summary}</p>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
