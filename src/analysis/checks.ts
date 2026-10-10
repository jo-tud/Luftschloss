import { catalogItem, maxLength, timber } from '../model/catalog'
import { fmtCm, fmtM, memberBoxes, memberLength, obbBounds, obbCorners, obbOverlap, panelOBB, type OBB } from '../model/geometry'
import { LOADS, NET_SAG, netEdgePull } from './statics'
import { cornice, corniceIntrusion, roomObstacles } from '../model/room'
import type { Resolved } from '../model/resolve'
import type { Member, Project, Side, Vec3 } from '../model/types'
import { analyzeDoors, analyzeWindows, type DoorResult, type SwingResult } from './openings'
import { transportCheck } from './assembly'

export type Severity = 'fehler' | 'warnung' | 'hinweis'

export interface Finding {
  id: string
  severity: Severity
  category: 'Kollision' | 'Fenster & Tür' | 'Freiraum' | 'Sicherheit' | 'Stabilität' | 'Material' | 'Raum'
  title: string
  detail?: string
  targets: string[]
  pos?: Vec3
}

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

const STRUCTURAL = new Set(['pfosten', 'zarge', 'quertraeger', 'wandriegel'])

export function analyze(p: Project, r: Resolved): Analysis {
  const findings: Finding[] = []
  const prof = p.settings.safetyProfile
  const safety = (strict: Severity): Severity => (prof === 'kinder' ? strict : prof === 'jugendliche' ? (strict === 'fehler' ? 'warnung' : strict) : 'hinweis')
  const add = (f: Finding) => findings.push(f)
  const room = p.room
  const memberById = new Map(r.members.map((m) => [m.id, m]))

  // --- Fenster und Türen -----------------------------------------------------------
  const windows = analyzeWindows(p, r)
  for (const w of windows) {
    const win = p.wallObjects.find((o) => o.id === w.windowId)
    if (!win || win.kind !== 'fenster') continue
    const sash = win.sashes[w.sashIndex]
    const label = `${win.name}, Flügel ${win.sashes.length > 1 ? (w.sashIndex === 0 ? 'links' : 'rechts') : ''}`.trim()
    if (sash.opening !== 'fest' && sash.opening !== 'kipp' && w.maxAngle < 90) {
      add({
        id: `fenster:${w.windowId}:${w.sashIndex}`,
        severity: w.maxAngle < 30 ? 'warnung' : 'hinweis',
        category: 'Fenster & Tür',
        title: `${label} öffnet nur bis ${w.maxAngle}°`,
        detail: w.blockedBy ? `Blockiert durch: ${w.blockedBy.label}. Zum Lüften reicht oft die Kippstellung; zum Putzen braucht der Flügel ca. 90°.` : undefined,
        targets: [w.windowId, ...(w.blockedBy ? [w.blockedBy.id] : [])],
      })
    }
    if (w.tiltFree === false) {
      add({
        id: `kipp:${w.windowId}:${w.sashIndex}`,
        severity: 'warnung',
        category: 'Fenster & Tür',
        title: `${label}: Kippstellung blockiert`,
        detail: w.tiltBlockedBy ? `Im Kippspalt (ca. 12,5 cm) steht: ${w.tiltBlockedBy.label}` : undefined,
        targets: [w.windowId, ...(w.tiltBlockedBy ? [w.tiltBlockedBy.id] : [])],
      })
    }
  }
  const doors = analyzeDoors(p, r)
  for (const d of doors) {
    const door = p.wallObjects.find((o) => o.id === d.doorId)
    if (door?.kind === 'tuer' && door.opensInward && d.maxAngle < 90) {
      add({ id: `tuer:${d.doorId}`, severity: 'fehler', category: 'Fenster & Tür', title: `${door.name} öffnet nur bis ${d.maxAngle}°`, detail: d.blockedBy && `Blockiert durch: ${d.blockedBy.label}`, targets: [d.doorId, ...(d.blockedBy ? [d.blockedBy.id] : [])] })
    }
  }

  // --- Kollisionen -----------------------------------------------------------------
  const obstacles = roomObstacles(p)
  const parts: { id: string; label: string; boxes: OBB[]; member?: Member }[] = [
    ...r.members.map((m) => ({ id: m.id, label: m.name ?? 'Bauteil', boxes: memberBoxes(m), member: m })),
    ...r.panels.filter((x) => x.kind !== 'matratze' && x.kind !== 'netz').map((x) => ({ id: x.id, label: x.name ?? 'Fläche', boxes: [panelOBB(x)] })),
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
    if (out > 0.5) add({ id: `wand:${part.id}`, severity: 'fehler', category: 'Kollision', title: `${part.label} ragt ${fmtCm(out)} in die Wand`, targets: [part.id] })
    if (maxZ - room.height > 0.5) add({ id: `decke:${part.id}`, severity: 'fehler', category: 'Kollision', title: `${part.label} ragt ${fmtCm(maxZ - room.height)} in die Decke`, targets: [part.id] })
    // Stuck
    let stuck = 0
    for (const b of part.boxes) for (const c of obbCorners(b)) stuck = Math.max(stuck, corniceIntrusion(room, c)?.depth ?? 0)
    if (stuck > 1) add({ id: `stuck:${part.id}`, severity: 'fehler', category: 'Kollision', title: `${part.label} stößt an den Stuck`, detail: `Rund ${fmtCm(stuck)} zu nah. Bauteil absenken, von der Wand abrücken oder (bei Pfosten) ausklinken. Stuck möglichst nie berühren.`, targets: [part.id] })
    for (const o of obstacles) {
      if (o.kind === 'person') continue
      let hit = false
      for (const b of part.boxes) if (obbOverlap(b, o.box) > 0.5) hit = true
      if (!hit) continue
      const key = `${o.ownerId}:${part.member?.assemblyId ?? part.id}:${o.kind}`
      if (o.kind === 'konvektion' || o.kind === 'steckdose') {
        if (reported.has(key)) continue
        reported.add(key)
        add({
          id: `hindernis:${key}`,
          severity: 'hinweis',
          category: 'Kollision',
          title: o.kind === 'steckdose' ? `${o.label} wird verdeckt` : `${o.label} wird verbaut`,
          detail: o.kind === 'konvektion' ? 'Über dem Heizkörper sollte ca. 10 cm frei bleiben, damit die Wärme aufsteigen kann.' : undefined,
          targets: [part.id, o.ownerId],
        })
        continue
      }
      add({
        id: `hindernis:${o.id}:${part.id}`,
        severity: o.kind === 'sockelleiste' ? 'fehler' : o.kind === 'moebel' ? 'warnung' : 'fehler',
        category: 'Kollision',
        title: `${part.label} kollidiert mit ${o.label}`,
        detail: o.kind === 'sockelleiste' ? `Pfosten ausklinken (${fmtCm(room.skirting.height)} × ${fmtCm(room.skirting.depth)}) oder das Bett um die Leistentiefe von der Wand abrücken – Einstellung „Wandanschluss“ am Bett.` : undefined,
        targets: [part.id, o.ownerId],
      })
    }
  }
  for (const d of r.deepNotches) {
    add({ id: `kerbe:${d.memberId}:${d.reason}`, severity: 'fehler', category: 'Stabilität', title: `${memberById.get(d.memberId)?.name ?? 'Bauteil'}: Ausklinkung für ${d.reason} zu tief`, detail: `Nötig wären ${fmtCm(d.depth)}, sinnvoll höchstens ${fmtCm(d.max)} (halber Querschnitt). Bauteil von der Wand abrücken oder kürzen.`, targets: [d.memberId] })
  }
  for (const m of r.members) {
    for (const n of m.notches ?? []) {
      if (n.reason.startsWith('Stuck')) add({ id: `kerbe-stuck:${m.id}`, severity: 'hinweis', category: 'Raum', title: `${m.name ?? 'Pfosten'} am Stuck ausgeklinkt`, detail: `${fmtCm(n.length)} lang, ${fmtCm(n.depth)} tief. Stuck nicht berühren, 1–2 cm Luft lassen.`, targets: [m.id] })
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
      category: 'Freiraum',
      title: `Unter dem Bett ${fmtM(info.underside)}, über der Matratze ${fmtM(headroom)}`,
      detail: `Stehen (${fmtM(ph)}): ${c.canStand ? 'ja' : 'nein'} · Sitzen am Schreibtisch: ${c.canSitDesk ? 'ja' : 'nein'} · Aufrecht sitzen im Bett: ${c.canSitBed ? 'ja' : 'nein'}. Faustwerte Altbau: unten 1,80–2,00 m, Matratze bis Decke 0,80–1,00 m.`,
      targets: [a.id],
    })
    if (headroom < 750) add({ id: `kopf:${a.id}`, severity: 'warnung', category: 'Freiraum', title: `Nur ${fmtM(headroom)} über der Matratze`, detail: 'Zum Aufsetzen im Bett sind 0,80–1,00 m angenehm.', targets: [a.id] })
    const wallC = Math.max(...(['A', 'B', 'C', 'D'] as const).map((w) => (cornice(room, w).enabled ? cornice(room, w).height : 0)))
    if (info.mattressTop + 0.45 * ph > room.height - wallC && wallC > 0) add({ id: `kopf-stuck:${a.id}`, severity: 'hinweis', category: 'Freiraum', title: 'An der Wand ragt der Stuck in den Kopfraum', targets: [a.id] })

    // Etagenbett
    if (P.lowerBed && info.lowerMattressTop === undefined) add({ id: `etage-pfosten:${a.id}`, severity: 'hinweis', category: 'Stabilität', title: 'Untere Liegefläche nur mit vier Pfosten', detail: 'Das Etagenbett wird bei den Bauarten „freistehend“ und „deckenhoch“ erzeugt.', targets: [a.id] })
    if (info.lowerMattressTop !== undefined) {
      const sitUnder = info.underside - info.lowerMattressTop
      if (sitUnder < 750) add({ id: `etage-kopf:${a.id}`, severity: 'warnung', category: 'Freiraum', title: `Unten nur ${fmtM(sitUnder)} über der Matratze`, detail: 'Zum Aufsetzen im unteren Bett sind mindestens 0,75 m, besser 0,85 m angenehm. Oberes Bett höher setzen oder die untere Liegefläche absenken.', targets: [a.id] })
      add({ id: `etage-info:${a.id}`, severity: 'hinweis', category: 'Freiraum', title: `Etagenbett: unten ${fmtM(sitUnder)} Sitzhöhe über der Matratze`, detail: 'Die untere Liegefläche zählt nicht als „frei darunter“. Das obere Bett braucht weiterhin Geländer und Leiter wie ein Hochbett.', targets: [a.id] })
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
        category: 'Stabilität',
        title: `Begehbares Netz zieht die Zargen mit ${pull.toFixed(1).replace('.', ',')} kN/m nach innen`,
        detail: `Bei ${Math.round(NET_SAG * 100)} % Durchhang über ${fmtCm(span, 0)} Spannweite; springt jemand in die Mitte, kommen je Seite rund ${jump.toFixed(1).replace('.', ',')} kN hinzu. Die Zargen werden dabei quer zur schwachen Achse gebogen, die Ecken auf Zug. Bewährt: kräftige Zargen (mind. 80×160 oder hochkant BSH), Ecken mit Schlossschrauben und Winkeln, Netz mit Randseil und nachspannbarer Schnürung, Bruchlast des Netzes nach Herstellerangabe. Unter dem Netz rund ${fmtCm(span * NET_SAG * 2, 0)} Durchhang frei halten – keine Kanten und Möbel darunter. Für Jugendliche und Erwachsene, nicht für Kleinkinder.`,
        targets: [a.id],
      })
    }

    // Absturzsicherung
    if (P.guard !== 'keins') {
      const aboveMattress = P.guardHeight - P.mattressThickness
      if (aboveMattress < 160) add({ id: `gelaender-hoehe:${a.id}`, severity: safety('warnung'), category: 'Sicherheit', title: `Geländer nur ${fmtCm(aboveMattress)} über der Matratze`, detail: `Empfehlung (DIN EN 747): mind. 16 cm über Matratzenoberkante und 26 cm über Liegefläche. Maximale Matratzendicke bei diesem Geländer: ${fmtCm(P.guardHeight - 160)}.`, targets: [a.id] })
      if (info.rodGap !== undefined && info.rodGap > 75 && P.guard !== 'seil') add({ id: `gelaender-spalt:${a.id}`, severity: safety('warnung'), category: 'Sicherheit', title: `Lücken im Geländer ${fmtCm(info.rodGap)}`, detail: 'Empfehlung: Öffnungen höchstens 7,5 cm (Kopf darf nicht durchpassen).', targets: [a.id] })
      if (P.guard === 'seil') add({ id: `seil:${a.id}`, severity: safety('warnung'), category: 'Sicherheit', title: 'Seilgeländer: nur für Jugendliche und Erwachsene', detail: 'Seile geben nach und lassen große Lücken. Besondere Sorgfalt bei Befestigung und Nachspannen.', targets: [a.id] })
      if (P.guard === 'netz') add({ id: `netz:${a.id}`, severity: 'hinweis', category: 'Sicherheit', title: 'Netz als Absturzsicherung', detail: 'Knotenloses PP-/Polyesternetz, Maschenweite 30–45 mm, Randseil. Befestigung alle 10–15 cm über Augschrauben oder Bohrungen, Netz etwas kleiner als den Rahmen bestellen und nach den ersten Tagen nachspannen.', targets: [a.id] })
    }
    if (info.accessWidth !== undefined) {
      if (info.accessWidth < 300) add({ id: `zugang:${a.id}`, severity: safety('warnung'), category: 'Sicherheit', title: `Einstieg nur ${fmtCm(info.accessWidth)} breit`, detail: 'Empfehlung: 30–40 cm lichte Breite.', targets: [a.id] })
      else if (info.accessWidth > 400 && prof === 'kinder') add({ id: `zugang-breit:${a.id}`, severity: 'hinweis', category: 'Sicherheit', title: `Einstieg ${fmtCm(info.accessWidth)} breit`, detail: 'DIN EN 747 empfiehlt für Kinderbetten 30–40 cm.', targets: [a.id] })
    }
    if (info.rungPitch !== undefined && (info.rungPitch < 200 || info.rungPitch > 300)) add({ id: `sprossen:${a.id}`, severity: safety('warnung'), category: 'Sicherheit', title: `Sprossenabstand ${fmtCm(info.rungPitch)}`, detail: 'Richtwert: 25 cm ± 5 cm, alle gleich.', targets: [a.id] })
    if (P.ladder === 'senkrecht' || P.ladder === 'schraeg') add({ id: `sprossen-flach:${a.id}`, severity: 'hinweis', category: 'Sicherheit', title: 'Rundsprossen sind barfuß unbequem', detail: 'Heimwerker-Erfahrung: flache Stufen in Gratnuten sind deutlich angenehmer (Leitertyp „Stufenleiter“).', targets: [a.id] })
    // Offene Seiten zur Wand
    const sides: Side[] = ['hinten', 'vorne', 'links', 'rechts']
    for (const s of sides) {
      if (info.walls.includes(s)) continue
      if (P.guard !== 'keins' && P.guardSides[s]) continue
      const gap = sideWallGap(s, fp, room, P.rotation)
      if (gap === undefined) continue
      if (gap > 75 && gap < 230) add({ id: `wandspalt:${a.id}:${s}`, severity: safety('warnung'), category: 'Sicherheit', title: `Spalt ${fmtCm(gap)} zwischen Bett (${s}) und Wand`, detail: 'Einklemmgefahr: Spalt höchstens 7,5 cm oder über 23 cm – sonst Geländer auch auf dieser Seite.', targets: [a.id] })
      else if (gap >= 230) add({ id: `offen:${a.id}:${s}`, severity: safety('fehler'), category: 'Sicherheit', title: `Seite ${s} ohne Absturzsicherung`, targets: [a.id] })
    }
    if (prof === 'kinder' && P.deckHeight > 600) add({ id: `alter:${a.id}`, severity: 'hinweis', category: 'Sicherheit', title: 'Oben schlafen erst ab 6 Jahren', targets: [a.id] })

    // Stabilität
    const wallFix = r.fixings.filter((f) => f.memberId.startsWith(`${a.id}:`) && f.target === 'wand')
    if (P.type === 'freistehend' && !P.braces && wallFix.length === 0) add({ id: `wackeln:${a.id}`, severity: 'warnung', category: 'Stabilität', title: 'Freistehendes Gestell ohne Aussteifung', detail: 'Winkel und Balkenschuhe wirken als Gelenk. Kopfbänder einschalten oder das Bett mit 2 Pfosten an der Wand befestigen (Kippsicherung).', targets: [a.id] })
    if (P.type === 'abgehaengt') add({ id: `abgehaengt:${a.id}`, severity: 'warnung', category: 'Stabilität', title: 'Abgehängte Konstruktion: besondere Sorgfalt', detail: 'Nur an tragfähiger Decke (Beton/Holzbalken, nicht Stuck), Deckenanker vom Fachhandel, Wandriegel mit Schwerlastdübeln.', targets: [a.id] })
    if (P.type === 'deckenhoch' && room.ceiling === 'holzbalken') add({ id: `decke-holz:${a.id}`, severity: 'hinweis', category: 'Stabilität', title: 'Verspannung gegen Holzbalkendecke', detail: 'Pfosten möglichst unter einem Deckenbalken verspannen und mit Lastverteilbrett arbeiten; Stuck nicht berühren.', targets: [a.id] })
    if (wallFix.length && p.settings.rentalMode) add({ id: `miete:${a.id}`, severity: 'hinweis', category: 'Raum', title: `${wallFix.reduce((s, f) => s + f.count, 0)} Bohrungen in der Wand`, detail: 'Mietwohnung: Dübellöcher für eine Kippsicherung sind üblich; größere Eingriffe mit dem Vermieter abstimmen.', targets: [a.id] })
    const weak = new Set(['porenbeton', 'lochziegel', 'trockenbau', 'leichtbau'])
    const hangers = r.members.filter((m) => m.assemblyId === a.id && m.catalogId === 'gewindestange-m10')
    if (hangers.length) {
      const c = room.ceiling
      if (c === 'schwach' || c === 'abgehaengt')
        add({ id: `decke-haengen:${a.id}`, severity: 'fehler', category: 'Stabilität', title: 'Decke ist nicht für eine Abhängung geeignet', detail: 'Laut Raumangaben trägt die Decke keine Lasten. Freie Ecke besser auf einen Pfosten stellen (Bett → „Freie Ecke getragen von“).', targets: [a.id, ...hangers.map((h) => h.id)] })
      else if (c === 'holzbalken')
        add({ id: `decke-balken:${a.id}`, severity: 'warnung', category: 'Stabilität', title: 'Abhängung nur in einen Deckenbalken', detail: 'Balkenlage suchen (Leitungssucher, Probebohrung), Gewindestange mit Stahlplatte oder Schwerlastanker im Balken, Stuck nicht berühren. Redundant auslegen.', targets: [a.id, ...hangers.map((h) => h.id)] })
    }
    if (P.frameStyle === 'aufgelegt' && wallFix.length) add({ id: `wandbalken:${a.id}`, severity: 'hinweis', category: 'Stabilität', title: 'Wandbalken-Bauweise', detail: 'Effizient und sehr tragfähig an Ziegel- oder Betonwänden: Wandbalken mit Schwerlastdübeln oder Betonschrauben alle ca. 40 cm, Querträger bzw. Latten oben auflegen und verschrauben.', targets: [a.id] })
    for (const f of wallFix) {
      const m = memberById.get(f.memberId)
      if (!m) continue
      const wall = nearestWallId(m, room)
      if (weak.has(room.walls[wall].material)) {
        const load = memberById.get(f.memberId)?.role === 'wandriegel'
        add({ id: `wandmaterial:${f.memberId}`, severity: load ? 'fehler' : 'warnung', category: 'Stabilität', title: load ? `Wandbalken an nicht tragfähiger Wand ${wall} (${room.walls[wall].material})` : `Kippsicherung in ${room.walls[wall].material} (Wand ${wall})`, detail: load ? 'Ein tragender Wandbalken braucht eine massive Wand (Ziegel, Beton, Kalksandstein). Hier besser Pfosten stellen.' : 'Dübel tragen hier nur 0,15–0,6 kN – für eine Kippsicherung reicht das meist; in Trockenbau in die Ständer schrauben.', targets: [f.memberId] })
      }
    }
    if (room.floor === 'holzdielen') add({ id: `boden:${a.id}`, severity: 'hinweis', category: 'Stabilität', title: 'Holzbalkendecke/Dielenboden', detail: 'Pfosten auf Lastverteilplatten (z. B. 20 × 20 cm Multiplex) stellen, möglichst wandnah.', targets: [a.id] })
    // Heizkörper unter der Liegefläche
    for (const o of p.wallObjects) {
      if (o.kind !== 'heizkoerper') continue
      const ob = obstacles.find((x) => x.id === `${o.id}:koerper`)
      if (!ob) continue
      const b = obbBounds(ob.box)
      if (b.max.x > fp.minX && b.min.x < fp.maxX && b.max.y > fp.minY && b.min.y < fp.maxY) add({ id: `heizung-unter:${a.id}:${o.id}`, severity: 'hinweis', category: 'Raum', title: `${o.name} liegt unter dem Bett`, detail: 'Wärme staut sich unter der Liegefläche, Thermostat muss erreichbar bleiben.', targets: [a.id, o.id] })
    }
  }

  // --- Material ----------------------------------------------------------------------
  const unsorted = new Set<string>()
  for (const m of r.members) {
    const item = catalogItem(m.catalogId)
    if (!item || item.kind !== 'stab') continue
    const L = memberLength(m)
    if (L > maxLength(item) + 0.5) add({ id: `laenge:${m.id}`, severity: 'warnung', category: 'Material', title: `${m.name ?? 'Bauteil'}: ${fmtM(L)} länger als Handelslänge ${fmtM(maxLength(item))}`, detail: 'Stoß über einem Auflager einplanen oder anderen Querschnitt wählen.', targets: [m.id] })
    if (STRUCTURAL.has(m.role) && !timber(m.catalogId).sorted) unsorted.add(m.catalogId)
  }
  for (const id of unsorted) add({ id: `sortierung:${id}`, severity: 'hinweis', category: 'Material', title: `${timber(id).name} ist nicht festigkeitssortiert`, detail: 'Wird später als C16 gerechnet. Für tragende Teile KVH (C24) empfehlen; Stücke mit großen Ästen oder Rissen aussortieren.', targets: [] })
  for (const j of r.joints) {
    if (j.kind === 'kreuzung' && j.typeId !== 'ueberblattung') add({ id: `kreuzung:${j.key}`, severity: 'warnung', category: 'Kollision', title: 'Bauteile durchdringen sich', detail: 'Überblattung wählen oder Bauteile versetzen.', targets: [j.a, j.b], pos: j.pos })
  }

  const tr = transportCheck(p, r)
  if (tr.door && tr.longest > tr.door) add({ id: 'transport', severity: 'warnung', category: 'Material', title: `${tr.name} (${fmtM(tr.longest)}) passt nicht durch die Tür`, detail: `Türdiagonale ca. ${fmtM(tr.door)}. Holz erst im Zimmer zuschneiden oder das Teil teilen (Stoß über einem Auflager). Auch Flur und Treppenhaus bedenken.`, targets: [] })
  else if (tr.door && tr.longest > tr.door - 300) add({ id: 'transport', severity: 'hinweis', category: 'Material', title: `${tr.name} (${fmtM(tr.longest)}) nur schräg durch die Tür`, detail: `Türdiagonale ca. ${fmtM(tr.door)} – lange Teile schräg tragen, Flurecken vorher ausmessen.`, targets: [] })

  // --- Projekt ------------------------------------------------------------------------
  if (p.estimated.length) add({ id: 'geschaetzt', severity: 'hinweis', category: 'Raum', title: `${p.estimated.length} Maße sind nur geschätzt`, detail: 'Raumhöhe, Fenster, Heizkörper, Stuck usw. bitte nachmessen und unter „Raum“ eintragen.', targets: [] })
  if (p.assemblies.length) add({ id: 'rauchmelder', severity: 'hinweis', category: 'Sicherheit', title: 'Rauchmelder über der Schlafebene', detail: 'Rauch staut sich unter der Decke – ein Melder oberhalb der Liegefläche ist sinnvoll.', targets: [] })

  const ack = new Set(p.settings.acknowledged)
  const order: Record<Severity, number> = { fehler: 0, warnung: 1, hinweis: 2 }
  findings.sort((a, b) => Number(ack.has(a.id)) - Number(ack.has(b.id)) || order[a.severity] - order[b.severity])
  return { findings, windows, doors, clearances }
}

function sideWallGap(s: Side, fp: { minX: number; maxX: number; minY: number; maxY: number }, room: Project['room'], rotation: number): number | undefined {
  // Lokale Seite in Weltrichtung übersetzen
  const order: Side[] = ['hinten', 'rechts', 'vorne', 'links']
  const idx = (order.indexOf(s) + rotation / 90) % 4
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

function nearestWallId(m: Member, room: Project['room']): 'A' | 'B' | 'C' | 'D' {
  const b = obbBounds(memberBoxes(m)[0])
  const gaps: ['A' | 'B' | 'C' | 'D', number][] = [
    ['A', b.min.y],
    ['B', b.min.x],
    ['C', room.width - b.max.y],
    ['D', room.length - b.max.x],
  ]
  return gaps.sort((x, y) => x[1] - y[1])[0][0]
}
