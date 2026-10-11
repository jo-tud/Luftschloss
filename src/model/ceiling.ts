import { wallFrame } from './geometry'
import type { Room, Vec3, WallId } from './types'
import { WALL_IDS } from './types'

/**
 * Decke mit Dachschrägen. Jede Schräge ist eine geneigte Ebene, die am Kniestock an der inneren
 * Wandoberfläche beginnt; die Decke ist an jeder Stelle die tiefste der Ebenen (flache Decke und
 * Schrägen). So ergeben sich auch Grate, wenn zwei Schrägen in einer Ecke zusammentreffen.
 */

/** Ebene z = a + bx·x + by·y; wall fehlt bei der flachen Decke */
export interface CeilingPlane {
  wall?: WallId
  a: number
  bx: number
  by: number
}

export const SLOPE_ANGLE = { min: 10, max: 70 } as const

export function slopeTan(angle: number): number {
  return Math.tan((Math.min(SLOPE_ANGLE.max, Math.max(SLOPE_ANGLE.min, angle)) * Math.PI) / 180)
}

export function ceilingPlanes(room: Room): CeilingPlane[] {
  const out: CeilingPlane[] = [{ a: room.height, bx: 0, by: 0 }]
  for (const w of WALL_IDS) {
    const s = room.slopes?.[w]
    if (!s || !(s.kneeHeight < room.height)) continue
    const k = Math.max(0, s.kneeHeight)
    const t = slopeTan(s.angle)
    if (w === 'A') out.push({ wall: w, a: k, bx: 0, by: t })
    else if (w === 'B') out.push({ wall: w, a: k, bx: t, by: 0 })
    else if (w === 'C') out.push({ wall: w, a: k + t * room.width, bx: 0, by: -t })
    else out.push({ wall: w, a: k + t * room.length, bx: -t, by: 0 })
  }
  return out
}

export function hasSlopes(room: Room): boolean {
  return ceilingPlanes(room).length > 1
}

const at = (pl: CeilingPlane, x: number, y: number) => pl.a + pl.bx * x + pl.by * y

/** Deckenhöhe an einer Stelle des Grundrisses */
export function ceilingAt(room: Room, x: number, y: number, planes = ceilingPlanes(room)): number {
  let z = Infinity
  for (const pl of planes) z = Math.min(z, at(pl, x, y))
  return z
}

/** Wie tief ragt ein Punkt in die Decke (> 0 = darüber)? */
export function ceilingIntrusion(room: Room, q: Vec3, planes = ceilingPlanes(room)): number {
  return q.z - ceilingAt(room, q.x, q.y, planes)
}

/**
 * Niedrigste und höchste Deckenhöhe über einem Rechteck des Grundrisses. Die Decke ist das Minimum
 * von Ebenen, das Minimum liegt daher an einer Ecke; das Maximum wird auf einem Raster gesucht.
 */
export function ceilingRange(room: Room, r: { minX: number; maxX: number; minY: number; maxY: number }): { min: number; max: number } {
  const planes = ceilingPlanes(room)
  if (planes.length === 1) return { min: room.height, max: room.height }
  let min = Infinity
  let max = -Infinity
  const n = 12
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const z = ceilingAt(room, r.minX + ((r.maxX - r.minX) * i) / n, r.minY + ((r.maxY - r.minY) * j) / n, planes)
      min = Math.min(min, z)
      max = Math.max(max, z)
    }
  return { min, max }
}

type P2 = { x: number; y: number }

/** Polygon auf die Halbebene c + dx·x + dy·y ≤ 0 beschneiden (Sutherland–Hodgman) */
function clipHalf(poly: P2[], c: number, dx: number, dy: number): P2[] {
  const out: P2[] = []
  const f = (q: P2) => c + dx * q.x + dy * q.y
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

function area(poly: P2[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

/** Deckenflächen: je Ebene der Bereich, in dem sie die tiefste ist – konvexe Vielecke mit Höhe */
export function ceilingFaces(room: Room): { wall?: WallId; poly: Vec3[] }[] {
  const planes = ceilingPlanes(room)
  const out: { wall?: WallId; poly: Vec3[] }[] = []
  planes.forEach((pi, i) => {
    let poly: P2[] = [
      { x: 0, y: 0 },
      { x: room.length, y: 0 },
      { x: room.length, y: room.width },
      { x: 0, y: room.width },
    ]
    planes.forEach((pj, j) => {
      if (j === i || poly.length < 3) return
      // pi ≤ pj; bei Gleichstand gewinnt die frühere Ebene
      poly = clipHalf(poly, pi.a - pj.a - (j < i ? -1e-6 : 0), pi.bx - pj.bx, pi.by - pj.by)
    })
    if (poly.length >= 3 && area(poly) > 1) out.push({ wall: pi.wall, poly: poly.map((q) => ({ x: q.x, y: q.y, z: at(pi, q.x, q.y) })) })
  })
  return out
}

/**
 * Oberkante einer Wand entlang ihrer Innenfläche: Punkte (s = Abstand von der linken Ecke, z) mit allen
 * Knicken, an denen eine Schräge beginnt oder endet.
 */
export function wallTop(room: Room, wall: WallId): { s: number; z: number }[] {
  const planes = ceilingPlanes(room)
  const f = wallFrame(room, wall)
  // jede Ebene entlang der Wand als Gerade z = c + m·s
  const lines = planes.map((pl) => ({ c: at(pl, f.start.x, f.start.y), m: pl.bx * f.u.x + pl.by * f.u.y }))
  const st = new Set<number>([0, f.length])
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const dm = lines[i].m - lines[j].m
      if (Math.abs(dm) < 1e-9) continue
      const s = (lines[j].c - lines[i].c) / dm
      if (s > 0.5 && s < f.length - 0.5) st.add(s)
    }
  const zAt = (s: number) => Math.min(...lines.map((l) => l.c + l.m * s))
  return [...st].sort((a, b) => a - b).map((s) => ({ s, z: zAt(s) }))
}

/** Abschnitte einer Wand, über denen die flache Decke liegt (dort sitzt der Stuck) */
export function flatSpans(room: Room, wall: WallId): [number, number][] {
  const top = wallTop(room, wall)
  const out: [number, number][] = []
  for (let i = 0; i < top.length - 1; i++) {
    const a = top[i]
    const b = top[i + 1]
    if (a.z < room.height - 0.5 || b.z < room.height - 0.5) continue
    const last = out[out.length - 1]
    if (last && Math.abs(last[1] - a.s) < 0.5) last[1] = b.s
    else out.push([a.s, b.s])
  }
  return out
}
