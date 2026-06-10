import { useMemo, useState } from 'react'

const TEMPORAL = ['from', 'to', 'between', 'since', 'changed', 'change', 'compare', 'over time', 'history', 'versus', 'vs']

function detectIntent(q) {
  const text = q.toLowerCase()
  const years = (q.match(/\b(19|20)\d{2}\b/g) || [])
  const hasConj = / and | or | vs | versus /.test(text)
  const temporal = years.length > 0 || TEMPORAL.some((t) => text.includes(t))
  if (years.length >= 2 || (hasConj && temporal) || (q.split(/\s+/).length > 15 && temporal))
    return { label: 'complex multi-part temporal', color: 'text-purple bg-purple/15' }
  if (/change|differ|compare|diff|versus|history/.test(text))
    return { label: 'version change / diff', color: 'text-orange bg-orange/15' }
  if (temporal) return { label: 'temporal lookup', color: 'text-accent bg-accent/15' }
  return { label: 'factual lookup', color: 'text-green bg-green/15' }
}

export default function QueryPanel({ onSubmit, loading, subProgress, thinking }) {
  const [query, setQuery] = useState('')
  const intent = useMemo(() => (query.trim() ? detectIntent(query) : null), [query])

  const submit = () => {
    if (query.trim() && !loading) onSubmit(query.trim())
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-surface p-5">
      <div className="relative">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
          placeholder="Ask a temporal question, e.g. “How did the fee structure and appeal process change between 2021 and 2024?”"
          rows={3}
          className="w-full resize-none rounded-xl border border-white/10 bg-bg px-4 py-3 text-[15px] text-ink outline-none placeholder:text-muted focus:border-accent/60"
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        {intent && (
          <span
            className={`animate-fade-in rounded-full px-3 py-1 text-xs font-semibold ${intent.color}`}
          >
            {intent.label}
          </span>
        )}
        <button
          onClick={submit}
          disabled={loading || !query.trim()}
          className="ml-auto rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Working…' : 'Ask CorpusAgent'}
        </button>
      </div>

      {loading && (
        <div className="mt-4 animate-fade-in rounded-xl border border-accent/20 bg-accent/5 p-3">
          <div className="flex items-center gap-2 text-sm text-accent">
            <Spinner />
            <span>{thinking || 'Agent is thinking'}</span>
            <Dots />
          </div>
          {subProgress?.total > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>
                  Sub-query {subProgress.index} / {subProgress.total}
                </span>
                <span>{Math.round((subProgress.index / subProgress.total) * 100)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2">
                <div
                  className="h-full rounded-full bg-purple transition-all duration-500"
                  style={{ width: `${(subProgress.index / subProgress.total) * 100}%` }}
                />
              </div>
              {subProgress.sub_query && (
                <p className="mt-1.5 text-xs italic text-muted">↳ {subProgress.sub_query}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
  )
}
function Dots() {
  return (
    <span className="inline-flex gap-0.5">
      <span className="animate-blink">.</span>
      <span className="animate-blink [animation-delay:0.2s]">.</span>
      <span className="animate-blink [animation-delay:0.4s]">.</span>
    </span>
  )
}
