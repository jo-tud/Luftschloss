import { add, cross, dot, len, memberAxes, memberBoxes, memberLength, norm, scale, sub, v, type OBB } from './geometry'
import type { DetectedJoint } from './resolve'
import type { Member, MemberShape, Vec3 } from './types'

/**
 * Zimmermannsmäßige Verbindungen als Geometrie: was an einem Stab angesetzt (Zapfen, Blatt) und
 * was ausgenommen wird (Zapfenloch, Blattsitz, Nut). Rein rechnerisch, damit 3D-Ansicht,
 * Verbindungsdetail und Tests dasselbe zeigen.
 *
 * Lokale Koordinaten eines Stabs: u entlang der Achse ab start, v entlang b, w entlang h.
 */

export type Range = [number, number]
/** Quader in lokalen Stabkoordinaten (u, v, w) */
export type LocalBox = [Range, Range, Range]

/** Gerades Prisma in Weltkoordinaten: Vieleck in (eu, ev), extrudiert entlang en */
export type Prism = MemberShape

export interface MemberCut {
  add: LocalBox[]
  sub: LocalBox[]
  prisms: Prism[]
}

export interface JointCuts {
  /** je Stab-ID */
  members: Map<string, MemberCut>
  /** zusätzliche Hölzer, z. B. Auflagerleiste (Weltquader) */
  extras: OBB[]
  /** Bohrungen, die als dunkle Scheibe auf der Fläche erscheinen (Rundstab in Bohrung) */
  holes: { at: Vec3; normal: Vec3; r: number }[]
  /** Maße für die Werkstattskizze (mm) */
  dims: Record<string, number>
}

/** Verbindungen, die das Holz selbst verändern */
export const CARPENTRY = new Set(['ueberblattung', 'zapfen', 'schwalbenschwanz', 'gratnut', 'ausklinkung', 'stecken', 'auflagerleiste', 'versatz'])

const EPS = 0.5

/** Ausdehnung eines Stabs (mit Ausklinkungen) entlang einer Weltrichtung */
export function rangeAlong(m: Member, d: Vec3): Range {
  let lo = Infinity
  let hi = -Infinity
  for (const o of memberBoxes(m)) {
    const c = dot(o.center, d)
    const e = o.axes.reduce((s, a, i) => s + Math.abs(dot(a, d)) * o.half[i], 0)
    lo = Math.min(lo, c - e)
    hi = Math.max(hi, c + e)
  }
  return [lo, hi]
}

/** Weltquader aus Bereichen entlang dreier (orthonormaler) Richtungen */
export function frameBox(e: [Vec3, Vec3, Vec3], r: [Range, Range, Range]): OBB {
  const center = e.reduce((c, a, i) => add(c, scale(a, (r[i][0] + r[i][1]) / 2)), v(0, 0, 0))
  return { center, axes: e, half: [(r[0][1] - r[0][0]) / 2, (r[1][1] - r[1][0]) / 2, (r[2][1] - r[2][0]) / 2] }
}

/** Weltquader in lokale Stabkoordinaten (exakt, wenn die Achsen parallel liegen) */
export function toLocal(m: Member, o: OBB): LocalBox {
  const axes = memberAxes(m)
  const rel = sub(o.center, m.start)
  return axes.map((a) => {
    const c = dot(rel, a)
    const e = o.axes.reduce((s, b, i) => s + Math.abs(dot(a, b)) * o.half[i], 0)
    return [c - e, c + e] as Range
  }) as LocalBox
}

const inter = (a: Range, b: Range): Range => [Math.max(a[0], b[0]), Math.min(a[1], b[1])]
const width = (r: Range) => r[1] - r[0]

/** Bezugssystem eines Stoßes: anschließender Stab E endet an bzw. in T */
export interface JointFrame {
  E: Member
  T: Member
  /** Ende von E am Knoten (auf der Achse) */
  pE?: Vec3
  /** Richtung aus dem Knoten in E hinein bzw. bei Stößen ohne Ende von E nach T */
  into: Vec3
  /** zeigt von E nach T */
  out: Vec3
  /** Lage der E zugewandten Fläche von T entlang out */
  face: number
  /** Dicke von T entlang out */
  depth: number
  /** senkrecht zu beiden Achsen */
  across: Vec3
  /** in der Ebene beider Stäbe, quer zu out */
  side: Vec3
}

function endAt(m: Member, p: Vec3): { pt: Vec3; into: Vec3 } {
  const [ax] = memberAxes(m)
  const ds = len(sub(m.start, p))
  const de = len(sub(m.end, p))
  return ds <= de ? { pt: m.start, into: ax } : { pt: m.end, into: scale(ax, -1) }
}

export function jointFrame(j: DetectedJoint, A: Member, B: Member): JointFrame | undefined {
  const [aA] = memberAxes(A)
  const [aB] = memberAxes(B)
  const c = cross(aA, aB)
  const parallel = len(c) < 0.3
  let E = A
  let T = B
  let pE: Vec3 | undefined
  let into: Vec3
  if (j.ending || j.kind === 'ecke' || j.kind === 'strebe') {
    // Endstab: angegeben, sonst der, dessen Ende weiter in den anderen hineinreichen müsste
    const reach = (X: Member, Y: Member) => {
      const { pt, into: d } = endAt(X, j.pos)
      const o = scale(d, -1)
      return rangeAlong(Y, o)[1] - dot(pt, o)
    }
    if (j.ending) E = j.ending === A.id ? A : B
    else if (j.kind === 'strebe' && (A.role === 'strebe') !== (B.role === 'strebe')) E = A.role === 'strebe' ? A : B
    else E = reach(A, B) >= reach(B, A) ? A : B
    T = E === A ? B : A
    const e = endAt(E, j.pos)
    pE = e.pt
    into = e.into
  } else {
    // ohne Ende (Auflage, Beischlag, Kreuzung): kleinerer Querschnitt liegt an
    if (A.b * A.h > B.b * B.h) {
      E = B
      T = A
    }
    const n = parallel ? norm(sub(memberBoxes(T)[0].center, memberBoxes(E)[0].center)) : norm(c)
    const towards = dot(sub(memberBoxes(T)[0].center, memberBoxes(E)[0].center), n) >= 0 ? n : scale(n, -1)
    into = scale(towards, -1)
  }
  const out = scale(into, -1)
  const [aE] = memberAxes(E)
  const [aT] = memberAxes(T)
  let across = norm(cross(aE, aT))
  if (len(across) < 0.5) across = memberAxes(E)[1]
  if (Math.abs(dot(across, out)) > 0.9) across = Math.abs(dot(memberAxes(E)[1], out)) < 0.9 ? memberAxes(E)[1] : memberAxes(E)[2]
  const side = norm(cross(out, across))
  const tr = rangeAlong(T, out)
  const face = pE ? dot(pE, out) : tr[0]
  return { E, T, pE, into, out, face, depth: tr[1] - face, across, side }
}

/**
 * Richtung, in der E beim Zerlegen von T weggezogen wird (beim Fügen umgekehrt). Formschlüssige
 * Verbindungen lassen sich nur in eine Richtung lösen: ein Blatt wird von oben eingelegt, ein
 * Schwalbenschwanz von der offenen Seite eingesetzt, eine Gratnut der Länge nach eingeschoben,
 * ein Träger in Balkenschuh oder auf Auflagerleiste von oben eingelegt.
 */
export function assemblyDir(j: DetectedJoint, F: JointFrame): Vec3 {
  const { E, T, across } = F
  const eA = rangeAlong(E, across)
  const tA = rangeAlong(T, across)
  // E liegt bündig auf der Seite low (kleineres across) bzw. high
  const low = Math.abs(eA[0] - tA[0]) <= Math.abs(eA[1] - tA[1])
  const up = v(0, 0, 1)
  switch (j.typeId) {
    case 'ueberblattung': {
      // Gleiche Wahl wie in jointCuts: A behält bei bündig unten die untere Hälfte, B liegt darauf
      const A = j.a === E.id ? E : T
      const B = A === E ? T : E
      const cr = norm(cross(memberAxes(A)[0], memberAxes(B)[0]))
      if (len(cr) < 0.5) return F.into
      const aR = rangeAlong(A, cr)
      const bR = rangeAlong(B, cr)
      const lo = Math.abs(aR[0] - bR[0]) <= Math.abs(aR[1] - bR[1])
      const bUp = lo ? cr : scale(cr, -1)
      return E === B ? bUp : scale(bUp, -1)
    }
    case 'schwalbenschwanz':
      return low ? scale(across, -1) : across
    case 'gratnut':
      // Die Nut läuft quer durch T: lieber nach oben herausziehen
      return dot(across, up) < -1e-6 ? scale(across, -1) : across
    case 'balkenschuh':
    case 'auflagerleiste':
      return up
  }
  return F.into
}

function cutOf(map: Map<string, MemberCut>, m: Member): MemberCut {
  let c = map.get(m.id)
  if (!c) {
    c = { add: [], sub: [], prisms: [] }
    map.set(m.id, c)
  }
  return c
}

/** Verlängerung eines Stabs über sein Ende hinaus (lokal) */
function extension(m: Member, atStart: boolean, d: number, vr?: Range, wr?: Range): LocalBox {
  const L = memberLength(m)
  return [atStart ? [-d, 0] : [L, L + d], vr ?? [-m.b / 2, m.b / 2], wr ?? [-m.h / 2, m.h / 2]]
}

export function jointCuts(j: DetectedJoint, byId: Map<string, Member>): JointCuts | undefined {
  if (!CARPENTRY.has(j.typeId)) return undefined
  const A = byId.get(j.a)
  const B = byId.get(j.b)
  if (!A || !B) return undefined
  const F = jointFrame(j, A, B)
  if (!F) return undefined
  const out: JointCuts = { members: new Map(), extras: [], holes: [], dims: {} }
  const { E, T, across, side } = F
  const eAcross = rangeAlong(E, across)
  const eSide = rangeAlong(E, side)
  const tAcross = rangeAlong(T, across)
  const tSide = rangeAlong(T, side)
  const frame: [Vec3, Vec3, Vec3] = [F.out, across, side]

  switch (j.typeId) {
    case 'ueberblattung': {
      // Jedes Holz mit Ende am Knoten wird über das andere hinaus verlängert, dann nehmen beide
      // je die halbe Dicke (quer zur Ebene) heraus.
      const ext = new Map<string, OBB>()
      for (const [X, Y] of [
        [A, B],
        [B, A],
      ] as const) {
        const L = memberLength(X)
        const { pt, into } = endAt(X, j.pos)
        const nearEnd = len(sub(pt, j.pos)) < Math.max(X.b, X.h, Y.b, Y.h)
        const o = scale(into, -1)
        const d = nearEnd ? rangeAlong(Y, o)[1] - dot(pt, o) : 0
        const axes = memberAxes(X)
        const atStart = pt === X.start
        const [u0, u1] = d > EPS ? (atStart ? [-d, L] : [0, L + d]) : [0, L]
        if (d > EPS) cutOf(out.members, X).add.push(extension(X, atStart, d))
        ext.set(X.id, { center: add(X.start, scale(axes[0], (u0 + u1) / 2)), axes, half: [(u1 - u0) / 2, X.b / 2, X.h / 2] })
      }
      const [aA] = memberAxes(A)
      const cr = norm(cross(aA, memberAxes(B)[0]))
      if (len(cr) < 0.5) return undefined
      const e2 = norm(cross(cr, aA))
      const fr: [Vec3, Vec3, Vec3] = [aA, e2, cr]
      const rng = (o: OBB, d: Vec3): Range => {
        const c = dot(o.center, d)
        const e = o.axes.reduce((s, a, i) => s + Math.abs(dot(a, d)) * o.half[i], 0)
        return [c - e, c + e]
      }
      const oA = ext.get(A.id)!
      const oB = ext.get(B.id)!
      const R = fr.map((d) => inter(rng(oA, d), rng(oB, d))) as [Range, Range, Range]
      if (R.some((r) => width(r) < 1)) return undefined
      // Blatt auf der Seite, auf der beide Hölzer bündig sind; jedes Holz bis zu seiner eigenen
      // Oberfläche ausnehmen, damit der Sitz offen ist
      const mid = (R[2][0] + R[2][1]) / 2
      const aR = rng(oA, cr)
      const bR = rng(oB, cr)
      const lo = Math.abs(aR[0] - bR[0]) <= Math.abs(aR[1] - bR[1])
      out.dims.blatt = Math.round(lo ? mid - aR[0] : aR[1] - mid)
      cutOf(out.members, A).sub.push(toLocal(A, frameBox(fr, [R[0], R[1], lo ? [mid, aR[1]] : [aR[0], mid]])))
      cutOf(out.members, B).sub.push(toLocal(B, frameBox(fr, [R[0], R[1], lo ? [bR[0], mid] : [mid, bR[1]]])))
      return out
    }
    case 'zapfen': {
      if (!F.pE || F.depth < 10) return undefined
      // Zapfen: 1/3 der Dicke quer zur Ebene, oben und unten Brüstung, 3/4 der Pfostendicke lang
      const t = Math.max(16, width(eAcross) / 3)
      const cA = (eAcross[0] + eAcross[1]) / 2
      const shoulder = Math.max(10, width(eSide) * 0.15)
      const sr: Range = [eSide[0] + shoulder, eSide[1] - shoulder]
      const L = F.depth < 50 ? F.depth : F.depth * 0.75
      const box = frameBox(frame, [[F.face, F.face + L], [cA - t / 2, cA + t / 2], sr])
      out.dims = { dicke: Math.round(t), hoehe: Math.round(width(sr)), laenge: Math.round(L), durch: L >= F.depth ? 1 : 0 }
      const e = toLocal(E, box)
      cutOf(out.members, E).add.push(e)
      cutOf(out.members, T).sub.push(toLocal(T, box))
      return out
    }
    case 'schwalbenschwanz':
    case 'gratnut': {
      if (!F.pE || F.depth < 10) return undefined
      const grat = j.typeId === 'gratnut'
      // Schwalbenschwanzblatt: halbe Dicke, 0,6 × Holzdicke tief. Gratnut: volle Breite, 1/3 tief.
      const dd = grat ? Math.min(20, Math.max(8, F.depth / 3)) : F.depth * 0.6
      const ar: Range = grat ? inter(eAcross, [tAcross[0] - 1, tAcross[1] + 1]) : lapRange(eAcross, tAcross)
      const sMid = (eSide[0] + eSide[1]) / 2
      const halfE = width(eSide) / 2
      const narrow = grat ? halfE - 3 : halfE * 0.55
      const wide = narrow + dd / 6
      dovetail(out, F, dd, ar, sMid, narrow, wide)
      out.dims = { tiefe: Math.round(dd), dicke: Math.round(width(ar)), schmal: Math.round(2 * narrow), breit: Math.round(2 * wide) }
      return out
    }
    case 'ausklinkung': {
      // Einlassung: T wird 15 mm tief (höchstens 1/4) über die Anlagefläche ausgenommen, E sitzt darin
      const dd = Math.min(15, Math.max(5, F.depth / 4))
      const ar = inter(eAcross, tAcross)
      const sr = inter(eSide, tSide)
      if (width(ar) < 1 || width(sr) < 1) return undefined
      const box = frameBox(frame, [[F.face, F.face + dd], ar, sr])
      out.dims.tiefe = Math.round(dd)
      cutOf(out.members, E).add.push(toLocal(E, box))
      cutOf(out.members, T).sub.push(toLocal(T, box))
      return out
    }
    case 'stecken': {
      if (!F.pE) return undefined
      const dd = (F.depth * 2) / 3
      out.dims = { tiefe: Math.round(dd), durchmesser: Math.round(Math.min(E.b, E.h)) }
      const { pt } = endAt(E, j.pos)
      cutOf(out.members, E).add.push(extension(E, pt === E.start, dd))
      out.holes.push({ at: add(F.pE, scale(F.out, -0.2)), normal: F.into, r: Math.min(E.b, E.h) / 2 + 0.5 })
      if (!E.round) cutOf(out.members, T).sub.push(toLocal(T, frameBox(frame, [[F.face, F.face + dd], eAcross, eSide])))
      return out
    }
    case 'versatz': {
      // Kopfbandende 15 mm tief in T eingelassen: Ende verlängert, Sitz in T ausgenommen,
      // die Zwickel neben dem schrägen Ende wieder aufgefüllt
      const be = braceEnd(F)
      if (!be) return undefined
      const dd = Math.min(15, Math.max(6, F.depth / 4))
      const { shape, n, s: sd, face, A, B } = be
      const k = dd / Math.max(0.2, dot(F.out, n))
      const d2: [number, number] = [dot(F.out, shape.eu) * k, dot(F.out, shape.ev) * k]
      const A2: [number, number] = [A[0] + d2[0], A[1] + d2[1]]
      const B2: [number, number] = [B[0] + d2[0], B[1] + d2[1]]
      const world = (q: [number, number]) => add(add(shape.origin, scale(shape.eu, q[0])), scale(shape.ev, q[1]))
      const sOf = (q: [number, number]) => dot(world(q), sd)
      const [P, Q, P2, Q2] = sOf(A) <= sOf(B) ? [A, B, A2, B2] : [B, A, B2, A2]
      out.members.set(E.id, { add: [], sub: [], prisms: [{ ...shape, poly: [P, Q, Q2, P2] }] })
      const enC = dot(shape.origin, shape.en)
      const sMin = Math.min(sOf(P), sOf(P2))
      const sMax = Math.max(sOf(Q), sOf(Q2))
      const box = frameBox([n, sd, shape.en], [[face, face + dd], [sMin, sMax], [enC + shape.range[0], enC + shape.range[1]]])
      const toUV = (nv: number, sv: number): [number, number] => {
        const w = add(add(scale(n, nv), scale(sd, sv)), scale(shape.en, enC))
        const rel = sub(w, shape.origin)
        return [dot(rel, shape.eu), dot(rel, shape.ev)]
      }
      const fill: [number, number][][] = []
      if (sOf(P2) < sOf(P) - 0.5) fill.push([P, toUV(face, sOf(P2)), P2])
      else if (sOf(P2) > sOf(P) + 0.5) fill.push([P, P2, toUV(face + dd, sOf(P))])
      if (sOf(Q2) > sOf(Q) + 0.5) fill.push([Q, Q2, toUV(face, sOf(Q2))])
      else if (sOf(Q2) < sOf(Q) - 0.5) fill.push([Q, toUV(face + dd, sOf(Q)), Q2])
      out.members.set(T.id, { add: [], sub: [toLocal(T, box)], prisms: fill.map((poly) => ({ ...shape, poly })) })
      out.dims = { tiefe: Math.round(dd) }
      return out
    }
    case 'auflagerleiste': {
      if (!F.pE) return undefined
      // Leiste 40 × 60 unter dem Ende von E an der Fläche von T, 4 cm über E hinaus
      const down = v(0, 0, -1)
      const along = norm(cross(F.out, down))
      if (len(along) < 0.5) return undefined
      const eDown = rangeAlong(E, down)
      const eAlong = rangeAlong(E, along)
      const tAlong = rangeAlong(T, along)
      // nicht über das tragende Holz hinaus
      const lr = inter([eAlong[0] - 40, eAlong[1] + 40], tAlong)
      out.extras.push(frameBox([F.out, along, down], [[F.face - 40, F.face], lr, [eDown[1], eDown[1] + 60]]))
      return out
    }
  }
  return undefined
}

/** Halbe Dicke für ein Blatt: auf der Seite, auf der beide Hölzer bündig sind, bis zur Oberfläche von T */
export function lapRange(eAcross: Range, tAcross: Range): Range {
  const m = (eAcross[0] + eAcross[1]) / 2
  return Math.abs(eAcross[0] - tAcross[0]) <= Math.abs(eAcross[1] - tAcross[1]) ? [Math.min(eAcross[0], tAcross[0]), m] : [m, Math.max(eAcross[1], tAcross[1])]
}

/** Schwalbenschwanz-Prisma an E, Sitz in T (Quader heraus, Keile wieder hinein) */
function dovetail(out: JointCuts, F: JointFrame, dd: number, ar: Range, sMid: number, narrow: number, wide: number) {
  const { E, T, across, side } = F
  // Punkt = out·(face + a) + side·(sMid + b) + across·n (orthonormal), n absolut wie ar
  const o = add(scale(F.out, F.face), scale(side, sMid))
  const poly: [number, number][] = [
    [0, -narrow],
    [dd, -wide],
    [dd, wide],
    [0, narrow],
  ]
  cutOf(out.members, E).prisms.push({ origin: o, eu: F.out, ev: side, en: across, poly, range: ar })
  const box = frameBox([F.out, across, side], [[F.face, F.face + dd], ar, [sMid - wide, sMid + wide]])
  cutOf(out.members, T).sub.push(toLocal(T, box))
  for (const k of [-1, 1])
    cutOf(out.members, T).prisms.push({
      origin: o,
      eu: F.out,
      ev: side,
      en: across,
      poly:
        k < 0
          ? [
              [0, -wide],
              [dd, -wide],
              [0, -narrow],
            ]
          : [
              [0, narrow],
              [dd, wide],
              [0, wide],
            ],
      range: ar,
    })
}

/** Alle Verbindungsgeometrien des Projekts, je Stab zusammengefasst */
export function allCuts(joints: DetectedJoint[], members: Member[]): { members: Map<string, MemberCut>; extras: OBB[]; holes: JointCuts['holes'] } {
  const byId = new Map(members.map((m) => [m.id, m]))
  const res = { members: new Map<string, MemberCut>(), extras: [] as OBB[], holes: [] as JointCuts['holes'] }
  for (const j of joints) {
    const c = jointCuts(j, byId)
    if (!c) continue
    for (const [id, mc] of c.members) {
      const t = cutOf(res.members, byId.get(id)!)
      t.add.push(...mc.add)
      t.sub.push(...mc.sub)
      t.prisms.push(...mc.prisms)
    }
    res.extras.push(...c.extras)
    res.holes.push(...c.holes)
  }
  return res
}

/**
 * Stab mit Verbindungen als Quader (Weltachsen = Stabachsen): Grundkörper samt Ausklinkungen und
 * Ansätzen, minus Ausnehmungen. Zerlegung über ein Raster der Schnittebenen, dann zusammenfassen.
 */
export function cutMemberBoxes(m: Member, c: MemberCut | undefined): OBB[] {
  if (!c || (c.add.length === 0 && c.sub.length === 0)) return memberBoxes(m)
  const axes = memberAxes(m)
  const base: LocalBox[] = memberBoxes(m).map((o) => toLocal(m, o))
  const solids = [...base, ...c.add]
  const subs = c.sub
  const coords = [0, 1, 2].map((k) => {
    const s = new Set<number>()
    for (const b of [...solids, ...subs]) {
      s.add(Math.round(b[k][0] * 100) / 100)
      s.add(Math.round(b[k][1] * 100) / 100)
    }
    return [...s].sort((a, b) => a - b)
  })
  const inside = (b: LocalBox, p: [number, number, number]) => p.every((x, k) => x > b[k][0] && x < b[k][1])
  const nu = coords[0].length - 1
  const nv = coords[1].length - 1
  const nw = coords[2].length - 1
  const filled: boolean[] = new Array(nu * nv * nw).fill(false)
  const idx = (i: number, jj: number, k: number) => (i * nv + jj) * nw + k
  for (let i = 0; i < nu; i++)
    for (let jj = 0; jj < nv; jj++)
      for (let k = 0; k < nw; k++) {
        const p: [number, number, number] = [(coords[0][i] + coords[0][i + 1]) / 2, (coords[1][jj] + coords[1][jj + 1]) / 2, (coords[2][k] + coords[2][k + 1]) / 2]
        filled[idx(i, jj, k)] = solids.some((b) => inside(b, p)) && !subs.some((b) => inside(b, p))
      }
  // zusammenfassen: immer den größten Quader zuerst (alle Wachstumsreihenfolgen probieren), damit
  // möglichst wenige Teilquader und damit wenige Fugen entstehen
  const n3 = [nu, nv, nw]
  const used: boolean[] = new Array(filled.length).fill(false)
  const free = (c: number[]) => filled[idx(c[0], c[1], c[2])] && !used[idx(c[0], c[1], c[2])]
  const cellVol = (lo: number[], hi: number[]) => [0, 1, 2].reduce((p, k) => p * (coords[k][hi[k] + 1] - coords[k][lo[k]]), 1)
  const ORDERS = [
    [2, 1, 0],
    [2, 0, 1],
    [1, 2, 0],
    [1, 0, 2],
    [0, 2, 1],
    [0, 1, 2],
  ]
  const grow = (start: number[], order: number[]) => {
    const lo = [...start]
    const hi = [...start]
    for (const ax of order) {
      for (;;) {
        if (hi[ax] + 1 >= n3[ax]) break
        // ganze neue Schicht frei?
        let ok = true
        const c = [0, 0, 0]
        for (c[0] = lo[0]; c[0] <= (ax === 0 ? hi[0] + 1 : hi[0]) && ok; c[0]++)
          for (c[1] = lo[1]; c[1] <= (ax === 1 ? hi[1] + 1 : hi[1]) && ok; c[1]++)
            for (c[2] = lo[2]; c[2] <= (ax === 2 ? hi[2] + 1 : hi[2]) && ok; c[2]++) if (c[ax] === hi[ax] + 1 && !free(c)) ok = false
        if (!ok) break
        hi[ax]++
      }
    }
    return { lo, hi }
  }
  const boxes: OBB[] = []
  for (;;) {
    let best: { lo: number[]; hi: number[]; v: number } | undefined
    for (let i = 0; i < nu; i++)
      for (let jj = 0; jj < nv; jj++)
        for (let k = 0; k < nw; k++) {
          if (!free([i, jj, k])) continue
          // nur Startzellen in der „unteren Ecke“ eines freien Bereichs
          if ((i > 0 && free([i - 1, jj, k])) || (jj > 0 && free([i, jj - 1, k])) || (k > 0 && free([i, jj, k - 1]))) continue
          for (const o of ORDERS) {
            const g = grow([i, jj, k], o)
            const vol = cellVol(g.lo, g.hi)
            if (!best || vol > best.v) best = { ...g, v: vol }
          }
        }
    if (!best) {
      // Restzellen ohne „untere Ecke“ (selten): einzeln übernehmen
      let any = false
      for (let i = 0; i < nu && !any; i++)
        for (let jj = 0; jj < nv && !any; jj++)
          for (let k = 0; k < nw && !any; k++) if (free([i, jj, k])) (best = { lo: [i, jj, k], hi: [i, jj, k], v: 0 }), (any = true)
      if (!best) break
    }
    const { lo, hi } = best
    for (let i = lo[0]; i <= hi[0]; i++) for (let jj = lo[1]; jj <= hi[1]; jj++) for (let k = lo[2]; k <= hi[2]; k++) used[idx(i, jj, k)] = true
    const r: LocalBox = [
      [coords[0][lo[0]], coords[0][hi[0] + 1]],
      [coords[1][lo[1]], coords[1][hi[1] + 1]],
      [coords[2][lo[2]], coords[2][hi[2] + 1]],
    ]
    const center = r.reduce((cc, rr, n) => add(cc, scale(axes[n], (rr[0] + rr[1]) / 2)), m.start)
    boxes.push({ center, axes, half: [width(r[0]) / 2, width(r[1]) / 2, width(r[2]) / 2] })
  }
  return boxes
}

/** Ecken eines Prismas in Weltkoordinaten (Boden, dann Deckel) */
export function prismCorners(p: Prism): { bottom: Vec3[]; top: Vec3[] } {
  const at = (q: [number, number], n: number) => add(add(add(p.origin, scale(p.eu, q[0])), scale(p.ev, q[1])), scale(p.en, n))
  return { bottom: p.poly.map((q) => at(q, p.range[0])), top: p.poly.map((q) => at(q, p.range[1])) }
}

/** Blickrichtung (vom Knoten zum Betrachter) für Detail und Skizze: schräg von oben, von der Seite von E */
export function jointViewDir(F: JointFrame | undefined): Vec3 {
  const flat = (q: Vec3) => {
    const l = Math.hypot(q.x, q.y)
    return l > 0.3 ? v(q.x / l, q.y / l, 0) : undefined
  }
  const base = (F && (flat(F.into) ?? flat(memberAxes(F.T)[0]) ?? flat(memberAxes(F.E)[0]))) ?? v(0.7, -0.7, 0)
  return norm(add(add(scale(base, 0.8), scale(v(-base.y, base.x, 0), 0.6)), v(0, 0, 0.55)))
}

/** Quader eines Stabs auf ±range um einen Punkt entlang der Stabachse beschneiden */
export function clipBoxesNear(boxes: OBB[], center: Vec3, range: number): OBB[] {
  const out: OBB[] = []
  for (const o of boxes) {
    const ax = o.axes[0]
    const t = dot(o.center, ax)
    const tc = dot(center, ax)
    const a = Math.max(t - o.half[0], tc - range)
    const b = Math.min(t + o.half[0], tc + range)
    if (b - a < 0.5) continue
    out.push({ ...o, center: add(o.center, scale(ax, (a + b) / 2 - t)), half: [(b - a) / 2, o.half[1], o.half[2]] })
  }
  return out
}

/**
 * Zuschnittlängen: Zapfen, Blätter und Schwalbenschwänze verlängern das Holz über den Knoten hinaus.
 */
export function cutLengths(joints: DetectedJoint[], members: Member[]): Map<string, number> {
  const cuts = allCuts(joints, members)
  const out = new Map<string, number>()
  for (const m of members) {
    const L = memberLength(m)
    const mc = cuts.members.get(m.id)
    if (!mc && !m.shape) {
      out.set(m.id, L)
      continue
    }
    const [ax] = memberAxes(m)
    // Kopfband mit Gehrung: zuschneiden von Spitze zu Spitze, nicht nach der Achslänge
    let lo = m.shape ? Infinity : 0
    let hi = m.shape ? -Infinity : L
    for (const b of mc?.add ?? []) {
      lo = Math.min(lo, b[0][0])
      hi = Math.max(hi, b[0][1])
    }
    for (const p of [...(m.shape ? [m.shape] : []), ...(mc?.prisms ?? [])]) {
      const { bottom, top } = prismCorners(p)
      for (const q of [...bottom, ...top]) {
        const u = dot(sub(q, m.start), ax)
        lo = Math.min(lo, u)
        hi = Math.max(hi, u)
      }
    }
    out.set(m.id, hi - lo)
  }
  return out
}

/** Darstellungskörper eines Stabs: Quader (mit Verbindungen) und Prismen; eigene Form (Kopfband) zuerst */
export function memberSolids(m: Member, mc: MemberCut | undefined): { boxes: OBB[]; prisms: Prism[] } {
  if (m.shape) return { boxes: [], prisms: [m.shape, ...(mc?.prisms ?? [])] }
  return { boxes: mc ? cutMemberBoxes(m, mc) : memberBoxes(m), prisms: mc?.prisms ?? [] }
}

/**
 * Ende eines Kopfbands (Stab mit eigener Form) an T: Flächennormale n von T (zeigt in T hinein),
 * Lage der Fläche, Richtung s entlang der Fläche in der Kopfbandebene und die beiden Ecken A, B des
 * Umrisses, die auf der Fläche liegen (in Koordinaten der Form).
 */
export function braceEnd(F: JointFrame): { shape: MemberShape; n: Vec3; s: Vec3; face: number; A: [number, number]; B: [number, number] } | undefined {
  const shape = F.E.shape
  if (!shape) return undefined
  const axesT = memberAxes(F.T)
  const cand = [axesT[1], axesT[2]].map((a) => (dot(a, F.out) >= 0 ? a : scale(a, -1)))
  const n = dot(cand[0], F.out) >= dot(cand[1], F.out) ? cand[0] : cand[1]
  const face = rangeAlong(F.T, n)[0]
  const s = norm(cross(n, shape.en))
  const world = (q: [number, number]) => add(add(shape.origin, scale(shape.eu, q[0])), scale(shape.ev, q[1]))
  const on = shape.poly.filter((q) => Math.abs(dot(world(q), n) - face) < 1.5)
  if (on.length < 2) return undefined
  return { shape, n, s, face, A: on[0], B: on[1] }
}
