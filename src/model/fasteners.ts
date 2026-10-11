import { add, cross, dot, len, memberAxes, memberBoxes, memberLength, norm, scale, sub, v } from './geometry'
import { braceEnd, jointCuts, jointFrame, lapRange } from './joinery'
import type { DetectedJoint, Resolved } from './resolve'
import type { Member, Vec3 } from './types'

/**
 * Befestigungsmittel einer Verbindung als Modell (mm, z oben): Lage, Einbaurichtung und wann sie
 * beim Bauen dazukommen. 3D-Ansicht (Beschläge), Verbindungsdetail (Animation), Arbeitsschritte
 * und Werkstattzeichnung lesen alle diese eine Liste.
 */

export type FastenerKind =
  /** Bolzen M10: Schlossschraube durchgebolzt bzw. Sechskantschraube mit Mutter in einer Tasche */
  | 'bolzen'
  /** Bettschraube M8 mit Zylindermutter */
  | 'bettschraube'
  /** Holzschraube (Tellerkopf 8 × 160, Spax 5 × 50, …) */
  | 'schraube'
  /** Holznagel bzw. Holzdübel, dessen Stirnseiten sichtbar bleiben */
  | 'holznagel'
  /** verdeckter Holzdübel im Stoß */
  | 'duebel'
  /** Stahlblech von Winkel bzw. Balkenschuh */
  | 'blech'
  /** Scheibe und Mutter auf einer Gewindestange */
  | 'stangenmutter'

/**
 * Wann das Befestigungsmittel dazukommt:
 * - vorher: am durchlaufenden Holz, bevor das andere Teil angesetzt wird (Balkenschuh, Leiste)
 * - mit: steckt schon im anzusetzenden Teil und wird mit ihm gefügt (Dübel)
 * - nachher: nach dem Fügen, durch die zusammengesetzten Teile (Bolzen, Schrauben, Holznägel)
 */
export type FastenerWhen = 'vorher' | 'mit' | 'nachher'

export interface Fastener {
  joint: string
  kind: FastenerKind
  /** Kopf bzw. Eintrittspunkt (bei Blechen die Blechmitte) */
  head: Vec3
  /** Einbaurichtung, ins Holz hinein (Einheitsvektor) */
  dir: Vec3
  /** Schaftlänge ab Kopf in mm (Blech: Schenkellänge) */
  length: number
  /** Schaftdurchmesser in mm (Blech: Breite) */
  d: number
  when: FastenerWhen
  /** Durchgebolzt: Scheibe und Mutter am Ende des Schafts */
  nut?: boolean
  /**
   * Stumpfer Stoß: Mutter in einer Querbohrung bzw. Tasche; at liegt auf der Bolzenachse, dir zeigt zur Öffnung.
   * outer/inner: Ausdehnung der Mutter entlang dir; bore, depth: Ø und Tiefe der Bohrung ab der Holzfläche
   */
  crossNut?: { at: Vec3; dir: Vec3; outer: number; inner: number; bore: number; depth: number }
  /** Blech: Achsen (Länge, Dicke, Breite) */
  plate?: { axes: [Vec3, Vec3, Vec3]; thick: number }
  /** Teile mit derselben Gruppe kommen zusammen an (die zwei Schenkel eines Winkels) */
  group?: number
  /** Katalogartikel für die Einkaufsliste (je Befestigungsmittel einmal; bei Winkeln am ersten Schenkel) */
  item?: string
  /** Vorbohren bzw. Bohrung: Durchmesser in mm (0 = ohne) */
  drill?: number
  /** Schraube: so viel Holz durchdringt sie, bevor sie ins tragende Holz greift */
  first?: number
}

/** Mindestens so tief muss das Gewinde einer 8er-Schraube im tragenden Holz sitzen (9·d, volle Tragfähigkeit) */
export const SCREW_GRIP_8 = 72

/** Kürzeste Tellerkopfschraube 8 mm, die durch first mm Holz noch grip mm ins tragende Holz reicht */
export function screw8(first: number, grip = SCREW_GRIP_8): { length: number; item: string } {
  for (const L of [160, 200, 240]) if (L - first >= grip) return { length: L, item: `schraube-8x${L}` }
  return { length: 240, item: 'schraube-8x240' }
}

const SCREWS: { d: number; L: number; item: string }[] = [
  { d: 8, L: 160, item: 'schraube-8x160' },
  { d: 8, L: 200, item: 'schraube-8x200' },
  { d: 8, L: 240, item: 'schraube-8x240' },
  { d: 6, L: 80, item: 'schraube-6x80' },
  { d: 6, L: 100, item: 'schraube-6x100' },
  { d: 5, L: 50, item: 'schraube-5x50' },
]

/**
 * Passende Holzschraube: Durchmesser höchstens ein Drittel des dünnsten Holzes (sonst spaltet es),
 * Länge so, dass sie durch first mm Holz geht, im tragenden Holz möglichst 9·d greift (mindestens 6·d)
 * und dort nicht wieder austritt (bearing = Dicke des tragenden Holzes in Schraubrichtung).
 */
export function pickScrew(first: number, bearing: number, thin: number): { d: number; length: number; item: string } {
  const fits = SCREWS.filter((s) => s.d <= Math.max(5, thin / 3) && s.L <= first + bearing - 8 && s.L - first >= 6 * s.d)
  // dickste Schraube zuerst; dann die kürzeste, die 9·d greift, sonst die längste mögliche
  for (const d of [8, 6, 5]) {
    const ds = fits.filter((s) => s.d === d).sort((a, b) => a.L - b.L)
    if (!ds.length) continue
    const full = ds.find((s) => s.L - first >= 9 * d)
    const s = full ?? ds[ds.length - 1]
    return { d, length: s.L, item: s.item }
  }
  // nichts passt sauber: die kürzeste, die überhaupt durch das erste Holz reicht
  const s = SCREWS.filter((x) => x.L > first + 10).sort((a, b) => a.d - b.d || a.L - b.L)[0] ?? SCREWS[0]
  return { d: s.d, length: s.L, item: s.item }
}

/** Kürzeste Schlossschraube M10, die durch beide Hölzer samt Scheibe und Mutter reicht */
export function boltM10(through: number): { length: number; item: string } {
  const need = through + 15
  for (const L of [160, 180, 200, 240]) if (L >= need) return { length: L, item: L === 180 ? 'schlossschraube-m10' : `schlossschraube-m10x${L}` }
  return { length: 240, item: 'schlossschraube-m10x240' }
}

/** Abstand der Quermutter vom Hirnholzende (a3,t = 80 mm für M10, DIN EN 1995) */
export const CROSS_NUT_DEPTH = 80

const neg = (a: Vec3): Vec3 => scale(a, -1)
const width2 = (r: [number, number]) => r[1] - r[0]
const at = (base: Vec3, ...terms: [Vec3, number][]): Vec3 => terms.reduce((q, [d, k]) => add(q, scale(d, k)), base)

/** Ausdehnung eines Stabs entlang einer Richtung (mit Ausklinkungen) */
function range(m: Member, e: Vec3): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const o of memberBoxes(m)) {
    const c = dot(o.center, e)
    const r = o.axes.reduce((s, a, i) => s + Math.abs(dot(a, e)) * o.half[i], 0)
    lo = Math.min(lo, c - r)
    hi = Math.max(hi, c + r)
  }
  return [lo, hi]
}

/** Mitte der Grundfläche des Betts, zu dem m gehört (für innen/außen) */
export function bedCentre(r: Resolved, m: Member): Vec3 | undefined {
  const bed = m.assemblyId ? r.beds.get(m.assemblyId) : undefined
  if (!bed) return undefined
  return v(bed.footprint.reduce((s, q) => s + q.x, 0) / bed.footprint.length, bed.footprint.reduce((s, q) => s + q.y, 0) / bed.footprint.length, 0)
}

const BOLTS = new Set(['schlossschraube', 'bettschraube'])
/** Stöße mit Schrauben ins Hirnholz bzw. durch das durchlaufende Holz */
const SCREWED = new Set(['holzbauschraube', 'ausklinkung', 'auflage', 'winkel'])

/**
 * Verbindungsarten, deren Befestigungsmittel hier aus der Geometrie entstehen. Liefern sie an einem
 * Stoß nichts (Hölzer berühren sich nur an einer Kante), braucht es dort auch nichts zu kaufen.
 */
export const MODELED = new Set(['winkel', 'balkenschuh', 'schlossschraube', 'bettschraube', 'holzbauschraube', 'auflage', 'auflagerleiste', 'ausklinkung', 'ueberblattung', 'schwalbenschwanz', 'zapfen', 'holzduebel', 'gratnut', 'kopfband', 'versatz'])

/** Liegt p im Stab m (ohne Ausnehmungen)? */
function inside(m: Member, p: Vec3): boolean {
  return memberBoxes(m).some((o) => o.axes.every((a, i) => Math.abs(dot(sub(p, o.center), a)) <= o.half[i] + 0.5))
}

/**
 * Kleinster Rand- bzw. Endabstand eines Bolzens (Achse axis durch p) im Stab m, gemessen quer zur
 * Bolzenachse; undefined, wenn der Bolzen m nicht trifft
 */
export function boltEdge(m: Member, p: Vec3, axis: Vec3): number | undefined {
  const [m0, m1] = range(m, axis)
  const q = add(p, scale(axis, (m0 + m1) / 2 - dot(p, axis)))
  let best: number | undefined
  for (const o of memberBoxes(m)) {
    const rel = sub(q, o.center)
    if (!o.axes.every((a, i) => Math.abs(dot(rel, a)) <= o.half[i] + 0.5)) continue
    const dd = Math.min(...o.axes.map((a, i) => (Math.abs(dot(a, axis)) < 0.7 ? o.half[i] - Math.abs(dot(rel, a)) : Infinity)))
    best = best === undefined ? dd : Math.max(best, dd)
  }
  return best
}

/** Wie weit ein Strahl ab p in Richtung d im Stab m verläuft (0, wenn p nicht im Holz liegt) */
function rayIn(m: Member, p: Vec3, d: Vec3): number {
  let best = 0
  for (const o of memberBoxes(m)) {
    let tMax = Infinity
    let ok = true
    o.axes.forEach((a, i) => {
      const q = dot(sub(p, o.center), a)
      const dd = dot(d, a)
      if (Math.abs(q) > o.half[i] + 0.5) ok = false
      else if (Math.abs(dd) > 1e-9) tMax = Math.min(tMax, ((dd > 0 ? o.half[i] : -o.half[i]) - q) / dd)
    })
    if (ok) best = Math.max(best, tMax)
  }
  return best
}

/** Wie viel Holz eine Schraube in Richtung n quer durch den Stab m durchläuft (schräge Hölzer: mehr als die Dicke) */
function chord(m: Member, n: Vec3): number {
  const ax = memberAxes(m)
  return Math.min(m.b / Math.max(1e-6, Math.abs(dot(ax[1], n))), m.h / Math.max(1e-6, Math.abs(dot(ax[2], n))))
}

/** Forstner-Ø der Tasche für Mutter und Scheibe M10 im stumpfen Bolzenstoß */
export const POCKET_D = 35

/**
 * Sechskantschraube M10 für den Bolzenstoß: durch first mm Holz (Kopfscheibe 3 mm), die Spitze soll
 * mindestens 1 mm aus der Mutter ragen (Taschenwand plan gestochen, Scheibe 2 + Mutter 8 mm) und
 * 5 mm vor der Gegenwand der Tasche frei enden
 */
export function hexM10(first: number, nutDepth = CROSS_NUT_DEPTH, bore = POCKET_D): { length: number; item: string } {
  const lo = first + 3 + nutDepth - bore / 2 + 3 + 10 + 1
  const hi = first + 3 + nutDepth + bore / 2 - 5
  const L = [140, 160, 180, 200, 240].filter((x) => x >= lo && x <= hi).pop() ?? [140, 160, 180, 200, 240].find((x) => x >= lo) ?? 240
  return { length: L, item: `sechskantschraube-m10x${L}` }
}

/**
 * Höhen der Bolzen eines stumpfen Stoßes über der Mitte des anschließenden Holzes (h hoch, Bolzen-Ø d).
 * DIN EN 1995: zum beanspruchten Rand oben 4·d, zum unbeanspruchten unten 3·d, untereinander 4·d.
 * crossing: Am selben Pfosten kommt ein zweiter Bolzenstoß quer dazu; dessen Bolzen würden die
 * eigenen im Pfosten kreuzen. +1 = obere Lage, −1 = um d + 6 mm tiefer gesetzte Lage (der Abstand
 * zur Unterkante sinkt dann unter 3·d; besser wäre, die Querzargen tiefer zu setzen).
 */
export function boltHeights(h: number, d: number, crossing: number): number[] {
  const top = h / 2 - 4 * d
  const bot = -h / 2 + 3 * d
  const avail = top - bot
  // 6 mm Holz zwischen den Bohrungen, damit eine leicht schiefe Bohrung die andere nicht trifft
  const gap = d + 6
  if (crossing === 0) return avail >= 4 * d ? [top, bot] : [(top + bot) / 2]
  if (avail < 4 * d) return [(top + bot) / 2 + (crossing * gap) / 2]
  const s = Math.max(4 * d, avail - gap)
  const t0 = crossing > 0 ? top : top - gap
  return [t0, t0 - s]
}

/**
 * Gibt es am selben durchlaufenden Holz einen zweiten, quer dazu stehenden Stoß (Typ aus types) auf
 * gleicher Höhe, dessen Bolzen bzw. Schrauben die eigenen kreuzen würden? 0 nein, sonst ±1 (Lage)
 */
function crossing(j: DetectedJoint, E: Member, T: Member, byId: Map<string, Member>, r: Resolved, types: Set<string>): number {
  const aE = memberAxes(E)[0]
  const zr = (m: Member): [number, number] => range(m, v(0, 0, 1))
  const [z0, z1] = zr(E)
  for (const o of r.joints) {
    if (o.key === j.key || !types.has(o.typeId) || !o.ending || o.ending === T.id) continue
    if (o.a !== T.id && o.b !== T.id) continue
    const E2 = byId.get(o.ending)
    if (!E2 || E2.round) continue
    if (Math.abs(dot(memberAxes(E2)[0], aE)) > 0.5) continue
    const [y0, y1] = zr(E2)
    if (Math.min(z1, y1) - Math.max(z0, y0) < 20) continue
    return Math.abs(aE.x) >= Math.abs(aE.y) ? 1 : -1
  }
  return 0
}

/** Befestigungsmittel einer Verbindung */
export function jointFasteners(j: DetectedJoint, byId: Map<string, Member>, r: Resolved): Fastener[] {
  const out: Fastener[] = []
  const A = byId.get(j.a)
  const B = byId.get(j.b)
  if (!A || !B) return out
  const push = (f: Omit<Fastener, 'joint'>) => out.push({ joint: j.key, ...f })
  const screw = (head: Vec3, dir: Vec3, length: number, radius: number, when: FastenerWhen = 'nachher', item?: string, drill?: number) =>
    push({ kind: 'schraube', head, dir, length, d: radius * 2, when, item, drill })
  /**
   * Schrauben in den Löchern eines Blechs (Mitte c, Schenkelrichtung l, Breite w, Normale nach außen n).
   * 5 × 50 ins Kantholz; auf einem dünnen Brett (wood mm) kurze 4 × 16, sonst kämen sie hinten heraus.
   */
  const plateScrews = (c: Vec3, l: Vec3, w: Vec3, n: Vec3, W: number, when: FastenerWhen, g?: number, wood = 80, leg = 90, shiftW = 0) => {
    const short = wood < 45
    // Lochbild über die Schenkellänge verteilt (bei 90 mm: −18, 8, 30 mm um die Mitte)
    for (const [a, b] of [
      [-0.2 * leg, -0.25],
      [-0.2 * leg, 0.25],
      [0.09 * leg, 0],
      [0.33 * leg, -0.25],
      [0.33 * leg, 0.25],
    ] as const)
      out.push({ joint: j.key, kind: 'schraube', head: at(c, [l, a], [w, b * W + shiftW], [n, 1.3]), dir: neg(n), length: short ? 16 : 50, d: short ? 4 : 5, when, item: short ? 'schraube-4x16' : 'schraube-5x50', group: g })
  }
  let group = 0
  const plate = (center: Vec3, lenAx: Vec3, thickAx: Vec3, wideAx: Vec3, L: number, W: number, when: FastenerWhen) =>
    push({ kind: 'blech', head: center, dir: thickAx, length: L, d: W, when, plate: { axes: [lenAx, thickAx, wideAx], thick: 2.5 }, group })

  if (BOLTS.has(j.typeId)) {
    if (A.round || B.round) return out
    const aA = memberAxes(A)[0]
    const c0 = cross(aA, memberAxes(B)[0])
    if (len(c0) < 0.3) return out
    const ax = norm(c0)
    // Wo liegen beide Hölzer übereinander (quer zur Bolzenachse gesehen)? Nur dort kann durchgebolzt werden.
    const e1 = aA
    const e2 = norm(cross(ax, aA))
    const ov = (e: Vec3): [number, number] => {
      const [a0, a1] = range(A, e)
      const [b0, b1] = range(B, e)
      return [Math.max(a0, b0), Math.min(a1, b1)]
    }
    const o1 = ov(e1)
    const o2 = ov(e2)
    const rad = j.typeId === 'bettschraube' ? 4 : 5
    const kind = j.typeId === 'bettschraube' ? 'bettschraube' : 'bolzen'
    if (o1[1] - o1[0] > 25 && o2[1] - o2[0] > 25 && j.typeId === 'schlossschraube') {
      // Durchgebolzt: Hölzer liegen aneinander (Beischlag, Kreuzung, überlappende Ecke)
      const [a0, a1] = range(A, ax)
      const [b0, b1] = range(B, ax)
      const lo = Math.min(a0, b0)
      const hi = Math.max(a1, b1)
      const p0 = dot(j.pos, ax)
      const mid = at(v(0, 0, 0), [e1, (o1[0] + o1[1]) / 2], [e2, (o2[0] + o2[1]) / 2], [ax, p0])
      // Kopf nach außen, weg von der Bettmitte
      const bc = bedCentre(r, A)
      const sign = bc && dot(v(bc.x - j.pos.x, bc.y - j.pos.y, 0), ax) > 0 ? -1 : 1
      const dOut = scale(ax, sign)
      const tHead = sign > 0 ? hi - p0 : p0 - lo
      const tNut = -(sign > 0 ? p0 - lo : hi - p0)
      // zwei Bolzen entlang der längeren Überdeckung: 4·d vom Rand der Überdeckung, untereinander
      // 4·d bis 80 mm (DIN EN 1995); reicht der Platz nicht, ein Bolzen in der Mitte
      const long1 = o1[1] - o1[0] >= o2[1] - o2[0]
      const e = long1 ? e1 : e2
      const span = long1 ? o1[1] - o1[0] : o2[1] - o2[0]
      const d = 2 * rad
      const sp = Math.min(80, span - 8 * d)
      const offs = sp >= 4 * d ? [-sp / 2, sp / 2] : [0]
      const b = boltM10(tHead - tNut)
      // nur Bolzen, die wirklich durch beide Hölzer gehen (schräge Hölzer überdecken sich nicht rechteckig)
      const hits = (q: Vec3) => [A, B].every((m) => { const [m0, m1] = range(m, ax); return inside(m, at(q, [ax, (m0 + m1) / 2 - dot(q, ax)])) })
      const bases = offs.map((k) => at(mid, [e, k])).filter(hits)
      for (const base of bases.length ? bases : [mid])
        push({ kind, head: at(base, [dOut, tHead]), dir: neg(dOut), length: tHead - tNut, d, when: 'nachher', nut: true, item: b.item, drill: 11 })
      return out
    }
    if (!j.ending) return out
    // Stumpfer Stoß: Bolzen durch das durchlaufende Holz ins Hirnholz des anschließenden,
    // Mutter in einer Querbohrung (Tasche) auf der Innenseite – Prinzip der Bettschraube
    const E = byId.get(j.ending)
    const Tm = E === A ? B : A
    if (!E) return out
    const axesE = memberAxes(E)
    const aE = axesE[0]
    const dS = len(sub(E.start, j.pos))
    const dEnd = len(sub(E.end, j.pos))
    const pE = dS < dEnd ? E.start : E.end
    const into = dS < dEnd ? aE : neg(aE)
    const o = neg(into)
    const [t0, t1] = range(Tm, o)
    const tHead = t1 - dot(pE, o)
    if (tHead < 5 || t0 - dot(pE, o) > 5) return out
    const nutDepth = CROSS_NUT_DEPTH
    const bett = j.typeId === 'bettschraube'
    // Höhen von unten nach oben gemessen (Oberkante ist der beanspruchte Rand)
    const hDir = axesE[2].z < -0.1 ? neg(axesE[2]) : axesE[2]
    const heights = boltHeights(E.h, 2 * rad, crossing(j, E, Tm, byId, r, BOLTS))
    const bc = bedCentre(r, E)
    const sd = bc && dot(v(bc.x - pE.x, bc.y - pE.y, 0), axesE[1]) < 0 ? -1 : 1
    const sideDir = scale(axesE[1], sd)
    // Schlossschraube lässt sich im stumpfen Stoß nicht anziehen (der Vierkant dreht im Holz):
    // Sechskantschraube mit Scheibe, Mutter in einer Tasche (Forstner Ø 35) auf der Innenseite
    const hex = hexM10(tHead, nutDepth)
    const item = bett ? 'bettschraube-m8' : hex.item
    for (const hgt of heights) {
      const base = at(pE, [hDir, hgt])
      push({
        kind,
        head: at(base, [o, tHead]),
        dir: into,
        length: bett ? tHead + nutDepth + 10 : hex.length - 3,
        d: 2 * rad,
        when: 'nachher',
        crossNut: bett
          ? { at: at(base, [into, nutDepth]), dir: sideDir, outer: E.b / 2, inner: E.b * 0.1, bore: 10, depth: E.b / 2 + 12 }
          : { at: at(base, [into, nutDepth]), dir: sideDir, outer: E.b / 2, inner: -6, bore: POCKET_D, depth: E.b / 2 + 6 },
        item,
        drill: bett ? 9 : 11,
      })
    }
    return out
  }

  if (j.typeId === 'winkel' || j.typeId === 'balkenschuh') {
    const extent = (m: Member, d: Vec3) => {
      const ax = memberAxes(m)
      return Math.abs(dot(ax[1], d)) * (m.b / 2) + Math.abs(dot(ax[2], d)) * (m.h / 2)
    }
    if (j.typeId === 'winkel' && (j.kind === 'auflage' || j.kind === 'beischlag')) {
      const F = jointFrame(j, A, B)
      if (!F || F.E.round || F.T.round) return out
      const E = F.E
      const axE = memberAxes(E)
      // Richtung, in der E auf T liegt; steht E senkrecht auf T (Stütze), eine Querschnittsachse
      // (die Querschnittsachse quer zu T, damit die Winkel entlang T stehen)
      const aT = memberAxes(F.T)[0]
      const cands = [axE[1], axE[2]].filter((a) => Math.abs(dot(F.into, a)) < 0.7)
      const pick = Math.abs(dot(F.into, axE[0])) > 0.7 ? (cands.sort((a, b) => Math.abs(dot(a, aT)) - Math.abs(dot(b, aT)))[0] ?? axE[1]) : axE[0]
      const aE = norm(sub(pick, scale(F.into, dot(pick, F.into))))
      // aufliegend: senkrechter Schenkel an der Seite von E, waagerechter auf T, beiderseits
      const sdir = norm(cross(F.out, aE))
      const [s0, s1] = range(E, sdir)
      const tTop = range(F.T, F.into)[1]
      const eR = range(E, aE)
      const tR = range(F.T, aE)
      const onT: [number, number] = [Math.max(eR[0], tR[0]), Math.min(eR[1], tR[1])]
      if (onT[1] - onT[0] < 30) return out
      const c = (onT[0] + onT[1]) / 2
      const wd = Math.min(65, onT[1] - onT[0] - 4)
      for (const [edge, k] of [
        [s1, 1],
        [s0, -1],
      ] as const) {
        const o = scale(sdir, k)
        const corner = at(v(0, 0, 0), [aE, c], [sdir, edge], [F.into, tTop])
        const p0 = at(corner, [aE, -dot(corner, aE) + c])
        // Schenkel auf T nicht über dessen Rand hinaus (Latte am Ende der Zarge); zu wenig Platz: weglassen
        const room = range(F.T, o)[1] - dot(p0, o)
        const legT = Math.min(90, room - 2)
        if (legT < 35) continue
        plate(at(p0, [F.into, 45], [o, 1.25]), F.into, o, aE, 90, wd, 'nachher')
        out[out.length - 1].item = 'winkel-90'
        plate(at(p0, [o, legT / 2], [F.into, 1.25]), o, F.into, aE, legT, wd, 'nachher')
        plateScrews(at(p0, [F.into, 45], [o, 1.25]), F.into, aE, o, wd, 'nachher', group, chord(E, sdir))
        plateScrews(at(p0, [o, legT / 2], [F.into, 1.25]), o, aE, F.into, wd, 'nachher', group, chord(F.T, F.into), legT)
        group++
      }
      return out
    }
    if (!j.ending) return out
    const E = byId.get(j.ending)
    const Tm = byId.get(j.ending === j.a ? j.b : j.a)
    if (!E || !Tm || E.round || Tm.round) return out
    const axesE = memberAxes(E)
    const aE = axesE[0]
    const aT = memberAxes(Tm)[0]
    const c = cross(aE, aT)
    if (len(c) < 0.3) return out
    const ax = norm(c)
    const dS = len(sub(E.start, j.pos))
    const dEnd = len(sub(E.end, j.pos))
    const pE = dS < dEnd ? E.start : E.end
    const into = dS < dEnd ? aE : neg(aE)
    // Lage quer zur Achse wie der Knoten
    const base = at(pE, [ax, dot(sub(j.pos, pE), ax)])
    if (j.typeId === 'winkel') {
      // zwei Winkel in den Innenecken beiderseits des Stabs (am Pfosten: unter und über der Zarge),
      // Schenkel 90 mm, Breite 65 mm bzw. Holzbreite. Bei einem dünnen Brett sitzen sie auf den
      // Brettflächen, nicht auf der schmalen Kante.
      const flat = Math.min(E.b, E.h) < 30 && extent(E, aT) > extent(E, ax)
      // Winkel sitzen auf den Flächen von E: Normale ist die Querschnittsachse von E, die am besten zu
      // aT (bzw. bei Brettern zu ax) passt – so liegen sie auch an schrägen Wangen flach an
      const axE = memberAxes(E)
      const want = flat ? ax : aT
      const first = Math.abs(dot(axE[1], want)) >= Math.abs(dot(axE[2], want))
      const nDir0 = first ? axE[1] : axE[2]
      const nDir = dot(nDir0, want) < 0 ? neg(nDir0) : nDir0
      const wDir = first ? axE[2] : axE[1]
      const h = (first ? E.b : E.h) / 2
      const wd = Math.min(65, (first ? E.h : E.b) - 4)
      for (const s2 of [-1, 1]) {
        const corner = at(base, [nDir, s2 * h])
        const tDir = scale(nDir, s2)
        // Schenkel am durchlaufenden Holz nicht über dessen Kante hinaus; zu wenig Platz: Winkel weglassen
        // an schrägen Hölzern (Leiterwange) entlang beider Blechkanten messen
        const room = Math.min(...[-1, 1].map((k) => rayIn(Tm, at(corner, [into, -2], [wDir, (k * wd) / 2]), tDir)))
        const legT = Math.min(90, room - 2)
        if (legT < 35) continue
        plate(at(corner, [into, 45], [tDir, 1.25]), into, tDir, wDir, 90, wd, 'nachher')
        out[out.length - 1].item = 'winkel-90'
        plate(at(corner, [tDir, legT / 2], [into, 1.25]), tDir, into, wDir, legT, wd, 'nachher')
        plateScrews(at(corner, [into, 45], [tDir, 1.25]), into, wDir, tDir, wd, 'nachher', group, chord(E, nDir))
        // am Eckpfosten mit Winkeln aus zwei Richtungen: Schrauben der einen Richtung 8 mm versetzt (das
        // Lochbild hat dafür Spiel), damit sie sich im Pfosten nicht treffen
        plateScrews(at(corner, [tDir, legT / 2], [into, 1.25]), tDir, wDir, into, wd, 'nachher', group, Math.min(chord(Tm, into), width2(range(Tm, into))), legT, crossing(j, E, Tm, byId, r, SCREWED) < 0 ? 8 * (wDir.z < 0 ? -1 : 1) : 0)
        group++
      }
    } else {
      // Balkenschuh: Boden unter dem Trägerende, zwei Seiten, zwei Laschen am Hauptträger.
      // Er wird zuerst an den Hauptträger geschraubt, dann der Träger eingelegt.
      const down = neg(axesE[2])
      const sideAx = axesE[1]
      const hb = E.b / 2
      const hh = E.h / 2
      plate(at(base, [down, hh + 1.25], [into, 45]), into, down, sideAx, 90, E.b + 5, 'vorher')
      out[out.length - 1].item = 'balkenschuh-60'
      for (const k of [-1, 1]) {
        const sdir = scale(sideAx, k)
        plate(at(base, [sdir, hb + 1.25], [into, 45], [down, hh * 0.15]), into, sdir, axesE[2], 90, E.h * 0.85, 'vorher')
        plate(at(base, [sdir, hb + 22], [into, -1.25], [down, hh * 0.15]), sdir, into, axesE[2], 40, E.h * 0.85, 'vorher')
        // Lasche: 3 Schrauben in den Hauptträger (vorher), Seite: 3 Schrauben in den Querträger (nachher)
        for (const z of [-0.3, 0, 0.3]) {
          out.push({ joint: j.key, kind: 'schraube', head: at(base, [sdir, hb + 22], [into, 0.2], [down, hh * 0.15 + z * E.h * 0.85]), dir: neg(into), length: 50, d: 5, when: 'vorher', item: 'schraube-5x50' })
          out.push({ joint: j.key, kind: 'schraube', head: at(base, [sdir, hb + 2.6], [into, 45 + (z > 0 ? 20 : z < 0 ? -20 : 0)], [down, hh * 0.15 + z * E.h * 0.6]), dir: neg(sdir), length: 50, d: 5, when: 'nachher', item: 'schraube-5x50' })
        }
      }
    }
    return out
  }

  // Holzschrauben, Holznägel, Dübel, Gewindestangen
  const F = jointFrame(j, A, B)
  if (!F) return out
  const { E, T: Tm, out: o, into, across, side } = F
  const eA = range(E, across)
  const eS = range(E, side)
  const tA = range(Tm, across)
  const overlap = (a: [number, number], b: [number, number]): [number, number] => [Math.max(a[0], b[0]), Math.min(a[1], b[1])]
  const mid = (r2: [number, number]) => (r2[0] + r2[1]) / 2
  const pt = (oo: number, a: number, sd: number): Vec3 => at(v(0, 0, 0), [o, oo], [across, a], [side, sd])
  const type = j.typeId
  const be = j.kind === 'strebe' ? braceEnd(F) : undefined
  if (be && (type === 'kopfband' || type === 'holzbauschraube' || type === 'versatz' || type === 'holzduebel')) {
    // Kopfband: Schrauben vom Rand des Kopfbands waagrecht bzw. senkrecht in Pfosten/Zarge,
    // Dübel quer durch die Stoßfläche
    const { shape, n, face, A: PA, B: PB } = be
    const n2: [number, number] = [-dot(n, shape.eu), -dot(n, shape.ev)]
    const world = (q: [number, number]): Vec3 => at(shape.origin, [shape.eu, q[0]], [shape.ev, q[1]])
    const exit = (p0: [number, number]): [number, number] => {
      let best = Infinity
      const poly = shape.poly
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]
        const b = poly[(i + 1) % poly.length]
        const ex = b[0] - a[0]
        const ey = b[1] - a[1]
        const den = n2[0] * ey - n2[1] * ex
        if (Math.abs(den) < 1e-9) continue
        const tt = ((a[0] - p0[0]) * ey - (a[1] - p0[1]) * ex) / den
        const u = ((a[0] - p0[0]) * n2[1] - (a[1] - p0[1]) * n2[0]) / den
        if (tt > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, tt)
      }
      return Number.isFinite(best) ? [p0[0] + n2[0] * best, p0[1] + n2[1] * best] : p0
    }
    const fr = type === 'kopfband' ? [1 / 3, 2 / 3] : [0.5]
    for (const f of type === 'holzduebel' ? [] : fr) {
      const p0: [number, number] = [PA[0] + (PB[0] - PA[0]) * f, PA[1] + (PB[1] - PA[1]) * f]
      const head = world(exit(p0))
      const toFace = face - dot(head, n)
      // 6 × 100, wenn sie noch 54 mm (9·d) in Pfosten bzw. Zarge greift, sonst Tellerkopf 8 mm
      if (type === 'kopfband' && toFace + 54 <= 100) screw(head, n, 100, 3, 'nachher', 'schraube-6x100', 4)
      else {
        const sz = screw8(toFace)
        screw(head, n, sz.length, 4, 'nachher', sz.item, 6)
      }
      out[out.length - 1].first = toFace
    }
    if (type === 'holzduebel')
      for (const f of [0.3, 0.7]) {
        const c = world([PA[0] + (PB[0] - PA[0]) * f, PA[1] + (PB[1] - PA[1]) * f])
        push({ kind: 'duebel', head: at(c, [n, -19]), dir: n, length: 40, d: 10, when: 'mit', item: 'holzduebel-10', drill: 10 }) // i18n-ok
      }
    return out
  }
  if (type === 'holzbauschraube' || type === 'auflage' || type === 'kopfband' || type === 'ausklinkung' || type === 'gratnut') {
    if (E.round || Tm.round) return out
    const oS = overlap(eS, range(Tm, side))
    const oA = overlap(eA, tA)
    /** Schraube durch first mm Holz: Länge so, dass sie tief genug im tragenden Holz sitzt; Ø 6 nur im ersten Holz vorbohren */
    const thin = Math.min(E.b, E.h, Tm.b, Tm.h)
    /** Schraube durch first mm Holz in das tragende Holz (bearing mm dick in Schraubrichtung); vorbohren mit 0,7·d */
    const put8 = (head: Vec3, dir: Vec3, first: number, bearing: number) => {
      if (type === 'gratnut') return screw(head, dir, 50, 2.5, 'nachher', 'schraube-5x50', 3)
      const sz = pickScrew(first, bearing, thin)
      screw(head, dir, sz.length, sz.d / 2, 'nachher', sz.item, Math.round(sz.d * 0.7))
      out[out.length - 1].first = first
    }
    // stumpfer Stoß nur, wenn die Hölzer wirklich quer zueinander stehen (nicht fast parallel wie Leitergriff und Holm)
    if (F.pE && type !== 'kopfband' && F.depth <= 3 * Math.max(Tm.b, Tm.h)) {
      // durch T ins Hirnholz von E: Kopf auf der Außenseite von T; im Hirnholz hält das Gewinde schlechter
      const far = F.face + F.depth
      // übereinander entlang der breiten Seite von E (Randabstand 4·d, untereinander 5·d)
      const alongS = eS[1] - eS[0] >= eA[1] - eA[0]
      const wide = alongS ? eS : eA
      // Platz für drei Schrauben (2 × 4·d Rand + 2 × 5·d Abstand bei d = 8), sonst zwei
      const span = wide[1] - wide[0] - 64
      const m = type === 'holzbauschraube' && span >= 80 ? 3 : 2
      // zweiter Stoß quer dazu am selben Holz (Handläufe am Eckpfosten): um 6 mm gegeneinander versetzen
      const cr = crossing(j, E, Tm, byId, r, SCREWED) * ((alongS ? side : across).z < 0 ? -1 : 1)
      for (let i = 0; i < m; i++) {
        const q = (span >= 40 ? wide[0] + 32 + (span * i) / (m - 1) : wide[0] + (wide[1] - wide[0]) * (0.3 + (0.4 * i) / (m - 1))) + cr * 6
        put8(alongS ? pt(far, mid(eA), q) : pt(far, q, mid(eS)), into, F.depth, memberLength(E))
      }
    } else if (oS[1] - oS[0] > 10 && oA[1] - oA[0] > 10 && width2(range(E, o)) <= 1.5 * Math.max(E.b, E.h)) {
      // aufliegend bzw. angelegt: durch E in T, Kopf auf E
      const er = range(E, o)
      const longS = oS[1] - oS[0] >= oA[1] - oA[0]
      for (const k of [-0.25, 0.25]) {
        const sd = longS ? mid(oS) + (oS[1] - oS[0]) * k : mid(oS)
        const ac = longS ? mid(oA) : mid(oA) + (oA[1] - oA[0]) * k
        put8(pt(er[0], ac, sd), o, er[1] - er[0], width2(range(Tm, o)))
      }
    } else if (oS[1] - oS[0] > 10 && oA[1] - oA[0] > 10 && width2(range(Tm, o)) <= 1.5 * Math.max(Tm.b, Tm.h)) {
      // umgekehrt aufliegend (Handlauf auf dem Pfostenkopf): durch T von oben in das Ende von E
      const tr = range(Tm, o)
      put8(pt(tr[0], mid(oA), mid(oS)), o, tr[1] - tr[0], width2(range(E, o)))
    } else {
      // Kopfband u. Ä.: quer durch die Überdeckung; berühren sich die Hölzer nur an einer Kante, nichts
      const o0 = overlap(range(E, o), range(Tm, o))
      if (o0[1] - o0[0] < 10 || oS[1] - oS[0] < 10) return out
      for (const k of [-0.2, 0.2]) put8(pt(mid(o0), eA[1], mid(eS) + (eS[1] - eS[0]) * k), neg(across), eA[1] - eA[0], width2(tA))
    }
  } else if (type === 'ueberblattung') {
    // zwei Schrauben quer durch das Blatt, diagonal versetzt
    const c = jointCuts(j, byId)
    const subA = c?.members.get(A.id)?.sub[0]
    if (!subA) return out
    const axesA = memberAxes(A)
    const cr = norm(cross(axesA[0], memberAxes(B)[0]))
    const e2 = norm(cross(cr, axesA[0]))
    const lapC = at(A.start, [axesA[0], (subA[0][0] + subA[0][1]) / 2], [axesA[1], (subA[1][0] + subA[1][1]) / 2], [axesA[2], (subA[2][0] + subA[2][1]) / 2])
    const ext = (d: Vec3) => [0, 1, 2].reduce((sum, k) => sum + Math.abs(dot(axesA[k], d)) * (subA[k][1] - subA[k][0]), 0)
    const top = Math.max(range(A, cr)[1], range(B, cr)[1])
    // so lang wie möglich, ohne unten auszutreten
    const bottom = Math.min(range(A, cr)[0], range(B, cr)[0])
    const thick = top - bottom
    const sz = thick - 8 >= 100 ? { L: 100, r: 3, item: 'schraube-6x100' } : thick - 8 >= 80 ? { L: 80, r: 3, item: 'schraube-6x80' } : { L: 50, r: 2.5, item: 'schraube-5x50' }
    for (const k of [-0.22, 0.22]) {
      const p0 = at(lapC, [axesA[0], ext(axesA[0]) * k], [e2, -ext(e2) * k])
      screw(at(p0, [cr, top - dot(p0, cr)]), neg(cr), sz.L, sz.r, 'nachher', sz.item, 4)
    }
  } else if (type === 'zapfen' && F.pE) {
    // Holznagel quer durch Zapfenloch und Zapfen, Stirnseiten sichtbar
    const L = F.depth < 50 ? F.depth : F.depth * 0.75
    const oo = F.face + L * 0.5
    // zwei Buchendübel Ø 10 × 40, von beiden Seiten durch Zapfenloch und Zapfen geschlagen
    const a = pt(oo, tA[0] - 1.5, mid(eS))
    const b = pt(oo, tA[1] + 1.5, mid(eS))
    const dab = norm(sub(b, a))
    const pinL = Math.min(40, len(sub(b, a)) / 2)
    push({ kind: 'holznagel', head: a, dir: dab, length: pinL, d: 10, when: 'nachher', item: 'holzduebel-10', drill: 10 })
    push({ kind: 'holznagel', head: b, dir: neg(dab), length: pinL, d: 10, when: 'nachher', item: 'holzduebel-10', drill: 10 })
  } else if (type === 'schwalbenschwanz' && F.pE) {
    const dd = F.depth * 0.6
    // zwei Holznägel durch das Blatt, Stirnseite außen sichtbar
    const lr = lapRange(eA, tA)
    const outer = Math.abs(lr[0] - mid(eA)) > Math.abs(lr[1] - mid(eA)) ? lr[0] - 1.5 : lr[1] + 1.5
    for (const k of [-0.18, 0.18]) {
      const a = pt(F.face + dd * 0.5, outer, mid(eS) + (eS[1] - eS[0]) * k)
      const b = pt(F.face + dd * 0.5, mid(eA) + (mid(eA) - outer) * 0.3, mid(eS) + (eS[1] - eS[0]) * k)
      push({ kind: 'holznagel', head: a, dir: norm(sub(b, a)), length: len(sub(b, a)), d: 10, when: 'nachher', item: 'holzduebel-10', drill: 10 })
    }
  } else if (type === 'holzduebel' && F.pE) {
    // zwei Dübel entlang der breiten Seite von E
    const alongS = eS[1] - eS[0] >= eA[1] - eA[0]
    for (const k of [-0.25, 0.25]) {
      const head = alongS ? pt(F.face - 19, mid(eA), mid(eS) + (eS[1] - eS[0]) * k) : pt(F.face - 19, mid(eA) + (eA[1] - eA[0]) * k, mid(eS))
      push({ kind: 'duebel', head, dir: o, length: 40, d: 10, when: 'mit', item: 'holzduebel-10', drill: 10 }) // i18n-ok
    }
  } else if (type === 'auflagerleiste') {
    // Die Leiste wird zuerst an das durchlaufende Holz geschraubt, dann der Träger aufgelegt
    const c = jointCuts(j, byId)
    const lst = c?.extras[0]
    if (!lst) return out
    // 6 × 100: 40 mm Leiste, 60 mm im tragenden Holz (mindestens 9·d = 54 mm)
    for (const k of [-0.35, 0, 0.35]) screw(at(lst.center, [lst.axes[0], -lst.half[0]], [lst.axes[1], lst.half[1] * 2 * k]), lst.axes[0], 100, 3, 'vorher', 'schraube-6x100', 4)
  } else if (type === 'gewindestange') {
    // Mutter und Scheibe auf beiden Seiten des Holzes, das die Stange hält
    const rodM = E.catalogId.startsWith('gewindestange') ? E : Tm.catalogId.startsWith('gewindestange') ? Tm : undefined
    const wood = rodM === E ? Tm : E
    if (!rodM) return out
    const ra = memberAxes(rodM)[0]
    const [w0, w1] = range(wood, ra)
    const base = at(j.pos, [ra, -dot(j.pos, ra)])
    for (const [t, d] of [
      [w0, -1],
      [w1, 1],
    ] as const)
      push({ kind: 'stangenmutter', head: at(base, [ra, t]), dir: scale(ra, -d), length: 8, d: 10, when: 'nachher' })
  }
  return out
}

/** Alle Befestigungsmittel (opts.only: nur diese Verbindung) */
export function allFasteners(r: Resolved, only?: string): Fastener[] {
  const byId = new Map(r.members.map((m) => [m.id, m]))
  const joints = only ? r.joints.filter((j) => j.key === only) : r.joints
  return joints.flatMap((j) => jointFasteners(j, byId, r))
}

/** Kleinster Abstand zweier Strecken p0–p1 und q0–q1 */
function segDist(p0: Vec3, p1: Vec3, q0: Vec3, q1: Vec3): number {
  const d1 = sub(p1, p0)
  const d2 = sub(q1, q0)
  const r = sub(p0, q0)
  const a = dot(d1, d1)
  const e = dot(d2, d2)
  const f = dot(d2, r)
  const clamp = (x: number) => Math.max(0, Math.min(1, x))
  let s0 = 0
  let t0 = 0
  if (a > 1e-9 && e > 1e-9) {
    const b = dot(d1, d2)
    const c = dot(d1, r)
    const den = a * e - b * b
    s0 = den > 1e-9 ? clamp((b * f - c * e) / den) : 0
    t0 = (b * s0 + f) / e
    if (t0 < 0) {
      t0 = 0
      s0 = clamp(-c / a)
    } else if (t0 > 1) {
      t0 = 1
      s0 = clamp((b - c) / a)
    }
  }
  return len(sub(add(p0, scale(d1, s0)), add(q0, scale(d2, t0))))
}

const DRILLED = new Set(['bolzen', 'bettschraube', 'schraube', 'holznagel', 'duebel'])

/** Bohrungen bzw. Schrauben zweier Verbindungen, die sich im Holz treffen (zweite Richtung am Eckpfosten) */
export function fastenerClashes(r: Resolved): { joints: [string, string]; members: string[] }[] {
  const fs = allFasteners(r).filter((f) => DRILLED.has(f.kind))
  const jointOf = new Map(r.joints.map((j) => [j.key, j]))
  const out: { joints: [string, string]; members: string[] }[] = []
  const seen = new Set<string>()
  const tip = (f: Fastener) => add(f.head, scale(f.dir, f.length))
  for (let i = 0; i < fs.length; i++)
    for (let k = i + 1; k < fs.length; k++) {
      const a = fs[i]
      const b = fs[k]
      if (a.joint === b.joint) continue
      const pair = [a.joint, b.joint].sort().join('#')
      if (seen.has(pair)) continue
      if (segDist(a.head, tip(a), b.head, tip(b)) >= (a.d + b.d) / 2 + 1) continue
      seen.add(pair)
      const ja = jointOf.get(a.joint)
      const jb = jointOf.get(b.joint)
      const common = ja && jb ? [ja.a, ja.b].filter((id) => id === jb.a || id === jb.b) : []
      out.push({ joints: [a.joint, b.joint], members: common })
    }
  return out
}
