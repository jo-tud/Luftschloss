import * as THREE from 'three'
import { memberAxes, memberBoxes } from '../model/geometry'
import { braceEnd, jointCuts, jointFrame, lapRange } from '../model/joinery'
import type { Resolved } from '../model/resolve'
import type { Member } from '../model/types'
import { T } from './camera'

/**
 * Beschläge als Instanz-Matrizen (Meter, three-Koordinaten): Schloss- und Bettschrauben (Kopf,
 * Scheibe, Mutter bzw. Quermutter in Tasche), Bleche für Winkel und Balkenschuhe, Köpfe von
 * Holzschrauben, Holznägel, Dübel und Muttern an Gewindestangen. Reine Rechnung, damit testbar.
 */
export const BOLT_TYPES = new Set(['schlossschraube', 'bettschraube'])

export interface HardwareLists {
  heads: THREE.Matrix4[]
  washers: THREE.Matrix4[]
  nuts: THREE.Matrix4[]
  plates: THREE.Matrix4[]
  pockets: THREE.Matrix4[]
  /** Köpfe von Holzschrauben (flache Scheiben) */
  screws: THREE.Matrix4[]
  /** Holznägel und Holzdübel, deren Stirnseite sichtbar ist */
  pins: THREE.Matrix4[]
  /** verdeckte Holzdübel im Stoß (nur im Verbindungsdetail sichtbar) */
  dowels: THREE.Matrix4[]
  /** Schäfte von Bolzen und Schrauben (nur im Verbindungsdetail) */
  rods: THREE.Matrix4[]
}

/**
 * opts.only: nur diese Verbindung (Verbindungsdetail). opts.rods: auch Schäfte, die im Holz stecken.
 */
export function hardwareInstances(r: Resolved, opts: { only?: string; rods?: boolean } = {}): HardwareLists {
  const byId = new Map(r.members.map((m) => [m.id, m]))
  const joints = opts.only ? r.joints.filter((j) => j.key === opts.only) : r.joints
  const rods: THREE.Matrix4[] = []
  /** Schaft von a nach b, Radius in mm */
  const rod = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, radius: number, list = rods) => {
    if (list === rods && !opts.rods) return
    const pa = T(a.x, a.y, a.z)
    const pb = T(b.x, b.y, b.z)
    const d = pb.clone().sub(pa)
    const L = d.length()
    if (L < 1e-6) return
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
    list.push(new THREE.Matrix4().compose(pa.clone().lerp(pb, 0.5), q, new THREE.Vector3(radius / 1000, L, radius / 1000)))
  }
  const heads: THREE.Matrix4[] = []
  const washers: THREE.Matrix4[] = []
  const nuts: THREE.Matrix4[] = []
  const up = new THREE.Vector3(0, 1, 0)
  const put = (list: THREE.Matrix4[], at: { x: number; y: number; z: number }, dir: THREE.Vector3, scale: [number, number, number]) => {
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir)
    list.push(new THREE.Matrix4().compose(T(at.x, at.y, at.z), q, new THREE.Vector3(...scale)))
  }
  const pockets: THREE.Matrix4[] = []
  type V = { x: number; y: number; z: number }
  const dotv = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z
  const crossv = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
  const normv = (a: V): V => {
    const l = Math.hypot(a.x, a.y, a.z) || 1
    return { x: a.x / l, y: a.y / l, z: a.z / l }
  }
  const addv = (base: V, ...terms: [V, number][]): V => terms.reduce((q, [d, k]) => ({ x: q.x + d.x * k, y: q.y + d.y * k, z: q.z + d.z * k }), base)
  /** Ausdehnung eines Stabs entlang einer Richtung */
  const range = (m: Member, e: V): [number, number] => {
    let lo = Infinity
    let hi = -Infinity
    for (const o of memberBoxes(m)) {
      const c = dotv(o.center, e)
      const r2 = o.axes.reduce((s2, a, i) => s2 + Math.abs(dotv(a, e)) * o.half[i], 0)
      lo = Math.min(lo, c - r2)
      hi = Math.max(hi, c + r2)
    }
    return [lo, hi]
  }
  const bedCentre = (m: Member): V | undefined => {
    const bed = m.assemblyId ? r.beds.get(m.assemblyId) : undefined
    if (!bed) return undefined
    return { x: bed.footprint.reduce((s2, q) => s2 + q.x, 0) / bed.footprint.length, y: bed.footprint.reduce((s2, q) => s2 + q.y, 0) / bed.footprint.length, z: 0 }
  }
  const toThree = (d: V) => new THREE.Vector3(d.x, d.z, -d.y)
  for (const j of joints) {
    if (!BOLT_TYPES.has(j.typeId)) continue
    const A = byId.get(j.a)
    const B = byId.get(j.b)
    if (!A || !B || A.round || B.round) continue
    const aA = memberAxes(A)[0]
    const aB = memberAxes(B)[0]
    const c0 = crossv(aA, aB)
    if (Math.hypot(c0.x, c0.y, c0.z) < 0.3) continue
    const ax = normv(c0)
    // Wo liegen beide Hölzer übereinander (quer zur Bolzenachse gesehen)? Nur dort kann durchgebolzt werden.
    const e1 = aA
    const e2 = normv(crossv(ax, aA))
    const ov = (e: V) => {
      const [a0, a1] = range(A, e)
      const [b0, b1] = range(B, e)
      return [Math.max(a0, b0), Math.min(a1, b1)] as [number, number]
    }
    const o1 = ov(e1)
    const o2 = ov(e2)
    const bolt = (base: V, dir: V, tHead: number, tNut: number) => {
      // dir zeigt vom Knoten zum Kopf
      const at = (t: number) => addv(base, [dir, t])
      const outDir = toThree(dir)
      const inDir = outDir.clone().negate()
      put(heads, at(tHead), outDir, [0.0125, 0.006, 0.0125])
      if (!Number.isNaN(tNut)) {
        put(washers, at(tNut - 1), inDir, [0.0105, 0.002, 0.0105])
        put(nuts, at(tNut - 6), inDir, [0.0095, 0.008, 0.0095])
        rod(at(tHead), at(tNut - 12), j.typeId === 'bettschraube' ? 4 : 5)
      }
    }
    if (o1[1] - o1[0] > 25 && o2[1] - o2[0] > 25 && j.typeId === 'schlossschraube') {
      // Durchgebolzt: Hölzer liegen aneinander (Beischlag, Kreuzung, überlappende Ecke)
      const [lo, hi] = (() => {
        const [a0, a1] = range(A, ax)
        const [b0, b1] = range(B, ax)
        return [Math.min(a0, b0), Math.max(a1, b1)]
      })()
      const p0 = dotv(j.pos, ax)
      const mid = addv({ x: 0, y: 0, z: 0 }, [e1, (o1[0] + o1[1]) / 2], [e2, (o2[0] + o2[1]) / 2], [ax, p0])
      // Kopf nach außen, weg von der Bettmitte
      const bc = bedCentre(A)
      const sign = bc && dotv({ x: bc.x - j.pos.x, y: bc.y - j.pos.y, z: 0 }, ax) > 0 ? -1 : 1
      const dir = { x: ax.x * sign, y: ax.y * sign, z: ax.z * sign }
      const tHead = sign > 0 ? hi - p0 : p0 - lo
      const tNut = -(sign > 0 ? p0 - lo : hi - p0)
      // zwei Bolzen entlang der längeren Überdeckung, mit Randabstand
      const long1 = o1[1] - o1[0] >= o2[1] - o2[0]
      const e = long1 ? e1 : e2
      const span = long1 ? o1[1] - o1[0] : o2[1] - o2[0]
      const spread = Math.min(span * 0.25, 60)
      for (const k of [-1, 1]) bolt(addv(mid, [e, spread * k]), dir, tHead, tNut)
      continue
    }
    if (!j.ending) continue
    // Stumpfer Stoß: Bolzen durch das durchlaufende Holz ins Hirnholz des anschließenden,
    // Mutter in einer Querbohrung (Tasche) auf der Innenseite – Prinzip der Bettschraube
    const E = byId.get(j.ending)
    const Tm = E === A ? B : A
    if (!E) continue
    const axesE = memberAxes(E)
    const aE = axesE[0]
    const dS = Math.hypot(E.start.x - j.pos.x, E.start.y - j.pos.y, E.start.z - j.pos.z)
    const dEnd = Math.hypot(E.end.x - j.pos.x, E.end.y - j.pos.y, E.end.z - j.pos.z)
    const pE = dS < dEnd ? E.start : E.end
    const into = dS < dEnd ? aE : { x: -aE.x, y: -aE.y, z: -aE.z }
    const out = { x: -into.x, y: -into.y, z: -into.z }
    const [t0, t1] = range(Tm, out)
    const tHead = t1 - dotv(pE, out)
    if (tHead < 5 || t0 - dotv(pE, out) > 5) continue
    const nutDepth = 70
    // Bolzen gegeneinander versetzt, damit sich zwei Stöße am selben Pfosten nicht kreuzen
    const hDir = axesE[2]
    const shift = Math.abs(aE.x) >= Math.abs(aE.y) ? 0.1 : -0.1
    const bc = bedCentre(E)
    const side = bc && dotv({ x: bc.x - pE.x, y: bc.y - pE.y, z: 0 }, axesE[1]) < 0 ? -1 : 1
    const sideDir = { x: axesE[1].x * side, y: axesE[1].y * side, z: axesE[1].z * side }
    for (const k of [-0.25, 0.25]) {
      const base = addv(pE, [hDir, (k + shift) * E.h])
      bolt(base, out, tHead, NaN)
      rod(addv(base, [out, tHead]), addv(base, [into, nutDepth + 10]), j.typeId === 'bettschraube' ? 4 : 5)
      // Quermutter in der Tasche
      rod(addv(base, [into, nutDepth], [sideDir, E.b / 2]), addv(base, [into, nutDepth], [sideDir, -E.b * 0.1]), 6.5)
      // sichtbare Tasche mit Mutter auf der Innenseite
      const pocket = addv(base, [into, nutDepth], [sideDir, E.b / 2 + 0.3])
      put(pockets, pocket, toThree(sideDir), [0.011, 0.001, 0.011])
      put(washers, addv(pocket, [sideDir, 0.4]), toThree(sideDir), [0.0065, 0.0008, 0.0065])
    }
  }
  // Winkel und Balkenschuhe: verzinkte Bleche (2,5 mm) am Ende des anschließenden Stabs
  const plates: THREE.Matrix4[] = []
  const plate = (c: { x: number; y: number; z: number }, len: { x: number; y: number; z: number }, thick: { x: number; y: number; z: number }, wide: { x: number; y: number; z: number }, L: number, Wd: number) => {
    const a0 = new THREE.Vector3(len.x, len.z, -len.y)
    const a1 = new THREE.Vector3(thick.x, thick.z, -thick.y)
    const a2 = new THREE.Vector3(wide.x, wide.z, -wide.y)
    if (new THREE.Vector3().crossVectors(a0, a1).dot(a2) < 0) a2.negate()
    const m = new THREE.Matrix4().makeBasis(a0, a1, a2)
    m.scale(new THREE.Vector3(L / 1000, 0.0025, Wd / 1000))
    m.setPosition(T(c.x, c.y, c.z))
    plates.push(m)
  }
  const extent = (m: { b: number; h: number }, axes: [ReturnType<typeof memberAxes>[0], ReturnType<typeof memberAxes>[0], ReturnType<typeof memberAxes>[0]], d: { x: number; y: number; z: number }) =>
    Math.abs(axes[1].x * d.x + axes[1].y * d.y + axes[1].z * d.z) * (m.b / 2) + Math.abs(axes[2].x * d.x + axes[2].y * d.y + axes[2].z * d.z) * (m.h / 2)
  for (const j of joints) {
    if (j.typeId !== 'winkel' && j.typeId !== 'balkenschuh') continue
    if (j.typeId === 'winkel' && (j.kind === 'auflage' || j.kind === 'beischlag')) {
      const A = byId.get(j.a)
      const B = byId.get(j.b)
      const F = A && B ? jointFrame(j, A, B) : undefined
      if (!F || F.E.round || F.T.round) continue
      const E = F.E
      const Tm = F.T
      const aE = memberAxes(E)[0]
      // aufliegend: senkrechter Schenkel an der Seite von E, waagerechter auf T, beiderseits
      const sd = normv(crossv(F.out, aE))
      const [s0, s1] = range(E, sd)
      const tTop = range(Tm, F.into)[1]
      const onT = range(Tm, aE)
      const c = (onT[0] + onT[1]) / 2
      const wd = Math.min(65, onT[1] - onT[0] - 4)
      for (const [edge, k] of [
        [s1, 1],
        [s0, -1],
      ] as const) {
        const o = { x: sd.x * k, y: sd.y * k, z: sd.z * k }
        const corner = addv({ x: 0, y: 0, z: 0 }, [aE, c], [sd, edge], [F.into, tTop])
        const p0 = addv(corner, [aE, -dotv(corner, aE) + c])
        plate(addv(p0, [F.into, 45], [o, 1.25]), F.into, o, aE, 90, wd)
        plate(addv(p0, [o, 45], [F.into, 1.25]), o, F.into, aE, 90, wd)
      }
      continue
    }
    if (!j.ending) continue
    const E = byId.get(j.ending)
    const Tm = byId.get(j.ending === j.a ? j.b : j.a)
    if (!E || !Tm || E.round || Tm.round) continue
    const axesE = memberAxes(E)
    const aE = axesE[0]
    const aT = memberAxes(Tm)[0]
    let ax = { x: aE.y * aT.z - aE.z * aT.y, y: aE.z * aT.x - aE.x * aT.z, z: aE.x * aT.y - aE.y * aT.x }
    const n = Math.hypot(ax.x, ax.y, ax.z)
    if (n < 0.3) continue
    ax = { x: ax.x / n, y: ax.y / n, z: ax.z / n }
    // Stabende am Knoten und Richtung in den Stab hinein
    const dS = Math.hypot(E.start.x - j.pos.x, E.start.y - j.pos.y, E.start.z - j.pos.z)
    const dEnd = Math.hypot(E.end.x - j.pos.x, E.end.y - j.pos.y, E.end.z - j.pos.z)
    const pE = dS < dEnd ? E.start : E.end
    const into = dS < dEnd ? aE : { x: -aE.x, y: -aE.y, z: -aE.z }
    const at = (base: { x: number; y: number; z: number }, ...terms: [{ x: number; y: number; z: number }, number][]) =>
      terms.reduce((q, [dv, k]) => ({ x: q.x + dv.x * k, y: q.y + dv.y * k, z: q.z + dv.z * k }), base)
    // Lage quer zur Achse wie der Knoten
    const axOff = (j.pos.x - pE.x) * ax.x + (j.pos.y - pE.y) * ax.y + (j.pos.z - pE.z) * ax.z
    const base = at(pE, [ax, axOff])
    if (j.typeId === 'winkel') {
      // zwei Winkel in den Innenecken beiderseits des Stabs (am Pfosten: unter und über der Zarge),
      // Schenkel 90 mm, Breite 65 mm bzw. Holzbreite
      const h = extent(E, axesE, aT)
      const wd = Math.min(65, 2 * extent(E, axesE, ax) - 4)
      for (const s2 of [-1, 1]) {
        const corner = at(base, [aT, s2 * h])
        const tDir = { x: aT.x * s2, y: aT.y * s2, z: aT.z * s2 }
        plate(at(corner, [into, 45], [tDir, 1.25]), into, tDir, ax, 90, wd)
        plate(at(corner, [tDir, 45], [into, 1.25]), tDir, into, ax, 90, wd)
      }
    } else {
      // Balkenschuh: Boden unter dem Trägerende, zwei Seiten, zwei Laschen am Hauptträger
      const down = { x: -axesE[2].x, y: -axesE[2].y, z: -axesE[2].z }
      const side = axesE[1]
      const hb = E.b / 2
      const hh = E.h / 2
      const bottom = at(base, [down, hh + 1.25], [into, 45])
      plate(bottom, into, down, side, 90, E.b + 5)
      for (const k of [-1, 1]) {
        const sd = { x: side.x * k, y: side.y * k, z: side.z * k }
        plate(at(base, [sd, hb + 1.25], [into, 45], [down, hh * 0.15]), into, sd, axesE[2], 90, E.h * 0.85)
        plate(at(base, [sd, hb + 22], [into, -1.25], [down, hh * 0.15]), sd, into, axesE[2], 40, E.h * 0.85)
      }
    }
  }
  // Holzschrauben, Holznägel, Dübel, Gewindestangen
  const screws: THREE.Matrix4[] = []
  const pins: THREE.Matrix4[] = []
  const dowels: THREE.Matrix4[] = []
  const screw = (head: V, dir: V, L: number, r = 4) => {
    put(screws, head, toThree({ x: -dir.x, y: -dir.y, z: -dir.z }), [r * 1.9 / 1000, 0.0015, r * 1.9 / 1000])
    rod(head, addv(head, [dir, L]), r * 0.75)
  }
  for (const j of joints) {
    const A = byId.get(j.a)
    const B = byId.get(j.b)
    if (!A || !B) continue
    const F = jointFrame(j, A, B)
    if (!F) continue
    const { E, T: Tm, out, into, across, side } = F
    const eA = range(E, across)
    const eS = range(E, side)
    const tA = range(Tm, across)
    const overlap = (a: [number, number], b: [number, number]): [number, number] => [Math.max(a[0], b[0]), Math.min(a[1], b[1])]
    const mid = (r2: [number, number]) => (r2[0] + r2[1]) / 2
    const pt = (o: number, a: number, sd: number): V => addv({ x: 0, y: 0, z: 0 }, [out, o], [across, a], [side, sd])
    const type = j.typeId
    const be = j.kind === 'strebe' ? braceEnd(F) : undefined
    if (be && (type === 'kopfband' || type === 'holzbauschraube' || type === 'versatz' || type === 'holzduebel')) {
      // Kopfband: Schrauben vom Rand des Kopfbands waagrecht bzw. senkrecht in Pfosten/Zarge,
      // Dübel quer durch die Stoßfläche
      const { shape, n, face, A, B } = be
      const n2: [number, number] = [-dotv(n, shape.eu), -dotv(n, shape.ev)]
      const world = (q: [number, number]): V => addv(shape.origin, [shape.eu, q[0]], [shape.ev, q[1]])
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
        const p0: [number, number] = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]
        const head = world(exit(p0))
        const toFace = face - dotv(head, n)
        screw(head, n, toFace + Math.min(90, F.depth * 0.8), type === 'kopfband' ? 3 : 4)
      }
      if (type === 'holzduebel')
        for (const f of [0.3, 0.7]) {
          const c = world([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f])
          rod(addv(c, [n, -35]), addv(c, [n, 35]), 5, dowels)
        }
      continue
    }
    if (type === 'holzbauschraube' || type === 'auflage' || type === 'kopfband' || type === 'ausklinkung' || type === 'gratnut') {
      if (E.round || Tm.round) continue
      const n = type === 'holzbauschraube' && F.pE ? 3 : 2
      const L = type === 'gratnut' ? 50 : 160
      const r0 = type === 'gratnut' ? 2.5 : 4
      const oS = overlap(eS, range(Tm, side))
      const oA = overlap(eA, tA)
      if (F.pE && type !== 'kopfband') {
        // durch T ins Hirnholz von E: Kopf auf der Außenseite von T
        const far = F.face + F.depth
        for (let i = 0; i < n; i++) {
          const f = 0.25 + (0.5 * i) / (n - 1)
          screw(pt(far, mid(eA), eS[0] + (eS[1] - eS[0]) * f), into, L, r0)
        }
      } else if (oS[1] - oS[0] > 10 && oA[1] - oA[0] > 10) {
        // aufliegend bzw. angelegt: durch E in T, Kopf auf E
        const e0 = range(E, out)[0]
        const longS = oS[1] - oS[0] >= oA[1] - oA[0]
        for (const k of [-0.25, 0.25]) {
          const sd = longS ? mid(oS) + (oS[1] - oS[0]) * k : mid(oS)
          const ac = longS ? mid(oA) : mid(oA) + (oA[1] - oA[0]) * k
          screw(pt(e0, ac, sd), out, L, r0)
        }
      } else {
        // Kopfband u. Ä.: quer durch die Überdeckung
        const o0 = overlap(range(E, out), range(Tm, out))
        for (const k of [-0.2, 0.2]) screw(pt(mid(o0), eA[1], mid(eS) + (eS[1] - eS[0]) * k), { x: -across.x, y: -across.y, z: -across.z }, L, r0)
      }
    } else if (type === 'ueberblattung') {
      // zwei Schrauben quer durch das Blatt, diagonal versetzt
      const c = jointCuts(j, byId)
      const subA = c?.members.get(A.id)?.sub[0]
      if (!subA) continue
      const axesA = memberAxes(A)
      const cr = normv(crossv(axesA[0], memberAxes(B)[0]))
      const e2 = normv(crossv(cr, axesA[0]))
      const lapC = addv(A.start, [axesA[0], (subA[0][0] + subA[0][1]) / 2], [axesA[1], (subA[1][0] + subA[1][1]) / 2], [axesA[2], (subA[2][0] + subA[2][1]) / 2])
      const ext = (d: V) => [0, 1, 2].reduce((sum, k) => sum + Math.abs(dotv(axesA[k], d)) * (subA[k][1] - subA[k][0]), 0)
      const top = Math.max(range(A, cr)[1], range(B, cr)[1])
      const down = { x: -cr.x, y: -cr.y, z: -cr.z }
      for (const k of [-0.22, 0.22]) {
        const p0 = addv(lapC, [axesA[0], ext(axesA[0]) * k], [e2, -ext(e2) * k])
        screw(addv(p0, [cr, top - dotv(p0, cr)]), down, 80)
      }
    } else if (type === 'zapfen' && F.pE) {
      // Holznagel quer durch Zapfenloch und Zapfen, Stirnseiten sichtbar
      const L = F.depth < 50 ? F.depth : F.depth * 0.75
      const o = F.face + L * 0.5
      rod(pt(o, tA[0] - 1.5, mid(eS)), pt(o, tA[1] + 1.5, mid(eS)), 8, pins)
    } else if (type === 'schwalbenschwanz' && F.pE) {
      const dd = F.depth * 0.6
      // zwei Holznägel durch das Blatt, Stirnseite außen sichtbar
      const lr = lapRange(eA, tA)
      const outer = Math.abs(lr[0] - mid(eA)) > Math.abs(lr[1] - mid(eA)) ? lr[0] - 1.5 : lr[1] + 1.5
      for (const k of [-0.18, 0.18]) rod(pt(F.face + dd * 0.5, outer, mid(eS) + (eS[1] - eS[0]) * k), pt(F.face + dd * 0.5, mid(eA) + (mid(eA) - outer) * 0.3, mid(eS) + (eS[1] - eS[0]) * k), 5, pins)
    } else if (type === 'holzduebel' && F.pE) {
      for (const k of [-0.25, 0.25]) rod(pt(F.face - 40, mid(eA), mid(eS) + (eS[1] - eS[0]) * k), pt(F.face + 40, mid(eA), mid(eS) + (eS[1] - eS[0]) * k), 5, dowels)
    } else if (type === 'auflagerleiste') {
      const c = jointCuts(j, byId)
      const lst = c?.extras[0]
      if (!lst) continue
      for (const k of [-0.35, 0, 0.35])
        screw(addv(lst.center, [lst.axes[0], -lst.half[0]], [lst.axes[1], lst.half[1] * 2 * k]), lst.axes[0], 50, 2.5)
    } else if (type === 'gewindestange') {
      // Mutter und Scheibe auf beiden Seiten des Holzes, das die Stange hält
      const rodM = E.catalogId.startsWith('gewindestange') ? E : Tm.catalogId.startsWith('gewindestange') ? Tm : undefined
      const wood = rodM === E ? Tm : E
      if (!rodM) continue
      const ra = memberAxes(rodM)[0]
      const [w0, w1] = range(wood, ra)
      const p0 = dotv(j.pos, ra)
      const base = addv(j.pos, [ra, -p0])
      for (const [t, d] of [
        [w0, -1],
        [w1, 1],
      ] as const) {
        const dir = toThree({ x: ra.x * d, y: ra.y * d, z: ra.z * d })
        put(washers, addv(base, [ra, t + d * 1]), dir, [0.015, 0.002, 0.015])
        put(nuts, addv(base, [ra, t + d * 6]), dir, [0.0095, 0.008, 0.0095])
      }
    }
  }
  return { heads, washers, nuts, plates, pockets, screws, pins, dowels, rods }
}
