import { aabbOBB, add, cross, norm, scale, v, wallFrame, type OBB, type WallFrame } from './geometry'
import type { CorniceProfile, DoorObj, Furniture, Project, Room, Vec3, WallId, WindowObj } from './types'
import { WALL_IDS } from './types'

export function cornice(room: Room, wall: WallId): CorniceProfile {
  return room.corniceOverrides[wall] ?? room.cornice
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

/** Alle festen Hindernisse im Raum (ohne Wände/Decke/Boden und ohne Stuck, der eigens geprüft wird). */
export function roomObstacles(p: Project): Obstacle[] {
  const room = p.room
  const out: Obstacle[] = []
  for (const o of p.wallObjects) {
    const f = wallFrame(room, o.wall)
    if (o.kind === 'fenster') {
      // Laibungswände links und rechts in der Nische (begrenzen den Flügel bei großen Winkeln)
      out.push({ id: `${o.id}:laibung-l`, ownerId: o.id, label: `${o.name}: Laibung`, kind: 'laibung', box: wallBox(f, o.offset - 300, o.offset, -o.revealDepth, 0, o.sillHeight, o.sillHeight + o.height) })
      out.push({ id: `${o.id}:laibung-r`, ownerId: o.id, label: `${o.name}: Laibung`, kind: 'laibung', box: wallBox(f, o.offset + o.width, o.offset + o.width + 300, -o.revealDepth, 0, o.sillHeight, o.sillHeight + o.height) })
      if (o.sill.enabled) {
        out.push({
          id: `${o.id}:fensterbank`,
          ownerId: o.id,
          label: `${o.name}: Fensterbank`,
          kind: 'fensterbank',
          box: wallBox(f, o.offset - o.sill.sideOverhang, o.offset + o.width + o.sill.sideOverhang, -o.revealDepth, o.sill.projection, o.sillHeight - o.sill.thickness, o.sillHeight),
        })
      }
    } else if (o.kind === 'heizkoerper') {
      out.push({ id: `${o.id}:koerper`, ownerId: o.id, label: o.name, kind: 'heizkoerper', box: wallBox(f, o.offset, o.offset + o.width, o.wallGap, o.wallGap + o.depth, o.bottom, o.bottom + o.height) })
      out.push({
        id: `${o.id}:konvektion`,
        ownerId: o.id,
        label: `${o.name}: Konvektionsraum`,
        kind: 'konvektion',
        box: wallBox(f, o.offset, o.offset + o.width, 0, o.wallGap + o.depth, o.bottom + o.height, o.bottom + o.height + o.convectionClearance),
      })
    } else if (o.kind === 'steckdose') {
      out.push({ id: `${o.id}:dose`, ownerId: o.id, label: o.name, kind: 'steckdose', box: wallBox(f, o.offset, o.offset + o.width, 0, 12, o.bottom, o.bottom + o.height) })
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
        out.push({ id: `sockel-${id}-${i}`, ownerId: `sockel-${id}`, label: `Sockelleiste Wand ${id}`, kind: 'sockelleiste', box: wallBox(f, a, b, 0, room.skirting.depth, 0, room.skirting.height) }),
      )
    }
  }
  for (const r of room.rosettes) {
    const rr = r.diameter / 2
    out.push({ id: `${r.id}:rosette`, ownerId: r.id, label: 'Deckenrosette', kind: 'rosette', box: aabbOBB(v(r.x - rr, r.y - rr, room.height - r.depth), v(r.x + rr, r.y + rr, room.height)) })
    if (r.lampDrop > 0) {
      const lr = r.lampDiameter / 2
      const lampH = lampShadeHeight(r)
      out.push({
        id: `${r.id}:lampe`,
        ownerId: r.id,
        label: 'Lampe',
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
