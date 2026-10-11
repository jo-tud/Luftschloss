import { add, cross, dot, len, memberAxes, memberBoxes, norm, scale, sub, v } from './geometry'
import { braceEnd, jointCuts, jointFrame, lapRange } from './joinery'
import type { DetectedJoint, Resolved } from './resolve'
import type { Member, Vec3 } from './types'

/**
 * Befestigungsmittel einer Verbindung als Modell (mm, z oben): Lage, Einbaurichtung und wann sie
 * beim Bauen dazukommen. 3D-Ansicht (Beschläge), Verbindungsdetail (Animation), Arbeitsschritte
 * und Werkstattzeichnung lesen alle diese eine Liste.
 */

export type FastenerKind =
  /** Schlossschraube M10 (Kopf, Scheibe, Mutter bzw. Quermutter) */
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
  /** Stumpfer Stoß: Quermutter in einer Tasche; at liegt auf der Bolzenachse, dir zeigt zur Tasche */
  crossNut?: { at: Vec3; dir: Vec3; outer: number; inner: number }
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

function bedCentre(r: Resolved, m: Member): Vec3 | undefined {
  const bed = m.assemblyId ? r.beds.get(m.assemblyId) : undefined
  if (!bed) return undefined
  return v(bed.footprint.reduce((s, q) => s + q.x, 0) / bed.footprint.length, bed.footprint.reduce((s, q) => s + q.y, 0) / bed.footprint.length, 0)
}

const BOLTS = new Set(['schlossschraube', 'bettschraube'])

/** Befestigungsmittel einer Verbindung */
export function jointFasteners(j: DetectedJoint, byId: Map<string, Member>, r: Resolved): Fastener[] {
  const out: Fastener[] = []
  const A = byId.get(j.a)
  const B = byId.get(j.b)
  if (!A || !B) return out
  const push = (f: Omit<Fastener, 'joint'>) => out.push({ joint: j.key, ...f })
  const screw = (head: Vec3, dir: Vec3, length: number, radius: number, when: FastenerWhen = 'nachher', item?: string, drill?: number) =>
    push({ kind: 'schraube', head, dir, length, d: radius * 2, when, item, drill })
  /** Schrauben 5 × 50 in den Löchern eines Blechs (Mitte c, Schenkelrichtung l, Breite w, Normale nach außen n) */
  const plateScrews = (c: Vec3, l: Vec3, w: Vec3, n: Vec3, W: number, when: FastenerWhen, g?: number) => {
    for (const [a, b] of [
      [-18, -0.25],
      [-18, 0.25],
      [8, 0],
      [30, -0.25],
      [30, 0.25],
    ] as const)
      out.push({ joint: j.key, kind: 'schraube', head: at(c, [l, a], [w, b * W], [n, 1.3]), dir: neg(n), length: 50, d: 5, when, item: 'schraube-5x50', group: g })
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
      // zwei Bolzen entlang der längeren Überdeckung, mit Randabstand
      const long1 = o1[1] - o1[0] >= o2[1] - o2[0]
      const e = long1 ? e1 : e2
      const span = long1 ? o1[1] - o1[0] : o2[1] - o2[0]
      const spread = Math.min(span * 0.25, 60)
      const b = boltM10(tHead - tNut)
      for (const k of [-1, 1]) {
        const base = at(mid, [e, spread * k])
        push({ kind, head: at(base, [dOut, tHead]), dir: neg(dOut), length: tHead - tNut, d: 2 * rad, when: 'nachher', nut: true, item: b.item, drill: 11 })
      }
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
    // Bolzen gegeneinander versetzt, damit sich zwei Stöße am selben Pfosten nicht kreuzen
    const hDir = axesE[2]
    const shift = Math.abs(aE.x) >= Math.abs(aE.y) ? 0.1 : -0.1
    const bc = bedCentre(r, E)
    const sd = bc && dot(v(bc.x - pE.x, bc.y - pE.y, 0), axesE[1]) < 0 ? -1 : 1
    const sideDir = scale(axesE[1], sd)
    const item = j.typeId === 'bettschraube' ? 'bettschraube-m8' : boltM10(tHead + nutDepth).item
    for (const k of [-0.25, 0.25]) {
      const base = at(pE, [hDir, (k + shift) * E.h])
      push({
        kind,
        head: at(base, [o, tHead]),
        dir: into,
        length: tHead + nutDepth + 10,
        d: 2 * rad,
        when: 'nachher',
        crossNut: { at: at(base, [into, nutDepth]), dir: sideDir, outer: E.b / 2, inner: E.b * 0.1 },
        item,
        drill: j.typeId === 'bettschraube' ? 9 : 11,
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
      const aE = memberAxes(E)[0]
      // aufliegend: senkrechter Schenkel an der Seite von E, waagerechter auf T, beiderseits
      const sdir = norm(cross(F.out, aE))
      const [s0, s1] = range(E, sdir)
      const tTop = range(F.T, F.into)[1]
      const onT = range(F.T, aE)
      const c = (onT[0] + onT[1]) / 2
      const wd = Math.min(65, onT[1] - onT[0] - 4)
      for (const [edge, k] of [
        [s1, 1],
        [s0, -1],
      ] as const) {
        const o = scale(sdir, k)
        const corner = at(v(0, 0, 0), [aE, c], [sdir, edge], [F.into, tTop])
        const p0 = at(corner, [aE, -dot(corner, aE) + c])
        plate(at(p0, [F.into, 45], [o, 1.25]), F.into, o, aE, 90, wd, 'nachher')
        out[out.length - 1].item = 'winkel-90'
        plate(at(p0, [o, 45], [F.into, 1.25]), o, F.into, aE, 90, wd, 'nachher')
        plateScrews(at(p0, [F.into, 45], [o, 1.25]), F.into, aE, o, wd, 'nachher', group)
        plateScrews(at(p0, [o, 45], [F.into, 1.25]), o, aE, F.into, wd, 'nachher', group)
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
      // Schenkel 90 mm, Breite 65 mm bzw. Holzbreite
      const h = extent(E, aT)
      const wd = Math.min(65, 2 * extent(E, ax) - 4)
      for (const s2 of [-1, 1]) {
        const corner = at(base, [aT, s2 * h])
        const tDir = scale(aT, s2)
        plate(at(corner, [into, 45], [tDir, 1.25]), into, tDir, ax, 90, wd, 'nachher')
        out[out.length - 1].item = 'winkel-90'
        plate(at(corner, [tDir, 45], [into, 1.25]), tDir, into, ax, 90, wd, 'nachher')
        plateScrews(at(corner, [into, 45], [tDir, 1.25]), into, ax, tDir, wd, 'nachher', group)
        plateScrews(at(corner, [tDir, 45], [into, 1.25]), tDir, ax, into, wd, 'nachher', group)
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
    const n = type === 'holzbauschraube' && F.pE ? 3 : 2
    const oS = overlap(eS, range(Tm, side))
    const oA = overlap(eA, tA)
    /** Schraube durch first mm Holz: Länge so, dass sie tief genug im tragenden Holz sitzt; Ø 6 nur im ersten Holz vorbohren */
    const put8 = (head: Vec3, dir: Vec3, first: number, grip?: number) => {
      if (type === 'gratnut') return screw(head, dir, 50, 2.5, 'nachher', 'schraube-5x50', 3)
      const sz = screw8(first, grip)
      screw(head, dir, sz.length, 4, 'nachher', sz.item, 6)
      out[out.length - 1].first = first
    }
    // stumpfer Stoß nur, wenn die Hölzer wirklich quer zueinander stehen (nicht fast parallel wie Leitergriff und Holm)
    if (F.pE && type !== 'kopfband' && F.depth <= 3 * Math.max(Tm.b, Tm.h)) {
      // durch T ins Hirnholz von E: Kopf auf der Außenseite von T; im Hirnholz hält das Gewinde schlechter
      const far = F.face + F.depth
      for (let i = 0; i < n; i++) {
        const f = 0.25 + (0.5 * i) / (n - 1)
        put8(pt(far, mid(eA), eS[0] + (eS[1] - eS[0]) * f), into, F.depth, 90)
      }
    } else if (oS[1] - oS[0] > 10 && oA[1] - oA[0] > 10 && width2(range(E, o)) <= 1.5 * Math.max(E.b, E.h)) {
      // aufliegend bzw. angelegt: durch E in T, Kopf auf E
      const er = range(E, o)
      const longS = oS[1] - oS[0] >= oA[1] - oA[0]
      for (const k of [-0.25, 0.25]) {
        const sd = longS ? mid(oS) + (oS[1] - oS[0]) * k : mid(oS)
        const ac = longS ? mid(oA) : mid(oA) + (oA[1] - oA[0]) * k
        put8(pt(er[0], ac, sd), o, er[1] - er[0])
      }
    } else {
      // Kopfband u. Ä.: quer durch die Überdeckung
      const o0 = overlap(range(E, o), range(Tm, o))
      for (const k of [-0.2, 0.2]) put8(pt(mid(o0), eA[1], mid(eS) + (eS[1] - eS[0]) * k), neg(across), eA[1] - eA[0])
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
    for (const k of [-0.25, 0.25]) push({ kind: 'duebel', head: pt(F.face - 19, mid(eA), mid(eS) + (eS[1] - eS[0]) * k), dir: o, length: 40, d: 10, when: 'mit', item: 'holzduebel-10', drill: 10 }) // i18n-ok
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
