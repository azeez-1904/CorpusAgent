import { useRef, useState } from 'react'
import { uploadDocument } from '../api'

export default function DocumentPanel({ documents, onUploaded, alertTitles }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)

  const onPick = (file) => {
    if (!file) return
    setPendingFile(file)
    setModalOpen(true)
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-surface">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="text-sm font-semibold text-ink">Documents</span>
        <button
          onClick={() => setModalOpen(true)}
          className="ml-auto rounded-lg bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/25"
        >
          + Upload
        </button>
      </div>

      <DropZone onPick={onPick} />

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {documents.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-muted">
            No documents yet. Upload PDFs or TXT files to begin.
          </p>
        )}
        {documents.map((doc) => (
          <div key={doc.title} className="rounded-xl border border-white/5 bg-bg/50 p-3">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-ink" title={doc.title}>
                {doc.title}
              </span>
              {doc.sensitive && (
                <span className="rounded bg-red/15 px-1.5 py-0.5 text-[10px] font-bold text-red">
                  🔒
                </span>
              )}
              {alertTitles?.has(doc.title) && (
                <span className="h-2 w-2 rounded-full bg-orange" title="New version alert" />
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {doc.versions.map((v, i) => (
                <span key={v.id} className="flex items-center gap-1">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] ${
                      v.superseded_by
                        ? 'bg-surface2 text-muted line-through'
                        : 'bg-accent/15 text-accent'
                    }`}
                    title={v.timestamp}
                  >
                    {v.version}
                  </span>
                  {i < doc.versions.length - 1 && (
                    <span className="text-[10px] text-muted">→</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <UploadModal
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
      )}
    </div>
  )
}

function DropZone({ onPick }) {
  const [over, setOver] = useState(false)
  const inputRef = useRef(null)
  return (
    <div
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
      onClick={() => inputRef.current?.click()}
      className={`mx-3 mt-3 cursor-pointer rounded-xl border border-dashed px-3 py-4 text-center text-xs transition ${
        over ? 'border-accent bg-accent/10 text-accent' : 'border-white/15 text-muted'
      }`}
    >
      Drag & drop a PDF / TXT here, or click to browse
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
    </div>
  )
}

function UploadModal({ file, onClose, onDone }) {
  const [title, setTitle] = useState(file ? file.name.replace(/\.(pdf|txt)$/i, '') : '')
  const [version, setVersion] = useState('v1')
  const [date, setDate] = useState('')
  const [sensitive, setSensitive] = useState(false)
  const [chosen, setChosen] = useState(file || null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

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
      setError(e?.response?.data?.detail || 'Upload failed.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-ink">Upload document</h3>

        <div
          onClick={() => inputRef.current?.click()}
          className="mt-3 cursor-pointer rounded-xl border border-dashed border-white/15 px-3 py-3 text-center text-xs text-muted hover:border-accent/60"
        >
          {chosen ? `📄 ${chosen.name}` : 'Click to choose a PDF / TXT file'}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setChosen(f)
                if (!title) setTitle(f.name.replace(/\.(pdf|txt)$/i, ''))
              }
            }}
          />
        </div>

        <label className="mt-3 block text-xs text-muted">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent/60"
          placeholder="e.g. OPRA Fee Schedule"
        />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted">Version</label>
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent/60"
              placeholder="v1"
            />
          </div>
          <div>
            <label className="block text-xs text-muted">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent/60"
            />
          </div>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={sensitive}
            onChange={(e) => setSensitive(e.target.checked)}
            className="h-4 w-4 accent-red-500"
          />
          🔒 Mark as sensitive (never sent to cloud)
        </label>

        {error && <p className="mt-2 text-xs text-red">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-40"
          >
            {busy ? 'Embedding…' : 'Upload & embed'}
          </button>
        </div>
      </div>
    </div>
  )
}
