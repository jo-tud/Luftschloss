import { catalogItem } from '../model/catalog'
import { memberLength } from '../model/geometry'
import { jointType } from '../model/joints'
import type { Resolved } from '../model/resolve'
import type { Member, Project } from '../model/types'

/** Gleiche Teile (Material, Länge, Querschnitt, Bearbeitung) bekommen dieselbe Nummer. */
export interface PartType {
  no: number
  catalogId: string
  name: string
  length: number
  b: number
  h: number
  round?: boolean
  count: number
  memberIds: string[]
  notches: { reason: string; length: number; depth: number }[]
  roles: string[]
}

function partKey(m: Member): string {
  const notches = (m.notches ?? []).map((n) => `${n.reason.split(' ')[0]}:${Math.round(n.length)}x${Math.round(n.depth)}`).sort().join(',')
  return `${m.catalogId}|${Math.round(memberLength(m))}|${Math.min(m.b, m.h)}x${Math.max(m.b, m.h)}|${notches}`
}

export function partTypes(r: Resolved): { parts: PartType[]; byMember: Map<string, number> } {
  const groups = new Map<string, Member[]>()
  for (const m of r.members) {
    const k = partKey(m)
    groups.set(k, [...(groups.get(k) ?? []), m])
  }
  const roleOrder = ['pfosten', 'wandriegel', 'zarge', 'quertraeger', 'strebe', 'leiste', 'holm', 'stab', 'stufe', 'sprosse', 'sonstiges']
  const list = [...groups.values()].sort((a, b) => roleOrder.indexOf(a[0].role) - roleOrder.indexOf(b[0].role) || memberLength(b[0]) - memberLength(a[0]))
  const byMember = new Map<string, number>()
  const parts = list.map((ms, i) => {
    const m = ms[0]
    for (const x of ms) byMember.set(x.id, i + 1)
    return {
      no: i + 1,
      catalogId: m.catalogId,
      name: baseName(m.name ?? m.role),
      length: Math.round(memberLength(m)),
      b: Math.min(m.b, m.h),
      h: Math.max(m.b, m.h),
      round: m.round,
      count: ms.length,
      memberIds: ms.map((x) => x.id),
      notches: (m.notches ?? []).map((n) => ({ reason: n.reason, length: Math.round(n.length), depth: Math.round(n.depth) })),
      roles: [...new Set(ms.map((x) => x.role))],
    }
  })
  return { parts, byMember }
}

function baseName(n: string): string {
  return n.replace(/\s+\d+$/, '').replace(/ (vorne|hinten|links|rechts)( (links|rechts))?$/, '')
}

export interface BuildStep {
  title: string
  text: string
  memberIds: string[]
  panelIds: string[]
  tools: string[]
}

/** Sinnvolle Montagereihenfolge aus Rollen und Lage der Teile */
export function buildSteps(p: Project, r: Resolved): BuildStep[] {
  const steps: BuildStep[] = []
  const used = new Set<string>()
  const take = (pred: (m: Member) => boolean) => {
    const ids = r.members.filter((m) => !used.has(m.id) && pred(m)).map((m) => m.id)
    ids.forEach((id) => used.add(id))
    return ids
  }
  const toolsFor = (ids: string[]) => {
    const set = new Set<string>()
    const idSet = new Set(ids)
    for (const j of r.joints) if (idSet.has(j.a) || idSet.has(j.b)) jointType(j.typeId)?.tools.forEach((t) => set.add(t))
    return [...set]
  }
  const push = (title: string, text: string, ids: string[], panelIds: string[] = []) => {
    if (!ids.length && !panelIds.length) return
    steps.push({ title, text, memberIds: ids, panelIds, tools: toolsFor(ids) })
  }
  const isLadder = (m: Member) => !!m.partKey?.startsWith('leiter-')
  const isGuard = (m: Member) => m.role === 'stab' || (m.role === 'holm' && !isLadder(m)) || m.name?.startsWith('Geländerpfosten') === true
  const ceilingWarn = r.members.some((m) => m.role === 'pfosten' && Math.max(m.start.z, m.end.z) > p.room.height - 60)

  push('Wandbalken anbringen', 'Wandbalken waagrecht ausrichten (Wasserwaage), anzeichnen, bohren und mit Schwerlastdübeln oder Betonschrauben ca. alle 40 cm befestigen.', take((m) => m.role === 'wandriegel'))
  push(
    'Pfosten stellen',
    `Ausklinkungen (Sockelleiste, Stuck) vorher sägen. Pfosten lotrecht stellen und provisorisch abstützen.${ceilingWarn ? ' Deckenhohe Pfosten erst stellen und dann mit dem Stellfuß gegen die Decke verspannen – nicht verkanten, Stuck nicht berühren.' : ''}`,
    take((m) => m.role === 'pfosten' && Math.min(m.start.z, m.end.z) < 5),
  )
  push('Abhängung montieren', 'Gewindestangen in tragfähige Decke (Balken!) verankern, unten mit Unterlegscheibe und Mutter.', take((m) => m.catalogId === 'gewindestange-m10'))
  push('Zargen bzw. Träger anschrauben', 'Längszargen und Querzargen auf Höhe anzeichnen, mit Schraubzwingen fixieren, rechtwinklig ausrichten (Diagonalen messen) und verschrauben.', take((m) => m.role === 'zarge'))
  push('Aussteifung', 'Kopfbänder 45° zuschneiden und verschrauben – erst danach steht das Gestell steif.', take((m) => m.role === 'strebe'))
  const fixings = r.fixings.filter((f) => f.target === 'wand' && r.members.find((m) => m.id === f.memberId)?.role === 'pfosten')
  if (fixings.length) steps.push({ title: 'Kippsicherung', text: `${fixings.length} Pfosten mit Winkel und Rahmendübel an der Wand befestigen.`, memberIds: [], panelIds: [], tools: ['Bohrmaschine', 'Steinbohrer 10 mm'] })
  push('Querträger', 'Querträger einsetzen bzw. auflegen und befestigen.', take((m) => m.role === 'quertraeger'))
  const decks = r.panels.filter((x) => !x.vertical && x.kind !== 'matratze').map((x) => x.id)
  push('Liegefläche', 'Latten bzw. Platte auflegen, ausrichten und gegen Verrutschen sichern. Filzstreifen gegen Quietschen.', take((m) => m.role === 'leiste'), decks)
  const guardPanels = r.panels.filter((x) => x.vertical).map((x) => x.id)
  push('Geländer', 'Geländerpfosten, Handläufe und Füllung montieren. Lücken höchstens 7,5 cm.', take(isGuard), guardPanels)
  push('Leiter bzw. Treppe', 'Leiter vormontieren (Sprossen/Stufen einleimen), einhängen bzw. anschrauben, gegen Verrutschen sichern.', take(isLadder))
  push('Restliche Teile', 'Übrige Teile nach Plan montieren.', take(() => true))
  const mattress = r.panels.filter((x) => x.kind === 'matratze').map((x) => x.id)
  push('Matratze', 'Matratze einlegen, Schrauben nach einigen Wochen nachziehen.', [], mattress)
  return steps
}

/** Längstes Teil gegen die Türdiagonale */
export function transportCheck(p: Project, r: Resolved): { longest: number; name: string; door?: number } {
  let longest = 0
  let name = ''
  for (const m of r.members) {
    const item = catalogItem(m.catalogId)
    if (item?.kind !== 'stab') continue
    const L = memberLength(m)
    if (L > longest) {
      longest = L
      name = m.name ?? 'Bauteil'
    }
  }
  const door = p.wallObjects.find((o) => o.kind === 'tuer')
  return { longest, name, door: door && door.kind === 'tuer' ? Math.hypot(door.width, door.height) : undefined }
}
