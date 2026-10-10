import { tk } from '../i18n'
import { uid } from './geometry'
import type { Project } from './types'

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
