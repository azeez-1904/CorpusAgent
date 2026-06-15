import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Database, Lock, Plus, UploadCloud } from 'lucide-react'
import UploadModal from './UploadModal'

/**
 * Left panel — the knowledge base. Lists documents grouped by title with an
 * inline version timeline. Clicking a card highlights its node in the graph.
 */
export default function DocumentPanel({
  documents,
  onUploaded,
  alertTitles,
  onSelectDoc,
  selectedTitle,
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)

  const openWith = (file) => {
    setPendingFile(file || null)
    setModalOpen(true)
  }

  return (
    <div className="panel flex h-full flex-col rounded-2xl">
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
        <Database size={15} className="text-blue" />
        <span className="text-sm font-bold text-ink">Knowledge Base</span>
        <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-muted">
          {documents.length}
        </span>
        <button
          onClick={() => openWith(null)}
          className="ml-auto flex items-center gap-1 rounded-lg border border-blue/30 bg-blue/10 px-2 py-1 text-[11px] font-semibold text-blue transition hover:border-blue hover:shadow-glow-blue"
        >
          <Plus size={13} /> Upload
        </button>
      </div>

      <DropZone onPick={openWith} />

      <div className="flex-1 space-y-2.5 overflow-y-auto px-3 pb-3">
        {documents.length === 0 && (
          <p className="px-1 py-8 text-center text-xs text-muted">
            No documents yet.
            <br />
            Drop a PDF / TXT above to begin.
          </p>
        )}
        <AnimatePresence initial={false}>
          {documents.map((doc, i) => {
            const selected = selectedTitle === doc.title
            const alerted = alertTitles?.has(doc.title)
            return (
              <motion.button
                key={doc.title}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
                onClick={() => onSelectDoc?.(selected ? null : doc.title)}
                whileHover={{ scale: 1.015 }}
                className={`block w-full rounded-xl border p-3 text-left transition ${
                  selected
                    ? 'border-blue/50 bg-blue/10 shadow-glow-blue'
                    : 'border-white/8 bg-card/50 hover:border-white/15 hover:bg-card-hover/60'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="truncate text-[13px] font-semibold text-ink"
                    title={doc.title}
                  >
                    {doc.title}
                  </span>
                  {doc.sensitive ? (
                    <span className="flex items-center gap-0.5 rounded bg-red/15 px-1.5 py-0.5 text-[9px] font-bold text-red">
                      <Lock size={9} />
                    </span>
                  ) : (
                    <span className="rounded bg-green/15 px-1.5 py-0.5 text-[9px] font-bold text-green">
                      PUB
                    </span>
                  )}
                  {alerted && (
                    <motion.span
                      className="ml-auto h-1.5 w-1.5 rounded-full bg-orange shadow-glow-orange"
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                      title="New version detected"
                    />
                  )}
                </div>
                <VersionDots versions={doc.versions} />
              </motion.button>
            )
          })}
        </AnimatePresence>
      </div>

      <UploadModal
        open={modalOpen}
        file={pendingFile}
        onClose={() => {
          setModalOpen(false)
          setPendingFile(null)
        }}
        onDone={() => {
          setModalOpen(false)
          setPendingFile(null)
          onUploaded()
        }}
      />
    </div>
  )
}

function VersionDots({ versions }) {
  const sorted = [...versions].sort((a, b) =>
    (a.timestamp || '').localeCompare(b.timestamp || ''),
  )
  return (
    <div className="mt-2.5 flex items-center">
      {sorted.map((v, i) => {
        const current = !v.superseded_by
        return (
          <div key={v.id} className="flex items-center" title={`${v.version} · ${fmtDate(v.timestamp)}`}>
            <div className="group relative flex flex-col items-center">
              <span
                className={`h-2.5 w-2.5 rounded-full border-2 transition ${
                  current
                    ? 'border-blue bg-blue shadow-glow-blue'
                    : 'border-muted/40 bg-transparent'
                }`}
              />
              <span className="pointer-events-none absolute -top-6 hidden whitespace-nowrap rounded bg-bg px-1.5 py-0.5 font-mono text-[9px] text-ink ring-1 ring-white/10 group-hover:block">
                {v.version} · {fmtDate(v.timestamp)}
              </span>
            </div>
            {i < sorted.length - 1 && (
              <span className="h-[2px] w-5 bg-gradient-to-r from-blue/50 to-muted/20" />
            )}
          </div>
        )
      })}
    </div>
  )
}

function DropZone({ onPick }) {
  const [over, setOver] = useState(false)
  // A native <label> is both the click-to-browse trigger (clicking a label
  // opens the OS file dialog with no JavaScript — the most compatible path)
  // and the drag-drop target. The input is `sr-only` (rendered) not `hidden`
  // (display:none), which some browsers won't open a dialog for.
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        onPick(e.dataTransfer.files?.[0])
      }}
      className={`mx-3 mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-center text-[11px] transition ${
        over
          ? 'border-solid border-blue bg-blue/10 text-blue shadow-glow-blue'
          : 'border-dashed border-white/12 text-muted hover:border-blue/40 hover:text-blue'
      }`}
    >
      <input
        type="file"
        accept=".pdf,.txt"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
          e.target.value = ''
        }}
      />
      <UploadCloud size={14} className={over ? 'text-blue' : 'text-muted'} />
      {over ? 'Release to upload' : 'Drag & drop a PDF / TXT — or click to browse'}
    </label>
  )
}

function fmtDate(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ts.slice(0, 10)
  }
}
