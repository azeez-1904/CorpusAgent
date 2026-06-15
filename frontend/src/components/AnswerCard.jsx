import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Cloud, Cpu, Gauge, Layers, Shield, Split, Zap } from 'lucide-react'
import DiffViewer from './DiffViewer'
import VersionTimeline from './VersionTimeline'

const ROUTE = {
  local: { label: 'LOCAL', Icon: Cpu, cls: 'border-green/50 bg-green/10 text-green shadow-glow-green' },
  cloud: { label: 'CLOUD', Icon: Cloud, cls: 'border-cyan/50 bg-cyan/10 text-cyan shadow-glow-cyan' },
  hybrid: { label: 'HYBRID', Icon: Split, cls: 'border-purple/50 bg-purple/10 text-purple shadow-glow-purple' },
}
const SUB_ROUTE = {
  local: 'bg-green/15 text-green',
  cloud: 'bg-cyan/15 text-cyan',
  hybrid: 'bg-purple/15 text-purple',
}

/** Reveals text quickly regardless of length (caps total duration ~1.1s). */
function useTypewriter(text) {
  const [out, setOut] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    clearInterval(ref.current)
    if (!text) {
      setOut('')
      return
    }
    const step = Math.max(1, Math.ceil(text.length / 70))
    let i = 0
    ref.current = setInterval(() => {
      i += step
      setOut(text.slice(0, i))
      if (i >= text.length) clearInterval(ref.current)
    }, 16)
    return () => clearInterval(ref.current)
  }, [text])
  return out
}

export default function AnswerCard({ result }) {
  const typed = useTypewriter(result?.answer || '')
  if (!result) return null
  const r = ROUTE[result.route] || ROUTE.local
  const done = typed.length >= (result.answer?.length || 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="edge-accent panel rounded-2xl p-5"
    >
      {/* Header row */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <motion.span
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 14, stiffness: 320 }}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold tracking-wide ${r.cls}`}
        >
          <r.Icon size={14} />
          {r.label}
        </motion.span>

        <span className="rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-muted">
          {result.intent}
        </span>
        {result.sensitive && (
          <span className="flex items-center gap-1 rounded-lg bg-red/15 px-2.5 py-1.5 text-[11px] font-semibold text-red">
            <Shield size={11} /> privacy-preserved
          </span>
        )}
        {result.is_complex && (
          <span className="rounded-lg bg-purple/15 px-2.5 py-1.5 text-[11px] font-semibold text-purple">
            multi-part
          </span>
        )}
      </div>

      {/* Answer */}
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
        {typed}
        {!done && <span className="ml-0.5 inline-block animate-blink text-blue">▍</span>}
      </p>

      {/* Sub-results */}
      {result.is_complex && result.sub_results?.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Sub-query breakdown ({result.sub_results.length})
          </div>
          {result.sub_results.map((sr, i) => (
            <motion.div
              key={sr.index ?? i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="rounded-lg border border-white/8 bg-card/40 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded bg-white/8 font-mono text-[10px] text-muted">
                  {sr.index ?? i + 1}
                </span>
                <span className="text-[13px] font-medium text-ink">{sr.sub_query}</span>
                {sr.route && (
                  <span
                    className={`ml-auto rounded px-2 py-0.5 text-[9px] font-bold ${
                      SUB_ROUTE[sr.route] || SUB_ROUTE.local
                    }`}
                  >
                    {sr.route.toUpperCase()}
                  </span>
                )}
              </div>
              <p className="mt-1.5 pl-7 text-[13px] text-muted">{sr.answer}</p>
            </motion.div>
          ))}
        </div>
      )}

      <VersionTimeline versions={result.versions_consulted} />
      <DiffViewer diff={result.diff} />

      {/* Stats footer */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/8 pt-3 font-mono text-[11px] text-muted">
        <Stat icon={<Zap size={11} className="text-orange" />} value={`${result.latency_ms ?? 0} ms`} />
        <Stat icon={<Cpu size={11} className="text-blue" />} value={result.model_used || 'edge'} />
        <Stat icon={<Layers size={11} className="text-cyan" />} value={`${result.chunks_retrieved ?? 0} chunks`} />
        {result.tokens_used > 0 && (
          <Stat icon={<Gauge size={11} className="text-purple" />} value={`${result.tokens_used} tok`} />
        )}
      </div>
    </motion.div>
  )
}

function Stat({ icon, value }) {
  return (
    <span className="flex items-center gap-1.5">
      {icon}
      {value}
    </span>
  )
}
