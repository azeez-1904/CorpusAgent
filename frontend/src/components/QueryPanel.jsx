import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, CornerDownLeft, Loader2, Sparkles } from 'lucide-react'

/** Intent classification mirrors the temporal categories the backend reasons about. */
function detectIntent(q) {
  const t = q.toLowerCase()
  const years = q.match(/\b(19|20)\d{2}\b/g) || []
  if (/\btrend|over time|evolve|evolv|growth|trajectory|history\b/.test(t))
    return { key: 'trend', label: 'Trend', icon: '📈', cls: 'text-purple bg-purple/15 ring-purple/30' }
  if (/\bchange|changed|differ|different|compare|comparison|diff|versus| vs |revised\b/.test(t))
    return { key: 'change', label: 'Change', icon: '🔄', cls: 'text-orange bg-orange/15 ring-orange/30' }
  if (/\bcurrent|currently|latest|now|today|still|in effect|valid|up to date|up-to-date\b/.test(t))
    return { key: 'currency', label: 'Currency', icon: '✅', cls: 'text-green bg-green/15 ring-green/30' }
  if (years.length > 0 || /\bas of|in 20|back in|at the time|on \b/.test(t))
    return { key: 'point', label: 'Point-in-time', icon: '🕐', cls: 'text-blue bg-blue/15 ring-blue/30' }
  return { key: 'current', label: 'Current', icon: '💬', cls: 'text-muted bg-white/5 ring-white/10' }
}

export default function QueryPanel({ onSubmit, loading, subProgress, thinking, hasDocs }) {
  const [query, setQuery] = useState('')
  const [subs, setSubs] = useState([])
  const wasLoading = useRef(false)
  const intent = useMemo(() => (query.trim() ? detectIntent(query) : null), [query])

  // Reset the live decomposition list at the start of each run.
  useEffect(() => {
    if (loading && !wasLoading.current) setSubs([])
    wasLoading.current = loading
  }, [loading])

  // Accumulate sub-queries as the backend streams progress events.
  useEffect(() => {
    const { index, total, sub_query } = subProgress || {}
    if (!total || !sub_query || !index) return
    setSubs((prev) => {
      const next = Array.from({ length: total }, (_, i) => prev[i] || null)
      for (let i = 0; i < index - 1; i++) {
        if (next[i]) next[i] = { ...next[i], status: 'done' }
      }
      next[index - 1] = { index, text: sub_query, status: 'running' }
      return next
    })
  }, [subProgress])

  // When the run finishes, flush remaining cards to done.
  useEffect(() => {
    if (!loading && subs.length) {
      setSubs((prev) => prev.map((s) => (s ? { ...s, status: 'done' } : s)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const submit = () => {
    if (query.trim() && !loading && hasDocs) onSubmit(query.trim())
  }

  return (
    <div className="edge-accent panel rounded-2xl p-4">
      <div className="relative">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={
            hasDocs
              ? 'Ask anything about your documents…  e.g. “How did the appeal fee change between 2021 and 2024?”'
              : 'Upload a document to start asking questions…'
          }
          rows={2}
          disabled={!hasDocs}
          className="w-full resize-none rounded-xl border border-white/10 bg-bg/80 px-4 py-3 pr-12 text-[14px] leading-relaxed text-ink outline-none transition placeholder:text-muted focus:border-blue/50 focus:shadow-glow-blue disabled:opacity-50"
        />
        <Sparkles size={15} className="pointer-events-none absolute right-4 top-3.5 text-muted/60" />
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <AnimatePresence mode="wait">
          {intent && (
            <motion.span
              key={intent.key}
              initial={{ opacity: 0, scale: 0.85, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85 }}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${intent.cls}`}
            >
              <span>{intent.icon}</span>
              {intent.label}
            </motion.span>
          )}
        </AnimatePresence>

        <span className="hidden text-[10px] text-muted sm:block">
          <kbd className="rounded bg-white/5 px-1 py-0.5 font-mono">Enter</kbd> to ask ·{' '}
          <kbd className="rounded bg-white/5 px-1 py-0.5 font-mono">Shift+Enter</kbd> newline
        </span>

        <motion.button
          onClick={submit}
          disabled={loading || !query.trim() || !hasDocs}
          whileTap={{ scale: 0.96 }}
          className="ml-auto flex items-center gap-2 rounded-xl bg-blue px-4 py-2 text-sm font-semibold text-white shadow-glow-blue transition hover:bg-blue/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <CornerDownLeft size={15} />}
          {loading ? 'Reasoning…' : 'Ask CorpusAgent'}
        </motion.button>
      </div>

      {/* Live thinking indicator */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden"
          >
            <div className="flex items-center gap-2 rounded-lg border border-blue/20 bg-blue/5 px-3 py-2 text-[13px] text-blue">
              <ThinkingDots />
              <span>{thinking || 'Decomposing query…'}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sub-query decomposition cards */}
      <AnimatePresence>
        {subs.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 space-y-2"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Sub-query decomposition
            </p>
            {subs.map((s, i) => (
              <SubQueryCard key={i} index={i + 1} sub={s} delay={i * 0.15} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SubQueryCard({ index, sub, delay }) {
  const done = sub?.status === 'done'
  const running = sub?.status === 'running'
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', damping: 22, stiffness: 260 }}
      className={`rounded-lg border p-2.5 transition ${
        done
          ? 'border-green/30 bg-green/5'
          : running
            ? 'border-blue/40 bg-blue/5'
            : 'border-white/8 bg-card/40'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-bold ${
            done ? 'bg-green/20 text-green' : 'bg-white/8 text-muted'
          }`}
        >
          {done ? <Check size={12} /> : index}
        </span>
        <span className="truncate text-[12.5px] text-ink/90">
          {sub?.text || 'Pending…'}
        </span>
        {running && <Loader2 size={13} className="ml-auto shrink-0 animate-spin text-blue" />}
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
        <motion.div
          className={`h-full rounded-full ${done ? 'bg-green' : 'bg-blue'}`}
          initial={{ width: '8%' }}
          animate={{ width: done ? '100%' : running ? '70%' : '8%' }}
          transition={{ duration: done ? 0.4 : 1.2, ease: 'easeOut' }}
        />
      </div>
    </motion.div>
  )
}

function ThinkingDots() {
  return (
    <span className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce-dot rounded-full bg-blue"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  )
}
