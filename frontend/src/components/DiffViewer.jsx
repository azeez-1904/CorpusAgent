import { motion } from 'framer-motion'
import { GitCompareArrows } from 'lucide-react'

/**
 * Word-level version diff. Additions render green, removals red (struck
 * through), unchanged context muted. Changed segments fade in sequentially to
 * draw the eye along the evolution of the text.
 */
export default function DiffViewer({ diff }) {
  if (!diff || !diff.segments?.length) return null

  let changeIdx = 0
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-bg/60 p-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-ink">
          <GitCompareArrows size={14} className="text-purple" />
          Version diff
        </span>
        {diff.title && (
          <span className="rounded bg-white/5 px-2 py-0.5 text-muted">{diff.title}</span>
        )}
        <span className="font-mono text-muted">
          {diff.old_version} <span className="text-purple">→</span> {diff.new_version}
        </span>
        <span className="ml-auto rounded bg-white/5 px-2 py-0.5 text-muted">
          {Math.round((diff.similarity ?? 0) * 100)}% similar
        </span>
      </div>

      <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 font-mono text-[12.5px] leading-relaxed">
        {diff.segments.map((seg, i) => {
          if (seg.kind === 'added') {
            return (
              <motion.span
                key={i}
                initial={{ opacity: 0, backgroundColor: 'rgba(16,185,129,0.5)' }}
                animate={{ opacity: 1, backgroundColor: 'rgba(16,185,129,0.18)' }}
                transition={{ delay: changeIdx++ * 0.03 }}
                className="rounded text-green"
              >
                {seg.text}
              </motion.span>
            )
          }
          if (seg.kind === 'removed') {
            return (
              <motion.span
                key={i}
                initial={{ opacity: 0, backgroundColor: 'rgba(239,68,68,0.5)' }}
                animate={{ opacity: 1, backgroundColor: 'rgba(239,68,68,0.18)' }}
                transition={{ delay: changeIdx++ * 0.03 }}
                className="rounded text-red line-through"
              >
                {seg.text}
              </motion.span>
            )
          }
          const text =
            seg.text.length > 220
              ? seg.text.slice(0, 100) + ' … ' + seg.text.slice(-100)
              : seg.text
          return (
            <span key={i} className="text-muted">
              {text}
            </span>
          )
        })}
      </div>

      <div className="mt-2 flex gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded bg-green/40" /> added
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded bg-red/40" /> removed
        </span>
      </div>
    </div>
  )
}
