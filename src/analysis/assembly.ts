import { t, tk, tr } from '../i18n'
import { catalogItem } from '../model/catalog'
import { ceilingAt } from '../model/ceiling'
import { dot, memberAxes, memberBoxes, memberLength, sub } from '../model/geometry'
import { allFasteners, type Fastener } from '../model/fasteners'
import { CARPENTRY, cutLengths } from '../model/joinery'

const JOINERY_LABEL: Record<string, string> = {
  ueberblattung: tk('Blatt'),
  zapfen: tk('Zapfen bzw. Zapfenloch'),
  schwalbenschwanz: tk('Schwalbenschwanz'),
  gratnut: tk('Gratnut bzw. Grat'),
  nut: tk('Nut'),
  knagge: tk('Knagge'),
  ausklinkung: tk('Einlassung'),
  stecken: tk('Bohrung bzw. Stab'),
  auflagerleiste: tk('Auflagerleiste'),
}
import { jointVariant } from '../model/jointPlan'
import type { Resolved } from '../model/resolve'
import type { Member, Project, Vec3 } from '../model/types'

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

function partKey(m: Member, len: number, joinery: string, holes: string): string {
  const notches = (m.notches ?? []).map((n) => `${n.reason.split(' ')[0]}:${Math.round(n.length)}x${Math.round(n.depth)}`).sort().join(',')
  return `${m.catalogId}|${Math.round(len)}|${Math.min(m.b, m.h)}x${Math.max(m.b, m.h)}|${notches}|${joinery}|${holes}`
}

/**
 * Bohrbild eines Teils als Schlüssel: Eintrittspunkte, Richtung und Ø aller Bohrungen in Stabkoordinaten,
 * unabhängig davon, wie herum das Teil liegt (Enden getauscht, um die Achse gedreht). Gespiegelte
 * Teile (links/rechts) bekommen so eine eigene Nummer und eine eigene Zeichnung.
 */
function holeKey(m: Member, fs: Fastener[]): string {
  const ax = memberAxes(m)
  const L = memberLength(m)
  const boxes = memberBoxes(m)
  const inM = (p: { x: number; y: number; z: number }) => boxes.some((o) => o.axes.every((a, i) => Math.abs(dot(sub(p, o.center), a)) <= o.half[i] + 0.5))
  const holes: number[][] = []
  for (const f of fs) {
    if (!f.drill || f.kind === 'blech' || f.kind === 'stangenmutter') continue
    for (let k = 0; k <= 40; k++) {
      const q = { x: f.head.x + (f.dir.x * f.length * k) / 40, y: f.head.y + (f.dir.y * f.length * k) / 40, z: f.head.z + (f.dir.z * f.length * k) / 40 }
      if (!inM(q)) continue
      const r = sub(q, m.start)
      holes.push([dot(r, ax[0]), dot(r, ax[1]), dot(r, ax[2]), dot(f.dir, ax[0]), dot(f.dir, ax[1]), dot(f.dir, ax[2]), f.drill])
      break
    }
  }
  // Ausklinkungen (Sockelleiste, Stuck) mit ihrer Seite: Pfosten an verschiedenen Wänden sind verschiedene Teile
  for (const n of m.notches ?? []) {
    const s = n.side[0] === '+' ? 1 : -1
    const onB = n.side[1] === 'b'
    holes.push([n.along + n.length / 2, onB ? (s * m.b) / 2 : 0, onB ? 0 : (s * m.h) / 2, 0, onB ? s : 0, onB ? 0 : s, -Math.round(n.depth)])
  }
  if (!holes.length) return ''
  const square = Math.abs(m.b - m.h) < 1
  const sig = (flip: boolean, rot: number) =>
    holes
      .map(([u, v, w, du, dv, dw, d]) => {
        // Ende tauschen = 180° um die w-Achse drehen, dann rot · 90° um die Stabachse
        let [U, V, W, dU, dV, dW] = flip ? [L - u, -v, w, -du, -dv, dw] : [u, v, w, du, dv, dw]
        for (let i = 0; i < rot; i++) [V, W, dV, dW] = [-W, V, -dW, dV]
        return [U, V, W].map((x) => Math.round(x / 2) * 2).join(',') + '>' + [dU, dV, dW].map((x) => Math.round(x * 10)).join(',') + '/' + d
      })
      .sort()
      .join(';')
  const all: string[] = []
  for (const flip of [false, true]) for (const rot of square ? [0, 1, 2, 3] : [0, 2]) all.push(sig(flip, rot))
  return all.sort()[0]
}

export function partTypes(r: Resolved): { parts: PartType[]; byMember: Map<string, number> } {
  const groups = new Map<string, Member[]>()
  const cutLen = cutLengths(r.joints, r.members)
  const len = (m: Member) => cutLen.get(m.id) ?? memberLength(m)
  // Holzverbindungen an den Enden gehören zur Teilenummer (anderes Werkstück)
  const joinery = new Map<string, string[]>()
  for (const j of r.joints)
    if (CARPENTRY.has(j.typeId)) for (const id of [j.a, j.b]) joinery.set(id, [...(joinery.get(id) ?? []), JOINERY_LABEL[j.typeId] ?? j.typeId])
  // Befestigungsmittel je Bauteil (für das Bohrbild)
  const fsOf = new Map<string, Fastener[]>()
  const jointOf = new Map(r.joints.map((j) => [j.key, j]))
  for (const f of allFasteners(r)) {
    const j = jointOf.get(f.joint)
    if (j) for (const id of [j.a, j.b]) fsOf.set(id, [...(fsOf.get(id) ?? []), f])
  }
  for (const m of r.members) {
    const k = partKey(m, len(m), (joinery.get(m.id) ?? []).sort().join(','), holeKey(m, fsOf.get(m.id) ?? []))
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
  // Werkzeug nur für Verbindungen, die in diesem Schritt entstehen (beide Teile stehen dann)
  const toolsFor = (ids: string[]) => {
    const set = new Set<string>()
    const idSet = new Set(ids)
    for (const j of r.joints) if ((idSet.has(j.a) || idSet.has(j.b)) && used.has(j.a) && used.has(j.b)) jointVariant(j.typeId, j, byId)?.tools.forEach((x) => set.add(tr(x)))
    return [...set]
  }
  const push = (title: string, text: string, ids: string[], panelIds: string[] = [], always = false) => {
    if (!ids.length && !panelIds.length && !always) return
    steps.push({ title, text, memberIds: ids, panelIds, tools: toolsFor(ids), joints: [] })
  }
  const isLadder = (m: Member) => !!m.partKey?.startsWith('leiter-')
  // Haltegriffe gehören zum Geländer (Handlauf und Bretter hängen an ihnen); die Wange wird danach an ihnen verbolzt
  const isGuard = (m: Member) => m.role === 'stab' || (m.role === 'holm' && (!isLadder(m) || !!m.partKey?.startsWith('leiter-griff'))) || (m.role === 'pfosten' && Math.min(m.start.z, m.end.z) >= 5)
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
      const diag = frameDiagonal(f, byId)
      const inset = postInset(f, byId)
      const ids = take((m) => f.posts.has(m.id) || f.zargen.includes(m.id))
      push(
        t('Seitenrahmen {i} am Boden vormontieren', { i: i + 1 }),
        t('Pfosten und Zarge flach auf Unterlagen legen, Lage anreißen und festspannen. Rechtwinklig ausrichten: Diagonalen messen, sie müssen auf 3 mm gleich sein. Dann die Verbindungen herstellen – Bolzenlöcher jetzt im Verbund bohren.') +
          (inset > 5 ? ' ' + t('Die Pfosten sitzen {d} mm vom Zargenende eingerückt – dort liegt später die Querzarge.', { d: inset }) : '') +
          (diag ? ' ' + t('Sollmaß der Diagonalen (Pfostenfuß außen bis Oberkante Zarge am anderen Pfosten außen): {d} mm.', { d: diag }) : '') +
          (i === 0 ? ' ' + t('Ausklinkungen für Sockelleiste und Stuck vorher sägen.') : ''),
        ids,
      )
    })
    const planDiag = footprintDiagonal([...new Set(frames.flatMap((f) => [...f.posts]))].map((id) => byId.get(id)!))
    const atWall = r.fixings.some((f) => f.target === 'wand')
    push(
      t('Aufrichten und verbinden'),
      (atWall ? t('Das Bett steht später an der Wand: etwa 60 cm davor aufbauen, alle Bolzen bohren und anziehen und erst dann anschieben – an der Wand kommt man an Köpfe und Muttern nicht heran (zum Nachziehen kurz abrücken).') + ' ' : '') +
        t('Mit einem Helfer beide Rahmen aufrichten und mit Hilfslatten abstützen. Querzargen bzw. die ersten Querträger ansetzen, festspannen, die Verbindungen herstellen (Bolzen höhenversetzt zu den ersten). Pfosten mit der Wasserwaage ins Lot stellen und die Diagonalen in der Draufsicht prüfen.') +
        (planDiag ? ' ' + t('Sollmaß in der Draufsicht (Pfostenecke außen zu Pfostenecke außen): {d} mm.', { d: planDiag }) : '') +
        (ceilingWarn ? ' ' + t('Deckenhohe Pfosten erst stellen und dann mit dem Stellfuß gegen die Decke verspannen – nicht verkanten, Stuck nicht berühren.') : ''),
      take((m) => m.role === 'zarge' || floorPost(m)),
      [],
      true,
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
  if (fixings.length) {
    // Text aus der Befestigung selbst (Winkel bzw. durch die Zarge), je Art einmal
    const notes = [...new Set(fixings.map((f) => f.note))]
    steps.push({ title: t('Kippsicherung'), text: notes.map((n) => t('{n} ×: {note}.', { n: fixings.filter((f) => f.note === n).length, note: n })).join(' '), memberIds: [], panelIds: [], tools: [t('Bohrmaschine'), t('Steinbohrer 10 mm')], joints: [] })
  }
  push(t('Querträger'), t('Querträger einsetzen bzw. auflegen und befestigen.'), take((m) => m.role === 'quertraeger'))
  const decks = r.panels.filter((x) => !x.vertical && x.kind !== 'matratze').map((x) => x.id)
  // aufgelegt mit Latten: die verschraubten Latten halten die beiden Seitenrahmen zusammen
  const screwedSlats = r.joints.some((j) => j.typeId === 'auflage' && [j.a, j.b].some((id) => r.members.find((m) => m.id === id)?.role === 'leiste'))
  push(
    t('Liegefläche'),
    screwedSlats
      ? t('Erste und letzte Latte sofort an beiden Enden auf die Zargen schrauben (je 2 Schrauben, vorbohren), dann alle übrigen. Erst danach hält das Gestell quer zusammen.')
      : t('Latten bzw. Platte auflegen, ausrichten und gegen Verrutschen sichern. Filzstreifen gegen Quietschen.'),
    take((m) => m.role === 'leiste'),
    decks,
  )
  const guardPanels = r.panels.filter((x) => x.vertical).map((x) => x.id)
  push(t('Geländer'), t('Geländerpfosten, Handläufe und Füllung montieren. Lücken höchstens 7,5 cm.'), take(isGuard), guardPanels)
  push(t('Leiter bzw. Treppe'), t('Leiter am Boden vormontieren (Sprossen bzw. Stufen einleimen und verschrauben, Diagonalen prüfen). Anstellen: Fuß flach auf den Boden, Kopfschnitt an die Zarge, seitlich an die Haltegriffe – dann mit den Griffen verbolzen.'), take(isLadder))
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

/** Zargen außen: wie weit die Pfosten vom Zargenende eingerückt sitzen (0 bei Zargen zwischen den Pfosten) */
function postInset(f: { zargen: string[]; posts: Set<string> }, byId: Map<string, Member>): number {
  const z = byId.get(f.zargen[0])
  if (!z) return 0
  const a = memberAxes(z)[0]
  const at = (q: Vec3) => q.x * a.x + q.y * a.y + q.z * a.z
  const r0 = Math.min(at(z.start), at(z.end))
  const r1 = Math.max(at(z.start), at(z.end))
  const posts = [...f.posts].map((id) => byId.get(id)!).filter(Boolean)
  if (!posts.length) return 0
  const half = (m: Member) => Math.abs(memberAxes(m)[1].x * a.x + memberAxes(m)[1].y * a.y) * (m.b / 2) + Math.abs(memberAxes(m)[2].x * a.x + memberAxes(m)[2].y * a.y) * (m.h / 2)
  const lo = Math.min(...posts.map((m) => at(m.start) - half(m)))
  const hi = Math.max(...posts.map((m) => at(m.start) + half(m)))
  return Math.round(Math.min(lo - r0, r1 - hi))
}

/**
 * Diagonale eines liegend vormontierten Seitenrahmens: vom Fuß des einen Pfostens (außen) bis zur
 * Oberkante der Zarge am anderen Pfosten (außen), in mm gerundet.
 */
function frameDiagonal(f: { zargen: string[]; posts: Set<string> }, byId: Map<string, Member>): number | undefined {
  const ps = [...f.posts].map((id) => byId.get(id)).filter((m): m is Member => !!m)
  const z = byId.get(f.zargen[0])
  if (ps.length < 2 || !z) return undefined
  const [a, b] = ps
  const foot = Math.min(a.start.z, a.end.z, b.start.z, b.end.z)
  const top = Math.max(z.start.z, z.end.z) + z.h / 2
  const w = Math.hypot(a.start.x - b.start.x, a.start.y - b.start.y) + Math.max(a.b, a.h)
  return Math.round(Math.hypot(w, top - foot))
}

/** Diagonale der Pfostenstellung in der Draufsicht (Außenecken), in mm gerundet */
function footprintDiagonal(posts: Member[]): number | undefined {
  if (posts.length < 3) return undefined
  // quadratische Pfosten angenommen (bei rechteckigen die größere Seite)
  const half = (m: Member) => Math.max(m.b, m.h) / 2
  const xs = posts.flatMap((m) => [m.start.x - half(m), m.start.x + half(m)])
  const ys = posts.flatMap((m) => [m.start.y - half(m), m.start.y + half(m)])
  return Math.round(Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)))
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
