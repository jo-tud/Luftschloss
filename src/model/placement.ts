import { analyze } from '../analysis/checks'
import { defaultBedParams } from './defaults'
import { resolveProject } from './resolve'
import { bedOuterSize } from './loftbed'
import type { BedType, LoftBedParams, Project, Room } from './types'

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
