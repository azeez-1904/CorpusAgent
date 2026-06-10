/**
 * Renders a word-level version diff: red = removed, green = added,
 * unchanged text shown in muted gray. Long unchanged runs are trimmed.
 */
export default function DiffViewer({ diff }) {
  if (!diff || !diff.segments?.length) return null

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-bg/60 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted">
        <span className="font-semibold text-ink">Version diff</span>
        <span className="rounded bg-surface2 px-2 py-0.5">{diff.title}</span>
        <span>
          {diff.old_version} → {diff.new_version}
        </span>
        <span className="ml-auto">{Math.round((diff.similarity ?? 0) * 100)}% similar</span>
      </div>
      <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed">
        {diff.segments.map((seg, i) => {
          if (seg.kind === 'added')
            return (
              <span key={i} className="rounded bg-green/20 text-green">
                {seg.text}
              </span>
            )
          if (seg.kind === 'removed')
            return (
              <span key={i} className="rounded bg-red/20 text-red line-through">
                {seg.text}
              </span>
            )
          const text = seg.text.length > 220 ? seg.text.slice(0, 100) + ' … ' + seg.text.slice(-100) : seg.text
          return (
            <span key={i} className="text-muted">
              {text}
            </span>
          )
        })}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded bg-green/40" /> added
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded bg-red/40" /> removed
        </span>
      </div>
    </div>
  )
}
