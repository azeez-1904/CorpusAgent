import { Cpu, Cloud, ShieldCheck, Timer, MessageSquare } from 'lucide-react'

/**
 * Compact telemetry strip pinned under the agent feed. All values are derived
 * from the live query_complete event stream — no fabricated numbers.
 */
export default function StatsPanel({ stats }) {
  const { queries = 0, edge = 0, cloud = 0, avgLatency = 0, privacy = 0 } = stats || {}

  return (
    <div className="panel rounded-2xl p-3">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <span>Session telemetry</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tile
          icon={<MessageSquare size={13} className="text-blue" />}
          label="Queries"
          value={queries}
        />
        <Tile
          icon={<Timer size={13} className="text-orange" />}
          label="Avg latency"
          value={`${avgLatency} ms`}
        />
        <Tile
          icon={<ShieldCheck size={13} className="text-green" />}
          label="Privacy kept"
          value={privacy}
        />
        <div className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-card/50 p-2.5">
          <Donut edge={edge} cloud={cloud} />
          <div className="min-w-0 text-[10px] leading-tight">
            <div className="flex items-center gap-1 text-green">
              <Cpu size={10} /> edge {edge}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-cyan">
              <Cloud size={10} /> cloud {cloud}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Tile({ icon, label, value }) {
  return (
    <div className="rounded-lg border border-white/8 bg-card/50 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-mono text-lg font-bold text-ink">{value}</div>
    </div>
  )
}

function Donut({ edge, cloud }) {
  const total = edge + cloud
  const r = 13
  const c = 2 * Math.PI * r
  const edgeFrac = total ? edge / total : 0
  const edgeLen = c * edgeFrac

  return (
    <svg width="34" height="34" viewBox="0 0 34 34" className="shrink-0 -rotate-90">
      <circle cx="17" cy="17" r={r} fill="none" stroke="#1a2235" strokeWidth="6" />
      {total > 0 && (
        <>
          <circle
            cx="17"
            cy="17"
            r={r}
            fill="none"
            stroke="#06b6d4"
            strokeWidth="6"
            strokeDasharray={c}
            strokeDashoffset={0}
          />
          <circle
            cx="17"
            cy="17"
            r={r}
            fill="none"
            stroke="#10b981"
            strokeWidth="6"
            strokeDasharray={`${edgeLen} ${c - edgeLen}`}
            strokeLinecap="butt"
          />
        </>
      )}
    </svg>
  )
}
