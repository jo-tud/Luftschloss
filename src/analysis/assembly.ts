import { t, tk, tr } from '../i18n'
import { catalogItem } from '../model/catalog'
import { ceilingAt } from '../model/ceiling'
import { memberAxes, memberLength } from '../model/geometry'
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
      name: partBaseName(m.name ?? m.role),
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

/** Name ohne Lagezusatz („Pfosten hinten links“ → „Pfosten“) */
export function partBaseName(n: string): string {
  return n.replace(/\s+\d+$/, '').replace(/ (vorne|hinten|links|rechts|front|back|rear|left|right)( (links|rechts|left|right))?$/, '')
}

export interface BuildStep {
  title: string
  text: string
  memberIds: string[]
  panelIds: string[]
  tools: string[]
  /** Verbindungen, die in diesem Schritt hergestellt werden (beide Teile stehen dann) */
  joints: string[]
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
  const push = (title: string, text: string, ids: string[], panelIds: string[] = [], always = false) => {
    if (!ids.length && !panelIds.length && !always) return
    steps.push({ title, text, memberIds: ids, panelIds, tools: toolsFor(ids), joints: [] })
  }
  const isLadder = (m: Member) => !!m.partKey?.startsWith('leiter-')
  const isGuard = (m: Member) => m.role === 'stab' || (m.role === 'holm' && !isLadder(m)) || (m.role === 'pfosten' && Math.min(m.start.z, m.end.z) >= 5)
  const ceilingWarn = r.members.some((m) => m.role === 'pfosten' && [m.start, m.end].some((q) => q.z > ceilingAt(p.room, q.x, q.y) - 60))
  const byId = new Map(r.members.map((m) => [m.id, m]))
  const floorPost = (m: Member) => m.role === 'pfosten' && Math.min(m.start.z, m.end.z) < 5

  push(
    t('Zuschneiden, kennzeichnen, bearbeiten'),
    t('Alle Teile nach der Teileliste zuschneiden (am besten im Baumarkt), mit ihrer Nummer beschriften und die Bezugsseite markieren. Dann je Teil die Bearbeitungen aus dem Teile-Arbeitsplan: Ausklinkungen, Zapfen, Blätter, Querbohrungen. Gleiche Teile nebeneinanderspannen und gemeinsam anreißen.'),
    [],
    [],
    true,
  )
  push(t('Wandbalken anbringen'), t('Wandbalken waagrecht ausrichten (Wasserwaage), anzeichnen, bohren und mit Schwerlastdübeln oder Betonschrauben ca. alle 40 cm befestigen.'), take((m) => m.role === 'wandriegel'))

  // Seitenrahmen: eine Zarge mit mindestens zwei Pfosten wird liegend am Boden vormontiert
  const postsOf = new Map<string, Set<string>>()
  for (const j of r.joints) {
    for (const [z, q] of [
      [j.a, j.b],
      [j.b, j.a],
    ]) {
      const zm = byId.get(z)
      const qm = byId.get(q)
      if (zm?.role === 'zarge' && qm && floorPost(qm)) postsOf.set(z, (postsOf.get(z) ?? new Set()).add(q))
    }
  }
  const frames: { zargen: string[]; posts: Set<string> }[] = []
  const candidates = [...postsOf].filter(([, ps]) => ps.size >= 2).sort((a, b) => memberLength(byId.get(b[0])!) - memberLength(byId.get(a[0])!))
  for (const [z, ps] of candidates) {
    const own = frames.find((f) => [...ps].every((x) => f.posts.has(x)))
    if (own) {
      // weitere Zarge im selben Rahmen (z. B. untere Zarge beim Etagenbett), nur wenn parallel
      const a = memberAxes(byId.get(z)!)[0]
      const b = memberAxes(byId.get(own.zargen[0])!)[0]
      if (Math.abs(a.x * b.x + a.y * b.y + a.z * b.z) > 0.9) own.zargen.push(z)
      continue
    }
    if (frames.some((f) => [...ps].some((x) => f.posts.has(x)))) continue
    frames.push({ zargen: [z], posts: new Set(ps) })
  }
  if (frames.length >= 2 && !r.members.some((m) => m.role === 'wandriegel')) {
    frames.forEach((f, i) => {
      const ids = take((m) => f.posts.has(m.id) || f.zargen.includes(m.id))
      push(
        t('Seitenrahmen {i} am Boden vormontieren', { i: i + 1 }),
        t('Pfosten und Zarge flach auf Unterlagen legen, Lage anreißen und festspannen. Rechtwinklig ausrichten: Diagonalen messen, sie müssen auf 3 mm gleich sein. Dann die Verbindungen herstellen – Bolzenlöcher jetzt im Verbund bohren.') +
          (i === 0 ? ' ' + t('Ausklinkungen für Sockelleiste und Stuck vorher sägen.') : ''),
        ids,
      )
    })
    push(
      t('Aufrichten und verbinden'),
      t('Mit einem Helfer beide Rahmen aufrichten und mit Hilfslatten abstützen. Querzargen ansetzen, festspannen, die Verbindungen herstellen (Bolzen höhenversetzt zu den ersten). Pfosten mit der Wasserwaage ins Lot stellen und die Diagonalen in der Draufsicht prüfen.') +
        (ceilingWarn ? ' ' + t('Deckenhohe Pfosten erst stellen und dann mit dem Stellfuß gegen die Decke verspannen – nicht verkanten, Stuck nicht berühren.') : ''),
      take((m) => m.role === 'zarge' || floorPost(m)),
    )
  } else {
    push(
      t('Pfosten stellen'),
      t('Ausklinkungen (Sockelleiste, Stuck) vorher sägen. Pfosten lotrecht stellen und provisorisch abstützen.') +
        (ceilingWarn ? ' ' + t('Deckenhohe Pfosten erst stellen und dann mit dem Stellfuß gegen die Decke verspannen – nicht verkanten, Stuck nicht berühren.') : ''),
      take(floorPost),
    )
    push(t('Abhängung montieren'), t('Gewindestangen in tragfähige Decke (Balken!) verankern, unten mit Unterlegscheibe und Mutter.'), take((m) => m.catalogId === 'gewindestange-m10'))
    push(t('Zargen bzw. Träger anschrauben'), t('Längszargen und Querzargen auf Höhe anzeichnen, mit Schraubzwingen fixieren, rechtwinklig ausrichten (Diagonalen messen) und verschrauben.'), take((m) => m.role === 'zarge'))
  }
  push(t('Abhängung montieren'), t('Gewindestangen in tragfähige Decke (Balken!) verankern, unten mit Unterlegscheibe und Mutter.'), take((m) => m.catalogId === 'gewindestange-m10'))
  push(t('Aussteifung'), t('Kopfbänder 45° zuschneiden und verschrauben – erst danach steht das Gestell steif.'), take((m) => m.role === 'strebe'))
  const fixings = r.fixings.filter((f) => f.target === 'wand' && r.members.find((m) => m.id === f.memberId)?.role === 'pfosten')
  if (fixings.length)
    steps.push({ title: t('Kippsicherung'), text: t('{n} Pfosten mit Winkel und Rahmendübel an der Wand befestigen.', { n: fixings.length }), memberIds: [], panelIds: [], tools: [t('Bohrmaschine'), t('Steinbohrer 10 mm')], joints: [] })
  push(t('Querträger'), t('Querträger einsetzen bzw. auflegen und befestigen.'), take((m) => m.role === 'quertraeger'))
  const decks = r.panels.filter((x) => !x.vertical && x.kind !== 'matratze').map((x) => x.id)
  push(t('Liegefläche'), t('Latten bzw. Platte auflegen, ausrichten und gegen Verrutschen sichern. Filzstreifen gegen Quietschen.'), take((m) => m.role === 'leiste'), decks)
  const guardPanels = r.panels.filter((x) => x.vertical).map((x) => x.id)
  push(t('Geländer'), t('Geländerpfosten, Handläufe und Füllung montieren. Lücken höchstens 7,5 cm.'), take(isGuard), guardPanels)
  push(t('Leiter bzw. Treppe'), t('Leiter am Boden vormontieren (Sprossen bzw. Stufen einleimen, Diagonalen prüfen), dann einhängen bzw. anschrauben und gegen Verrutschen sichern.'), take(isLadder))
  push(t('Restliche Teile'), t('Übrige Teile nach Plan montieren.'), take(() => true))
  const mattress = r.panels.filter((x) => x.kind === 'matratze').map((x) => x.id)
  push(t('Matratze'), t('Matratze einlegen. Probeliegen: Wackelt etwas, Schrauben und Bolzen nachziehen.'), [], mattress)
  push(t('Nachziehen'), t('Nach 4–6 Wochen und zu Beginn der Heizperiode alle Bolzen und Schrauben nachziehen – das Holz schwindet im beheizten Raum.'), [], [], true)

  // jede Verbindung entsteht in dem Schritt, in dem ihr zweites Teil dazukommt
  const stepOf = new Map<string, number>()
  steps.forEach((st, i) => st.memberIds.forEach((id) => stepOf.set(id, i)))
  for (const j of r.joints) {
    const a = stepOf.get(j.a)
    const b = stepOf.get(j.b)
    if (a === undefined || b === undefined) continue
    steps[Math.max(a, b)].joints.push(j.key)
  }
  return steps
}

/** Längstes Teil gegen die Türdiagonale */
/**
 * Längstes Holz und wie es ins Zimmer kommt: Lange Teile werden der Länge nach waagrecht durch die Tür
 * getragen – die Tür begrenzt dann nur den Querschnitt. Entscheidend ist, wie weit es hinter der Tür
 * bis zur gegenüberliegenden Wand geht (depth) und wie lang ein Teil sein darf, das man beim
 * Hereintragen zur Decke hin anhebt (tilt). Flur und Treppenhaus kennt die App nicht.
 */
export function transportCheck(p: Project, r: Resolved): { longest: number; name: string; depth?: number; tilt?: number } {
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
  if (!door) return { longest, name }
  const depth = door.wall === 'A' || door.wall === 'C' ? p.room.width : p.room.length
  // beim Anheben 10 cm Luft zur Decke
  return { longest, name, depth, tilt: Math.hypot(depth, p.room.height - 100) }
}
