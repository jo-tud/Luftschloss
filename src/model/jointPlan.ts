import { tk } from '../i18n'
import { BED_NUT_DEPTH, bedCentre, boltEdge, CROSS_NUT_DEPTH, jointFasteners, type Fastener } from './fasteners'
import { partDrawing, type PartDrawing, type Text } from './drawing'
import { dot, len, memberAxes, memberLength, scale, sub } from './geometry'
import { allCuts, assemblyDir, cutLengths, jointCuts, jointFrame, type JointCuts, type JointFrame, type Range } from './joinery'
import { guideKey, JOINT_GUIDE, type GuideEntry } from './jointGuide'
import { jointType, type JointType } from './joints'
import type { DetectedJoint, Resolved } from './resolve'
import type { Member, Vec3 } from './types'

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
  /** Anzeigename (beim stumpfen Bolzenstoß ein anderer als der des Typs) */
  name: string
  /** Werkzeug für genau diese Ausführung */
  tools: string[]
  toolsPlus?: string[]
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
  const fasteners = jointFasteners(j, byId, r)
  // durchgebolzt mit nur einem Bolzen: eigene Anleitung
  const single = j.typeId === 'schlossschraube' && !stoss && fasteners.filter((f) => f.kind === 'bolzen').length === 1
  const guide = (single ? JOINT_GUIDE['schlossschraube-1'] : JOINT_GUIDE[key]) ?? JOINT_GUIDE[j.typeId]
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
    vars.nut = f.kind === 'bettschraube' ? BED_NUT_DEPTH : CROSS_NUT_DEPTH
    vars.tasche = r0(f.crossNut?.depth ?? E.b / 2 + 12)
    // Bohrtiefe: beim Stoß bis zur Mitte der Tasche bzw. Querbohrung, sonst durch beide Hölzer
    vars.tiefe = f.kind === 'bettschraube' ? r0(f.length + 5) : f.crossNut ? r0(len(sub(f.crossNut.at, f.head))) : r0(f.length)
    // kleinster Rand- bzw. Endabstand quer zur Bolzenachse in beiden Hölzern
    const ax = memberAxes(E)
    const edges = bolts.flatMap((b) => [E, T].flatMap((m) => (m ? [boltEdge(m, b.head, b.dir)] : [])).filter((x): x is number => x !== undefined))
    vars.rand = edges.length ? Math.max(0, r0(Math.min(...edges))) : 0
    // Abstand der Bolzen zur Ober- und Unterkante des anschließenden Holzes (nur beim stumpfen Stoß)
    if (f.crossNut) {
      const up = ax[2].z < -0.1 ? -1 : 1
      const hs = bolts.map((b) => up * dot(sub(b.head, E.start), ax[2]))
      vars.oben = r0(E.h / 2 - Math.max(...hs))
      vars.unten = r0(E.h / 2 + Math.min(...hs))
    }
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
  if ((j.typeId === 'gratnut' || j.typeId === 'nut') && T && E) {
    // Nutlage an der Wange: Winkel zur Wangenkante, Teilung entlang der Wange, erste Nut ab Fuß
    let aT = memberAxes(T)[0]
    if (aT.z < 0) aT = scale(aT, -1)
    vars.winkel = r0((Math.asin(Math.min(1, Math.abs(aT.z))) * 180) / Math.PI)
    const foot = T.start.z <= T.end.z ? T.start : T.end
    const at = r.joints.filter((x) => (x.typeId === 'gratnut' || x.typeId === 'nut') && (x.a === T.id || x.b === T.id)).map((x) => dot(sub(x.pos, foot), aT)).sort((a, b) => a - b)
    vars.erste = r0(at[0] ?? dot(sub(j.pos, foot), aT))
    vars.teilung = at.length > 1 ? r0((at[at.length - 1] - at[0]) / (at.length - 1)) : 0
  }
  if (j.typeId === 'auflagerleiste' && cuts?.extras[0]) vars.leiste = r0(cuts.extras[0].half[1] * 2)
  // Kopfband: Zuschnitt von Spitze zu Spitze (mit Gehrungen), nicht die Achslänge
  if (j.typeId === 'kopfband' && E) vars.laenge = r0(cutLengths(r.joints.filter((x) => x.a === E.id || x.b === E.id), r.members).get(E.id) ?? memberLength(E))
  if (j.typeId === 'versatz' && !vars.size) vars.size = '8 × 160'

  // ohne berechnete Geometrie (ungewöhnliche Lage): übliche Werte, damit die Anleitung lesbar bleibt
  const DEFAULTS: Record<string, string | number> = { winkel: 70, erste: 200, teilung: 225, hoehe: 60, oben: 40, unten: 30, tasche: 36, tiefe: 15, n: 2, size: '8 × 160', grip: 72, abstand: 50, rand: 40, bohr: 11, laenge: 180, nut: CROSS_NUT_DEPTH }
  for (const st of guide.steps)
    for (const m of st.t.matchAll(/\{(\w+)\}/g)) if (!(m[1] in vars)) vars[m[1]] = DEFAULTS[m[1]] ?? '–'
  const effort: JointEffort = { difficulty: type.difficulty, minutes: type.minutes, drill: type.drill, hard: type.hard }
  // Stoß mit Quermutter: Querbohrung und Längsbohrung müssen sich treffen
  let name = type.name
  let tools = type.tools
  let toolsPlus = type.toolsPlus
  if (j.typeId === 'schlossschraube' && stoss) {
    Object.assign(effort, { difficulty: 2, minutes: [50, 20], drill: 1, hard: STOSS_HARD })
    name = STOSS_NAME
    tools = STOSS_TOOLS
    toolsPlus = STOSS_TOOLS_PLUS
  }
  return { type, name, tools, toolsPlus, frame, E, T, stoss, guide, vars, effort, fasteners, cuts }
}

/**
 * Anzeigename, Schwierigkeit und Werkzeug einer Verbindungsart an genau diesem Stoß (stumpfer Bolzenstoß:
 * Sechskantschraube mit Mutter in Tasche statt durchgebolzter Schlossschraube)
 */
export function jointVariant(typeId: string, j: DetectedJoint, byId: Map<string, Member>): { name: string; difficulty: 1 | 2 | 3; tools: string[] } | undefined {
  const type = jointType(typeId)
  if (!type) return undefined
  const A = byId.get(j.a)
  const B = byId.get(j.b)
  const stoss = !!j.ending && !!A && !!B && !!jointFrame(j, A, B)?.pE
  if (typeId === 'schlossschraube' && stoss) return { name: STOSS_NAME, difficulty: 2, tools: STOSS_TOOLS }
  return { name: type.name, difficulty: type.difficulty, tools: type.tools }
}

const STOSS_HARD = tk('Durch den Pfosten lang und gerade ins Hirnholz bohren, bis die Bohrung in der Tasche ankommt.')
const STOSS_NAME = tk('Bolzenstoß M10: Sechskantschraube, Mutter in einer Tasche (2 Stück)')
const STOSS_TOOLS = [tk('Bohrmaschine'), tk('Schlangenbohrer Ø 11 × 250 mm'), tk('Forstnerbohrer Ø 35 mm'), tk('Zwingen'), tk('Ratsche mit Nuss 17'), tk('Anschlagwinkel')]
const STOSS_TOOLS_PLUS = [tk('Bohrführung bzw. Bohrklotz')]

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
        center: bedCentre(r, m),
        lines: housingLines(m, [j], byId),
      }),
    )
  }
  return out
}

/** Mittellinien der Gratnuten, die in m eingeschnitten sind (Wange einer Treppe) */
function housingLines(m: Member, joints: DetectedJoint[], byId: Map<string, Member>): { p: Vec3; d: Vec3; n: Vec3 }[] {
  const out: { p: Vec3; d: Vec3; n: Vec3 }[] = []
  for (const j of joints) {
    if (j.typeId !== 'gratnut' && j.typeId !== 'nut') continue
    const A = byId.get(j.a)
    const B = byId.get(j.b)
    const F = A && B ? jointFrame(j, A, B) : undefined
    if (!F || F.T.id !== m.id) continue
    // F.out zeigt von E in T hinein: die Nut liegt auf der Fläche mit Normale −F.out
    out.push({ p: j.pos, d: assemblyDir(j, F), n: scale(F.out, -1) })
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

/**
 * Teile-Arbeitsplan: ein Werkstück mit allen Bearbeitungen und Bohrungen aus allen seinen
 * Verbindungen, über die ganze Länge. Stehende Hölzer werden vom unteren Ende aus bemaßt.
 */
export function partWorkDrawing(m: Member, r: Resolved, label: (m: Member) => string): PartDrawing | undefined {
  if (m.round) return undefined
  const mine = r.joints.filter((j) => j.a === m.id || j.b === m.id)
  const cut = allCuts(mine, r.members).members.get(m.id)
  const byId = new Map(r.members.map((x) => [x.id, x]))
  const fasteners = mine.flatMap((j) => jointFasteners(j, byId, r))
  const others = new Map<string, Member>()
  for (const j of mine) for (const id of [j.a, j.b]) if (id !== m.id && byId.get(id)) others.set(id, byId.get(id)!)
  const ax = memberAxes(m)[0]
  const vertical = Math.abs(ax.z) > 0.7
  const d = partDrawing(m, cut, {
    fasteners,
    others,
    label,
    full: true,
    refAtStart: vertical ? m.start.z <= m.end.z : true,
    endName: (atStart) => endName(m, atStart, r, label),
    center: bedCentre(r, m),
    lines: housingLines(m, mine, byId),
  })
  const any = d.holes.length > 0 || d.views.some((v) => v.waste.length > 0 || v.hidden.length > 0) || !!cut?.add.length
  return any ? d : undefined
}
