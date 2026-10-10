import { locale, t, tk, tr } from '../i18n'
import { catalogItem, maxLength, timber } from '../model/catalog'
import { fmtCm, fmtM, memberBoxes, memberLength, obbBounds, obbCorners, obbOverlap, panelOBB, wallFrame, type OBB } from '../model/geometry'
import { LOADS, NET_SAG, netEdgePull } from './statics'
import { cornice, corniceIntrusion, roomObstacles } from '../model/room'
import type { Resolved } from '../model/resolve'
import type { Member, Project, Side, Vec3 } from '../model/types'
import { WALL_IDS } from '../model/types'
import { analyzeDoors, analyzeWindows, type DoorResult, type SwingResult } from './openings'
import { transportCheck } from './assembly'

export type Severity = 'fehler' | 'warnung' | 'hinweis'

export interface Finding {
  id: string
  severity: Severity
  /** Kategorie als Schlüssel (deutsch); Anzeige mit tr(category) */
  category: 'Kollision' | 'Fenster & Tür' | 'Freiraum' | 'Sicherheit' | 'Stabilität' | 'Material' | 'Raum'
  title: string
  detail?: string
  targets: string[]
  pos?: Vec3
}

/** Kategorien (Schlüssel, nicht übersetzt – Anzeige mit tr()) */
const CAT = { kollision: 'Kollision', oeffnung: 'Fenster & Tür', frei: 'Freiraum', sicherheit: 'Sicherheit', stabil: 'Stabilität', material: 'Material', raum: 'Raum' } as const // i18n-ok

export interface Clearance {
  assemblyId: string
  underside: number
  headroom: number
  canStand: boolean
  canSitDesk: boolean
  canSitBed: boolean
}

export interface Analysis {
  findings: Finding[]
  windows: SwingResult[]
  doors: DoorResult[]
  clearances: Clearance[]
}

/** Wandarten im Klartext für Befunde (Anzeige mit tr()) */
export const WALL_MATERIAL_SHORT: Record<string, string> = {
  beton: tk('Betonwand'),
  kalksandstein: tk('Kalksandsteinwand'),
  vollziegel: tk('Vollziegelwand'),
  lochziegel: tk('Hochlochziegelwand'),
  porenbeton: tk('Porenbetonwand'),
  trockenbau: tk('Trockenbauwand'),
  holzstaender: tk('Holzständerwand'),
  leichtbau: tk('Leichtbauwand'),
}

const STRUCTURAL = new Set(['pfosten', 'zarge', 'quertraeger', 'wandriegel'])

/** Bettseite im Klartext */
function sideName(s: Side): string {
  switch (s) {
    case 'hinten':
      return t('hinten')
    case 'vorne':
      return t('vorne')
    case 'links':
      return t('links')
    case 'rechts':
      return t('rechts')
  }
}

/** Grund einer Ausklinkung (kommt aus resolve.ts bereits übersetzt) als deutscher Schlüssel – für Logik und stabile Befund-IDs */
function notchKey(reason: string): string {
  for (const id of WALL_IDS) {
    if (reason === t('Stuck Wand {id}', { id })) return `Stuck Wand ${id}` // i18n-ok
    if (reason === t('Sockelleiste Wand {id}', { id })) return `Sockelleiste Wand ${id}` // i18n-ok
  }
  return reason
}

const num1 = (x: number) => x.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Zusatzangaben je Befund für das Zusammenfassen (Tiefe in mm, Hindernis) */
type Meta = { depth?: number; obstacle?: string }

export function analyze(p: Project, r: Resolved): Analysis {
  // Bei mehreren Betten den Bettnamen voranstellen
  const bedName = (id?: string) => {
    const n = p.assemblies.find((a) => a.id === id)?.name
    return n ? tr(n) : t('Bett')
  }
  const bedPrefix = (m?: Member) => (p.assemblies.length > 1 && m?.assemblyId ? `${bedName(m.assemblyId)}: ` : '')
  const findings: Finding[] = []
  const meta = new Map<Finding, Meta>()
  const prof = p.settings.safetyProfile
  const safety = (strict: Severity): Severity => (prof === 'kinder' ? strict : prof === 'jugendliche' ? (strict === 'fehler' ? 'warnung' : strict) : 'hinweis')
  const add = (f: Finding, m?: Meta) => {
    findings.push(f)
    if (m) meta.set(f, m)
  }
  const room = p.room
  const memberById = new Map(r.members.map((m) => [m.id, m]))
  const memberName = (m?: Member, fallback = t('Bauteil')) => (m?.name ? tr(m.name) : fallback)
  const yes = (b: boolean) => (b ? t('ja') : t('nein'))

  // --- Fenster und Türen -----------------------------------------------------------
  const windows = analyzeWindows(p, r)
  for (const w of windows) {
    const win = p.wallObjects.find((o) => o.id === w.windowId)
    if (!win || win.kind !== 'fenster') continue
    const sash = win.sashes[w.sashIndex]
    const name = tr(win.name)
    const label = win.sashes.length > 1 ? (w.sashIndex === 0 ? t('{name}, Flügel links', { name }) : t('{name}, Flügel rechts', { name })) : t('{name}, Flügel', { name })
    if (sash.opening !== 'fest' && sash.opening !== 'kipp' && w.maxAngle < 90) {
      add({
        id: `fenster:${w.windowId}:${w.sashIndex}`,
        severity: w.maxAngle < 30 ? 'warnung' : 'hinweis',
        category: CAT.oeffnung,
        title: t('{label} öffnet nur bis {angle}°', { label, angle: w.maxAngle }),
        detail: w.blockedBy ? t('Blockiert durch: {what}. Zum Lüften reicht oft die Kippstellung; zum Putzen braucht der Flügel ca. 90°.', { what: tr(w.blockedBy.label) }) : undefined,
        targets: [w.windowId, ...(w.blockedBy ? [w.blockedBy.id] : [])],
      })
    }
    if (w.tiltFree === false) {
      add({
        id: `kipp:${w.windowId}:${w.sashIndex}`,
        severity: 'warnung',
        category: CAT.oeffnung,
        title: t('{label}: Kippstellung blockiert', { label }),
        detail: w.tiltBlockedBy ? t('Im Kippspalt (ca. 12,5 cm) steht: {what}', { what: tr(w.tiltBlockedBy.label) }) : undefined,
        targets: [w.windowId, ...(w.tiltBlockedBy ? [w.tiltBlockedBy.id] : [])],
      })
    }
  }
  const doors = analyzeDoors(p, r)
  for (const d of doors) {
    const door = p.wallObjects.find((o) => o.id === d.doorId)
    if (door?.kind === 'tuer' && door.opensInward && d.maxAngle < 90) {
      add({ id: `tuer:${d.doorId}`, severity: 'fehler', category: CAT.oeffnung, title: t('{label} öffnet nur bis {angle}°', { label: tr(door.name), angle: d.maxAngle }), detail: d.blockedBy && t('Blockiert durch: {what}', { what: tr(d.blockedBy.label) }), targets: [d.doorId, ...(d.blockedBy ? [d.blockedBy.id] : [])] })
    }
  }

  // --- Kollisionen -----------------------------------------------------------------
  const obstacles = roomObstacles(p)
  const parts: { id: string; label: string; boxes: OBB[]; member?: Member }[] = [
    ...r.members.map((m) => ({ id: m.id, label: memberName(m), boxes: memberBoxes(m), member: m })),
    ...r.panels.filter((x) => x.kind !== 'matratze' && x.kind !== 'netz').map((x) => ({ id: x.id, label: x.name ? tr(x.name) : t('Fläche'), boxes: [panelOBB(x)] })),
  ]
  const reported = new Set<string>()
  for (const part of parts) {
    const bounds = part.boxes.map(obbBounds)
    const minX = Math.min(...bounds.map((b) => b.min.x))
    const maxX = Math.max(...bounds.map((b) => b.max.x))
    const minY = Math.min(...bounds.map((b) => b.min.y))
    const maxY = Math.max(...bounds.map((b) => b.max.y))
    const maxZ = Math.max(...bounds.map((b) => b.max.z))
    const out = Math.max(-minX, -minY, maxX - room.length, maxY - room.width)
    if (out > 0.5) add({ id: `wand:${part.id}`, severity: 'fehler', category: CAT.kollision, title: t('{part} ragt {depth} in die Wand', { part: part.label, depth: fmtCm(out) }), targets: [part.id] }, { depth: out })
    if (maxZ - room.height > 0.5) add({ id: `decke:${part.id}`, severity: 'fehler', category: CAT.kollision, title: t('{part} ragt {depth} in die Decke', { part: part.label, depth: fmtCm(maxZ - room.height) }), targets: [part.id] }, { depth: maxZ - room.height })
    // Stuck
    let stuck = 0
    for (const b of part.boxes) for (const c of obbCorners(b)) stuck = Math.max(stuck, corniceIntrusion(room, c)?.depth ?? 0)
    if (stuck > 1) add({ id: `stuck:${part.id}`, severity: 'fehler', category: CAT.kollision, title: t('{part} stößt an den Stuck', { part: part.label }), detail: t('Rund {depth} zu nah. Bauteil absenken, von der Wand abrücken oder (bei Pfosten) ausklinken. Stuck möglichst nie berühren.', { depth: fmtCm(stuck) }), targets: [part.id] }, { depth: stuck })
    for (const o of obstacles) {
      if (o.kind === 'person') continue
      let hit = false
      for (const b of part.boxes) if (obbOverlap(b, o.box) > 0.5) hit = true
      if (!hit) continue
      const key = `${o.ownerId}:${part.member?.assemblyId ?? part.id}:${o.kind}`
      const what = tr(o.label)
      if (o.kind === 'konvektion' || o.kind === 'steckdose') {
        if (reported.has(key)) continue
        reported.add(key)
        add({
          id: `hindernis:${key}`,
          severity: 'hinweis',
          category: CAT.kollision,
          title: o.kind === 'steckdose' ? t('{what} wird verdeckt', { what }) : t('{what} wird verbaut', { what }),
          detail: o.kind === 'konvektion' ? t('Über dem Heizkörper sollte ca. 10 cm frei bleiben, damit die Wärme aufsteigen kann.') : undefined,
          targets: [part.id, o.ownerId],
        })
        continue
      }
      add(
        {
          id: `hindernis:${o.id}:${part.id}`,
          severity: o.kind === 'sockelleiste' ? 'fehler' : o.kind === 'moebel' ? 'warnung' : 'fehler',
          category: CAT.kollision,
          title: t('{part} kollidiert mit {what}', { part: part.label, what }),
          detail: o.kind === 'sockelleiste' ? t('Pfosten ausklinken ({h} × {d}) oder das Bett um die Leistentiefe von der Wand abrücken – Einstellung „Wandanschluss“ am Bett.', { h: fmtCm(room.skirting.height), d: fmtCm(room.skirting.depth) }) : undefined,
          targets: [part.id, o.ownerId],
        },
        { obstacle: what },
      )
    }
  }
  for (const d of r.deepNotches) {
    add({ id: `kerbe:${d.memberId}:${notchKey(d.reason)}`, severity: 'fehler', category: CAT.stabil, title: t('{part}: Ausklinkung für {reason} zu tief', { part: memberName(memberById.get(d.memberId)), reason: tr(d.reason) }), detail: t('Nötig wären {depth}, sinnvoll höchstens {max} (halber Querschnitt). Bauteil von der Wand abrücken oder kürzen.', { depth: fmtCm(d.depth), max: fmtCm(d.max) }), targets: [d.memberId] })
  }
  for (const m of r.members) {
    for (const n of m.notches ?? []) {
      if (notchKey(n.reason).startsWith('Stuck')) add({ id: `kerbe-stuck:${m.id}`, severity: 'hinweis', category: CAT.raum, title: m.name ? t('{part} am Stuck ausgeklinkt', { part: tr(m.name) }) : t('Pfosten am Stuck ausgeklinkt'), detail: t('{length} lang, {depth} tief. Stuck nicht berühren, 1–2 cm Luft lassen.', { length: fmtCm(n.length), depth: fmtCm(n.depth) }), targets: [m.id] })
    }
  }

  // --- Betten: Freiraum, Sicherheit, Stabilität ------------------------------------
  const clearances: Clearance[] = []
  for (const a of p.assemblies) {
    const info = r.beds.get(a.id)
    if (!info) continue
    const P = a.params
    const xs = info.footprint.map((q) => q.x)
    const ys = info.footprint.map((q) => q.y)
    const fp = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
    let ceilingAbove = room.height
    for (const ro of room.rosettes) {
      const rr = Math.max(ro.diameter, ro.lampDiameter) / 2
      if (ro.x + rr > fp.minX && ro.x - rr < fp.maxX && ro.y + rr > fp.minY && ro.y - rr < fp.maxY) ceilingAbove = Math.min(ceilingAbove, room.height - Math.max(ro.depth, ro.lampDrop))
    }
    const headroom = ceilingAbove - info.mattressTop
    const ph = p.settings.personHeight
    const c: Clearance = {
      assemblyId: a.id,
      underside: info.underside,
      headroom,
      canStand: info.underside >= ph + 50,
      canSitDesk: info.underside >= 450 + 0.52 * ph + 60,
      canSitBed: headroom >= 0.52 * ph + 50,
    }
    clearances.push(c)
    add({
      id: `frei:${a.id}`,
      severity: 'hinweis',
      category: CAT.frei,
      title: t('Unter dem Bett {under}, über der Matratze {above}', { under: fmtM(info.underside), above: fmtM(headroom) }),
      detail: t('Stehen ({height}): {stand} · Sitzen am Schreibtisch: {desk} · Aufrecht sitzen im Bett: {bed}. Faustwerte Altbau: unten 1,80–2,00 m, Matratze bis Decke 0,80–1,00 m.', { height: fmtM(ph), stand: yes(c.canStand), desk: yes(c.canSitDesk), bed: yes(c.canSitBed) }),
      targets: [a.id],
    })
    if (headroom < 750) add({ id: `kopf:${a.id}`, severity: 'warnung', category: CAT.frei, title: t('Nur {h} über der Matratze', { h: fmtM(headroom) }), detail: t('Zum Aufsetzen im Bett sind 0,80–1,00 m angenehm.'), targets: [a.id] })
    const wallC = Math.max(...(['A', 'B', 'C', 'D'] as const).map((w) => (cornice(room, w).enabled ? cornice(room, w).height : 0)))
    if (info.mattressTop + 0.45 * ph > room.height - wallC && wallC > 0) add({ id: `kopf-stuck:${a.id}`, severity: 'hinweis', category: CAT.frei, title: t('An der Wand ragt der Stuck in den Kopfraum'), targets: [a.id] })

    // Etagenbett
    if (P.lowerBed && info.lowerMattressTop === undefined) add({ id: `etage-pfosten:${a.id}`, severity: 'hinweis', category: CAT.stabil, title: t('Untere Liegefläche nur mit vier Pfosten'), detail: t('Das Etagenbett wird bei den Bauarten „freistehend“ und „deckenhoch“ erzeugt.'), targets: [a.id] })
    if (info.lowerMattressTop !== undefined) {
      const sitUnder = info.underside - info.lowerMattressTop
      if (sitUnder < 750) add({ id: `etage-kopf:${a.id}`, severity: 'warnung', category: CAT.frei, title: t('Unten nur {h} über der Matratze', { h: fmtM(sitUnder) }), detail: t('Zum Aufsetzen im unteren Bett sind mindestens 0,75 m, besser 0,85 m angenehm. Oberes Bett höher setzen oder die untere Liegefläche absenken.'), targets: [a.id] })
      add({ id: `etage-info:${a.id}`, severity: 'hinweis', category: CAT.frei, title: t('Etagenbett: unten {h} Sitzhöhe über der Matratze', { h: fmtM(sitUnder) }), detail: t('Die untere Liegefläche zählt nicht als „frei darunter“. Das obere Bett braucht weiterhin Geländer und Leiter wie ein Hochbett.'), targets: [a.id] })
    }
    // Begehbares Netz
    if (P.deck === 'netz') {
      const qArea = p.settings.loadProfile === 'hochebene' ? LOADS.qHochebene : LOADS.qBett
      const span = Math.min(info.outerLength, info.outerWidth) - 2 * timber(P.railCatalogId).b
      const pull = netEdgePull(qArea, span) // N/mm = kN/m
      const jump = LOADS.jump / (4 * NET_SAG) / 1000
      add({
        id: `netz-deck:${a.id}`,
        severity: safety('warnung'),
        category: CAT.stabil,
        title: t('Begehbares Netz zieht die Zargen mit {pull} kN/m nach innen', { pull: num1(pull) }),
        detail: t(
          'Bei {sag} % Durchhang über {span} Spannweite; springt jemand in die Mitte, kommen je Seite rund {jump} kN hinzu. Die Zargen werden dabei quer zur schwachen Achse gebogen, die Ecken auf Zug. Bewährt: kräftige Zargen (mind. 80×160 oder hochkant BSH), Ecken mit Schlossschrauben und Winkeln, Netz mit Randseil und nachspannbarer Schnürung, Bruchlast des Netzes nach Herstellerangabe. Unter dem Netz rund {free} Durchhang frei halten – keine Kanten und Möbel darunter. Für Jugendliche und Erwachsene, nicht für Kleinkinder.',
          { sag: Math.round(NET_SAG * 100), span: fmtCm(span, 0), jump: num1(jump), free: fmtCm(span * NET_SAG * 2, 0) },
        ),
        targets: [a.id],
      })
    }

    // Absturzsicherung
    if (P.guard !== 'keins') {
      const aboveMattress = P.guardHeight - P.mattressThickness
      if (aboveMattress < 160 || P.guardHeight < 260) add({ id: `gelaender-hoehe:${a.id}`, severity: safety('warnung'), category: CAT.sicherheit, title: aboveMattress < 160 ? t('Geländer nur {h} über der Matratze', { h: fmtCm(aboveMattress) }) : t('Geländer nur {h} über der Liegefläche', { h: fmtCm(P.guardHeight) }), detail: t('Empfehlung (DIN EN 747): mind. 16 cm über Matratzenoberkante und 26 cm über Liegefläche. Maximale Matratzendicke bei diesem Geländer: {max}.', { max: fmtCm(P.guardHeight - 160) }), targets: [a.id] })
      if (info.rodGap !== undefined && info.rodGap > 75 && P.guard !== 'seil') add({ id: `gelaender-spalt:${a.id}`, severity: safety('warnung'), category: CAT.sicherheit, title: t('Lücken im Geländer {gap}', { gap: fmtCm(info.rodGap) }), detail: t('Empfehlung: Öffnungen höchstens 7,5 cm (Kopf darf nicht durchpassen).'), targets: [a.id] })
      if (P.guard === 'seil') add({ id: `seil:${a.id}`, severity: safety('warnung'), category: CAT.sicherheit, title: t('Seilgeländer: nur für Jugendliche und Erwachsene'), detail: t('Seile geben nach und lassen große Lücken. Besondere Sorgfalt bei Befestigung und Nachspannen.'), targets: [a.id] })
      if (P.guard === 'netz') add({ id: `netz:${a.id}`, severity: 'hinweis', category: CAT.sicherheit, title: t('Netz als Absturzsicherung'), detail: t('Knotenloses PP-/Polyesternetz, Maschenweite 30–45 mm, Randseil. Befestigung alle 10–15 cm über Augschrauben oder Bohrungen, Netz etwas kleiner als den Rahmen bestellen und nach den ersten Tagen nachspannen.'), targets: [a.id] })
    }
    if (info.accessWidth !== undefined) {
      if (info.accessWidth < 300) add({ id: `zugang:${a.id}`, severity: safety('warnung'), category: CAT.sicherheit, title: t('Einstieg nur {w} breit', { w: fmtCm(info.accessWidth) }), detail: t('Empfehlung: 30–40 cm lichte Breite.'), targets: [a.id] })
      else if (info.accessWidth > 400 && prof === 'kinder') add({ id: `zugang-breit:${a.id}`, severity: 'hinweis', category: CAT.sicherheit, title: t('Einstieg {w} breit', { w: fmtCm(info.accessWidth) }), detail: t('DIN EN 747 empfiehlt für Kinderbetten 30–40 cm.'), targets: [a.id] })
    }
    if (info.rungPitch !== undefined && (info.rungPitch < 200 || info.rungPitch > 300)) add({ id: `sprossen:${a.id}`, severity: safety('warnung'), category: CAT.sicherheit, title: t('Sprossenabstand {pitch}', { pitch: fmtCm(info.rungPitch) }), detail: t('Richtwert: 25 cm ± 5 cm, alle gleich.'), targets: [a.id] })
    if (P.ladder === 'senkrecht' || P.ladder === 'schraeg') add({ id: `sprossen-flach:${a.id}`, severity: 'hinweis', category: CAT.sicherheit, title: t('Rundsprossen sind barfuß unbequem'), detail: t('Heimwerker-Erfahrung: flache Stufen in Gratnuten sind deutlich angenehmer (Leitertyp „Stufenleiter“).'), targets: [a.id] })
    // Offene Seiten zur Wand
    const sides: Side[] = ['hinten', 'vorne', 'links', 'rechts'] // i18n-ok
    for (const s of sides) {
      const gap = sideWallGap(s, fp, room, P.rotation, P.mirror)
      if (info.walls.includes(s)) {
        // Wandseite: trägt und sichert nur, wenn das Bett dort wirklich an der Wand steht
        if (gap === undefined || gap <= 20) continue
        add({
          id: `wandseite:${a.id}:${s}`,
          severity: 'fehler',
          category: CAT.stabil,
          title: t('Wandseite {side} steht {gap} von der Wand ab', { side: sideName(s), gap: fmtCm(gap) }),
          detail: t('Diese Bauweise trägt auf dieser Seite über einen Wandbalken an der Wand. Das Bett an die Wand rücken oder eine freistehende Bauart wählen.'),
          targets: [a.id],
        })
      }
      if (P.guard !== 'keins' && P.guardSides[s]) continue
      if (gap === undefined) continue
      if (gap > 75 && gap < 230) add({ id: `wandspalt:${a.id}:${s}`, severity: safety('warnung'), category: CAT.sicherheit, title: t('Spalt {gap} zwischen Bett ({side}) und Wand', { gap: fmtCm(gap), side: sideName(s) }), detail: t('Einklemmgefahr: Spalt höchstens 7,5 cm oder über 23 cm – sonst Geländer auch auf dieser Seite.'), targets: [a.id] })
      else if (gap >= 230) add({ id: `offen:${a.id}:${s}`, severity: safety('fehler'), category: CAT.sicherheit, title: t('Seite {side} ohne Absturzsicherung', { side: sideName(s) }), targets: [a.id] })
    }
    if (prof === 'kinder' && P.deckHeight > 600) add({ id: `alter:${a.id}`, severity: 'hinweis', category: CAT.sicherheit, title: t('Oben schlafen erst ab 6 Jahren'), targets: [a.id] })

    // Stabilität
    const wallFix = r.fixings.filter((f) => f.memberId.startsWith(`${a.id}:`) && f.target === 'wand')
    if (P.type === 'freistehend' && !P.braces && wallFix.length === 0) add({ id: `wackeln:${a.id}`, severity: 'warnung', category: CAT.stabil, title: t('Freistehendes Gestell ohne Aussteifung'), detail: t('Winkel und Balkenschuhe wirken als Gelenk. Kopfbänder einschalten oder das Bett mit 2 Pfosten an der Wand befestigen (Kippsicherung).'), targets: [a.id] })
    if (P.type === 'abgehaengt') add({ id: `abgehaengt:${a.id}`, severity: 'warnung', category: CAT.stabil, title: t('Abgehängte Konstruktion: besondere Sorgfalt'), detail: t('Nur an tragfähiger Decke (Beton/Holzbalken, nicht Stuck), Deckenanker vom Fachhandel, Wandriegel mit Schwerlastdübeln.'), targets: [a.id] })
    if (P.type === 'deckenhoch' && room.ceiling === 'holzbalken') add({ id: `decke-holz:${a.id}`, severity: 'hinweis', category: CAT.stabil, title: t('Verspannung gegen Holzbalkendecke'), detail: t('Pfosten möglichst unter einem Deckenbalken verspannen und mit Lastverteilbrett arbeiten; Stuck nicht berühren.'), targets: [a.id] })
    if (wallFix.length && p.settings.rentalMode) add({ id: `miete:${a.id}`, severity: 'hinweis', category: CAT.raum, title: t('{n} Bohrungen in der Wand', { n: wallFix.reduce((s, f) => s + f.count, 0) }), detail: t('Mietwohnung: Dübellöcher für eine Kippsicherung sind üblich; größere Eingriffe mit dem Vermieter abstimmen.'), targets: [a.id] })
    const weak = new Set(['porenbeton', 'lochziegel', 'trockenbau', 'leichtbau'])
    const hangers = r.members.filter((m) => m.assemblyId === a.id && m.catalogId === 'gewindestange-m10')
    if (hangers.length) {
      const c = room.ceiling
      if (c === 'schwach' || c === 'abgehaengt')
        add({ id: `decke-haengen:${a.id}`, severity: 'fehler', category: CAT.stabil, title: t('Decke ist nicht für eine Abhängung geeignet'), detail: t('Laut Raumangaben trägt die Decke keine Lasten. Freie Ecke besser auf einen Pfosten stellen (Bett → „Freie Ecke getragen von“).'), targets: [a.id, ...hangers.map((h) => h.id)] })
      else if (c === 'holzbalken')
        add({ id: `decke-balken:${a.id}`, severity: 'warnung', category: CAT.stabil, title: t('Abhängung nur in einen Deckenbalken'), detail: t('Balkenlage suchen (Leitungssucher, Probebohrung), Gewindestange mit Stahlplatte oder Schwerlastanker im Balken, Stuck nicht berühren. Redundant auslegen.'), targets: [a.id, ...hangers.map((h) => h.id)] })
    }
    if (P.frameStyle === 'aufgelegt' && wallFix.length) add({ id: `wandbalken:${a.id}`, severity: 'hinweis', category: CAT.stabil, title: t('Wandbalken-Bauweise'), detail: t('Effizient und sehr tragfähig an Ziegel- oder Betonwänden: Wandbalken mit Schwerlastdübeln oder Betonschrauben alle ca. 40 cm, Querträger bzw. Latten oben auflegen und verschrauben.'), targets: [a.id] })
    // Tragender Wandbalken über einem Fenster oder einer Tür: dort ist keine Wand zum Befestigen
    for (const m of r.members) {
      if (m.assemblyId !== a.id || m.role !== 'wandriegel') continue
      const wall = nearestWallId(m, room)
      const f = wallFrame(room, wall)
      const along = (q: Vec3) => (q.x - f.start.x) * f.u.x + (q.y - f.start.y) * f.u.y
      const s0 = Math.min(along(m.start), along(m.end))
      const s1 = Math.max(along(m.start), along(m.end))
      const z0 = Math.min(m.start.z, m.end.z) - m.h / 2
      const z1 = Math.max(m.start.z, m.end.z) + m.h / 2
      for (const o of p.wallObjects) {
        if (o.wall !== wall || (o.kind !== 'fenster' && o.kind !== 'tuer')) continue
        const oz0 = o.kind === 'fenster' ? o.sillHeight : 0
        const oz1 = o.kind === 'fenster' ? o.sillHeight + o.height : o.height
        if (s1 <= o.offset || s0 >= o.offset + o.width || z1 <= oz0 || z0 >= oz1) continue
        add({
          id: `wandbalken-oeffnung:${m.id}:${o.id}`,
          severity: 'fehler',
          category: CAT.stabil,
          title: bedPrefix(m) + t('Wandbalken läuft über {name}', { name: tr(o.name) }),
          detail: t('Dort fehlt die Wand zum Befestigen, der Balken trägt in diesem Bereich nicht. Liegefläche höher oder tiefer legen, das Bett verschieben oder auf dieser Seite Pfosten stellen.'),
          targets: [m.id, o.id],
        })
      }
    }
    for (const f of wallFix) {
      const m = memberById.get(f.memberId)
      if (!m) continue
      const wall = nearestWallId(m, room)
      const mat = room.walls[wall].material
      if (weak.has(mat)) {
        const load = memberById.get(f.memberId)?.role === 'wandriegel'
        const material = WALL_MATERIAL_SHORT[mat] ? tr(WALL_MATERIAL_SHORT[mat]) : mat
        add({
          id: `wandmaterial:${f.memberId}`,
          severity: load ? 'fehler' : 'warnung',
          category: CAT.stabil,
          title: load ? t('Wandbalken an nicht tragfähiger Wand {wall} ({material})', { wall, material }) : bedPrefix(m) + t('Kippsicherung in {material} (Wand {wall})', { wall, material }),
          detail: load ? t('Ein tragender Wandbalken braucht eine massive Wand (Ziegel, Beton, Kalksandstein). Hier besser Pfosten stellen.') : t('Dübel tragen hier nur 0,15–0,6 kN – für eine Kippsicherung reicht das meist; in Trockenbau in die Ständer schrauben.'),
          targets: [f.memberId],
        })
      }
    }
    if (room.floor === 'holzdielen') add({ id: `boden:${a.id}`, severity: 'hinweis', category: CAT.stabil, title: t('Holzbalkendecke/Dielenboden'), detail: t('Pfosten auf Lastverteilplatten (z. B. 20 × 20 cm Multiplex) stellen, möglichst wandnah.'), targets: [a.id] })
    // Heizkörper unter der Liegefläche
    for (const o of p.wallObjects) {
      if (o.kind !== 'heizkoerper') continue
      const ob = obstacles.find((x) => x.id === `${o.id}:koerper`)
      if (!ob) continue
      const b = obbBounds(ob.box)
      if (b.max.x > fp.minX && b.min.x < fp.maxX && b.max.y > fp.minY && b.min.y < fp.maxY) add({ id: `heizung-unter:${a.id}:${o.id}`, severity: 'hinweis', category: CAT.raum, title: t('{name} liegt unter dem Bett', { name: tr(o.name) }), detail: t('Wärme staut sich unter der Liegefläche, Thermostat muss erreichbar bleiben.'), targets: [a.id, o.id] })
    }
  }

  // --- Eigene Betten aus freien Teilen ------------------------------------------------
  for (const g of p.groups) {
    const D = g.deck
    if (!D) {
      add({ id: `liegeflaeche:${g.id}`, severity: 'hinweis', category: CAT.frei, title: t('{name}: Liegefläche fehlt', { name: tr(g.name) }), detail: t('Ohne Liegefläche fehlen die Lasten für die Statik und die Prüfungen für Kopfraum und Absturzsicherung. Bett auswählen → „Liegefläche erkennen“.'), targets: [g.id] })
      continue
    }
    const fp = { minX: D.x, maxX: D.x + D.length, minY: D.y, maxY: D.y + D.width }
    const parts = r.members.filter((m) => m.groupId === g.id)
    const mattressTop = D.z + D.thickness
    let ceilingAbove = room.height
    for (const ro of room.rosettes) {
      const rr = Math.max(ro.diameter, ro.lampDiameter) / 2
      if (ro.x + rr > fp.minX && ro.x - rr < fp.maxX && ro.y + rr > fp.minY && ro.y - rr < fp.maxY) ceilingAbove = Math.min(ceilingAbove, room.height - Math.max(ro.depth, ro.lampDrop))
    }
    // Unterkante: tiefstes waagrechtes Holz unter der Liegefläche
    const under = parts
      .flatMap((m) => memberBoxes(m).map(obbBounds))
      .filter((b) => b.max.z <= D.z + 3 && b.max.z - b.min.z < 300 && b.max.x > fp.minX && b.min.x < fp.maxX && b.max.y > fp.minY && b.min.y < fp.maxY)
    const underside = under.length ? Math.min(...under.map((b) => b.min.z)) : D.z
    const headroom = ceilingAbove - mattressTop
    const ph = p.settings.personHeight
    const c: Clearance = { assemblyId: g.id, underside, headroom, canStand: underside >= ph + 50, canSitDesk: underside >= 450 + 0.52 * ph + 60, canSitBed: headroom >= 0.52 * ph + 50 }
    clearances.push(c)
    add({
      id: `frei:${g.id}`,
      severity: 'hinweis',
      category: CAT.frei,
      title: t('Unter dem Bett {under}, über der Matratze {above}', { under: fmtM(underside), above: fmtM(headroom) }),
      detail: t('Stehen ({height}): {stand} · Sitzen am Schreibtisch: {desk} · Aufrecht sitzen im Bett: {bed}. Faustwerte Altbau: unten 1,80–2,00 m, Matratze bis Decke 0,80–1,00 m.', { height: fmtM(ph), stand: yes(c.canStand), desk: yes(c.canSitDesk), bed: yes(c.canSitBed) }),
      targets: [g.id],
    })
    if (headroom < 750) add({ id: `kopf:${g.id}`, severity: 'warnung', category: CAT.frei, title: t('Nur {h} über der Matratze', { h: fmtM(headroom) }), detail: t('Zum Aufsetzen im Bett sind 0,80–1,00 m angenehm.'), targets: [g.id] })
    // Absturzsicherung je Seite: Hölzer mind. 16 cm über der Matratze, nah an der Kante, auf mind. 60 % der Länge
    if (D.z > 600) {
      const guards = parts.flatMap((m) => memberBoxes(m).map(obbBounds)).filter((b) => b.max.z >= mattressTop + 160)
      const edges: { wall: 'A' | 'B' | 'C' | 'D'; along: 'x' | 'y'; at: number; lo: number; hi: number; gap: number }[] = [
        { wall: 'A', along: 'x', at: fp.minY, lo: fp.minX, hi: fp.maxX, gap: fp.minY },
        { wall: 'C', along: 'x', at: fp.maxY, lo: fp.minX, hi: fp.maxX, gap: room.width - fp.maxY },
        { wall: 'B', along: 'y', at: fp.minX, lo: fp.minY, hi: fp.maxY, gap: fp.minX },
        { wall: 'D', along: 'y', at: fp.maxX, lo: fp.minY, hi: fp.maxY, gap: room.length - fp.maxX },
      ]
      for (const e of edges) {
        const spans = guards
          .filter((b) => (e.along === 'x' ? b.max.y > e.at - 150 && b.min.y < e.at + 150 : b.max.x > e.at - 150 && b.min.x < e.at + 150))
          .map((b) => (e.along === 'x' ? [Math.max(e.lo, b.min.x), Math.min(e.hi, b.max.x)] : [Math.max(e.lo, b.min.y), Math.min(e.hi, b.max.y)]))
          .filter(([a, b]) => b > a)
          .sort((a, b) => a[0] - b[0])
        let covered = 0
        let end = -Infinity
        for (const [a, b] of spans) {
          covered += Math.max(0, b - Math.max(a, end))
          end = Math.max(end, b)
        }
        if (covered >= 0.6 * (e.hi - e.lo)) continue
        const side = t('zu Wand {w}', { w: e.wall })
        if (e.gap > 75 && e.gap < 230) add({ id: `wandspalt:${g.id}:${e.wall}`, severity: safety('warnung'), category: CAT.sicherheit, title: t('Spalt {gap} zwischen Bett ({side}) und Wand', { gap: fmtCm(e.gap), side }), detail: t('Einklemmgefahr: Spalt höchstens 7,5 cm oder über 23 cm – sonst Geländer auch auf dieser Seite.'), targets: [g.id] })
        else if (e.gap >= 230) add({ id: `offen:${g.id}:${e.wall}`, severity: safety('fehler'), category: CAT.sicherheit, title: t('Seite {side} ohne Absturzsicherung', { side }), detail: t('Geländer mindestens 16 cm über der Matratze vorsehen.'), targets: [g.id] })
      }
      if (prof === 'kinder') add({ id: `alter:${g.id}`, severity: 'hinweis', category: CAT.sicherheit, title: t('Oben schlafen erst ab 6 Jahren'), targets: [g.id] })
    }
  }

  // --- Material ----------------------------------------------------------------------
  const unsorted = new Set<string>()
  for (const m of r.members) {
    const item = catalogItem(m.catalogId)
    if (!item || item.kind !== 'stab') continue
    const L = memberLength(m)
    if (L > maxLength(item) + 0.5) add({ id: `laenge:${m.id}`, severity: 'warnung', category: CAT.material, title: t('{part}: {length} länger als Handelslänge {max}', { part: memberName(m), length: fmtM(L), max: fmtM(maxLength(item)) }), detail: t('Stoß über einem Auflager einplanen oder anderen Querschnitt wählen.'), targets: [m.id] })
    if (STRUCTURAL.has(m.role) && !timber(m.catalogId).sorted) unsorted.add(m.catalogId)
  }
  for (const id of unsorted) add({ id: `sortierung:${id}`, severity: 'hinweis', category: CAT.material, title: t('{name} ist nicht festigkeitssortiert', { name: tr(timber(id).name) }), detail: t('Wird später als C16 gerechnet. Für tragende Teile KVH (C24) empfehlen; Stücke mit großen Ästen oder Rissen aussortieren.'), targets: [] })
  for (const j of r.joints) {
    if (j.kind === 'kreuzung' && j.typeId !== 'ueberblattung') add({ id: `kreuzung:${j.key}`, severity: 'warnung', category: CAT.kollision, title: t('Bauteile durchdringen sich'), detail: t('Überblattung wählen oder Bauteile versetzen.'), targets: [j.a, j.b], pos: j.pos })
  }

  const tc = transportCheck(p, r)
  if (tc.door && tc.longest > tc.door) add({ id: 'transport', severity: 'warnung', category: CAT.material, title: t('{name} ({length}) passt nicht durch die Tür', { name: tr(tc.name), length: fmtM(tc.longest) }), detail: t('Türdiagonale ca. {diag}. Holz erst im Zimmer zuschneiden oder das Teil teilen (Stoß über einem Auflager). Auch Flur und Treppenhaus bedenken.', { diag: fmtM(tc.door) }), targets: [] })
  else if (tc.door && tc.longest > tc.door - 300) add({ id: 'transport', severity: 'hinweis', category: CAT.material, title: t('{name} ({length}) nur schräg durch die Tür', { name: tr(tc.name), length: fmtM(tc.longest) }), detail: t('Türdiagonale ca. {diag} – lange Teile schräg tragen, Flurecken vorher ausmessen.', { diag: fmtM(tc.door) }), targets: [] })

  // --- Projekt ------------------------------------------------------------------------
  if (p.estimated.length) add({ id: 'geschaetzt', severity: 'hinweis', category: CAT.raum, title: t('{n} Maße sind nur geschätzt', { n: p.estimated.length }), detail: t('Gelb hinterlegte Felder sind geschätzt. Nachmessen und eintragen – ein Klick auf einen Eintrag springt zum Feld.'), targets: [] })
  if (p.assemblies.length || p.groups.length) add({ id: 'rauchmelder', severity: 'hinweis', category: CAT.sicherheit, title: t('Rauchmelder über der Schlafebene'), detail: t('Rauch staut sich unter der Decke – ein Melder oberhalb der Liegefläche ist sinnvoll.'), targets: [] })

  const ack = new Set(p.settings.acknowledged)
  const order: Record<Severity, number> = { fehler: 0, warnung: 1, hinweis: 2 }
  findings.sort((a, b) => Number(ack.has(a.id)) - Number(ack.has(b.id)) || order[a.severity] - order[b.severity])
  return { findings: groupFindings(findings, meta, p, r), windows, doors, clearances }
}

function sideWallGap(s: Side, fp: { minX: number; maxX: number; minY: number; maxY: number }, room: Project['room'], rotation: number, mirror = false): number | undefined {
  // Lokale Seite in Weltrichtung übersetzen; gespiegelt tauschen links und rechts (wie in toWorld)
  const order: Side[] = ['hinten', 'rechts', 'vorne', 'links'] // i18n-ok
  const local: Side = mirror && s === 'links' ? 'rechts' : mirror && s === 'rechts' ? 'links' : s // i18n-ok
  const idx = (order.indexOf(local) + rotation / 90) % 4
  switch (order[idx]) {
    case 'hinten':
      return fp.minY
    case 'vorne':
      return room.width - fp.maxY
    case 'links':
      return fp.minX
    case 'rechts':
      return room.length - fp.maxX
  }
}

/** Wand, an der das Bauteil liegt: bei waagrechten Teilen die Wand, zu der es parallel läuft (in Ecken berühren sie zwei) */
function nearestWallId(m: Member, room: Project['room']): 'A' | 'B' | 'C' | 'D' {
  const b = obbBounds(memberBoxes(m)[0])
  const dx = Math.abs(m.end.x - m.start.x)
  const dy = Math.abs(m.end.y - m.start.y)
  const dz = Math.abs(m.end.z - m.start.z)
  const gaps: ['A' | 'B' | 'C' | 'D', number][] = [
    ['A', b.min.y],
    ['B', b.min.x],
    ['C', room.width - b.max.y],
    ['D', room.length - b.max.x],
  ]
  const along = dz >= Math.max(dx, dy) ? gaps : dx >= dy ? gaps.filter(([w]) => w === 'A' || w === 'C') : gaps.filter(([w]) => w === 'B' || w === 'D')
  return along.sort((x, y) => x[1] - y[1])[0][0]
}

/**
 * Fasst gleichartige Kollisionen eines Betts zu einem Befund zusammen (z. B. „Hochbett: 12 Teile ragen bis
 * 27 cm in die Wand“). Die Einzelteile stehen in der Beschreibung, alle bleiben Ziele des Befunds.
 */
function groupFindings(findings: Finding[], meta: Map<Finding, Meta>, p: Project, r: Resolved): Finding[] {
  const asmOf = new Map<string, string>()
  for (const m of r.members) if (m.assemblyId) asmOf.set(m.id, m.assemblyId)
  for (const x of r.panels) if (x.assemblyId) asmOf.set(x.id, x.assemblyId)
  const kindOf = (f: Finding): string | undefined => {
    const k = f.id.split(':')[0]
    if (k === 'wand' || k === 'decke' || k === 'stuck' || k === 'kerbe-stuck') return k
    if (k === 'hindernis' && f.severity !== 'hinweis') return `hindernis:${f.targets[1] ?? ''}`
    return undefined
  }
  const groups = new Map<string, Finding[]>()
  const out: Finding[] = []
  for (const f of findings) {
    const kind = kindOf(f)
    const asm = asmOf.get(f.targets[0])
    if (!kind || !asm) {
      out.push(f)
      continue
    }
    const key = `${kind}|${asm}`
    if (!groups.has(key)) {
      groups.set(key, [])
      out.push({ ...f, id: `@${key}` })
    }
    groups.get(key)!.push(f)
  }
  return out.map((f) => {
    if (!f.id.startsWith('@')) return f
    const key = f.id.slice(1)
    const list = groups.get(key)!
    if (list.length === 1) return list[0]
    const [kind, asm] = key.split('|')
    const name = p.assemblies.find((a) => a.id === asm)?.name
    const bed = name ? tr(name) : t('Bett')
    const depth = fmtCm(Math.max(...list.map((x) => meta.get(x)?.depth ?? 0)))
    const n = list.length
    const title =
      kind === 'wand'
        ? t('{bed}: {n} Teile ragen bis {depth} in die Wand', { bed, n, depth })
        : kind === 'decke'
          ? t('{bed}: {n} Teile ragen bis {depth} in die Decke', { bed, n, depth })
          : kind === 'stuck'
            ? t('{bed}: {n} Teile stoßen an den Stuck', { bed, n })
            : kind === 'kerbe-stuck'
              ? t('{bed}: {n} Pfosten am Stuck ausgeklinkt', { bed, n })
              : t('{bed}: {n} Teile kollidieren mit {what}', { bed, n, what: meta.get(list[0])?.obstacle ?? t('einem Hindernis') })
    const parts = list.map((x) => x.title).join('; ')
    return {
      ...list[0],
      id: `${kind}-gruppe:${asm}`,
      title,
      detail: [list[0].detail, t('Betroffen: {parts}.', { parts })].filter(Boolean).join(' '),
      targets: [...new Set(list.flatMap((x) => x.targets))],
    }
  })
}
