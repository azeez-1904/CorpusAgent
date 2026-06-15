import { useEffect, useMemo, useRef } from 'react'
import * as d3 from 'd3'

/**
 * Live knowledge graph. Documents become hub nodes; each version is a smaller
 * satellite. Solid arrowed edges show temporal flow between versions; faint
 * dashed edges connect topically related documents. When a query runs, the
 * consulted version nodes light up, emit orbiting "chunk" particles, and the
 * edges feeding them animate a flowing dash to trace the retrieval path.
 */

function buildGraph(documents, relations) {
  const nodes = []
  const links = []
  const titles = new Set(documents.map((d) => d.title))

  documents.forEach((doc) => {
    const hubId = `hub::${doc.title}`
    nodes.push({
      id: hubId,
      type: 'hub',
      title: doc.title,
      sensitive: doc.sensitive,
      count: doc.versions.length,
    })

    const sorted = [...doc.versions].sort((a, b) =>
      (a.timestamp || '').localeCompare(b.timestamp || ''),
    )
    let prevId = null
    sorted.forEach((v, i) => {
      // Use the version's unique doc id for the node id so two uploads that
      // share a title AND version string (e.g. both "v1") don't collide into
      // one node / a self-loop. `verKey` (title+version) is what query
      // highlights match against.
      const vid = `ver::${v.id || `${doc.title}::${v.version}::${i}`}`
      nodes.push({
        id: vid,
        type: 'version',
        title: doc.title,
        version: v.version,
        verKey: `${doc.title}::${v.version}`,
        timestamp: v.timestamp,
        sensitive: v.sensitive,
        superseded: !!v.superseded_by,
      })
      links.push({ source: hubId, target: vid, kind: 'member' })
      if (prevId) {
        links.push({ source: prevId, target: vid, kind: 'temporal' })
      }
      prevId = vid
    })
  })

  // Content-derived relations from the backend (centroid cosine similarity).
  // Near-identical docs become a solid "duplicate" link; merely related docs
  // become a faint dashed link. This replaces the old title-word heuristic, so
  // identical content links up regardless of differing filenames/titles.
  ;(relations || []).forEach((r) => {
    if (!titles.has(r.a) || !titles.has(r.b)) return
    links.push({
      source: `hub::${r.a}`,
      target: `hub::${r.b}`,
      kind: r.duplicate ? 'duplicate' : 'related',
      score: r.score,
    })
  })

  return { nodes, links }
}

const COLORS = {
  hubPublic: '#10b981',
  hubSensitive: '#ef4444',
  version: '#3b82f6',
  versionSensitive: '#f87171',
  active: '#06b6d4',
}

export default function MindMap({ documents, relations, highlights, alertTitles, selectedTitle }) {
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const simRef = useRef(null)
  const selRef = useRef({}) // cached d3 selections for cheap highlight updates

  const graph = useMemo(
    () => buildGraph(documents || [], relations || []),
    [documents, relations],
  )
  // Topology signature: rebuild simulation only when nodes/edges change.
  const signature = useMemo(
    () =>
      graph.nodes.map((n) => n.id).join('|') +
      '##' +
      graph.links.map((l) => `${idOf(l.source)}>${idOf(l.target)}:${l.kind}`).join('|'),
    [graph],
  )

  // ---- Build / rebuild the force simulation when topology changes ----------
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const width = wrap.clientWidth || 800
    const height = wrap.clientHeight || 480

    const svg = d3
      .select(svgRef.current)
      .attr('viewBox', [0, 0, width, height])
      .attr('preserveAspectRatio', 'xMidYMid meet')
    svg.selectAll('*').remove()

    // Arrowhead for temporal edges (points to newer version).
    const defs = svg.append('defs')
    defs
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', 'rgba(59,130,246,0.55)')

    const root = svg.append('g')

    // Zoom / pan
    svg.call(
      d3
        .zoom()
        .scaleExtent([0.4, 2.5])
        .on('zoom', (e) => root.attr('transform', e.transform)),
    )

    const nodes = graph.nodes.map((d) => ({ ...d }))
    const links = graph.links.map((d) => ({ ...d }))

    const linkSel = root
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', (d) => `gl-link gl-${d.kind}`)
      .attr('stroke', linkStroke)
      .attr('stroke-width', (d) =>
        d.kind === 'temporal' ? 1.6 : d.kind === 'duplicate' ? 2 : 1,
      )
      .attr('stroke-dasharray', (d) => (d.kind === 'related' ? '3 5' : null))
      .attr('marker-end', (d) => (d.kind === 'temporal' ? 'url(#arrow)' : null))
    linkSel
      .filter((d) => d.kind === 'related' || d.kind === 'duplicate')
      .append('title')
      .text((d) =>
        `${d.kind === 'duplicate' ? 'Near-duplicate content' : 'Related content'}` +
        ` · ${(d.score * 100).toFixed(0)}% similar`,
      )

    const nodeSel = root
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'gl-node')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag()
          .on('start', (e, d) => {
            if (!e.active) simRef.current.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (e, d) => {
            d.fx = e.x
            d.fy = e.y
          })
          .on('end', (e, d) => {
            if (!e.active) simRef.current.alphaTarget(0)
            d.fx = null
            d.fy = null
          }),
      )

    // Outer glow ring (used for active pulse + sensitivity halo)
    nodeSel
      .append('circle')
      .attr('class', 'gl-halo')
      .attr('r', (d) => radius(d) + 5)
      .attr('fill', 'none')
      .attr('stroke', (d) =>
        d.sensitive ? 'rgba(239,68,68,0.35)' : 'rgba(16,185,129,0.22)',
      )
      .attr('stroke-width', 1.5)
      .attr('opacity', (d) => (d.type === 'hub' ? 1 : 0))

    nodeSel
      .append('circle')
      .attr('class', 'gl-core')
      .attr('r', radius)
      .attr('fill', fillFor)
      .attr('stroke', strokeFor)
      .attr('stroke-width', 1.5)

    // Lock glyph for sensitive hubs
    nodeSel
      .filter((d) => d.type === 'hub' && d.sensitive)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.32em')
      .attr('font-size', '10px')
      .attr('fill', '#fff')
      .text('🔒')

    // Hub labels
    nodeSel
      .filter((d) => d.type === 'hub')
      .append('text')
      .attr('class', 'gl-label')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => radius(d) + 14)
      .attr('font-size', '10px')
      .attr('font-weight', 600)
      .attr('fill', '#cbd5e1')
      .attr('pointer-events', 'none')
      .text((d) => (d.title.length > 20 ? d.title.slice(0, 19) + '…' : d.title))

    // Version labels (tiny)
    nodeSel
      .filter((d) => d.type === 'version')
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.32em')
      .attr('font-size', '7px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', 'rgba(255,255,255,0.85)')
      .attr('pointer-events', 'none')
      .text((d) => d.version)

    nodeSel.append('title').text((d) =>
      d.type === 'hub'
        ? `${d.title} — ${d.count} version(s)`
        : `${d.title} · ${d.version}\n${d.timestamp || ''}`,
    )

    const sim = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance((l) =>
            l.kind === 'member'
              ? 38
              : l.kind === 'temporal'
                ? 60
                : l.kind === 'duplicate'
                  ? 90
                  : 150,
          )
          .strength((l) =>
            l.kind === 'related' ? 0.05 : l.kind === 'duplicate' ? 0.28 : 0.7,
          ),
      )
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius((d) => radius(d) + 10))
      .on('tick', () => {
        linkSel
          .attr('x1', (d) => d.source.x)
          .attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x)
          .attr('y2', (d) => d.target.y)
        nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`)
      })

    simRef.current = sim
    selRef.current = { nodeSel, linkSel }

    return () => sim.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  // ---- Highlight pass: react to query retrieval + selection (cheap) -------
  useEffect(() => {
    const { nodeSel, linkSel } = selRef.current
    if (!nodeSel) return
    const hot = highlights || new Set()
    const alerts = alertTitles || new Set()

    nodeSel.each(function (d) {
      const g = d3.select(this)
      const active = d.type === 'version' && hot.has(d.verKey)
      const selected = selectedTitle && d.title === selectedTitle
      const alerted = d.type === 'hub' && alerts.has(d.title)

      g.select('.gl-core')
        .transition()
        .duration(350)
        .attr('fill', active ? COLORS.active : fillFor(d))
        .attr('stroke', active ? '#a5f3fc' : alerted ? '#f59e0b' : strokeFor(d))
        .attr('stroke-width', active || selected ? 2.6 : alerted ? 2.2 : 1.5)
        .attr('r', active ? radius(d) + 3 : radius(d))

      g.select('.gl-halo')
        .attr('opacity', active || selected || alerted || d.type === 'hub' ? 1 : 0)
        .attr(
          'stroke',
          active
            ? 'rgba(6,182,212,0.7)'
            : alerted
              ? 'rgba(245,158,11,0.6)'
              : d.sensitive
                ? 'rgba(239,68,68,0.35)'
                : 'rgba(16,185,129,0.22)',
        )

      g.classed('gl-active', active)
      g.classed('gl-alert', alerted)

      // Orbiting "chunk" particles around active nodes
      g.selectAll('.gl-orbit').remove()
      if (active) {
        for (let k = 0; k < 3; k++) {
          g.append('circle')
            .attr('class', 'gl-orbit')
            .attr('r', 1.6)
            .attr('fill', '#67e8f9')
            .style('transform-box', 'fill-box')
            .style('transform-origin', 'center')
            .style('animation', `orbit 1.6s linear ${k * 0.53}s infinite`)
        }
      }
    })

    const hotEnd = (ref) =>
      typeof ref === 'object' && ref.verKey ? hot.has(ref.verKey) : false
    linkSel
      .classed('gl-flow', (d) => hotEnd(d.target) && hotEnd(d.source))
      .attr('stroke', (d) => (hotEnd(d.target) ? 'rgba(6,182,212,0.85)' : linkStroke(d)))
  }, [highlights, alertTitles, selectedTitle, signature])

  // ---- Background particle field ------------------------------------------
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    let raf
    let W = (canvas.width = wrap.clientWidth)
    let H = (canvas.height = wrap.clientHeight)
    const N = 46
    const parts = Array.from({ length: N }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: Math.random() * 1.4 + 0.4,
    }))
    const ro = new ResizeObserver(() => {
      W = canvas.width = wrap.clientWidth
      H = canvas.height = wrap.clientHeight
    })
    ro.observe(wrap)
    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      for (const p of parts) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > W) p.vx *= -1
        if (p.y < 0 || p.y > H) p.vy *= -1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(96,165,250,0.25)'
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <style>{`@keyframes orbit{from{transform:rotate(0deg) translateX(14px)}to{transform:rotate(360deg) translateX(14px)}}
        .gl-flow{stroke-dasharray:4 6;animation:dashflow 0.6s linear infinite}
        @keyframes dashflow{to{stroke-dashoffset:-20}}
        .gl-active .gl-core{filter:drop-shadow(0 0 6px rgba(6,182,212,0.9))}`}</style>
      <canvas ref={canvasRef} className="absolute inset-0" />
      <svg ref={svgRef} className="relative h-full w-full" />

      {(!documents || documents.length === 0) && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="text-sm text-muted">
            Upload documents to grow the knowledge graph
          </p>
        </div>
      )}

      <Legend />
    </div>
  )
}

function radius(d) {
  if (d.type === 'hub') return Math.min(11 + d.count * 2.2, 22)
  return 9
}
function fillFor(d) {
  if (d.type === 'hub') return d.sensitive ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.16)'
  return d.superseded
    ? 'rgba(100,116,139,0.35)'
    : d.sensitive
      ? 'rgba(248,113,113,0.5)'
      : 'rgba(59,130,246,0.55)'
}
function strokeFor(d) {
  if (d.type === 'hub') return d.sensitive ? COLORS.hubSensitive : COLORS.hubPublic
  return d.sensitive ? COLORS.versionSensitive : COLORS.version
}
function linkStroke(d) {
  switch (d.kind) {
    case 'duplicate':
      return 'rgba(139,92,246,0.6)' // violet — near-identical content
    case 'related':
      return 'rgba(148,163,184,0.22)' // faint slate — topically related
    case 'temporal':
      return 'rgba(59,130,246,0.4)'
    default:
      return 'rgba(59,130,246,0.28)' // member
  }
}
function idOf(ref) {
  return typeof ref === 'object' ? ref.id : ref
}

function Legend() {
  const items = [
    ['#10b981', 'Public doc'],
    ['#ef4444', 'Sensitive'],
    ['#3b82f6', 'Version'],
    ['#06b6d4', 'Retrieved'],
    ['#8b5cf6', 'Duplicate'],
  ]
  return (
    <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-white/8 bg-bg/60 px-2.5 py-1.5 text-[10px] text-muted backdrop-blur">
      {items.map(([c, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: c }} />
          {label}
        </span>
      ))}
    </div>
  )
}
