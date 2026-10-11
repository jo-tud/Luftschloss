import { t, tr } from '../i18n'
import { aabbOBB, add, cross, memberBoxes, norm, obbBounds, scale, v, wallFrame, type OBB, type WallFrame } from './geometry'
import type { CorniceProfile, DoorObj, Furniture, Member, ProjectionObj, Project, Room, Vec3, WallId, WindowObj } from './types'
import { WALL_IDS } from './types'
import { ceilingAt, ceilingPlanes, ceilingRange } from './ceiling'

/** Stuckleiste einer Wand; unter einer Dachschräge gibt es keine */
export function cornice(room: Room, wall: WallId): CorniceProfile {
  const c = room.corniceOverrides[wall] ?? room.cornice
  const s = room.slopes?.[wall]
  return s && s.kneeHeight < room.height && c.enabled ? { ...c, enabled: false } : c
}

/** Quader in Wandkoordinaten: s entlang der Wand, d in den Raum, z Höhe */
export function wallBox(f: WallFrame, s0: number, s1: number, d0: number, d1: number, z0: number, z1: number): OBB {
  const sm = (s0 + s1) / 2
  const dm = (d0 + d1) / 2
  const c = v(f.start.x + f.u.x * sm + f.n.x * dm, f.start.y + f.u.y * sm + f.n.y * dm, (z0 + z1) / 2)
  return {
    center: c,
    axes: [f.u, f.n, v(0, 0, 1)],
    half: [Math.abs(s1 - s0) / 2, Math.abs(d1 - d0) / 2, Math.abs(z1 - z0) / 2],
  }
}

export interface SashGeom {
  windowId: string
  index: number
  opening: WindowObj['sashes'][number]['opening']
  /** Bandachse unten */
  hinge: Vec3
  /** Richtung vom Band zur Griffseite im geschlossenen Zustand */
  e: Vec3
  n: Vec3
  width: number
  height: number
  thickness: number
  handle: number
}

export function windowSashes(room: Room, w: WindowObj): SashGeom[] {
  const f = wallFrame(room, w.wall)
  const inner0 = w.offset + w.frameWidth
  const inner1 = w.offset + w.width - w.frameWidth
  const n = Math.max(1, w.sashes.length)
  const sw = (inner1 - inner0) / n
  return w.sashes.map((s, i) => {
    const left = inner0 + i * sw
    const right = left + sw
    const hs = s.hinge === 'links' ? left : right
    const hinge = v(f.start.x + f.u.x * hs - f.n.x * w.revealDepth, f.start.y + f.u.y * hs - f.n.y * w.revealDepth, w.sillHeight + w.frameWidth)
    return {
      windowId: w.id,
      index: i,
      opening: s.opening,
      hinge,
      e: s.hinge === 'links' ? f.u : scale(f.u, -1),
      n: f.n,
      width: sw,
      height: w.height - 2 * w.frameWidth,
      thickness: w.sashThickness,
      handle: w.handleProjection,
    }
  })
}

/** Flügel als Quader bei Öffnungswinkel deg (0 = zu, 90 = senkrecht zur Wand in den Raum). */
export function sashBoxes(g: SashGeom, deg: number, shrink = 3): OBB[] {
  const r = (deg * Math.PI) / 180
  const dir = add(scale(g.e, Math.cos(r)), scale(g.n, Math.sin(r)))
  // Rückseite (zur Wand hin) dreht starr mit
  const back = add(scale(g.e, Math.sin(r)), scale(g.n, -Math.cos(r)))
  const zc = g.hinge.z + g.height / 2
  const c = add(add(v(g.hinge.x, g.hinge.y, zc), scale(dir, g.width / 2)), scale(back, g.thickness / 2))
  const sash: OBB = { center: c, axes: [dir, back, v(0, 0, 1)], half: [g.width / 2 - shrink, g.thickness / 2 - shrink / 2, g.height / 2 - shrink] }
  // Griff auf der Raumseite nahe der Schließkante
  const front = scale(back, -1)
  const hc = add(add(v(g.hinge.x, g.hinge.y, g.hinge.z + Math.min(g.height / 2, 1050)), scale(dir, g.width - 45)), scale(front, g.handle / 2))
  const handle: OBB = { center: hc, axes: [dir, back, v(0, 0, 1)], half: [15, g.handle / 2, 65] }
  return [sash, handle]
}

/** Kippspalt: oberer Teil des Flügels neigt sich um ca. 125 mm in den Raum (Siegenia AF Gr. 1). */
export function tiltBox(g: SashGeom, gap = 125): OBB {
  const z1 = g.hinge.z + g.height
  const z0 = z1 - g.height * 0.6
  const mid = add(v(g.hinge.x, g.hinge.y, (z0 + z1) / 2), scale(g.e, g.width / 2))
  const c = add(mid, scale(g.n, gap / 2))
  return { center: c, axes: [g.e, g.n, v(0, 0, 1)], half: [g.width / 2 - 5, gap / 2, (z1 - z0) / 2] }
}

export interface DoorGeom {
  hinge: Vec3
  e: Vec3
  n: Vec3
  width: number
  height: number
}

export function doorGeom(room: Room, d: DoorObj): DoorGeom {
  const f = wallFrame(room, d.wall)
  const hs = d.hinge === 'links' ? d.offset : d.offset + d.width
  const inward = d.opensInward ? f.n : scale(f.n, -1)
  return {
    hinge: v(f.start.x + f.u.x * hs, f.start.y + f.u.y * hs, 0),
    e: d.hinge === 'links' ? f.u : scale(f.u, -1),
    n: inward,
    width: d.width,
    height: d.height,
  }
}

export function doorLeafBox(g: DoorGeom, deg: number): OBB {
  const r = (deg * Math.PI) / 180
  const dir = add(scale(g.e, Math.cos(r)), scale(g.n, Math.sin(r)))
  const side = norm(cross(v(0, 0, 1), dir))
  const c = add(v(g.hinge.x, g.hinge.y, g.height / 2), scale(dir, g.width / 2))
  return { center: c, axes: [dir, side, v(0, 0, 1)], half: [g.width / 2 - 5, 20, g.height / 2 - 5] }
}

export type ObstacleKind =
  | 'laibung'
  | 'fensterbank'
  | 'heizkoerper'
  | 'konvektion'
  | 'steckdose'
  | 'sockelleiste'
  | 'rosette'
  | 'lampe'
  | 'moebel'
  | 'person'
  | 'vorsprung'

export interface Obstacle {
  id: string
  ownerId: string
  label: string
  kind: ObstacleKind
  box: OBB
}

export function furnitureBox(fu: Furniture): OBB {
  const rot = fu.rotation === 90 || fu.rotation === 270
  const sx = rot ? fu.sy : fu.sx
  const sy = rot ? fu.sx : fu.sy
  return aabbOBB(v(fu.x, fu.y, fu.z), v(fu.x + sx, fu.y + sy, fu.z + fu.sz))
}

/** Mauervorsprung als Quader vom Boden bis zur Decke (unter einer Schräge bis zu ihrer höchsten Stelle) */
export function projectionBox(room: Room, o: ProjectionObj): OBB {
  const f = wallFrame(room, o.wall)
  const b = obbBounds(wallBox(f, o.offset, o.offset + o.width, 0, o.depth, 0, 1))
  const top = ceilingRange(room, { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y }).max
  return wallBox(f, o.offset, o.offset + o.width, 0, o.depth, 0, top)
}

/** Alle festen Hindernisse im Raum (ohne Wände/Decke/Boden und ohne Stuck, der eigens geprüft wird). */
export function roomObstacles(p: Project): Obstacle[] {
  const room = p.room
  const out: Obstacle[] = []
  for (const o of p.wallObjects) {
    const f = wallFrame(room, o.wall)
    if (o.kind === 'fenster') {
      // Laibungswände links und rechts in der Nische (begrenzen den Flügel bei großen Winkeln). Sie reichen
      // höchstens bis zur nächsten Öffnung derselben Wand – sonst läge die Laibung im Nachbarfenster und
      // dessen Flügel gälten schon ab 0° als blockiert
      const others = p.wallObjects.filter((x) => x.id !== o.id && x.wall === o.wall && (x.kind === 'fenster' || x.kind === 'tuer'))
      const l0 = Math.max(o.offset - 300, ...others.filter((x) => x.offset + x.width <= o.offset + 1).map((x) => x.offset + x.width))
      const r1 = Math.min(o.offset + o.width + 300, ...others.filter((x) => x.offset >= o.offset + o.width - 1).map((x) => x.offset))
      if (o.offset - l0 > 1) out.push({ id: `${o.id}:laibung-l`, ownerId: o.id, label: t('{name}: Laibung', { name: tr(o.name) }), kind: 'laibung', box: wallBox(f, l0, o.offset, -o.revealDepth, 0, o.sillHeight, o.sillHeight + o.height) })
      if (r1 - (o.offset + o.width) > 1) out.push({ id: `${o.id}:laibung-r`, ownerId: o.id, label: t('{name}: Laibung', { name: tr(o.name) }), kind: 'laibung', box: wallBox(f, o.offset + o.width, r1, -o.revealDepth, 0, o.sillHeight, o.sillHeight + o.height) })
      if (o.sill.enabled) {
        out.push({
          id: `${o.id}:fensterbank`,
          ownerId: o.id,
          label: t('{name}: Fensterbank', { name: tr(o.name) }),
          kind: 'fensterbank',
          box: wallBox(f, o.offset - o.sill.sideOverhang, o.offset + o.width + o.sill.sideOverhang, -o.revealDepth, o.sill.projection, o.sillHeight - o.sill.thickness, o.sillHeight),
        })
      }
    } else if (o.kind === 'heizkoerper') {
      out.push({ id: `${o.id}:koerper`, ownerId: o.id, label: o.name, kind: 'heizkoerper', box: wallBox(f, o.offset, o.offset + o.width, o.wallGap, o.wallGap + o.depth, o.bottom, o.bottom + o.height) })
      out.push({
        id: `${o.id}:konvektion`,
        ownerId: o.id,
        label: t('{name}: Konvektionsraum', { name: tr(o.name) }),
        kind: 'konvektion',
        box: wallBox(f, o.offset, o.offset + o.width, 0, o.wallGap + o.depth, o.bottom + o.height, o.bottom + o.height + o.convectionClearance),
      })
    } else if (o.kind === 'steckdose') {
      out.push({ id: `${o.id}:dose`, ownerId: o.id, label: o.name, kind: 'steckdose', box: wallBox(f, o.offset, o.offset + o.width, 0, 12, o.bottom, o.bottom + o.height) })
    } else if (o.kind === 'vorsprung') {
      out.push({ id: `${o.id}:mauer`, ownerId: o.id, label: o.name, kind: 'vorsprung', box: projectionBox(room, o) })
    }
  }
  if (room.skirting.enabled) {
    for (const id of WALL_IDS) {
      const f = wallFrame(room, id)
      const doors = p.wallObjects.filter((o) => o.kind === 'tuer' && o.wall === id).map((o) => [o.offset, o.offset + o.width] as const)
      let s = 0
      const cuts = [...doors].sort((a, b) => a[0] - b[0])
      const spans: [number, number][] = []
      for (const [a, b] of cuts) {
        if (a > s) spans.push([s, a])
        s = Math.max(s, b)
      }
      if (s < f.length) spans.push([s, f.length])
      spans.forEach(([a, b], i) =>
        out.push({ id: `sockel-${id}-${i}`, ownerId: `sockel-${id}`, label: t('Sockelleiste Wand {id}', { id }), kind: 'sockelleiste', box: wallBox(f, a, b, 0, room.skirting.depth, 0, room.skirting.height) }),
      )
    }
  }
  for (const r of room.rosettes) {
    const rr = r.diameter / 2
    out.push({ id: `${r.id}:rosette`, ownerId: r.id, label: t('Deckenrosette'), kind: 'rosette', box: aabbOBB(v(r.x - rr, r.y - rr, room.height - r.depth), v(r.x + rr, r.y + rr, room.height)) })
    if (r.lampDrop > 0) {
      const lr = r.lampDiameter / 2
      const lampH = lampShadeHeight(r)
      out.push({
        id: `${r.id}:lampe`,
        ownerId: r.id,
        label: t('Lampe'),
        kind: 'lampe',
        box: aabbOBB(v(r.x - lr, r.y - lr, room.height - r.lampDrop), v(r.x + lr, r.y + lr, room.height - r.lampDrop + lampH)),
      })
    }
  }
  for (const fu of p.furniture) {
    out.push({ id: `${fu.id}:moebel`, ownerId: fu.id, label: fu.name, kind: fu.kind.startsWith('person') ? 'person' : 'moebel', box: furnitureBox(fu) })
  }
  return out
}

/**
 * Wie tief ragt ein Punkt in den Stuck? Profil vereinfacht: Kehle/Schräge als Dreieck zwischen
 * Wand (Höhe) und Decke (Ausladung), Rechteck als volles Rechteck. Liefert das nötige Maß, um den
 * der Punkt zurückweichen müsste (> 0 = Kollision), und die betroffene Wand.
 */
export function corniceIntrusion(room: Room, q: Vec3): { depth: number; wall: WallId } | undefined {
  let best: { depth: number; wall: WallId } | undefined
  const planes = ceilingPlanes(room)
  // Stuck nur unter der flachen Decke
  if (planes.length > 1 && ceilingAt(room, q.x, q.y, planes) < room.height - 1) return undefined
  for (const id of WALL_IDS) {
    const c = cornice(room, id)
    if (!c.enabled) continue
    const f = wallFrame(room, id)
    const d = (q.x - f.start.x) * f.n.x + (q.y - f.start.y) * f.n.y
    const below = room.height - q.z
    if (d < 0 || d >= c.projection || below >= c.height) continue
    const limit = c.shape === 'rechteck' ? c.height : c.height * (1 - d / c.projection)
    if (below < limit) {
      const depth = c.shape === 'rechteck' ? c.projection - d : c.projection * (1 - below / c.height) - d
      if (!best || depth > best.depth) best = { depth, wall: id }
    }
  }
  return best
}

/** Höhe des Lampenschirms: typischer Pendelschirm, etwa halb so hoch wie breit */
export function lampShadeHeight(r: { lampDrop: number; lampDiameter: number }): number {
  return Math.min(r.lampDrop, r.lampDiameter * 0.5)
}

/**
 * Wand, an der ein Bauteil liegt, und sein Abstand dazu. Waagrechte Teile gehören zu der Wand, zu der sie
 * parallel laufen – in einer Ecke berühren sie zwei.
 */
export function memberWall(m: Member, room: Room): { wall: WallId; gap: number } {
  const b = obbBounds(memberBoxes(m)[0])
  const dx = Math.abs(m.end.x - m.start.x)
  const dy = Math.abs(m.end.y - m.start.y)
  const dz = Math.abs(m.end.z - m.start.z)
  const gaps: { wall: WallId; gap: number }[] = [
    { wall: 'A', gap: b.min.y },
    { wall: 'B', gap: b.min.x },
    { wall: 'C', gap: room.width - b.max.y },
    { wall: 'D', gap: room.length - b.max.x },
  ]
  const along = dz >= Math.max(dx, dy) ? gaps : dx >= dy ? gaps.filter((g) => g.wall === 'A' || g.wall === 'C') : gaps.filter((g) => g.wall === 'B' || g.wall === 'D')
  return along.sort((x, y) => x.gap - y.gap)[0]
}

/** Liegt der Punkt (auf Höhe z, entlang der Wand) in einer Fenster- oder Türöffnung dieser Wand? */
export function inWallOpening(p: Project, wall: WallId, q: Vec3, margin = 0): boolean {
  const f = wallFrame(p.room, wall)
  const s = (q.x - f.start.x) * f.u.x + (q.y - f.start.y) * f.u.y
  return p.wallObjects.some((o) => {
    if (o.wall !== wall || (o.kind !== 'fenster' && o.kind !== 'tuer')) return false
    const z0 = o.kind === 'fenster' ? o.sillHeight : 0
    const z1 = o.kind === 'fenster' ? o.sillHeight + o.height : o.height
    return s > o.offset - margin && s < o.offset + o.width + margin && q.z > z0 - margin && q.z < z1 + margin
  })
}

/** Möbel, auf denen ein Bett liegen darf (Korpusse mit tragender Oberseite) */
export const BEARING_FURNITURE: Furniture['kind'][] = ['schrank', 'regal', 'kommode']

export interface FurnitureBearing {
  memberId: string
  furnitureId: string
  /** Abschnitt entlang der Stabachse, der auf dem Möbel liegt */
  t0: number
  t1: number
}

/**
 * Waagrechte Hölzer, die auf der Oberseite eines Schranks, Regals oder einer Kommode liegen
 * (Unterkante höchstens 15 mm über bzw. 5 mm unter der Oberseite). Grundlage für die Auflager
 * der Statik und die Prüfung „Bett auf Regal/Schrank“.
 */
export function furnitureBearings(p: Project, members: Member[]): FurnitureBearing[] {
  const tops = p.furniture
    .filter((fu) => BEARING_FURNITURE.includes(fu.kind))
    .map((fu) => ({ fu, b: obbBounds(furnitureBox(fu)) }))
  if (!tops.length) return []
  const out: FurnitureBearing[] = []
  for (const m of members) {
    if (Math.abs(m.start.z - m.end.z) > 5) continue
    const bottom = obbBounds(memberBoxes(m)[0]).min.z
    const L = Math.hypot(m.end.x - m.start.x, m.end.y - m.start.y)
    if (L < 1) continue
    for (const { fu, b } of tops) {
      const gap = bottom - b.max.z
      if (gap > 15 || gap < -5) continue
      // Stabachse im Grundriss auf das Rechteck des Möbels beschneiden (Liang–Barsky)
      const dx = m.end.x - m.start.x
      const dy = m.end.y - m.start.y
      let u0 = 0
      let u1 = 1
      const clip = (pp: number, q: number) => {
        if (Math.abs(pp) < 1e-9) return q >= 0
        const r = q / pp
        if (pp < 0) u0 = Math.max(u0, r)
        else u1 = Math.min(u1, r)
        return u0 <= u1
      }
      if (!(clip(-dx, m.start.x - b.min.x) && clip(dx, b.max.x - m.start.x) && clip(-dy, m.start.y - b.min.y) && clip(dy, b.max.y - m.start.y))) continue
      if ((u1 - u0) * L < 20) continue
      out.push({ memberId: m.id, furnitureId: fu.id, t0: u0 * L, t1: u1 * L })
    }
  }
  return out
}
