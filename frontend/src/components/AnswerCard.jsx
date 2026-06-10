import DiffViewer from './DiffViewer'
import VersionTimeline from './VersionTimeline'

const ROUTE_STYLES = {
  local: { label: '🔒 LOCAL', cls: 'bg-green/15 text-green border-green/40' },
  cloud: { label: '☁️ CLOUD', cls: 'bg-accent/15 text-accent border-accent/40' },
  hybrid: { label: '🔀 HYBRID', cls: 'bg-purple/15 text-purple border-purple/40' },
}

export default function AnswerCard({ result }) {
  if (!result) return null
  const route = ROUTE_STYLES[result.route] || ROUTE_STYLES.local

  return (
    <div className="animate-fade-in rounded-2xl border border-white/10 bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-lg border px-3 py-1 text-xs font-bold ${route.cls}`}>
          {route.label}
        </span>
        <span className="rounded-lg bg-surface2 px-2.5 py-1 text-xs text-muted">
          {result.intent}
        </span>
        {result.sensitive && (
          <span className="rounded-lg bg-red/15 px-2.5 py-1 text-xs text-red">
            privacy-preserved
          </span>
        )}
        <span className="ml-auto font-mono text-xs text-muted">
          {result.latency_ms} ms · {result.model_used || 'edge'} ·{' '}
          {result.chunks_retrieved} chunks
        </span>
      </div>

      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
        {result.answer}
      </p>

      {result.is_complex && result.sub_results?.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">
            Sub-query breakdown ({result.sub_results.length})
          </div>
          {result.sub_results.map((sr) => (
            <div key={sr.index} className="rounded-lg border border-white/5 bg-bg/50 p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded bg-surface2 text-[11px] text-muted">
                  {sr.index}
                </span>
                <span className="text-sm font-medium text-ink">{sr.sub_query}</span>
                <span
                  className={`ml-auto rounded px-2 py-0.5 text-[10px] font-bold ${
                    (ROUTE_STYLES[sr.route] || ROUTE_STYLES.local).cls
                  }`}
                >
                  {sr.route?.toUpperCase()}
                </span>
              </div>
              <p className="mt-1.5 pl-7 text-sm text-muted">{sr.answer}</p>
            </div>
          ))}
        </div>
      )}

      <VersionTimeline versions={result.versions_consulted} />
      <DiffViewer diff={result.diff} />
    </div>
  )
}
