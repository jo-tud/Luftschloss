import { t, tr } from '../i18n'
import { memberBoxes, obbOverlap, panelOBB, type OBB } from '../model/geometry'
import { doorGeom, doorLeafBox, roomObstacles, sashBoxes, tiltBox, windowSashes, type SashGeom } from '../model/room'
import type { Resolved } from '../model/resolve'
import type { Project } from '../model/types'

export interface Blocker {
  id: string
  label: string
  boxes: OBB[]
  /** Art des Raumhindernisses (z. B. 'laibung'); fehlt bei Bauteilen und Flächen */
  kind?: string
}

/** Alles, woran ein Flügel oder Türblatt anstoßen kann */
export function blockers(p: Project, r: Resolved): Blocker[] {
  const out: Blocker[] = []
  for (const m of r.members) out.push({ id: m.id, label: m.name ? tr(m.name) : t('Bauteil'), boxes: memberBoxes(m) })
  for (const pa of r.panels) out.push({ id: pa.id, label: pa.name ? tr(pa.name) : t('Fläche'), boxes: [panelOBB(pa)] })
  for (const o of roomObstacles(p)) {
    if (o.kind === 'sockelleiste' || o.kind === 'steckdose' || o.kind === 'konvektion') continue
    out.push({ id: o.ownerId, label: tr(o.label), boxes: [o.box], kind: o.kind })
  }
  return out
}

export interface SwingResult {
  windowId: string
  sashIndex: number
  /** Größter freier Öffnungswinkel in Grad (bis 180) */
  maxAngle: number
  blockedBy?: { id: string; label: string }
  /** Kippstellung frei? (nur bei Kipp-/Drehkipp-Flügeln) */
  tiltFree?: boolean
  tiltBlockedBy?: { id: string; label: string }
}

function firstHit(boxes: OBB[], list: Blocker[], ignore: (b: Blocker) => boolean): Blocker | undefined {
  for (const b of list) {
    if (ignore(b)) continue
    for (const x of boxes) for (const y of b.boxes) if (obbOverlap(x, y) > 0.5) return b
  }
  return undefined
}

export function sweepSash(g: SashGeom, list: Blocker[], limit = 180): SwingResult {
  const ignore = (b: Blocker) => b.id === g.windowId && b.kind !== 'laibung'
  let max = limit
  let blockedBy: Blocker | undefined
  for (let deg = 2; deg <= limit; deg += 1) {
    const hit = firstHit(sashBoxes(g, deg), list, ignore)
    if (hit) {
      max = deg - 1
      blockedBy = hit
      break
    }
  }
  const res: SwingResult = { windowId: g.windowId, sashIndex: g.index, maxAngle: g.opening === 'fest' || g.opening === 'kipp' ? 0 : max, blockedBy: blockedBy && { id: blockedBy.id, label: blockedBy.label } }
  if (g.opening === 'kipp' || g.opening === 'drehkipp') {
    const hit = firstHit([tiltBox(g)], list, (b) => b.id === g.windowId)
    res.tiltFree = !hit
    if (hit) res.tiltBlockedBy = { id: hit.id, label: hit.label }
  }
  return res
}

export function analyzeWindows(p: Project, r: Resolved): SwingResult[] {
  const list = blockers(p, r)
  const out: SwingResult[] = []
  for (const w of p.wallObjects) {
    if (w.kind !== 'fenster') continue
    for (const g of windowSashes(p.room, w)) out.push(sweepSash(g, list))
  }
  return out
}

export interface DoorResult {
  doorId: string
  maxAngle: number
  blockedBy?: { id: string; label: string }
}

export function analyzeDoors(p: Project, r: Resolved): DoorResult[] {
  const list = blockers(p, r)
  const out: DoorResult[] = []
  for (const d of p.wallObjects) {
    if (d.kind !== 'tuer') continue
    const g = doorGeom(p.room, d)
    let max = 120
    let blocked: Blocker | undefined
    for (let deg = 2; deg <= 120; deg++) {
      const hit = firstHit([doorLeafBox(g, deg)], list, (b) => b.id === d.id)
      if (hit) {
        max = deg - 1
        blocked = hit
        break
      }
    }
    out.push({ doorId: d.id, maxAngle: max, blockedBy: blocked && { id: blocked.id, label: blocked.label } })
  }
  return out
}
