import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from './components/Header'
import DocumentPanel from './components/DocumentPanel'
import MindMap from './components/MindMap'
import QueryPanel from './components/QueryPanel'
import AnswerCard from './components/AnswerCard'
import AgentFeed from './components/AgentFeed'
import StatsPanel from './components/StatsPanel'
import { useDocuments } from './hooks/useDocuments'
import { useAgentFeed } from './hooks/useAgentFeed'
import { getAlerts, getPersona, getRelations, getStatus, runQuery } from './lib/api'

export default function App() {
  const { documents, refresh: refreshDocs } = useDocuments()
  const [relations, setRelations] = useState([])
  const [persona, setPersona] = useState(null)
  const [pulsing, setPulsing] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [status, setStatus] = useState(null)

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [thinking, setThinking] = useState('')
  const [subProgress, setSubProgress] = useState({ index: 0, total: 0, sub_query: '' })

  const [selectedTitle, setSelectedTitle] = useState(null)
  const [highlights, setHighlights] = useState(() => new Set())

  const refreshPersona = useCallback(async () => {
    try {
      setPersona(await getPersona())
    } catch {
      /* keep previous */
    }
  }, [])

  const refreshAlerts = useCallback(async () => {
    try {
      const data = await getAlerts()
      setAlerts(Array.isArray(data) ? data : [])
    } catch {
      setAlerts([])
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getStatus())
    } catch {
      setStatus(null)
    }
  }, [])

  const refreshRelations = useCallback(async () => {
    try {
      const data = await getRelations()
      setRelations(Array.isArray(data) ? data : [])
    } catch {
      setRelations([])
    }
  }, [])

  useEffect(() => {
    refreshPersona()
    refreshAlerts()
    refreshStatus()
    refreshRelations()
  }, [refreshPersona, refreshAlerts, refreshStatus, refreshRelations])

  // Live agent events drive persona pulse, sub-query progress, and refreshes.
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
          refreshStatus()
          refreshRelations()
          break
        case 'query_complete':
          setThinking('')
          break
        default:
          break
      }
    },
    [refreshPersona, refreshAlerts, refreshDocs, refreshStatus, refreshRelations],
  )

  const { events, connected, activeAgent } = useAgentFeed(onEvent)

  const onSubmit = useCallback(async (query) => {
    setLoading(true)
    setResult(null)
    setHighlights(new Set())
    setThinking('Decomposing query…')
    setSubProgress({ index: 0, total: 0, sub_query: '' })
    try {
      const res = await runQuery(query)
      setResult(res)
      // Light up the version nodes that were actually consulted. Keyed by
      // title+version (the graph maps these to its version nodes), so it stays
      // correct even when node ids are disambiguated.
      const hot = new Set(
        (res.versions_consulted || []).map((v) => `${v.title}::${v.version}`),
      )
      setHighlights(hot)
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
    refreshStatus()
    refreshRelations()
  }, [refreshDocs, refreshAlerts, refreshPersona, refreshStatus, refreshRelations])

  const alertTitles = useMemo(
    () => new Set((Array.isArray(alerts) ? alerts : []).map((a) => a.doc_title)),
    [alerts],
  )

  // Derive session telemetry from the live query_complete stream.
  const stats = useMemo(() => {
    const done = events.filter((e) => e.event === 'query_complete')
    const edge = done.filter((e) => e.route === 'local').length
    const cloud = done.filter((e) => e.route === 'cloud' || e.route === 'hybrid').length
    const latencies = done.map((e) => e.latency_ms || 0).filter(Boolean)
    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0
    return { queries: done.length, edge, cloud, avgLatency, privacy: edge }
  }, [events])

  const docCount = status?.documents ?? documents.length

  return (
    <div className="relative flex h-screen flex-col overflow-hidden">
      <div className="app-atmosphere" />
      <div className="app-grain" />

      <Header
        persona={persona}
        pulsing={pulsing}
        status={status}
        connected={connected}
        docCount={docCount}
      />

      <main className="relative z-10 grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_320px] gap-4 p-4">
        {/* LEFT — documents */}
        <DocumentPanel
          documents={documents}
          onUploaded={onUploaded}
          alertTitles={alertTitles}
          onSelectDoc={setSelectedTitle}
          selectedTitle={selectedTitle}
        />

        {/* CENTER — graph + query */}
        <div className="flex min-h-0 flex-col gap-4">
          <div className="panel relative min-h-0 flex-[1.15] overflow-hidden rounded-2xl">
            <div className="pointer-events-none absolute left-4 top-3 z-10 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">
                Knowledge Graph
              </span>
            </div>
            <MindMap
              documents={documents}
              relations={relations}
              highlights={highlights}
              alertTitles={alertTitles}
              selectedTitle={selectedTitle}
            />
          </div>

          <div className="flex min-h-0 flex-[1] flex-col gap-4 overflow-y-auto pr-1">
            <QueryPanel
              onSubmit={onSubmit}
              loading={loading}
              subProgress={subProgress}
              thinking={thinking}
              hasDocs={documents.length > 0}
            />
            {result ? (
              <AnswerCard result={result} />
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-card/30 p-8 text-center text-sm text-muted">
                Ask a question above. Sensitive documents are answered on-device;
                uncertain answers escalate to Qwen Cloud.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — agent feed + telemetry */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="min-h-0 flex-1">
            <AgentFeed events={events} connected={connected} activeAgent={activeAgent} />
          </div>
          <StatsPanel stats={stats} />
        </div>
      </main>
    </div>
  )
}
