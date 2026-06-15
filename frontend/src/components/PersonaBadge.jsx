import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

/**
 * Header-center persona pill. When the SpecializationAgent updates the persona,
 * the text types in character-by-character behind a blinking cursor and the
 * whole pill pulses with a blue glow.
 */
export default function PersonaBadge({ persona, pulsing }) {
  const fullText = persona?.persona || ''
  const [typed, setTyped] = useState('')
  const intervalRef = useRef(null)

  useEffect(() => {
    clearInterval(intervalRef.current)
    if (!fullText) {
      setTyped('')
      return
    }
    let i = 0
    setTyped('')
    intervalRef.current = setInterval(() => {
      i += 2
      setTyped(fullText.slice(0, i))
      if (i >= fullText.length) clearInterval(intervalRef.current)
    }, 16)
    return () => clearInterval(intervalRef.current)
  }, [fullText])

  const empty = !persona?.persona

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`relative flex min-w-0 max-w-[640px] items-center gap-2.5 rounded-full border px-3.5 py-1.5 transition-shadow duration-500 ${
        pulsing
          ? 'border-blue/50 bg-blue/10 shadow-glow-blue'
          : 'border-white/8 bg-card/60'
      }`}
      style={{ backdropFilter: 'blur(12px)' }}
    >
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
          pulsing ? 'bg-blue/25 text-blue animate-pulse' : 'bg-purple/15 text-purple'
        }`}
      >
        <Sparkles size={13} strokeWidth={2.25} />
      </span>

      <div className="flex min-w-0 items-center gap-2">
        {persona?.domain ? (
          <span className="shrink-0 rounded-full bg-purple/20 px-2.5 py-0.5 text-[11px] font-semibold text-purple ring-1 ring-purple/30">
            {persona.domain}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-muted">
            Generalist
          </span>
        )}

        {empty ? (
          <span className="truncate text-[12.5px] italic text-muted">
            Upload documents to self-specialize…
          </span>
        ) : (
          <span className="truncate text-[12.5px] text-ink/90" title={fullText}>
            {typed}
            <span className="ml-0.5 inline-block w-[1px] animate-blink text-blue">▍</span>
          </span>
        )}
      </div>

      {pulsing && (
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-blue">
          specializing
        </span>
      )}
    </motion.div>
  )
}
