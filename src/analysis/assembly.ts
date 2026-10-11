import { t, tk, tr } from '../i18n'
import { catalogItem } from '../model/catalog'
import { ceilingAt } from '../model/ceiling'
import { memberLength } from '../model/geometry'
import { CARPENTRY, cutLengths } from '../model/joinery'

const JOINERY_LABEL: Record<string, string> = {
  ueberblattung: tk('Blatt'),
  zapfen: tk('Zapfen bzw. Zapfenloch'),
  schwalbenschwanz: tk('Schwalbenschwanz'),
  gratnut: tk('Gratnut bzw. Grat'),
  ausklinkung: tk('Einlassung'),
  stecken: tk('Bohrung bzw. Stab'),
  auflagerleiste: tk('Auflagerleiste'),
}
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
  /** Holzverbindungen an diesem Teil (Zapfen, Blatt, …) */
  joinery: string[]
  roles: string[]
}

function partKey(m: Member, len: number, joinery: string): string {
  const notches = (m.notches ?? []).map((n) => `${n.reason.split(' ')[0]}:${Math.round(n.length)}x${Math.round(n.depth)}`).sort().join(',')
  return `${m.catalogId}|${Math.round(len)}|${Math.min(m.b, m.h)}x${Math.max(m.b, m.h)}|${notches}|${joinery}`
}

export function partTypes(r: Resolved): { parts: PartType[]; byMember: Map<string, number> } {
  const groups = new Map<string, Member[]>()
  const cutLen = cutLengths(r.joints, r.members)
  const len = (m: Member) => cutLen.get(m.id) ?? memberLength(m)
  // Holzverbindungen an den Enden gehören zur Teilenummer (anderes Werkstück)
  const joinery = new Map<string, string[]>()
  for (const j of r.joints)
    if (CARPENTRY.has(j.typeId)) for (const id of [j.a, j.b]) joinery.set(id, [...(joinery.get(id) ?? []), JOINERY_LABEL[j.typeId] ?? j.typeId])
  for (const m of r.members) {
    const k = partKey(m, len(m), (joinery.get(m.id) ?? []).sort().join(','))
    groups.set(k, [...(groups.get(k) ?? []), m])
  }
  const roleOrder = ['pfosten', 'wandriegel', 'zarge', 'quertraeger', 'strebe', 'leiste', 'holm', 'stab', 'stufe', 'sprosse', 'sonstiges']
  const list = [...groups.values()].sort((a, b) => roleOrder.indexOf(a[0].role) - roleOrder.indexOf(b[0].role) || len(b[0]) - len(a[0]))
  const byMember = new Map<string, number>()
  const parts = list.map((ms, i) => {
    const m = ms[0]
    for (const x of ms) byMember.set(x.id, i + 1)
    return {
      no: i + 1,
      catalogId: m.catalogId,
      name: baseName(m.name ?? m.role),
      length: Math.round(len(m)),
      joinery: [...new Set(joinery.get(m.id) ?? [])],
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
  return n.replace(/\s+\d+$/, '').replace(/ (vorne|hinten|links|rechts|front|back|rear|left|right)( (links|rechts|left|right))?$/, '')
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
    for (const j of r.joints) if (idSet.has(j.a) || idSet.has(j.b)) jointType(j.typeId)?.tools.forEach((x) => set.add(tr(x)))
    return [...set]
  }
  const push = (title: string, text: string, ids: string[], panelIds: string[] = []) => {
    if (!ids.length && !panelIds.length) return
    steps.push({ title, text, memberIds: ids, panelIds, tools: toolsFor(ids) })
  }
  const isLadder = (m: Member) => !!m.partKey?.startsWith('leiter-')
  const isGuard = (m: Member) => m.role === 'stab' || (m.role === 'holm' && !isLadder(m)) || (m.role === 'pfosten' && Math.min(m.start.z, m.end.z) >= 5)
  const ceilingWarn = r.members.some((m) => m.role === 'pfosten' && [m.start, m.end].some((q) => q.z > ceilingAt(p.room, q.x, q.y) - 60))

  push(t('Wandbalken anbringen'), t('Wandbalken waagrecht ausrichten (Wasserwaage), anzeichnen, bohren und mit Schwerlastdübeln oder Betonschrauben ca. alle 40 cm befestigen.'), take((m) => m.role === 'wandriegel'))
  push(
    t('Pfosten stellen'),
    t('Ausklinkungen (Sockelleiste, Stuck) vorher sägen. Pfosten lotrecht stellen und provisorisch abstützen.') +
      (ceilingWarn ? ' ' + t('Deckenhohe Pfosten erst stellen und dann mit dem Stellfuß gegen die Decke verspannen – nicht verkanten, Stuck nicht berühren.') : ''),
    take((m) => m.role === 'pfosten' && Math.min(m.start.z, m.end.z) < 5),
  )
  push(t('Abhängung montieren'), t('Gewindestangen in tragfähige Decke (Balken!) verankern, unten mit Unterlegscheibe und Mutter.'), take((m) => m.catalogId === 'gewindestange-m10'))
  push(t('Zargen bzw. Träger anschrauben'), t('Längszargen und Querzargen auf Höhe anzeichnen, mit Schraubzwingen fixieren, rechtwinklig ausrichten (Diagonalen messen) und verschrauben.'), take((m) => m.role === 'zarge'))
  push(t('Aussteifung'), t('Kopfbänder 45° zuschneiden und verschrauben – erst danach steht das Gestell steif.'), take((m) => m.role === 'strebe'))
  const fixings = r.fixings.filter((f) => f.target === 'wand' && r.members.find((m) => m.id === f.memberId)?.role === 'pfosten')
  if (fixings.length) steps.push({ title: t('Kippsicherung'), text: t('{n} Pfosten mit Winkel und Rahmendübel an der Wand befestigen.', { n: fixings.length }), memberIds: [], panelIds: [], tools: [t('Bohrmaschine'), t('Steinbohrer 10 mm')] })
  push(t('Querträger'), t('Querträger einsetzen bzw. auflegen und befestigen.'), take((m) => m.role === 'quertraeger'))
  const decks = r.panels.filter((x) => !x.vertical && x.kind !== 'matratze').map((x) => x.id)
  push(t('Liegefläche'), t('Latten bzw. Platte auflegen, ausrichten und gegen Verrutschen sichern. Filzstreifen gegen Quietschen.'), take((m) => m.role === 'leiste'), decks)
  const guardPanels = r.panels.filter((x) => x.vertical).map((x) => x.id)
  push(t('Geländer'), t('Geländerpfosten, Handläufe und Füllung montieren. Lücken höchstens 7,5 cm.'), take(isGuard), guardPanels)
  push(t('Leiter bzw. Treppe'), t('Leiter vormontieren (Sprossen/Stufen einleimen), einhängen bzw. anschrauben, gegen Verrutschen sichern.'), take(isLadder))
  push(t('Restliche Teile'), t('Übrige Teile nach Plan montieren.'), take(() => true))
  const mattress = r.panels.filter((x) => x.kind === 'matratze').map((x) => x.id)
  push(t('Matratze'), t('Matratze einlegen, Schrauben nach einigen Wochen nachziehen.'), [], mattress)
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
      name = m.name ?? t('Bauteil')
    }
  }
  const door = p.wallObjects.find((o) => o.kind === 'tuer')
  return { longest, name, door: door && door.kind === 'tuer' ? Math.hypot(door.width, door.height) : undefined }
}
