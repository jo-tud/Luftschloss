import * as THREE from 'three'
import { memberAxes, memberBoxes } from '../model/geometry'
import type { Resolved } from '../model/resolve'
import type { Member } from '../model/types'
import { T } from './camera'

/**
 * Beschläge als Instanz-Matrizen (Meter, three-Koordinaten): Schlossschrauben (Kopf, Scheibe,
 * Mutter) und Bleche für Winkel und Balkenschuhe. Reine Rechnung, damit sie testbar ist.
 */
export const BOLT_TYPES = new Set(['schlossschraube', 'bettschraube'])

export function hardwareInstances(r: Resolved): { heads: THREE.Matrix4[]; washers: THREE.Matrix4[]; nuts: THREE.Matrix4[]; plates: THREE.Matrix4[]; pockets: THREE.Matrix4[] } {
  const byId = new Map(r.members.map((m) => [m.id, m]))
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
  for (const j of r.joints) {
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
  for (const j of r.joints) {
    if (j.typeId !== 'winkel' && j.typeId !== 'balkenschuh') continue
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
      // Innenecke unten (bzw. auf der Seite mit negativem z), Schenkel 90 mm, Breite 65 mm
      const s2 = aT.z > 0.5 ? -1 : aT.z < -0.5 ? 1 : 1
      const h = extent(E, axesE, aT)
      const corner = at(base, [aT, s2 * h])
      const tDir = { x: aT.x * s2, y: aT.y * s2, z: aT.z * s2 }
      plate(at(corner, [into, 45], [tDir, 1.25]), into, tDir, ax, 90, 65)
      plate(at(corner, [tDir, 45], [into, 1.25]), tDir, into, ax, 90, 65)
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
  return { heads, washers, nuts, plates, pockets }
}
