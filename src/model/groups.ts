import { tk } from '../i18n'
import { memberBoxes, obbBounds, uid } from './geometry'
import type { BedGroup, Member, Project } from './types'

/**
 * Selbst konstruierte Betten: freie Teile, unter einem Namen zusammengefasst. Die Teile bleiben
 * frei bearbeitbar; das Bett lässt sich als Ganzes auswählen, verschieben und löschen.
 */

/** Fasst freie Teile zu einem Bett zusammen und gibt dessen ID zurück */
export function createGroup(d: Project, ids: string[]): string {
  const id = uid('eigenbett')
  d.groups.push({ id, name: tk('Eigenes Bett') })
  for (const m of d.members) if (ids.includes(m.id) && !m.groupId) m.groupId = id
  for (const x of d.panels) if (ids.includes(x.id) && !x.groupId) x.groupId = id
  // Liegefläche gleich festlegen: eine mitgewählte Matratze (z. B. aus einem aufgelösten Bett) wird
  // zur Liegefläche des Betts, sonst ein Vorschlag aus den Hölzern; lässt sich im Bett anpassen
  const g = d.groups[d.groups.length - 1]
  const mat = d.panels.find((x) => x.groupId === id && x.kind === 'matratze' && !x.vertical)
  if (mat) {
    const xs = mat.outline.map((q) => q.x)
    const ys = mat.outline.map((q) => q.y)
    g.deck = { x: Math.min(...xs), y: Math.min(...ys), length: Math.max(...xs) - Math.min(...xs), width: Math.max(...ys) - Math.min(...ys), z: mat.z, thickness: mat.thickness }
    d.panels = d.panels.filter((x) => !(x.groupId === id && x.kind === 'matratze'))
  } else g.deck = detectDeck(d, id)
  return id
}

/** Löst die Zusammenfassung: die Teile werden wieder einzelne freie Teile */
export function ungroup(d: Project, groupId: string): string[] {
  const ids: string[] = []
  for (const m of d.members) if (m.groupId === groupId) (delete m.groupId, ids.push(m.id))
  for (const x of d.panels) if (x.groupId === groupId) (delete x.groupId, ids.push(x.id))
  d.groups = d.groups.filter((g) => g.id !== groupId)
  return ids
}

/** Löscht das Bett mit allen seinen Teilen */
export function deleteGroup(d: Project, groupId: string) {
  d.members = d.members.filter((m) => m.groupId !== groupId)
  d.panels = d.panels.filter((x) => x.groupId !== groupId)
  d.groups = d.groups.filter((g) => g.id !== groupId)
}

/** Teile eines Betts */
export function groupParts(p: Project, groupId: string): string[] {
  return [...p.members.filter((m) => m.groupId === groupId).map((m) => m.id), ...p.panels.filter((x) => x.groupId === groupId).map((x) => x.id)]
}

/** Betten ohne Teile entfernen (z. B. nachdem das letzte Teil gelöscht wurde) */
export function pruneGroups(d: Project) {
  d.groups = d.groups.filter((g) => d.members.some((m) => m.groupId === g.id) || d.panels.some((x) => x.groupId === g.id))
}

/**
 * Liegefläche eines eigenen Betts vorschlagen: die größte waagrechte Platte des Betts, sonst die
 * Ebene mit den meisten waagrechten Hölzern (Latten bzw. Querträger; bei Gleichstand die tiefere,
 * damit nicht der Handlauf gewählt wird). Die Matratze deckt deren Umriss ab.
 */
export function detectDeck(p: Project, groupId: string): BedGroup['deck'] | undefined {
  const thickness = 160
  const sheets = p.panels.filter((x) => x.groupId === groupId && !x.vertical && x.kind !== 'matratze')
  if (sheets.length) {
    const box = (o: { x: number; y: number }[]) => ({ x0: Math.min(...o.map((q) => q.x)), x1: Math.max(...o.map((q) => q.x)), y0: Math.min(...o.map((q) => q.y)), y1: Math.max(...o.map((q) => q.y)) })
    const best = sheets.map((x) => ({ x, b: box(x.outline) })).sort((a, b) => (b.b.x1 - b.b.x0) * (b.b.y1 - b.b.y0) - (a.b.x1 - a.b.x0) * (a.b.y1 - a.b.y0))[0]
    return { x: Math.round(best.b.x0), y: Math.round(best.b.y0), length: Math.round(best.b.x1 - best.b.x0), width: Math.round(best.b.y1 - best.b.y0), z: Math.round(best.x.z + best.x.thickness), thickness }
  }
  const flat = p.members.filter((m) => m.groupId === groupId && Math.abs(m.start.z - m.end.z) < 2)
  const levels = new Map<number, Member[]>()
  for (const m of flat) {
    const top = Math.round(((m.start.z + m.end.z) / 2 + m.h / 2) / 5) * 5
    levels.set(top, [...(levels.get(top) ?? []), m])
  }
  const pick = [...levels.entries()].filter(([, ms]) => ms.length >= 2).sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0]
  if (!pick) return undefined
  const bounds = pick[1].flatMap((m) => memberBoxes(m).map(obbBounds))
  const x0 = Math.min(...bounds.map((b) => b.min.x))
  const x1 = Math.max(...bounds.map((b) => b.max.x))
  const y0 = Math.min(...bounds.map((b) => b.min.y))
  const y1 = Math.max(...bounds.map((b) => b.max.y))
  return { x: Math.round(x0), y: Math.round(y0), length: Math.round(x1 - x0), width: Math.round(y1 - y0), z: pick[0], thickness }
}
