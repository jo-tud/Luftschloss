import * as THREE from 'three'
import { add, cross, dot, memberBoxes, norm, scale, sub, v, type OBB } from '../model/geometry'
import { clipBoxesNear, cutMemberBoxes, jointCuts, jointFrame, jointViewDir, prismCorners, type JointCuts, type Prism } from '../model/joinery'
import type { DetectedJoint, Resolved } from '../model/resolve'
import type { Member, Vec3 } from '../model/types'
import { hardwareInstances } from '../views/hardware'

/**
 * Werkstattskizze einer Verbindung als auseinandergezogene Isometrie, erzeugt aus derselben
 * Geometrie wie 3D-Ansicht und Verbindungsdetail – Skizze und Modell können nicht auseinanderlaufen.
 */

interface Face {
  pts: Vec3[]
  n: Vec3
}
interface Solid {
  faces: Face[]
  center: Vec3
  color: [number, number, number]
  /** Teile desselben Holzes: gemeinsame Fugen werden nicht gezeichnet */
  group: number
}

const WOOD_T: [number, number, number] = [214, 178, 128]
const WOOD_E: [number, number, number] = [236, 210, 166]
const STEEL: [number, number, number] = [160, 166, 174]

function boxFaces(o: OBB): Face[] {
  const faces: Face[] = []
  for (let i = 0; i < 3; i++)
    for (const s of [-1, 1]) {
      const n = scale(o.axes[i], s)
      const j = (i + 1) % 3
      const k = (i + 2) % 3
      const c = add(o.center, scale(n, o.half[i]))
      const a = scale(o.axes[j], o.half[j])
      const b = scale(o.axes[k], o.half[k])
      faces.push({ n, pts: [add(add(c, a), b), add(sub(c, a), b), sub(sub(c, a), b), sub(add(c, a), b)] })
    }
  return faces
}

function prismFaces(p: Prism): Face[] {
  const { bottom, top } = prismCorners(p)
  const all = [...bottom, ...top]
  const c = scale(all.reduce((s, q) => add(s, q), v(0, 0, 0)), 1 / all.length)
  const face = (pts: Vec3[]): Face => {
    let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])))
    const fc = scale(pts.reduce((s, q) => add(s, q), v(0, 0, 0)), 1 / pts.length)
    if (dot(n, sub(fc, c)) < 0) n = scale(n, -1)
    return { pts, n }
  }
  const out = [face(bottom), face(top)]
  for (let i = 0; i < bottom.length; i++) {
    const k = (i + 1) % bottom.length
    out.push(face([bottom[i], bottom[k], top[k], top[i]]))
  }
  return out
}

/**
 * Zeichenreihenfolge (hinten zuerst): für je zwei konvexe Körper eine trennende Flächenebene suchen;
 * liegt der andere auf der Betrachterseite, kommt er später. Sonst nach Tiefe des Mittelpunkts.
 */
function depthOrder(solids: Solid[], L: Vec3): Solid[] {
  const n = solids.length
  const verts = solids.map((s) => s.faces.flatMap((f) => f.pts))
  const before: number[][] = solids.map(() => [])
  const indeg = new Array(n).fill(0)
  const rel = (i: number, k: number): number => {
    // -1: i vor k zeichnen, 1: k vor i, 0: unbekannt
    for (const [a, b, sign] of [
      [i, k, 1],
      [k, i, -1],
    ] as const) {
      for (const f of solids[a].faces) {
        const d = Math.max(...verts[a].map((q) => dot(q, f.n)))
        if (verts[b].every((q) => dot(q, f.n) >= d - 0.5)) {
          // b liegt vor der Fläche f von a
          const bInFront = dot(f.n, L) > 0
          return (bInFront ? -1 : 1) * sign
        }
      }
    }
    return 0
  }
  for (let i = 0; i < n; i++)
    for (let k = i + 1; k < n; k++) {
      const r = rel(i, k)
      if (r < 0) {
        before[i].push(k)
        indeg[k]++
      } else if (r > 0) {
        before[k].push(i)
        indeg[i]++
      }
    }
  const depth = (i: number) => dot(solids[i].center, L)
  const out: Solid[] = []
  const done = new Array(n).fill(false)
  for (let step = 0; step < n; step++) {
    let pick = -1
    for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0 && (pick < 0 || depth(i) < depth(pick))) pick = i
    // Zyklus: den hintersten nehmen
    if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || depth(i) < depth(pick))) pick = i
    done[pick] = true
    out.push(solids[pick])
    for (const k of before[pick]) indeg[k]--
  }
  return out
}

const fromThree = (p: THREE.Vector3): Vec3 => v(p.x * 1000, -p.z * 1000, p.y * 1000)

export function JointIso({ j, resolved, width = 260, height = 190 }: { j: DetectedJoint; resolved: Resolved; width?: number; height?: number }) {
  const byId = new Map(resolved.members.map((m) => [m.id, m]))
  const A = byId.get(j.a)
  const B = byId.get(j.b)
  if (!A || !B) return null
  const F = jointFrame(j, A, B)
  const cuts: JointCuts | undefined = jointCuts(j, byId)
  const E = F?.E ?? A
  const Tm = F?.T ?? B
  const explode = F ? scale(F.into, 70) : v(0, 0, 70)
  const shift = (o: OBB): OBB => ({ ...o, center: add(o.center, explode) })
  const solids: Solid[] = []
  const pieces = (m: Member, color: [number, number, number], moved: boolean, group: number) => {
    const mc = cuts?.members.get(m.id)
    const boxes = clipBoxesNear(mc ? cutMemberBoxes(m, mc) : memberBoxes(m), j.pos, 170)
    for (const o of boxes) {
      const oo = moved ? shift(o) : o
      solids.push({ faces: boxFaces(oo), center: oo.center, color, group })
    }
    for (const p of mc?.prisms ?? []) {
      const pp = moved ? { ...p, origin: add(p.origin, explode) } : p
      const fs = prismFaces(pp)
      const c = scale(fs.flatMap((f) => f.pts).reduce((s, q) => add(s, q), v(0, 0, 0)), 1 / fs.flatMap((f) => f.pts).length)
      solids.push({ faces: fs, center: c, color, group })
    }
  }
  pieces(Tm, WOOD_T, false, 0)
  pieces(E, WOOD_E, true, 1)
  ;(cuts?.extras ?? []).forEach((o, i) => solids.push({ faces: boxFaces(o), center: o.center, color: WOOD_E, group: 2 + i }))
  // Beschläge
  const hw = hardwareInstances(resolved, { only: j.key, rods: true })
  const pos = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const sc = new THREE.Vector3()
  for (const m of hw.plates) {
    m.decompose(pos, q, sc)
    const ax = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((a) => fromThree(a.applyQuaternion(q)))
    const unit = ax.map((a) => scale(a, 1 / 1000)) as [Vec3, Vec3, Vec3]
    const o: OBB = { center: fromThree(pos), axes: unit, half: [sc.x * 500, Math.max(1.5, sc.y * 500), sc.z * 500] }
    solids.push({ faces: boxFaces(o), center: o.center, color: STEEL, group: 100 + solids.length })
  }
  type Line = { a: Vec3; b: Vec3; w: number; color: string }
  const lines: Line[] = []
  const dots: { at: Vec3; r: number; color: string }[] = []
  const seg = (list: THREE.Matrix4[], color: string, moved = false) => {
    for (const m of list) {
      m.decompose(pos, q, sc)
      const dir = fromThree(new THREE.Vector3(0, 1, 0).applyQuaternion(q))
      const d = scale(dir, (sc.y * 1000) / 2 / 1000)
      let c = fromThree(pos)
      if (moved) c = add(c, explode)
      lines.push({ a: sub(c, d), b: add(c, d), w: Math.max(1.6, sc.x * 1000 * 1.6), color })
    }
  }
  seg(hw.rods, '#59606a')
  seg(hw.pins, '#8a5a2b')
  seg(hw.dowels, '#8a5a2b', true)
  for (const list of [hw.heads, hw.screws, hw.washers, hw.nuts]) {
    for (const m of list) {
      m.decompose(pos, q, sc)
      dots.push({ at: fromThree(pos), r: Math.max(2.2, sc.x * 1000 * 0.85), color: '#6d747d' })
    }
  }
  for (const h of cuts?.holes ?? []) dots.push({ at: h.at, r: h.r * 0.45, color: '#3a2a1c' })

  // Projektion
  const L = jointViewDir(F)
  const right = norm(cross(v(0, 0, 1), L))
  const up = norm(cross(L, right))
  const P = (p: Vec3): [number, number] => [dot(sub(p, j.pos), right), -dot(sub(p, j.pos), up)]
  const light = norm(add(L, v(0.2, -0.3, 1)))
  const polys: { d: string; fill: string; edges: string }[] = []
  // sichtbare Flächen je Holz, um Fugen zwischen Teilquadern desselben Holzes wegzulassen
  const visible = solids.flatMap((s) => s.faces.filter((f) => dot(f.n, L) > 0.02).map((f) => ({ f, group: s.group })))
  const inside = (q: Vec3, f: Face) => {
    if (Math.abs(dot(sub(q, f.pts[0]), f.n)) > 0.6) return false
    for (let i = 0; i < f.pts.length; i++) {
      const a = f.pts[i]
      const b = f.pts[(i + 1) % f.pts.length]
      if (dot(cross(sub(b, a), sub(q, a)), f.n) < -0.01) return false
    }
    return true
  }
  const interior = (a: Vec3, b: Vec3, f: Face, group: number) => {
    const mid = scale(add(a, b), 0.5)
    const fc = scale(f.pts.reduce((s, q) => add(s, q), v(0, 0, 0)), 1 / f.pts.length)
    const outward = norm(sub(sub(mid, fc), scale(f.n, dot(sub(mid, fc), f.n))))
    const probe = add(mid, scale(outward, 1))
    return visible.some((o) => o.f !== f && o.group === group && dot(o.f.n, f.n) > 0.999 && inside(probe, o.f))
  }
  for (const s of depthOrder(solids, L))
    for (const f of s.faces) {
      if (dot(f.n, L) <= 0.02) continue
      const k = 0.72 + 0.32 * Math.max(0, dot(f.n, light))
      const fill = `rgb(${s.color.map((c) => Math.min(255, Math.round(c * k))).join(',')})`
      const pp = f.pts.map(P)
      let edges = ''
      for (let i = 0; i < f.pts.length; i++) {
        const i2 = (i + 1) % f.pts.length
        if (interior(f.pts[i], f.pts[i2], f, s.group)) continue
        edges += `M${pp[i][0].toFixed(1)},${pp[i][1].toFixed(1)}L${pp[i2][0].toFixed(1)},${pp[i2][1].toFixed(1)}`
      }
      polys.push({ d: pp.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' '), fill, edges })
    }
  const all = [...solids.flatMap((s) => s.faces.flatMap((f) => f.pts)), ...lines.flatMap((l) => [l.a, l.b])].map(P)
  const minX = Math.min(...all.map((p) => p[0]))
  const maxX = Math.max(...all.map((p) => p[0]))
  const minY = Math.min(...all.map((p) => p[1]))
  const maxY = Math.max(...all.map((p) => p[1]))
  const pad = 12
  return (
    <svg viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`} width={width} height={height} className="pl-sketch">
      {polys.map((p, i) => (
        <g key={i}>
          <polygon points={p.d} fill={p.fill} stroke={p.fill} strokeWidth={0.6} strokeLinejoin="round" />
          {p.edges && <path d={p.edges} fill="none" stroke="#6b5136" strokeWidth={0.8} strokeLinecap="round" />}
        </g>
      ))}
      {lines.map((l, i) => {
        const [x1, y1] = P(l.a)
        const [x2, y2] = P(l.b)
        return <line key={`l${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={l.color} strokeWidth={l.w} strokeLinecap="round" />
      })}
      {dots.map((d, i) => {
        const [x, y] = P(d.at)
        return <circle key={`d${i}`} cx={x} cy={y} r={d.r} fill={d.color} stroke="#3c4148" strokeWidth={0.6} />
      })}
    </svg>
  )
}

/** Maßangaben zur Skizze, aus der Verbindungsgeometrie */
export function jointSketchNote(j: DetectedJoint, resolved: Resolved): string {
  const byId = new Map(resolved.members.map((m) => [m.id, m]))
  const A = byId.get(j.a)
  const B = byId.get(j.b)
  const F = A && B ? jointFrame(j, A, B) : undefined
  const c = jointCuts(j, byId)
  const d = c?.dims ?? {}
  const stoss = !!F?.pE
  switch (j.typeId) {
    case 'schlossschraube':
      return stoss
        ? '2 × M10 durch das durchlaufende Holz ins Hirnholz, Mutter in einer Querbohrung Ø 25 mm, 70 mm vom Ende. Bolzen zweier Stöße am selben Pfosten in der Höhe versetzen.'
        : '2 × M10 durchgebolzt, Ø 11 mm vorbohren, Randabstand ≥ 40 mm, Bolzenabstand ≥ 50 mm.'
    case 'bettschraube':
      return 'Bettschraube M8 durch das durchlaufende Holz, Zylindermutter in Querbohrung Ø 10 mm, 70 mm vom Ende. Bohrschablone verwenden.'
    case 'holzbauschraube':
      return stoss ? '3 Schrauben 8 × 160 durch das durchlaufende Holz ins Hirnholz, Ø 5 mm vorbohren.' : '2 Schrauben 8 × 160 durch das aufliegende Holz, Ø 5 mm vorbohren.'
    case 'auflage':
      return 'Stumpf auflegen, 2 Schrauben 8 × 160 von oben.'
    case 'lose':
      return 'Lose auflegen, Filz- oder Gummistreifen dazwischen, ggf. 1 Schraube gegen Verrutschen.'
    case 'winkel':
      return '2 Winkel 90 mm mit Sicke in die Innenecken, je Winkel 10 Schrauben 5 × 50.'
    case 'balkenschuh':
      return 'Balkenschuh passend zum Querschnitt, alle Löcher mit 5 × 50 verschrauben (Vollausnagelung).'
    case 'ueberblattung':
      return `Beide Hölzer auf halbe Dicke ausnehmen: Blatttiefe ${d.blatt ?? '–'} mm. Leimen und 2 Schrauben 6 × 80 diagonal.`
    case 'schwalbenschwanz':
      return `Schwalbenschwanzblatt ${d.dicke ?? '–'} mm dick, ${d.tiefe ?? '–'} mm lang, Hals ${d.schmal ?? '–'} mm, Ende ${d.breit ?? '–'} mm (Neigung 1:6). 2 Holznägel Ø 10.`
    case 'zapfen':
      return `Zapfen ${d.dicke ?? '–'} × ${d.hoehe ?? '–'} mm, ${d.laenge ?? '–'} mm lang${d.durch ? ' (durchgehend)' : ''}. Zapfenloch gleich groß stemmen, Holznagel Ø 16 mm.`
    case 'gratnut':
      return `Gratnut ${d.tiefe ?? '–'} mm tief, Flanken 1:6, Stufe von der Seite einschieben, leimen + 2 Schrauben 5 × 50.`
    case 'ausklinkung':
      return `Einlassung ${d.tiefe ?? '–'} mm tief über die ganze Anlagefläche, 2 Schrauben 8 × 160.`
    case 'holzduebel':
      return '2 Holzdübel Ø 10 × 80 mm, je 40 mm tief, mit Dübelspitzen anzeichnen, leimen.'
    case 'stecken':
      return `Bohrung Ø ${d.durchmesser ?? '–'} mm, ${d.tiefe ?? '–'} mm tief (2/3 der Holzdicke), leimen.`
    case 'auflagerleiste':
      return 'Leiste 40 × 60 mm unter das Ende an das durchlaufende Holz, 3 Schrauben 5 × 50, darauf auflegen.'
    case 'gewindestange':
      return 'Gewindestange M10 mit großen Unterlegscheiben und Muttern beiderseits des Holzes, Kontermutter.'
    case 'kopfband':
      return 'Kopfband 45°, je Ende 2 Schrauben 8 × 160.'
    case 'seilbefestigung':
      return 'Seil durch Bohrung bzw. Augschraube, mit Achtknoten sichern.'
  }
  return ''
}
