import { analyze } from '../analysis/checks'
import { defaultBedParams } from './defaults'
import { resolveProject } from './resolve'
import { bedOuterSize, generateLoftBed } from './loftbed'
import { memberBoxes, obbBounds, rotate2, uid } from './geometry'
import { BEARING_FURNITURE } from './room'
import { tk } from '../i18n'
import type { Assembly, BedType, Furniture, LoftBedParams, Project, Room } from './types'

/** Ecke des Raums, in die ein neues Bett gestellt wird (Wand A bzw. C, Ende an Wand D bzw. B) */
export type Corner = 'AD' | 'AB' | 'CB' | 'CD'
export const CORNERS: Corner[] = ['AD', 'AB', 'CB', 'CD']

/**
 * Parameter für ein neues Bett in einer Raumecke: Rückseite an Wand A bzw. C, ein Ende an der
 * Querwand. Gemeinsam für Vorlagen in der Seitenleiste und den Planungsassistenten.
 */
export function placeBed(room: Room, type: BedType, patch: Partial<LoftBedParams>, corner: Corner): LoftBedParams {
  const params = defaultBedParams({
    type,
    deckHeight: Math.min(1900, room.height - 1100),
    wallEnd: corner === 'AD' || corner === 'CB' ? 'rechts' : 'links', // i18n-ok
    braces: type === 'freistehend',
    ...patch,
  })
  // Die Rückseite steht an der Wand: dort übernimmt die Wand die Absturzsicherung
  params.guardSides = { ...params.guardSides, hinten: false }
  const { length } = bedOuterSize(params)
  if (corner === 'AD') Object.assign(params, { x: room.length - length, y: 0, rotation: 0 })
  if (corner === 'AB') Object.assign(params, { x: 0, y: 0, rotation: 0 })
  if (corner === 'CB') Object.assign(params, { x: length, y: room.width, rotation: 180 })
  if (corner === 'CD') Object.assign(params, { x: room.length, y: room.width, rotation: 180 })
  if (type === 'nische') {
    Object.assign(params, { mattressLength: Math.max(1600, room.length - 2 * 80 - 20), x: 0, rotation: corner.startsWith('C') ? 180 : 0, y: corner.startsWith('C') ? room.width : 0 })
    if (corner.startsWith('C')) params.x = room.length
  }
  return params
}

/** Wände, an denen das Bett in dieser Ecke steht: Rückwand und Querwand */
export function cornerWalls(corner: Corner): { back: 'A' | 'C'; end: 'B' | 'D' } {
  return { back: corner[0] as 'A' | 'C', end: corner[1] as 'B' | 'D' }
}

/**
 * Günstigste Ecke für ein neues Bett: so wenig Fehler wie möglich, kein verbautes Fenster und keine
 * verstellte Tür (wiegt fast so schwer), dann möglichst wenige übrige Warnungen – wie im Assistenten.
 */
export function bestCorner(p: Project, type: BedType, patch: Partial<LoftBedParams>): Corner {
  let best: { c: Corner; score: number } | undefined
  for (const c of CORNERS) {
    const params = placeBed(p.room, type, patch, c)
    const q: Project = { ...p, assemblies: [...p.assemblies, { id: 'probe-neu', kind: 'hochbett', name: '', params, detached: [] }] }
    let score: number
    try {
      const f = analyze(q, resolveProject(q)).findings.filter((x) => x.targets.includes('probe-neu') || x.targets.some((t) => t.startsWith('probe-neu:')) || x.severity !== 'hinweis')
      const errors = f.filter((x) => x.severity === 'fehler').length
      const warnings = f.filter((x) => x.severity === 'warnung')
      const opening = warnings.filter((x) => x.category === 'Fenster & Tür').length // i18n-ok
      score = errors * 1000 + opening * 300 + (warnings.length - opening) * 40
    } catch {
      score = Infinity
    }
    if (!best || score < best.score) best = { c, score }
  }
  return best?.c ?? 'AD'
}

/**
 * Liegehöhe, bei der der Rahmen eines Betts ohne Pfosten auf den Schränken bzw. Regalen darunter
 * aufliegt (höchste Oberseite unter dem Bett). undefined, wenn dort kein solches Möbel steht.
 */
export function deckOnFurniture(p: Project, a: Assembly): number | undefined {
  const g = generateLoftBed(a, p.room.height, p.room)
  const frame = g.members.filter((m) => (m.role === 'zarge' || m.role === 'wandriegel') && Math.abs(m.start.z - m.end.z) < 5)
  if (!frame.length) return undefined
  const bottom = Math.min(...frame.map((m) => obbBounds(memberBoxes(m)[0]).min.z))
  const xs = g.info.footprint.map((q) => q.x)
  const ys = g.info.footprint.map((q) => q.y)
  const fp = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
  const under = p.furniture.filter((fu) => {
    if (!BEARING_FURNITURE.includes(fu.kind)) return false
    const rot = fu.rotation === 90 || fu.rotation === 270
    const sx = rot ? fu.sy : fu.sx
    const sy = rot ? fu.sx : fu.sy
    return Math.min(fp.x1, fu.x + sx) - Math.max(fp.x0, fu.x) > 50 && Math.min(fp.y1, fu.y + sy) - Math.max(fp.y0, fu.y) > 50
  })
  if (!under.length) return undefined
  const top = Math.max(...under.map((fu) => fu.z + fu.sz))
  return Math.round(a.params.deckHeight + top - bottom)
}

/** Zwei Regale unter Kopf- und Fußende eines Betts (Vorlage „Auf Regal/Schrank“) */
export function shelvesUnderBed(P: LoftBedParams, height = 1500, depth = 400): Furniture[] {
  const { length: Lo, width: Wo } = bedOuterSize(P)
  const world = (x: number, y: number) => {
    const r = rotate2(P.mirror ? Lo - x : x, y, P.rotation)
    return { x: P.x + r.x, y: P.y + r.y }
  }
  return [0, Lo - depth].map((x0) => {
    const c = [world(x0, 0), world(x0 + depth, Wo)]
    const x = Math.round(Math.min(c[0].x, c[1].x))
    const y = Math.round(Math.min(c[0].y, c[1].y))
    return { id: uid('regal'), kind: 'regal', name: tk('Regal'), x, y, z: 0, sx: Math.round(Math.abs(c[1].x - c[0].x)), sy: Math.round(Math.abs(c[1].y - c[0].y)), sz: height, rotation: 0 }
  })
}

/** Außenmaße des Gestells im Grundriss (ohne Leiter) */
export function bedBounds(P: LoftBedParams): { minX: number; maxX: number; minY: number; maxY: number } {
  const { length: Lo, width: Wo } = bedOuterSize(P)
  const pts = [
    [0, 0],
    [Lo, 0],
    [Lo, Wo],
    [0, Wo],
  ].map(([x, y]) => {
    const r = rotate2(P.mirror ? Lo - x : x, y, P.rotation)
    return { x: P.x + r.x, y: P.y + r.y }
  })
  const xs = pts.map((q) => q.x)
  const ys = pts.map((q) => q.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

/**
 * Ändern sich die Außenmaße (dickere Pfosten, andere Matratze), wächst das Bett von seiner Bezugsecke
 * aus – an einer Wand stehende Seiten würden in die Wand wandern. Deshalb bleibt der Abstand zu den
 * Wänden erhalten, an denen das Bett vorher stand (bis 5 cm, z. B. abgerückt um die Sockelleiste).
 */
export function keepWallContact(room: Room, before: LoftBedParams, after: LoftBedParams): LoftBedParams {
  const b = bedBounds(before)
  const a = bedBounds(after)
  const tol = 50
  const shift = (lo: number, hi: number, aLo: number, aHi: number, max: number) => {
    const atLo = lo < tol
    const atHi = max - hi < tol
    if (atHi && !atLo) return hi - aHi
    if (atLo && !atHi) return lo - aLo
    return 0
  }
  const dx = shift(b.minX, b.maxX, a.minX, a.maxX, room.length)
  const dy = shift(b.minY, b.maxY, a.minY, a.maxY, room.width)
  return dx || dy ? { ...after, x: Math.round(after.x + dx), y: Math.round(after.y + dy) } : after
}
