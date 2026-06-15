import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'

/** Horizontal timeline of the document versions consulted to produce an answer. */
export default function VersionTimeline({ versions }) {
  if (!versions?.length) return null
  const sorted = [...versions].sort((a, b) =>
    (a.timestamp || '').localeCompare(b.timestamp || ''),
  )

  return (
    <div className="mt-4">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
        Versions consulted
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {sorted.map((v, i) => (
          <span key={`${v.title}-${v.version}-${i}`} className="flex items-center gap-1.5">
            <motion.span
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.06 }}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] ${
                v.sensitive
                  ? 'border-red/40 bg-red/10 text-red'
                  : 'border-blue/40 bg-blue/10 text-blue'
              }`}
              title={v.timestamp}
            >
              {v.sensitive && <Lock size={10} />}
              <span className="font-medium text-ink/90">{v.title}</span>
              <span className="font-mono opacity-80">{v.version}</span>
            </motion.span>
            {i < sorted.length - 1 && <span className="text-muted">→</span>}
          </span>
        ))}
      </div>
    </div>
  )
}
