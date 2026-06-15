import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Calendar, FileText, Globe, Loader2, Lock, UploadCloud, X } from 'lucide-react'
import { uploadDocument } from '../lib/api'

/** Slide-up bottom-sheet upload form with an animated sensitivity toggle. */
export default function UploadModal({ open, file, onClose, onDone }) {
  const [title, setTitle] = useState(file ? stripExt(file.name) : '')
  const [version, setVersion] = useState('v1')
  const [date, setDate] = useState('')
  const [sensitive, setSensitive] = useState(false)
  const [chosen, setChosen] = useState(file || null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  // The modal stays mounted, so useState initializers only run once. When the
  // panel re-opens with a drag-dropped file, sync that file (and a default
  // title) into local state instead of silently keeping the stale values.
  useEffect(() => {
    if (!open) return
    setChosen(file || null)
    setTitle((prev) => prev || (file ? stripExt(file.name) : ''))
    setError('')
  }, [open, file])

  const submit = async () => {
    if (!chosen || !title.trim()) {
      setError('A file and title are required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await uploadDocument({
        file: chosen,
        title: title.trim(),
        version: version.trim() || 'v1',
        date: date ? new Date(date).toISOString() : '',
        sensitive,
      })
      onDone()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Upload failed. Is the backend running?')
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="edge-accent panel w-full max-w-lg rounded-2xl p-6 shadow-glow-blue"
            initial={{ y: '110%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '110%', opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 240 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-ink">
                <UploadCloud size={18} className="text-blue" />
                Add to Knowledge Base
              </h3>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-muted transition hover:bg-white/5 hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>

            {/* File picker — native <label> wrapping the input. Clicking the
                label opens the OS file dialog with NO JavaScript, which is the
                most browser-compatible approach. The input is `sr-only` (still
                rendered) rather than `hidden` (display:none), because some
                browsers refuse to open the dialog for a display:none input. */}
            <label className="mt-4 flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 px-4 py-3 text-left text-sm text-muted transition hover:border-blue/60 hover:bg-blue/5">
              <FileText size={18} className={chosen ? 'text-blue' : 'text-muted'} />
              <span className="truncate">
                {chosen ? chosen.name : 'Choose a PDF or TXT file…'}
              </span>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.txt"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    setChosen(f)
                    if (!title) setTitle(stripExt(f.name))
                  }
                }}
              />
            </label>

            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. OPRA Fee Schedule"
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-bg px-3 py-2 text-sm text-ink outline-none transition focus:border-blue/60 focus:shadow-glow-blue"
            />

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Version
                </label>
                <input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="v1"
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-bg px-3 py-2 font-mono text-sm text-ink outline-none transition focus:border-blue/60"
                />
              </div>
              <div>
                <label className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  <Calendar size={11} /> Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-bg px-3 py-2 text-sm text-ink outline-none transition focus:border-blue/60 [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Sensitivity toggle */}
            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Privacy classification
            </label>
            <div className="relative mt-1.5 grid grid-cols-2 rounded-xl border border-white/10 bg-bg p-1">
              <motion.div
                layout
                transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                className={`absolute inset-y-1 w-[calc(50%-4px)] rounded-lg ${
                  sensitive ? 'left-[calc(50%+0px)] bg-red/20 shadow-glow-red' : 'left-1 bg-green/20 shadow-glow-green'
                }`}
              />
              <button
                onClick={() => setSensitive(false)}
                className={`relative z-10 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${
                  !sensitive ? 'text-green' : 'text-muted'
                }`}
              >
                <Globe size={14} /> PUBLIC
              </button>
              <button
                onClick={() => setSensitive(true)}
                className={`relative z-10 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${
                  sensitive ? 'text-red' : 'text-muted'
                }`}
              >
                <Lock size={14} /> SENSITIVE
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted">
              {sensitive
                ? 'Answered strictly on-device — never sent to the cloud.'
                : 'May escalate to Qwen Cloud when edge confidence is low.'}
            </p>

            {error && <p className="mt-3 text-xs text-red">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-muted transition hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg bg-blue px-5 py-2 text-sm font-semibold text-white shadow-glow-blue transition hover:bg-blue/90 disabled:opacity-40"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                {busy ? 'Embedding…' : 'Upload & embed'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function stripExt(name) {
  return name.replace(/\.(pdf|txt)$/i, '')
}
