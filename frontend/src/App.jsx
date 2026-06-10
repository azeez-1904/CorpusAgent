import { useCallback, useEffect, useMemo, useState } from 'react'
import PersonaBadge from './components/PersonaBadge'
import DocumentPanel from './components/DocumentPanel'
import QueryPanel from './components/QueryPanel'
import AnswerCard from './components/AnswerCard'
import AgentActivityFeed from './components/AgentActivityFeed'
import { useDocuments } from './hooks/useDocuments'
import { useWebSocket } from './hooks/useWebSocket'
import { getAlerts, getPersona, getStatus, runQuery } from './api'

export default function App() {
  const { documents, refresh: refreshDocs } = useDocuments()
  const [persona, setPersona] = useState(null)
  const [pulsing, setPulsing] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [status, setStatus] = useState(null)

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [thinking, setThinking] = useState('')
  const [subProgress, setSubProgress] = useState({ index: 0, total: 0, sub_query: '' })

  const refreshPersona = useCallback(async () => {
    try {
      setPersona(await getPersona())
    } catch {
      /* keep previous */
    }
  }, [])

  const refreshAlerts = useCallback(async () => {
    try {
      setAlerts(await getAlerts())
    } catch {
      setAlerts([])
    }
  }, [])

  useEffect(() => {
    refreshPersona()
    refreshAlerts()
    getStatus().then(setStatus).catch(() => setStatus(null))
  }, [refreshPersona, refreshAlerts])

  // Live agent events drive the persona pulse, sub-query progress, and refreshes.
  const onEvent = useCallback(
    (e) => {
      switch (e.event) {
        case 'agent_thinking':
          setThinking(e.message || 'Agent is thinking')
          if (e.agent === 'SpecializationAgent') setPulsing(true)
          break
        case 'sub_query_progress':
          setSubProgress({ index: e.index, total: e.total, sub_query: e.sub_query })
          break
        case 'persona_updated':
          setPulsing(false)
          refreshPersona()
          break
        case 'version_alert':
          refreshAlerts()
          break
        case 'document_uploaded':
          refreshDocs()
          break
        case 'query_complete':
          setThinking('')
          break
        default:
          break
      }
    },
    [refreshPersona, refreshAlerts, refreshDocs],
  )

  const { events, connected } = useWebSocket(onEvent)

  const onSubmit = useCallback(async (query) => {
    setLoading(true)
    setResult(null)
    setThinking('Agent is thinking')
    setSubProgress({ index: 0, total: 0, sub_query: '' })
    try {
      setResult(await runQuery(query))
    } catch (err) {
      setResult({
        answer:
          err?.response?.data?.detail || 'The query failed. Is the backend running?',
        route: 'local',
        intent: 'error',
        versions_consulted: [],
      })
    } finally {
      setLoading(false)
      setThinking('')
    }
  }, [])

  const onUploaded = useCallback(() => {
    refreshDocs()
    refreshAlerts()
    refreshPersona()
  }, [refreshDocs, refreshAlerts, refreshPersona])

  const alertTitles = useMemo(
    () => new Set(alerts.map((a) => a.doc_title)),
    [alerts],
  )

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="border-b border-white/10 bg-surface/60 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-6 py-3.5">
          <span className="text-xl">🧠</span>
          <div>
            <h1 className="text-base font-bold leading-tight text-ink">CorpusAgent</h1>
            <p className="text-[11px] text-muted">
              Self-specializing edge RAG with privacy-aware cloud escalation
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            {status && (
              <>
                <Pill
                  ok={status.cloud_configured}
                  on="☁️ Cloud ready"
                  off="cloud off"
                />
                <Pill ok={status.ollama_running} on="⚡ Edge online" off="edge off" />
                {status.gpu?.name && (
                  <span className="rounded-lg bg-surface2 px-2.5 py-1 text-muted">
                    {status.gpu.name}
                  </span>
                )}
              </>
            )}
            <span
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 ${
                connected ? 'text-green' : 'text-muted'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  connected ? 'animate-pulse bg-green' : 'bg-muted'
                }`}
              />
              {connected ? 'live' : 'reconnecting'}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-5">
        <PersonaBadge persona={persona} pulsing={pulsing} />

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
          <div className="h-[calc(100vh-260px)] min-h-[420px]">
            <DocumentPanel
              documents={documents}
              onUploaded={onUploaded}
              alertTitles={alertTitles}
            />
          </div>

          <div className="space-y-5">
            <QueryPanel
              onSubmit={onSubmit}
              loading={loading}
              subProgress={subProgress}
              thinking={thinking}
            />
            {result ? (
              <AnswerCard result={result} />
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-surface/40 p-10 text-center text-sm text-muted">
                Ask a question above. Sensitive documents are answered on-device;
                uncertain answers escalate to Qwen Cloud (☁️ CLOUD).
              </div>
            )}
          </div>

          <div className="h-[calc(100vh-260px)] min-h-[420px]">
            <AgentActivityFeed events={events} connected={connected} />
          </div>
        </div>
      </main>
    </div>
  )
}

function Pill({ ok, on, off }) {
  return (
    <span
      className={`rounded-lg px-2.5 py-1 ${
        ok ? 'bg-accent/15 text-accent' : 'bg-surface2 text-muted'
      }`}
    >
      {ok ? on : off}
    </span>
  )
}
