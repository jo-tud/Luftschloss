import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { buildSteps, partTypes, transportCheck } from '../analysis/assembly'
import { catalogItem } from '../model/catalog'
import { fmtCm, fmtM, memberBoxes, obbCorners } from '../model/geometry'
import { JOINT_TYPES, jointType } from '../model/joints'
import { BED_TYPE_LABEL } from '../model/loftbed'
import type { Member, Vec3 } from '../model/types'
import { useDerived, useStore } from '../state/store'
import { eur } from './fields'
import { CutPlan } from './Material'
import { JointIso, jointSketchNote } from './JointSketch'
import { staticsFindings } from './Statics'

type View = 'front' | 'side' | 'top'

function hull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: [number, number][] = []
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

const FILL: Record<string, string> = { pfosten: '#e2bf8d', zarge: '#ecd2a6', wandriegel: '#d9c3a0', quertraeger: '#f1dcb8', leiste: '#f6e6c8', holm: '#e8c999', strebe: '#e2bf8d', stab: '#d6b07a', sprosse: '#d6b07a', stufe: '#f1dcb8', sonstiges: '#c7ccd3' }

/** Orthogonale Ansicht des Betts mit Teilenummern und Maßketten */
function PlanView({ view, members, origin, ex, ey, numbers, labelNos, title }: { view: View; members: Member[]; origin: Vec3; ex: Vec3; ey: Vec3; numbers: Map<string, number>; labelNos: Set<number>; title: string }) {
  const proj = (q: Vec3): { x: number; y: number; depth: number } => {
    const d = { x: q.x - origin.x, y: q.y - origin.y }
    const u = d.x * ex.x + d.y * ex.y
    const v = d.x * ey.x + d.y * ey.y
    if (view === 'front') return { x: u, y: -q.z, depth: v }
    if (view === 'side') return { x: v, y: -q.z, depth: -u }
    return { x: u, y: v, depth: q.z }
  }
  const shapes = members.flatMap((m) =>
    memberBoxes(m).map((o) => {
      const pts = obbCorners(o).map(proj)
      return { m, poly: hull(pts.map((q) => [q.x, q.y])), depth: Math.max(...pts.map((q) => q.depth)), cx: pts.reduce((s, q) => s + q.x, 0) / 8, cy: pts.reduce((s, q) => s + q.y, 0) / 8 }
    }),
  )
  if (!shapes.length) return null
  shapes.sort((a, b) => a.depth - b.depth)
  const xs = shapes.flatMap((s) => s.poly.map((q) => q[0]))
  const ys = shapes.flatMap((s) => s.poly.map((q) => q[1]))
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const pad = 380
  const labels: ReactElement[] = []
  const placed = new Set<number>()
  // Etikett dort, wo das Teil groß zu sehen ist
  const area = (poly: [number, number][]) => Math.abs(poly.reduce((s, q, i) => s + q[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * q[1], 0)) / 2
  const spots: [number, number][] = []
  for (const s of [...shapes].sort((a, b) => area(b.poly) - area(a.poly))) {
    const no = numbers.get(s.m.id)
    if (no === undefined || placed.has(no) || !labelNos.has(no)) continue
    placed.add(no)
    // Nummern nicht übereinander setzen: ausweichen, sonst mit Führungslinie daneben
    const R = 70
    const free = (x: number, y: number) => spots.every((q) => Math.hypot(q[0] - x, q[1] - y) > 2 * R + 10)
    const tries: [number, number][] = [[0, 0], [0, -2.3 * R], [0, 2.3 * R], [2.3 * R, 0], [-2.3 * R, 0], [2 * R, -2 * R], [-2 * R, -2 * R], [2 * R, 2 * R], [-2 * R, 2 * R], [0, -4.6 * R], [0, 4.6 * R]]
    const off = tries.find(([dx, dy]) => free(s.cx + dx, s.cy + dy)) ?? [0, 0]
    const lx = s.cx + off[0]
    const ly = s.cy + off[1]
    spots.push([lx, ly])
    labels.push(
      <g key={`l${no}`}>
        {(off[0] || off[1]) && <line x1={s.cx} y1={s.cy} x2={lx} y2={ly} className="pl-leader" />}
        <circle cx={lx} cy={ly} r={R} className="pl-bubble" />
        <text x={lx} y={ly} className="pl-no">
          {no}
        </text>
      </g>,
    )
  }
  const dim = (ax: number, ay: number, bx: number, by: number, off: number, text: string, key: string) => {
    const horiz = Math.abs(by - ay) < 1
    const [p1, p2] = horiz ? [[ax, ay + off], [bx, by + off]] : [[ax + off, ay], [bx + off, by]]
    const mx = (p1[0] + p2[0]) / 2
    const my = (p1[1] + p2[1]) / 2
    return (
      <g key={key} className="pl-dim">
        <line x1={ax} y1={ay} x2={p1[0]} y2={p1[1]} />
        <line x1={bx} y1={by} x2={p2[0]} y2={p2[1]} />
        <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} markerStart="url(#arr)" markerEnd="url(#arr)" />
        <text x={horiz ? mx : mx - 30} y={horiz ? my - 30 : my} transform={horiz ? undefined : `rotate(-90 ${mx - 30} ${my})`}>
          {text}
        </text>
      </g>
    )
  }
  const dims: ReactElement[] = []
  dims.push(dim(x0, y1, x1, y1, 200, fmtCm(x1 - x0, 1), 'w'))
  if (view === 'top') dims.push(dim(x1, y0, x1, y1, 200, fmtCm(y1 - y0, 1), 'h'))
  else {
    dims.push(dim(x1, 0, x1, y0, 200, `${fmtCm(-y0, 1)} gesamt`, 'h'))
    // Oberkante Liegefläche (höchste Latte bzw. Platte)
    const deck = members.filter((m) => m.role === 'leiste' || m.role === 'quertraeger' || m.role === 'zarge')
    if (deck.length) {
      const zTop = Math.max(...deck.map((m) => Math.max(m.start.z, m.end.z) + m.h / 2))
      dims.push(dim(x0, 0, x0, -zTop, -200, `${fmtCm(zTop, 1)} Liegefläche`, 'd'))
    }
  }
  return (
    <figure className="pl-view">
      <figcaption>{title}</figcaption>
      <svg viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`}>
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 2 L 10 5 L 0 8 z" fill="#2a6fdb" />
          </marker>
        </defs>
        {view !== 'top' && <line x1={x0 - pad} y1={0} x2={x1 + pad} y2={0} className="pl-floor" />}
        {shapes.map((s, i) => (
          <polygon key={i} points={s.poly.map((q) => q.join(',')).join(' ')} fill={FILL[s.m.role] ?? '#e8d3b0'} className="pl-part" />
        ))}
        {dims}
        {labels}
      </svg>
    </figure>
  )
}

export function BauplanDialog() {
  const show = useStore((s) => s.showPlan)
  const set = useStore((s) => s.set)
  const p = useStore((s) => s.project)
  const statics = useStore((s) => s.statics)
  const d = useDerived()
  const [snapshot, setSnapshot] = useState<string | undefined>()
  useEffect(() => {
    if (show) setSnapshot((document.querySelector('.viewport canvas') as HTMLCanvasElement | null)?.toDataURL('image/png'))
  }, [show])
  const data = useMemo(() => {
    const { parts, byMember } = partTypes(d.resolved)
    const steps = buildSteps(p, d.resolved)
    return { parts, byMember, steps }
  }, [p, d])
  if (!show) return null
  const a = p.assemblies[0]
  const info = a ? d.resolved.beds.get(a.id) : undefined
  const members = d.resolved.members.filter((m) => !a || m.assemblyId === a.id || !m.assemblyId)
  const fp = info?.footprint
  const origin = fp ? { x: fp[0].x, y: fp[0].y, z: 0 } : { x: 0, y: 0, z: 0 }
  const norm2 = (x: number, y: number) => {
    const l = Math.hypot(x, y) || 1
    return { x: x / l, y: y / l, z: 0 }
  }
  const ex = fp ? norm2(fp[1].x - fp[0].x, fp[1].y - fp[0].y) : { x: 1, y: 0, z: 0 }
  const ey = fp ? norm2(fp[3].x - fp[0].x, fp[3].y - fp[0].y) : { x: 0, y: 1, z: 0 }
  const vertical = new Set(data.parts.filter((pt) => pt.roles.some((r) => r === 'pfosten' || r === 'holm' || r === 'zarge' || r === 'wandriegel' || r === 'strebe' || r === 'stufe')).map((pt) => pt.no))
  const horizontal = new Set(data.parts.filter((pt) => !vertical.has(pt.no)).map((pt) => pt.no))
  const jointsByType = new Map<string, typeof d.resolved.joints>()
  // je Verbindungsart und Lage (Stoß mit Ende bzw. angelegt) eine Skizze
  for (const j of d.resolved.joints) {
    const k = `${j.typeId}|${j.ending ? 'stoss' : 'anlage'}`
    jointsByType.set(k, [...(jointsByType.get(k) ?? []), j])
  }
  const open = [...d.analysis.findings, ...staticsFindings(p, statics)].filter((f) => f.severity !== 'hinweis' && !p.settings.acknowledged.includes(f.id))
  const transport = transportCheck(p, d.resolved)
  const clearance = a ? d.analysis.clearances.find((c) => c.assemblyId === a.id) : undefined
  return (
    <div className="modal-bg plan-bg" onClick={() => set({ showPlan: false })}>
      <div className="modal plan" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Bauplan · {p.name}</h2>
          <span className="muted">{new Date().toLocaleDateString('de-DE')}</span>
          <button onClick={() => window.print()}>🖨 Drucken / PDF</button>
          <button className="close" onClick={() => set({ showPlan: false })}>
            ✕
          </button>
        </header>
        <div className="modal-body plan-body">
          <section className="pl-head">
            <div>
              {a && (
                <table className="kvt">
                  <tbody>
                    <tr>
                      <th>Bauart</th>
                      <td>
                        {BED_TYPE_LABEL[a.params.type]}
                        {a.params.frameStyle === 'aufgelegt' ? ', aufgelegt' : ''}
                      </td>
                    </tr>
                    <tr>
                      <th>Matratze</th>
                      <td>
                        {(a.params.mattressCount ?? 1) > 1 ? `${a.params.mattressCount} × ` : ''}
                        {fmtCm(a.params.mattressWidth, 0)} × {fmtCm(a.params.mattressLength, 0)}, {fmtCm(a.params.mattressThickness, 0)} dick
                        {(a.params.mattressCount ?? 1) > 1 ? `, ${a.params.mattressLayout ?? 'nebeneinander'}` : ''}
                      </td>
                    </tr>
                    {info && (
                      <tr>
                        <th>Außenmaß</th>
                        <td>
                          Gestell {fmtCm(info.outerLength, 0)} × {fmtCm(info.outerWidth, 0)}
                          {(info.standLength > info.outerLength + 5 || info.standWidth > info.outerWidth + 5) && ` · mit Leiter ${fmtCm(info.standLength, 0)} × ${fmtCm(info.standWidth, 0)}`}, Liegefläche {fmtCm(info.deckTop, 0)} hoch
                        </td>
                      </tr>
                    )}
                    {clearance && (
                      <tr>
                        <th>Freiraum</th>
                        <td>
                          {fmtM(clearance.underside)} darunter, {fmtM(clearance.headroom)} über der Matratze
                        </td>
                      </tr>
                    )}
                    <tr>
                      <th>Material</th>
                      <td>
                        ca. {eur(d.bom.total)} ({d.bom.priceStand})
                      </td>
                    </tr>
                    {statics && (
                      <tr>
                        <th>Statik</th>
                        <td>
                          höchste Ausnutzung {Math.round(statics.maxUtil * 100)} %, Gestell {statics.swayClass} ({Math.max(statics.sway.x, statics.sway.y).toLocaleString('de-DE', { maximumFractionDigits: 1 })} mm)
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
              {transport.door && transport.longest > transport.door && <p className="warn">Längstes Teil {fmtM(transport.longest)} ({transport.name}) passt nicht durch die Tür (Diagonale {fmtM(transport.door)}). Im Zimmer zuschneiden oder teilen.</p>}
            </div>
            {snapshot && <img src={snapshot} alt="3D-Ansicht" className="pl-snap" />}
          </section>

          <section className="pl-views">
            <PlanView view="front" title="Ansicht von vorne" members={members} origin={origin} ex={ex} ey={ey} numbers={data.byMember} labelNos={vertical} />
            <PlanView view="side" title="Ansicht von der Seite" members={members} origin={origin} ex={ex} ey={ey} numbers={data.byMember} labelNos={vertical} />
            <PlanView view="top" title="Draufsicht" members={members} origin={origin} ex={ex} ey={ey} numbers={data.byMember} labelNos={horizontal} />
          </section>

          <h3>Teileliste</h3>
          <table className="bom">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Anz.</th>
                <th>Teil</th>
                <th>Querschnitt</th>
                <th>Länge</th>
                <th>Material</th>
                <th>Bearbeitung</th>
              </tr>
            </thead>
            <tbody>
              {data.parts.map((pt) => (
                <tr key={pt.no}>
                  <td>
                    <b>{pt.no}</b>
                  </td>
                  <td>{pt.count}×</td>
                  <td>{pt.name}</td>
                  <td>{pt.round ? `Ø ${pt.b}` : `${pt.b} × ${pt.h}`}</td>
                  <td>{fmtCm(pt.length)}</td>
                  <td className="muted">{catalogItem(pt.catalogId)?.name ?? pt.catalogId}</td>
                  <td>{[...pt.notches.map((n) => `${n.reason}: ${fmtCm(n.length)} lang, ${fmtCm(n.depth)} tief ausklinken`), ...pt.joinery].join('; ') || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Verbindungen</h3>
          <div className="pl-joints">
            {[...jointsByType.entries()].map(([groupKey, list]) => {
              const typeId = list[0].typeId
              const jt = jointType(typeId)
              const sample = list[0]
              return (
                <div key={groupKey} className="pl-joint">
                  <JointIso j={sample} resolved={d.resolved} />
                  <div>
                    <b>
                      {list.length}× {jt?.name ?? typeId}
                    </b>
                    <p>{jointSketchNote(sample, d.resolved)}</p>
                    <p className="hint">{jt?.note}</p>
                    {jt?.tools.length ? <p className="hint">Werkzeug: {jt.tools.join(', ')}</p> : null}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="hint">Alle Verbindungstypen: {JOINT_TYPES.length}. Typ je Verbindung in der App änderbar (Teil anklicken → Verbindungen).</p>

          <h3>Montage</h3>
          <ol className="pl-steps">
            {data.steps.map((s, i) => (
              <li key={i}>
                <b>{s.title}</b>
                {s.memberIds.length > 0 && <span className="muted"> · Teile {[...new Set(s.memberIds.map((id) => data.byMember.get(id)))].sort((x, y) => (x ?? 0) - (y ?? 0)).join(', ')}</span>}
                <p>{s.text}</p>
                {s.tools.length > 0 && <p className="hint">Werkzeug: {s.tools.join(', ')}</p>}
              </li>
            ))}
          </ol>

          <h3>Zuschnitt</h3>
          <CutPlan bom={d.bom} />

          {open.length > 0 && (
            <>
              <h3>Offene Punkte aus der Prüfung</h3>
              <ul>
                {open.map((f) => (
                  <li key={f.id}>
                    {f.severity === 'fehler' ? '⛔' : '⚠️'} {f.title}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="hint">Erstellt mit Luftschloss. Planungshilfe ohne Gewähr – ersetzt keine Tragwerksplanung. Maße vor dem Zuschnitt am Bau prüfen.</p>
        </div>
      </div>
    </div>
  )
}
