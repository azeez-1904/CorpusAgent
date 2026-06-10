/** Horizontal pills of the document versions consulted for an answer. */
export default function VersionTimeline({ versions }) {
  if (!versions?.length) return null
  const sorted = [...versions].sort((a, b) =>
    (a.timestamp || '').localeCompare(b.timestamp || ''),
  )

  return (
    <div className="mt-3">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
        Versions consulted
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {sorted.map((v, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span
              className={`rounded-lg border px-2.5 py-1 text-xs ${
                v.sensitive
                  ? 'border-red/40 bg-red/10 text-red'
                  : 'border-accent/40 bg-accent/10 text-accent'
              }`}
              title={v.timestamp}
            >
              {v.sensitive && '🔒 '}
              {v.title} · {v.version}
            </span>
            {i < sorted.length - 1 && <span className="text-muted">→</span>}
          </span>
        ))}
      </div>
    </div>
  )
}
