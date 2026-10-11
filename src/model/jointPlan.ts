import { tk } from '../i18n'
import { CROSS_NUT_DEPTH, jointFasteners, type Fastener } from './fasteners'
import { partDrawing, type PartDrawing, type Text } from './drawing'
import { dot, len, memberAxes, memberLength, scale, sub } from './geometry'
import { jointCuts, jointFrame, type JointCuts, type JointFrame, type Range } from './joinery'
import { guideKey, JOINT_GUIDE, type GuideEntry } from './jointGuide'
import { jointType, type JointType } from './joints'
import type { DetectedJoint, Resolved } from './resolve'
import type { Member } from './types'

/**
 * Arbeitsplan einer konkreten Verbindung: welche Anleitung gilt, mit welchen Maßen, wie aufwendig
 * sie ist. Liest Geometrie (joinery.ts) und Befestigungsmittel (fasteners.ts), damit Text, 3D-Ablauf
 * und Einkaufsliste dieselben Zahlen zeigen.
 */
export interface JointEffort {
  difficulty: 1 | 2 | 3
  /** Minuten je Verbindung: Anfänger, geübt */
  minutes: [number, number]
  /** 0 kaum Bohrungen, 1 rechtwinklig bohren, 2 Bohrungen müssen sich treffen */
  drill: 0 | 1 | 2
  hard: string
}

export interface JointPlan {
  type: JointType
  frame?: JointFrame
  E?: Member
  T?: Member
  /** stumpfer Stoß: anschließendes Teil endet am durchlaufenden */
  stoss: boolean
  guide: GuideEntry
  /** Werte für die Platzhalter der Anleitung; E und T sind Bauteilnamen (vor der Anzeige mit tr übersetzen) */
  vars: Record<string, string | number>
  effort: JointEffort
  /** fertige Anzeigenamen für {E} und {T} (Bauplan: Name mit Teilenummer), sonst vars übersetzen */
  labels?: { E: string; T: string }
  fasteners: Fastener[]
  cuts?: JointCuts
}

/** Länge, die man kauft: aus dem Katalogartikel (…x200) bzw. 180 für die Standard-Schlossschraube */
function buyLength(item?: string): number | undefined {
  if (!item) return undefined
  if (item === 'schlossschraube-m10') return 180
  const m = /x(\d+)$/.exec(item)
  return m ? Number(m[1]) : undefined
}

const r0 = (x: number) => Math.round(x)

export function jointPlan(j: DetectedJoint, byId: Map<string, Member>, r: Resolved): JointPlan | undefined {
  const type = jointType(j.typeId)
  if (!type) return undefined
  const A = byId.get(j.a)
  const B = byId.get(j.b)
  const frame = A && B ? jointFrame(j, A, B) : undefined
  const E = frame?.E ?? (j.ending ? byId.get(j.ending) : A)
  const T = frame?.T ?? (E === A ? B : A)
  const stoss = !!frame?.pE && !!j.ending
  const key = guideKey(j.typeId, stoss && (j.typeId === 'schlossschraube' || j.typeId === 'holzbauschraube'))
  const guide = JOINT_GUIDE[key] ?? JOINT_GUIDE[j.typeId]
  const fasteners = jointFasteners(j, byId, r)
  const cuts = jointCuts(j, byId)
  const vars: Record<string, string | number> = { E: E?.name ?? '', T: T?.name ?? '' }
  for (const [k, x] of Object.entries(cuts?.dims ?? {})) vars[k] = x

  const bolts = fasteners.filter((f) => f.kind === 'bolzen' || f.kind === 'bettschraube')
  if (bolts.length && E) {
    const f = bolts[0]
    vars.n = bolts.length
    vars.bohr = f.drill ?? 11
    vars.laenge = buyLength(f.item) ?? r0(f.length)
    vars.abstand = bolts.length > 1 ? r0(len(sub(bolts[0].head, bolts[1].head))) : 0
    vars.nut = CROSS_NUT_DEPTH
    vars.tasche = r0(E.b / 2 + 12)
    vars.tiefe = f.crossNut ? r0(f.length - 10) : r0(f.length)
    // kleinster Abstand der Bolzenachse zum Rand des anschließenden Holzes
    const ax = memberAxes(E)
    const edge = Math.min(
      ...bolts.map((b) => {
        const rel = sub(b.head, E.start)
        return Math.min(E.b / 2 - Math.abs(dot(rel, ax[1])), E.h / 2 - Math.abs(dot(rel, ax[2])))
      }),
    )
    vars.rand = Math.max(0, r0(edge))
  }
  if (!bolts.length && E && T && (j.typeId === 'schlossschraube' || j.typeId === 'bettschraube')) {
    // ohne berechnete Lage (ungewöhnliche Geometrie): übliche Werte
    Object.assign(vars, { n: 2, bohr: j.typeId === 'bettschraube' ? 9 : 11, laenge: 180, abstand: r0(Math.max(E.b, E.h) / 2), nut: CROSS_NUT_DEPTH, tasche: r0(E.b / 2 + 12), tiefe: r0(Math.min(T.b, T.h) + CROSS_NUT_DEPTH), rand: 40 })
  }
  const screws = fasteners.filter((f) => f.kind === 'schraube' && f.first !== undefined)
  if (screws.length) {
    const f = screws[0]
    vars.n = screws.length
    vars.size = `${f.d} × ${buyLength(f.item) ?? r0(f.length)}`
    vars.grip = r0(f.length - (f.first ?? 0))
  } else {
    const any = fasteners.find((f) => f.kind === 'schraube' && f.item)
    if (any) vars.size = `${any.d} × ${buyLength(any.item) ?? r0(any.length)}`
  }
  if (j.typeId === 'winkel') vars.n = fasteners.filter((f) => f.kind === 'schraube').length / 2 || 10
  if (j.typeId === 'holzduebel') {
    const d = fasteners.filter((f) => f.kind === 'duebel')
    vars.abstand = d.length > 1 ? r0(len(sub(d[0].head, d[1].head))) : 0
  }
  if (j.typeId === 'zapfen' && cuts?.dims.laenge) {
    vars.lochtiefe = cuts.dims.durch ? cuts.dims.laenge : cuts.dims.laenge + 5
    vars.nagel = r0(cuts.dims.laenge / 2)
  }
  if (j.typeId === 'auflagerleiste' && cuts?.extras[0]) vars.leiste = r0(cuts.extras[0].half[1] * 2)
  if (j.typeId === 'kopfband' && E) vars.laenge = r0(memberLength(E))
  if (j.typeId === 'versatz' && !vars.size) vars.size = '8 × 160'

  // ohne berechnete Geometrie (ungewöhnliche Lage): übliche Werte, damit die Anleitung lesbar bleibt
  const DEFAULTS: Record<string, string | number> = { tiefe: 15, n: 2, size: '8 × 160', grip: 72, abstand: 50, rand: 40, bohr: 11, laenge: 180, nut: CROSS_NUT_DEPTH }
  for (const st of guide.steps)
    for (const m of st.t.matchAll(/\{(\w+)\}/g)) if (!(m[1] in vars)) vars[m[1]] = DEFAULTS[m[1]] ?? '–'
  const effort: JointEffort = { difficulty: type.difficulty, minutes: type.minutes, drill: type.drill, hard: type.hard }
  // Stoß mit Quermutter: Querbohrung und Längsbohrung müssen sich treffen
  if (j.typeId === 'schlossschraube' && stoss) Object.assign(effort, { difficulty: 2, minutes: [45, 20], drill: 1, hard: STOSS_HARD })
  return { type, frame, E, T, stoss, guide, vars, effort, fasteners, cuts }
}

const STOSS_HARD = tk('Längsbohrung muss die Querbohrung der Mutter treffen.')

/** Text mit Platzhaltern füllen (für Tests und Druck; Anzeige über t() mit denselben Werten) */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/**
 * Werkstattzeichnungen der beiden Teile einer Verbindung (anzusetzendes Teil zuerst), mit den
 * Bearbeitungen und Bohrungen nur dieser Verbindung. label: Name eines Teils für „im Verbund mit …“.
 */
export function jointDrawings(plan: JointPlan, j: DetectedJoint, byId: Map<string, Member>, r: Resolved, label: (m: Member) => string): PartDrawing[] {
  const out: PartDrawing[] = []
  // Ausdehnung beider Teile entlang ihrer Achse, mit Zapfen und Blatt (für „im Verbund mit …“)
  const ranges = new Map<string, Range>()
  for (const m of [plan.E, plan.T]) {
    if (!m) continue
    let lo = 0
    let hi = memberLength(m)
    for (const b of plan.cuts?.members.get(m.id)?.add ?? []) {
      lo = Math.min(lo, b[0][0])
      hi = Math.max(hi, b[0][1])
    }
    ranges.set(m.id, [lo, hi])
  }
  const others = new Map([...byId].filter(([id]) => id === j.a || id === j.b))
  for (const m of [plan.E, plan.T]) {
    if (!m || m.round) continue
    const other = m === plan.E ? plan.T : plan.E
    const toward = plan.frame ? scale(plan.frame.out, m === plan.E ? 1 : -1) : undefined
    out.push(
      partDrawing(m, plan.cuts?.members.get(m.id), {
        at: j.pos,
        fasteners: plan.fasteners,
        others,
        ranges,
        label,
        toward,
        towardName: other ? label(other) : undefined,
        endName: (atStart) => endName(m, atStart, r, label),
      }),
    )
  }
  return out
}

/** Bezugsende benennen: oben bzw. unten bei stehenden Hölzern, sonst nach dem Teil, an dem es endet */
export function endName(m: Member, atStart: boolean, r: Resolved, label: (m: Member) => string): Text {
  const p = atStart ? m.start : m.end
  const q = atStart ? m.end : m.start
  const ax = memberAxes(m)[0]
  if (Math.abs(ax.z) > 0.7) return { key: p.z < q.z ? tk('unteres Ende') : tk('oberes Ende') }
  const reach = Math.max(m.b, m.h) * 1.5
  const byId = new Map(r.members.map((x) => [x.id, x]))
  for (const jj of r.joints) {
    if (jj.a !== m.id && jj.b !== m.id) continue
    if (len(sub(jj.pos, p)) > reach) continue
    const o = byId.get(jj.a === m.id ? jj.b : jj.a)
    if (o) return { key: tk('Ende an {teil}'), vars: { teil: label(o) } }
  }
  return { key: tk('Bezugsende') }
}
