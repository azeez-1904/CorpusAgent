import { useEffect, useState } from 'react'

/**
 * The hero element. Shows the self-generated expert persona with a typing
 * effect and a pulsing ring while the SpecializationAgent is working.
 */
export default function PersonaBadge({ persona, pulsing }) {
  const fullText = persona?.persona || ''
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!fullText) {
      setTyped('')
      return
    }
    setTyped('')
    let i = 0
    const id = setInterval(() => {
      i += 2
      setTyped(fullText.slice(0, i))
      if (i >= fullText.length) clearInterval(id)
    }, 18)
    return () => clearInterval(id)
  }, [fullText])

  const empty = !persona?.persona

  return (
    <div
      className={`rounded-2xl border border-purple/30 bg-gradient-to-br from-surface2 to-surface px-6 py-5 transition-all ${
        pulsing ? 'animate-pulse-ring border-purple' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-purple/20 text-xl ${
            pulsing ? 'animate-pulse' : ''
          }`}
        >
          🧠
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              CorpusAgent Persona
            </span>
            {persona?.domain && (
              <span className="rounded-full bg-purple/20 px-2.5 py-0.5 text-xs font-semibold text-purple">
                {persona.domain}
              </span>
            )}
            {pulsing && (
              <span className="text-xs text-purple animate-pulse">specialising…</span>
            )}
          </div>
          {empty ? (
            <p className="mt-1 text-sm italic text-muted">
              No persona yet — upload documents to specialise the agent.
            </p>
          ) : (
            <p className="mt-1 text-[15px] italic leading-snug text-ink">
              “{typed}
              <span className="animate-blink">▍</span>”
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
