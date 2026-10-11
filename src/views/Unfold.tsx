import { useRef, useState } from 'react'
import { fmtCm, memberBoxes, obbBounds, wallFrame } from '../model/geometry'
import { flatSpans, wallTop } from '../model/ceiling'
import { cornice } from '../model/room'
import type { Project, ProjectionObj, WallId } from '../model/types'
import { WALL_IDS } from '../model/types'
import { useDerived, useStore } from '../state/store'
import { t, tr } from '../i18n'

/**
 * Abwicklung: Der Raum wird wie eine Schachtel aufgeklappt. Boden in der Mitte (Draufsicht),
 * die vier Wände nach außen geklappt, jeweils von innen gesehen. Wandobjekte lassen sich hier
 * direkt entlang der Wand und in der Höhe ziehen.
 */

/** Wandpunkt (s entlang der Wand, z Höhe) → Abwicklungs-Koordinaten (Boden-Ebene, mm) */
function unfoldPoint(p: Project, wall: WallId, s: number, z: number): { x: number; y: number } {
  const L = p.room.length
  const W = p.room.width
  switch (wall) {
    case 'A':
      return { x: L - s, y: -z }
    case 'B':
      return { x: -z, y: s }
    case 'C':
      return { x: s, y: W + z }
    case 'D':
      return { x: L + z, y: W - s }
  }
}

function wallRect(p: Project, wall: WallId, s0: number, s1: number, z0: number, z1: number): string {
  const pts = [unfoldPoint(p, wall, s0, z0), unfoldPoint(p, wall, s1, z0), unfoldPoint(p, wall, s1, z1), unfoldPoint(p, wall, s0, z1)]
  return pts.map((q) => `${q.x},${-q.y}`).join(' ')
}

/** Grundfläche eines Mauervorsprungs auf dem Boden */
function floorRect(p: Project, o: ProjectionObj): string {
  const f = wallFrame(p.room, o.wall)
  const at = (s: number, d: number) => `${f.start.x + f.u.x * s + f.n.x * d},${-(f.start.y + f.u.y * s + f.n.y * d)}`
  return [at(o.offset, 0), at(o.offset + o.width, 0), at(o.offset + o.width, o.depth), at(o.offset, o.depth)].join(' ')
}

/** Wandfläche bis zur Decke; unter einer Dachschräge mit schräger Oberkante */
function wallOutline(p: Project, wall: WallId): string {
  const f = wallFrame(p.room, wall)
  const pts = [unfoldPoint(p, wall, 0, 0), unfoldPoint(p, wall, f.length, 0), ...wallTop(p.room, wall).reverse().map((q) => unfoldPoint(p, wall, q.s, q.z))]
  return pts.map((q) => `${q.x},${-q.y}`).join(' ')
}

export function UnfoldView() {
  const p = useStore((s) => s.project)
  const sel = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const updateFrom = useStore((s) => s.updateFrom)
  const endCoalesce = useStore((s) => s.endCoalesce)
  const d = useDerived()
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ id: string; wall: WallId; x0: number; y0: number; base: Project; key: string } | null>(null)
  const r = p.room
  const H = r.height
  const L = r.length
  const W = r.width
  const pad = 200
  const vb = { x: -H - pad, y: -(W + H) - pad, w: L + 2 * H + 2 * pad, h: W + 2 * H + 2 * pad }

  const toModel = (e: React.PointerEvent) => {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const q = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: q.x, y: -q.y }
  }

  const onDown = (e: React.PointerEvent, id: string, wall: WallId) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    select({ kind: 'wallObject', id })
    const q = toModel(e)
    setDrag({ id, wall, x0: q.x, y0: q.y, base: p, key: `abw-${Date.now()}` })
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return
    const q = toModel(e)
    const dx = q.x - drag.x0
    const dy = q.y - drag.y0
    // Verschiebung in Wandkoordinaten (s, z) zurückrechnen
    const ds = { A: -dx, B: dy, C: dx, D: -dy }[drag.wall]
    const dz = { A: -dy, B: -dx, C: dy, D: dx }[drag.wall]
    const g = 10
    updateFrom(
      drag.base,
      (dd) => {
        const o = dd.wallObjects.find((x) => x.id === drag.id)
        const o0 = drag.base.wallObjects.find((x) => x.id === drag.id)
        if (!o || !o0) return
        const len = wallFrame(dd.room, o.wall).length
        o.offset = Math.max(0, Math.min(len - o.width, Math.round((o0.offset + ds) / g) * g))
        if (o.kind === 'fenster' && o0.kind === 'fenster') o.sillHeight = Math.max(0, Math.round((o0.sillHeight + dz) / g) * g)
        if ((o.kind === 'heizkoerper' || o.kind === 'steckdose') && (o0.kind === 'heizkoerper' || o0.kind === 'steckdose')) o.bottom = Math.max(0, Math.round((o0.bottom + dz) / g) * g)
      },
      drag.key,
    )
  }
  const onUp = () => {
    setDrag(null)
    endCoalesce()
  }

  return (
    <div className="unfold">
      <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} onPointerMove={onMove} onPointerUp={onUp} onPointerDown={() => select(null)}>
        <defs>
          <pattern id="stuck" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M0,40 L40,0" stroke="#cfc8bb" strokeWidth="6" />
          </pattern>
        </defs>
        {/* Boden */}
        <rect x={0} y={-W} width={L} height={W} className="uf-floor" />
        {WALL_IDS.map((w) => {
          const f = wallFrame(r, w)
          const c = cornice(r, w)
          return (
            <g key={w}>
              <polygon points={wallOutline(p, w)} className="uf-wall" />
              {c.enabled && flatSpans(r, w).map(([s0, s1]) => <polygon key={s0} points={wallRect(p, w, s0, s1, H - c.height, H)} fill="url(#stuck)" className="uf-stuck" />)}
              {r.skirting.enabled && <polygon points={wallRect(p, w, 0, f.length, 0, r.skirting.height)} className="uf-skirting" />}
              <WallLabel p={p} wall={w} />
            </g>
          )
        })}
        {/* Bett: Grundriss auf dem Boden, Ansicht auf den Wänden (Teile bis 1,5 m vor der Wand) */}
        {d.resolved.members.map((m) => {
          const bs = memberBoxes(m).map(obbBounds)
          const b = { min: { x: Math.min(...bs.map((q) => q.min.x)), y: Math.min(...bs.map((q) => q.min.y)), z: Math.min(...bs.map((q) => q.min.z)) }, max: { x: Math.max(...bs.map((q) => q.max.x)), y: Math.max(...bs.map((q) => q.max.y)), z: Math.max(...bs.map((q) => q.max.z)) } }
          const isSel = sel && (sel.id === m.id || sel.id === m.assemblyId)
          const parts = [<rect key="plan" x={b.min.x} y={-b.max.y} width={b.max.x - b.min.x} height={b.max.y - b.min.y} className={`uf-member${isSel ? ' sel' : ''}`} />]
          for (const w of WALL_IDS) {
            const f = wallFrame(r, w)
            const corners = [b.min, b.max, { x: b.min.x, y: b.max.y, z: 0 }, { x: b.max.x, y: b.min.y, z: 0 }]
            const ds = corners.map((q) => (q.x - f.start.x) * f.n.x + (q.y - f.start.y) * f.n.y)
            if (Math.min(...ds) > 1500) continue
            const ss = corners.map((q) => (q.x - f.start.x) * f.u.x + (q.y - f.start.y) * f.u.y)
            const opacity = Math.max(0.25, 1 - Math.min(...ds) / 1500)
            parts.push(<polygon key={w} points={wallRect(p, w, Math.min(...ss), Math.max(...ss), b.min.z, b.max.z)} className={`uf-member${isSel ? ' sel' : ''}`} style={{ opacity }} />)
          }
          return (
            <g key={m.id} onPointerDown={(e) => (e.stopPropagation(), select(m.assemblyId ? { kind: 'assembly', id: m.assemblyId } : { kind: 'member', id: m.id }))}>
              {parts}
            </g>
          )
        })}
        {/* Wandobjekte */}
        {p.wallObjects.map((o) => {
          const isSel = sel?.id === o.id
          const z0 = o.kind === 'fenster' ? o.sillHeight : o.kind === 'tuer' || o.kind === 'vorsprung' ? 0 : o.bottom
          const z1 = o.kind === 'vorsprung' ? Math.max(...wallTop(r, o.wall).map((q) => q.z)) : o.kind === 'fenster' || o.kind === 'tuer' ? z0 + o.height : o.bottom + o.height
          const label = unfoldPoint(p, o.wall, o.offset + o.width / 2, (z0 + z1) / 2)
          const res = o.kind === 'fenster' ? d.analysis.windows.filter((w) => w.windowId === o.id) : []
          const blocked = res.some((w) => w.maxAngle < 90 && w.maxAngle >= 0 && o.kind === 'fenster')
          return (
            <g key={o.id} className={`uf-obj ${o.kind}${isSel ? ' sel' : ''}${blocked ? ' blocked' : ''}`} onPointerDown={(e) => onDown(e, o.id, o.wall)}>
              <polygon points={wallRect(p, o.wall, o.offset, o.offset + o.width, z0, z1)} />
              {o.kind === 'vorsprung' && <polygon points={floorRect(p, o)} className="uf-floor-block" />}
              <text x={label.x} y={-label.y} textAnchor="middle" dominantBaseline="middle" fontSize={130}>
                {tr(o.name)}
              </text>
              {o.kind === 'fenster' && (
                <text x={label.x} y={-label.y + 170} textAnchor="middle" fontSize={100}>
                  {t('Brüstung {h}', { h: fmtCm(o.sillHeight, 0) })}
                  {blocked ? ` · ${t('öffnet bis {a}°', { a: Math.min(...res.map((w) => w.maxAngle)) })}` : ''}
                </text>
              )}
            </g>
          )
        })}
        {r.rosettes.map((ro) => (
          <circle key={ro.id} cx={ro.x} cy={-ro.y} r={ro.diameter / 2} className="uf-rosette" />
        ))}
      </svg>
      <p className="unfold-hint">{t('Abwicklung: Wände nach außen geklappt, jeweils von innen gesehen. Fenster, Heizkörper und Steckdosen hier direkt ziehen.')}</p>
    </div>
  )
}

function WallLabel({ p, wall }: { p: Project; wall: WallId }) {
  const f = wallFrame(p.room, wall)
  const q = unfoldPoint(p, wall, f.length / 2, p.room.height + 160)
  return (
    <text x={q.x} y={-q.y} textAnchor="middle" dominantBaseline="middle" fontSize={170} className="uf-label">
      {t('Wand {w}', { w: wall })} · {fmtCm(f.length, 0)}
    </text>
  )
}
