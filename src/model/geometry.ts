import { locale } from '../i18n'
import type { Member, Mm, Panel, Room, Vec3, WallId } from './types'

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
export const add = (a: Vec3, b: Vec3): Vec3 => v(a.x + b.x, a.y + b.y, a.z + b.z)
export const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z)
export const scale = (a: Vec3, s: number): Vec3 => v(a.x * s, a.y * s, a.z * s)
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
export const norm = (a: Vec3): Vec3 => {
  const l = len(a)
  return l === 0 ? v(0, 0, 0) : scale(a, 1 / l)
}
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b))
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t))

/**
 * Lokales System einer Wand: start ist die linke Ecke vom Raum aus gesehen, u zeigt nach rechts
 * entlang der Wand, n zeigt in den Raum. Umlauf A → B → C → D.
 */
export interface WallFrame {
  id: WallId
  start: Vec3
  u: Vec3
  n: Vec3
  length: Mm
}

export function wallFrame(room: Room, id: WallId): WallFrame {
  const L = room.length
  const W = room.width
  switch (id) {
    case 'A':
      return { id, start: v(L, 0, 0), u: v(-1, 0, 0), n: v(0, 1, 0), length: L }
    case 'B':
      return { id, start: v(0, 0, 0), u: v(0, 1, 0), n: v(1, 0, 0), length: W }
    case 'C':
      return { id, start: v(0, W, 0), u: v(1, 0, 0), n: v(0, -1, 0), length: L }
    case 'D':
      return { id, start: v(L, W, 0), u: v(0, -1, 0), n: v(-1, 0, 0), length: W }
  }
}

/** Orientierter Quader */
export interface OBB {
  center: Vec3
  axes: [Vec3, Vec3, Vec3]
  half: [number, number, number]
}

/** Achsen eines Stabs: Längsachse, Querschnittsbreite b, Querschnittshöhe h */
export function memberAxes(m: Pick<Member, 'start' | 'end' | 'roll'>): [Vec3, Vec3, Vec3] {
  const ax = norm(sub(m.end, m.start))
  // Referenz für die Querschnittslage: Waagerechte Stäbe stehen hochkant (h nach oben),
  // senkrechte Stäbe richten b entlang x aus.
  const vertical = Math.abs(ax.z) > 0.999
  const ref = vertical ? v(1, 0, 0) : v(0, 0, 1)
  let hb: Vec3
  let hh: Vec3
  if (vertical) {
    hb = norm(sub(ref, scale(ax, dot(ref, ax))))
    hh = norm(cross(ax, hb))
  } else {
    hh = norm(sub(ref, scale(ax, dot(ref, ax))))
    hb = norm(cross(hh, ax))
  }
  const r = (m.roll * Math.PI) / 180
  if (r !== 0) {
    const c = Math.cos(r)
    const s = Math.sin(r)
    const nb = add(scale(hb, c), scale(hh, s))
    const nh = add(scale(hb, -s), scale(hh, c))
    hb = nb
    hh = nh
  }
  return [ax, hb, hh]
}

export function memberLength(m: Pick<Member, 'start' | 'end'>): number {
  return dist(m.start, m.end)
}

/**
 * Quader eines Stabs mit schrägen Endschnitten (für die Suche nach Berührungen): an den Enden in
 * schmale Streifen quer zur Schnittebene zerlegt, jeder reicht bis an den Schnitt. So berührt der
 * Kopfschnitt die Zarge, und nichts ragt über den Schnitt hinaus.
 */
export function memberReach(m: Member, n = 8): OBB[] {
  const boxes = memberBoxes(m)
  if (!m.ends || (!m.ends.start && !m.ends.end)) return boxes
  const axes = memberAxes(m)
  const L = memberLength(m)
  const loc = (q: Vec3, a: Vec3) => q.x * a.x + q.y * a.y + q.z * a.z
  const plane = (nv: Vec3 | undefined, at: number) => {
    if (!nv) return undefined
    const ln = axes.map((a) => loc(nv, a))
    return Math.abs(ln[0]) < 0.05 ? undefined : { ln, at }
  }
  const ps = plane(m.ends.start, 0)
  const pe = plane(m.ends.end, L)
  const p = (ps ?? pe)!.ln[1] ** 2 >= (ps ?? pe)!.ln[2] ** 2 ? 1 : 2
  // Lage des Schnitts entlang der Achse bei Querlage x (Achse p), q liegt in der Ebene
  const uAt = (pl: { ln: number[]; at: number }, x: number) => pl.at - (pl.ln[p] * x) / pl.ln[0]
  const out: OBB[] = []
  for (const o of boxes) {
    const rel = sub(o.center, m.start)
    const c = axes.map((a) => loc(rel, a))
    const u0 = c[0] - o.half[0]
    const u1 = c[0] + o.half[0]
    const atS = ps && u0 <= 0.5
    const atE = pe && u1 >= L - 0.5
    if (!atS && !atE) {
      out.push(o)
      continue
    }
    const hp = o.half[p]
    for (let k = 0; k < n; k++) {
      const x0 = c[p] - hp + (2 * hp * k) / n
      const x1 = x0 + (2 * hp) / n
      const a = atS ? Math.max(uAt(ps!, x0), uAt(ps!, x1)) : u0
      const b = atE ? Math.min(uAt(pe!, x0), uAt(pe!, x1)) : u1
      if (b - a < 1) continue
      const half: [number, number, number] = [(b - a) / 2, o.half[1], o.half[2]]
      half[p] = hp / n
      const cc = [...c]
      cc[0] = (a + b) / 2
      cc[p] = (x0 + x1) / 2
      out.push({ center: add(add(add(m.start, scale(axes[0], cc[0])), scale(axes[1], cc[1])), scale(axes[2], cc[2])), axes: o.axes, half })
    }
  }
  return out
}

export function memberOBB(m: Pick<Member, 'start' | 'end' | 'roll' | 'b' | 'h'>): OBB {
  const axes = memberAxes(m)
  return {
    center: lerp(m.start, m.end, 0.5),
    axes,
    half: [memberLength(m) / 2, m.b / 2, m.h / 2],
  }
}

/** Zerlegt einen Stab mit Ausklinkungen in Quader (für Darstellung und Kollision). */
export function memberBoxes(m: Member): OBB[] {
  const notches = m.notches ?? []
  if (notches.length === 0) return [memberOBB(m)]
  const L = memberLength(m)
  const axes = memberAxes(m)
  const cuts = new Set<number>([0, L])
  for (const n of notches) {
    cuts.add(Math.max(0, Math.min(L, n.along)))
    cuts.add(Math.max(0, Math.min(L, n.along + n.length)))
  }
  const stations = [...cuts].sort((a, b) => a - b)
  const boxes: OBB[] = []
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i]
    const b = stations[i + 1]
    if (b - a < 0.5) continue
    const mid = (a + b) / 2
    let bMin = -m.b / 2
    let bMax = m.b / 2
    let hMin = -m.h / 2
    let hMax = m.h / 2
    for (const n of notches) {
      if (mid < n.along || mid > n.along + n.length) continue
      if (n.side === '+b') bMax = Math.min(bMax, m.b / 2 - n.depth)
      if (n.side === '-b') bMin = Math.max(bMin, -m.b / 2 + n.depth)
      if (n.side === '+h') hMax = Math.min(hMax, m.h / 2 - n.depth)
      if (n.side === '-h') hMin = Math.max(hMin, -m.h / 2 + n.depth)
    }
    if (bMax - bMin < 1 || hMax - hMin < 1) continue
    const c = add(
      add(add(m.start, scale(axes[0], mid)), scale(axes[1], (bMin + bMax) / 2)),
      scale(axes[2], (hMin + hMax) / 2),
    )
    boxes.push({ center: c, axes, half: [(b - a) / 2, (bMax - bMin) / 2, (hMax - hMin) / 2] })
  }
  return boxes
}

export function aabbOBB(min: Vec3, max: Vec3): OBB {
  return {
    center: lerp(min, max, 0.5),
    axes: [v(1, 0, 0), v(0, 1, 0), v(0, 0, 1)],
    half: [(max.x - min.x) / 2, (max.y - min.y) / 2, (max.z - min.z) / 2],
  }
}

export function obbCorners(o: OBB): Vec3[] {
  const out: Vec3[] = []
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        out.push(
          add(
            add(add(o.center, scale(o.axes[0], sx * o.half[0])), scale(o.axes[1], sy * o.half[1])),
            scale(o.axes[2], sz * o.half[2]),
          ),
        )
      }
  return out
}

export function obbBounds(o: OBB): { min: Vec3; max: Vec3 } {
  const cs = obbCorners(o)
  return {
    min: v(Math.min(...cs.map((c) => c.x)), Math.min(...cs.map((c) => c.y)), Math.min(...cs.map((c) => c.z))),
    max: v(Math.max(...cs.map((c) => c.x)), Math.max(...cs.map((c) => c.y)), Math.max(...cs.map((c) => c.z))),
  }
}

/**
 * Trennachsen-Test für zwei orientierte Quader. Liefert die Eindringtiefe (> 0 bei Überlappung,
 * sonst ≤ 0 = Abstand entlang der besten Trennachse). tolerance > 0 lässt Berührung zu.
 */
export function obbOverlap(a: OBB, b: OBB): number {
  const axes: Vec3[] = [...a.axes, ...b.axes]
  for (const x of a.axes)
    for (const y of b.axes) {
      const c = cross(x, y)
      if (len(c) > 1e-6) axes.push(norm(c))
    }
  const d = sub(b.center, a.center)
  let minPen = Infinity
  for (const ax of axes) {
    const ra = a.half[0] * Math.abs(dot(a.axes[0], ax)) + a.half[1] * Math.abs(dot(a.axes[1], ax)) + a.half[2] * Math.abs(dot(a.axes[2], ax))
    const rb = b.half[0] * Math.abs(dot(b.axes[0], ax)) + b.half[1] * Math.abs(dot(b.axes[1], ax)) + b.half[2] * Math.abs(dot(b.axes[2], ax))
    const pen = ra + rb - Math.abs(dot(d, ax))
    if (pen < minPen) minPen = pen
    if (minPen <= 0) return minPen
  }
  return minPen
}

/** Quader eines Panels (waagerecht über dem Umriss-Bounding-Box, oder senkrecht entlang der Linie) */
export function panelOBB(p: Panel): OBB {
  if (p.vertical) {
    const a = v(p.vertical.a.x, p.vertical.a.y, p.z)
    const b = v(p.vertical.b.x, p.vertical.b.y, p.z)
    const ax = norm(sub(b, a))
    const nz = v(0, 0, 1)
    const nb = norm(cross(nz, ax))
    const l = dist(a, b)
    return {
      center: add(lerp(a, b, 0.5), v(0, 0, p.vertical.height / 2)),
      axes: [ax, nb, nz],
      half: [l / 2, p.thickness / 2, p.vertical.height / 2],
    }
  }
  const xs = p.outline.map((q) => q.x)
  const ys = p.outline.map((q) => q.y)
  return aabbOBB(v(Math.min(...xs), Math.min(...ys), p.z), v(Math.max(...xs), Math.max(...ys), p.z + p.thickness))
}

export function rotate2(x: number, y: number, deg: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180
  const c = Math.round(Math.cos(r) * 1e9) / 1e9
  const s = Math.round(Math.sin(r) * 1e9) / 1e9
  return { x: x * c - y * s, y: x * s + y * c }
}

export const round = (x: number, step = 1): number => Math.round(x / step) * step

export function fmtCm(mm: number, digits = 1): string {
  return `${(mm / 10).toLocaleString(locale(), { minimumFractionDigits: 0, maximumFractionDigits: digits })} cm`
}

export function fmtM(mm: number): string {
  return `${(mm / 1000).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`
}

let idCounter = 0
export function uid(prefix: string): string {
  idCounter++
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Konvexes Vieleck auf die Halbebene c + dx·x + dy·y ≤ 0 beschneiden (Sutherland–Hodgman) */
export function clipHalf<P extends { x: number; y: number }>(poly: P[], c: number, dx: number, dy: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  const f = (q: { x: number; y: number }) => c + dx * q.x + dy * q.y
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const fp = f(p)
    const fq = f(q)
    if (fp <= 0) out.push(p)
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq)
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })
    }
  }
  return out
}
