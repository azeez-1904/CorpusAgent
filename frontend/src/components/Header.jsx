import { motion } from 'framer-motion'
import { Cpu, Cloud, FileStack, Wifi, WifiOff } from 'lucide-react'
import PersonaBadge from './PersonaBadge'

const HEX = { clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }

/** Top bar: logo + title (left), persona (center), system status (right). */
export default function Header({ persona, pulsing, status, connected, docCount }) {
  const edgeOn = status?.ollama_running
  const cloudOn = status?.cloud_configured

  return (
    <header className="glass relative z-20 flex h-14 shrink-0 items-center gap-4 px-5">
      {/* Logo + title */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="relative grid h-9 w-9 place-items-center">
          <div className="conic-rotate absolute inset-0" style={HEX} />
          <div
            className="absolute inset-[1.5px] bg-bg"
            style={HEX}
          />
          <span className="relative font-mono text-[13px] font-bold tracking-tight text-blue">
            CA
          </span>
        </div>
        <div className="leading-tight">
          <h1 className="text-[15px] font-bold text-ink">
            Corpus<span className="text-blue">Agent</span>
          </h1>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">
            Temporal RAG Intelligence
          </p>
        </div>
      </div>

      {/* Persona — center */}
      <div className="flex flex-1 justify-center px-2">
        <PersonaBadge persona={persona} pulsing={pulsing} />
      </div>

      {/* Status cluster */}
      <div className="flex shrink-0 items-center gap-2">
        <StatusChip
          icon={<Cpu size={13} />}
          on={edgeOn}
          label={edgeOn ? status?.local_model || 'Ollama' : 'edge offline'}
          color="green"
          tip="Edge inference (Ollama)"
        />
        <StatusChip
          icon={<Cloud size={13} />}
          on={cloudOn}
          label={cloudOn ? 'Qwen ready' : 'cloud offline'}
          color="cyan"
          tip="Cloud escalation (Qwen)"
        />
        <span
          className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-card/60 px-2.5 py-1.5 text-[11px] font-medium text-ink"
          title="Documents in corpus"
        >
          <FileStack size={13} className="text-blue" />
          <span className="font-mono">{docCount ?? 0}</span>
          <span className="text-muted">docs</span>
        </span>

        <span
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
            connected
              ? 'border-green/30 bg-green/10 text-green'
              : 'border-white/8 bg-card/60 text-muted'
          }`}
          title={connected ? 'Live event stream connected' : 'Reconnecting…'}
        >
          {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
          {connected ? 'live' : '…'}
        </span>
      </div>
    </header>
  )
}

const CHIP_COLORS = {
  green: { dot: 'bg-green', text: 'text-green' },
  cyan: { dot: 'bg-cyan', text: 'text-cyan' },
}

function StatusChip({ icon, on, label, color, tip }) {
  const c = CHIP_COLORS[color] || CHIP_COLORS.green
  const dot = on ? c.dot : 'bg-muted'
  return (
    <span
      className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-card/60 px-2.5 py-1.5 text-[11px] font-medium text-ink"
      title={tip}
    >
      <span className="relative flex h-2 w-2">
        {on && (
          <motion.span
            className={`absolute inline-flex h-full w-full rounded-full ${c.dot} opacity-60`}
            animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      <span className={on ? c.text : 'text-muted'}>{icon}</span>
      <span className="max-w-[110px] truncate text-muted">{label}</span>
    </span>
  )
}
