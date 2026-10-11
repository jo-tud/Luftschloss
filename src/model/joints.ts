import { tk } from '../i18n'
import type { JointKind, Member, ProjectSettings } from './types'

/**
 * Verbindungstypen. stiffness bereitet die spätere Rahmenstatik vor: Winkel und Balkenschuhe
 * wirken nach den Herstellerdaten praktisch als Gelenk (Seitenlast nur 0,7–1,4 kN je Verbinder),
 * Aussteifung muss dann über Streben, Platten oder die Wand kommen.
 * Quellen: docs/recherche/verbindungen-befestigung-normen.md
 */
export interface JointType {
  id: string
  name: string
  group: 'stahl' | 'schraube' | 'holz'
  kinds: JointKind[]
  /** Schwierigkeit wie in Heimwerker-Anleitungen (Bosch DIY): 1 leicht, 2 mittel, 3 schwer */
  difficulty: 1 | 2 | 3
  /** Zeit je Verbindung in Minuten: Anfänger, geübt (Einschätzung, docs/recherche/verbindungen-anleitungen.md) */
  minutes: [number, number]
  /** Wie genau gebohrt werden muss: 0 kaum Bohrungen, 1 rechtwinklig bohren, 2 Bohrungen müssen sich treffen */
  drill: 0 | 1 | 2
  /** Was es schwer macht */
  hard: string
  /** Werkzeug, mit dem es komfortabler geht (tools ist das Mindeste) */
  toolsPlus?: string[]
  removable: boolean
  stiffness: 'gelenkig' | 'halbsteif' | 'steif'
  /** Anteil des Querschnitts, der an der Verbindung übrig bleibt (für spätere Statik) */
  residualSection: number
  tools: string[]
  hardware: { id: string; qty: number }[]
  note: string
  /** Grobe charakteristische Tragfähigkeit der ganzen Verbindung in kN (für die Statik-Abschätzung) */
  capacityKN: number
}

export const JOINT_TYPES: JointType[] = [
  {
    id: 'winkel',
    name: tk('Stahlwinkel mit Sicke (2 Stück)'),
    group: 'stahl',
    kinds: ['t-stoss', 'ecke', 'auflage', 'beischlag'],
    difficulty: 1,
    minutes: [15, 8],
    drill: 0,
    hard: tk('Spaltfrei spannen; alle Löcher belegen.'),
    removable: true,
    stiffness: 'gelenkig',
    residualSection: 1,
    tools: [tk('Akkuschrauber'), tk('Zwingen')],
    hardware: [
      { id: 'winkel-90', qty: 2 },
      { id: 'schraube-5x50', qty: 20 },
    ],
    note: tk('Einfachste Lösung. Senkrecht tragfähig (ca. 8 kN char. je Paar), gegen Verdrehen schwach – Aussteifung nötig.'),
    capacityKN: 8,
  },
  {
    id: 'balkenschuh',
    name: tk('Balkenschuh'),
    group: 'stahl',
    kinds: ['t-stoss'],
    difficulty: 1,
    minutes: [15, 8],
    drill: 0,
    hard: tk('Schuh lotrecht und auf richtiger Höhe ansetzen.'),
    removable: false,
    stiffness: 'gelenkig',
    residualSection: 1,
    tools: [tk('Akkuschrauber'), tk('Zwingen')],
    hardware: [
      { id: 'balkenschuh-60', qty: 1 },
      { id: 'schraube-5x50', qty: 12 },
    ],
    note: tk('Klassisch für Querträger zwischen Zargen. Volle Last nur bei Vollausnagelung/-verschraubung.'),
    capacityKN: 4.3,
  },
  {
    id: 'schlossschraube',
    name: tk('Schlossschrauben M10, durchgebolzt (2 Stück)'),
    group: 'schraube',
    kinds: ['t-stoss', 'beischlag', 'kreuzung', 'ecke'],
    difficulty: 1,
    minutes: [25, 10],
    drill: 1,
    hard: tk('Rechtwinklig durch 140–200 mm Holz bohren.'),
    removable: true,
    stiffness: 'halbsteif',
    residualSection: 0.9,
    tools: [tk('Akkuschrauber'), tk('Schlangenbohrer Ø 11 mm, lang genug'), tk('Zwingen'), tk('Gabelschlüssel 17')],
    toolsPlus: [tk('Bohrständer oder Bohrführung'), tk('Ratsche mit Nuss 17')],
    hardware: [{ id: 'schlossschraube-m10', qty: 2 }],
    note: tk('Robust und zerlegbar. Abscheren ca. 5,7 kN char. je Bolzen bei 60 mm Holz. Nach einigen Wochen nachziehen.'),
    capacityKN: 11,
  },
  {
    id: 'holzbauschraube',
    name: tk('Tellerkopfschrauben 8 mm (2–3 Stück, Länge nach Holzdicke)'),
    group: 'schraube',
    kinds: ['t-stoss', 'auflage', 'beischlag', 'kreuzung', 'ecke', 'strebe'],
    difficulty: 1,
    minutes: [15, 8],
    drill: 0,
    hard: tk('Hirnholz spaltet leicht; nur das erste Holz vorbohren.'),
    removable: false,
    stiffness: 'gelenkig',
    residualSection: 1,
    tools: [tk('Akkuschrauber (kräftig)'), tk('TX40-Bit'), tk('Holzbohrer 6 mm')],
    toolsPlus: [tk('Schlagschrauber')],
    hardware: [{ id: 'schraube-8x160', qty: 3 }],
    note: tk('Schnell und günstig. Abscheren ca. 3,3 kN char. je Schraube. Mindestholzdicke 30 mm.'),
    capacityKN: 9,
  },
  {
    id: 'bettschraube',
    name: tk('Bettschraube mit Zylindermutter'),
    group: 'schraube',
    kinds: ['t-stoss', 'ecke'],
    difficulty: 2,
    minutes: [50, 20],
    drill: 2,
    hard: tk('Querbohrung muss die Längsbohrung auf ±1 mm treffen.'),
    removable: true,
    stiffness: 'halbsteif',
    residualSection: 0.85,
    tools: [tk('Bohrmaschine'), tk('Schlangenbohrer Ø 9 × 250 mm'), tk('Holzbohrer Ø 10 mm'), tk('Zwingen'), tk('Inbusschlüssel')],
    toolsPlus: [tk('Bohrschablone für Bettbeschläge'), tk('Bohrständer')],
    hardware: [{ id: 'bettschraube-m8', qty: 2 }],
    note: tk('Unsichtbar und zerlegbar, typisch im Möbelbau. Bohrungen müssen genau sitzen.'),
    capacityKN: 4,
  },
  {
    id: 'auflage',
    name: tk('Stumpfe Auflage, verschraubt'),
    group: 'holz',
    kinds: ['auflage', 'kreuzung'],
    difficulty: 1,
    minutes: [10, 5],
    drill: 0,
    hard: tk('Auflagerhöhe genau treffen.'),
    removable: true,
    stiffness: 'gelenkig',
    residualSection: 1,
    tools: [tk('Akkuschrauber')],
    hardware: [{ id: 'schraube-8x160', qty: 2 }],
    note: tk('Last geht direkt über Druck ins untere Holz – die tragfähigste einfache Lösung.'),
    capacityKN: 20,
  },
  {
    id: 'auflagerleiste',
    name: tk('Auflage auf angeschraubter Leiste'),
    group: 'holz',
    kinds: ['t-stoss'],
    difficulty: 1,
    minutes: [20, 10],
    drill: 0,
    hard: tk('Leiste genau auf Höhe und waagrecht anschrauben.'),
    removable: true,
    stiffness: 'gelenkig',
    residualSection: 1,
    tools: [tk('Akkuschrauber')],
    hardware: [{ id: 'schraube-5x50', qty: 6 }],
    note: tk('Leiste unter dem Querträger trägt; Schrauben der Leiste auf Abscheren beansprucht.'),
    capacityKN: 5,
  },
  {
    id: 'ausklinkung',
    name: tk('Ausklinkung / Einlassung'),
    group: 'holz',
    kinds: ['auflage', 't-stoss', 'beischlag'],
    difficulty: 2,
    minutes: [75, 30],
    drill: 0,
    hard: tk('Ebener Grund und Passung auf ±0,5 mm.'),
    removable: true,
    stiffness: 'halbsteif',
    residualSection: 0.75,
    tools: [tk('Japansäge'), tk('Stechbeitel'), tk('Streichmaß')],
    toolsPlus: [tk('Handkreissäge mit Tiefenanschlag'), tk('Grundhobel'), tk('Oberfräse')],
    hardware: [{ id: 'schraube-8x160', qty: 2 }],
    note: tk('Unterseitig höchstens h/4 ausklinken, Innenecke ausrunden. Schwächt den Schub am Auflager.'),
    capacityKN: 12,
  },
  {
    id: 'ueberblattung',
    name: tk('Überblattung (Eck-, T- oder Kreuzblatt)'),
    group: 'holz',
    kinds: ['ecke', 't-stoss', 'kreuzung'],
    difficulty: 2,
    minutes: [75, 30],
    drill: 0,
    hard: tk('Ebener Grund; beide Hälften müssen genau gleich tief sein.'),
    removable: false,
    stiffness: 'halbsteif',
    residualSection: 0.5,
    tools: [tk('Feinsäge'), tk('Stechbeitel'), tk('Streichmaß'), tk('Holzleim')],
    toolsPlus: [tk('Handkreissäge mit Tiefenanschlag'), tk('Grundhobel'), tk('Oberfräse')],
    hardware: [{ id: 'schraube-8x160', qty: 2 }],
    note: tk('Beide Hölzer auf halbe Dicke. Nur ca. 50 % Restquerschnitt – für geringere Lasten.'),
    capacityKN: 6,
  },
  {
    id: 'schwalbenschwanz',
    name: tk('Schwalbenschwanzblatt'),
    group: 'holz',
    kinds: ['t-stoss', 'ecke'],
    difficulty: 3,
    minutes: [120, 45],
    drill: 0,
    hard: tk('Schräge Flanken sägen und den Umriss genau übertragen.'),
    removable: false,
    stiffness: 'halbsteif',
    residualSection: 0.5,
    tools: [tk('Feinsäge'), tk('Stechbeitel'), tk('Schmiege'), tk('Holzleim')],
    toolsPlus: [tk('Schablone 1:6'), tk('Oberfräse')],
    hardware: [{ id: 'holzduebel-10', qty: 2 }],
    note: tk('Zugfest ohne Metall. Neigung 1:6 bei Nadelholz. Viel Handarbeit.'),
    capacityKN: 6,
  },
  {
    id: 'zapfen',
    name: tk('Zapfen und Zapfenloch mit Holznagel'),
    group: 'holz',
    kinds: ['t-stoss', 'ecke'],
    difficulty: 3,
    minutes: [150, 50],
    drill: 1,
    hard: tk('Zapfenloch senkrecht stemmen; Anfänger stemmen leicht 1–2° schief.'),
    removable: false,
    stiffness: 'steif',
    residualSection: 0.67,
    tools: [tk('Feinsäge'), tk('Stechbeitel'), tk('Forstnerbohrer'), tk('Streichmaß'), tk('Holzleim')],
    toolsPlus: [tk('Bohrständer'), tk('Kettenstemmer oder Domino')],
    hardware: [{ id: 'holzduebel-10', qty: 2 }],
    note: tk('Zapfendicke ca. 1/3 des Holzes. Klassisch und steif, aber aufwändig.'),
    capacityKN: 8,
  },
  {
    id: 'holzduebel',
    name: tk('Holzdübel geleimt'),
    group: 'holz',
    kinds: ['t-stoss', 'ecke', 'strebe'],
    difficulty: 2,
    minutes: [40, 15],
    drill: 2,
    hard: tk('Gegenlöcher müssen genau gegenüber sitzen und senkrecht sein.'),
    removable: false,
    stiffness: 'halbsteif',
    residualSection: 0.9,
    tools: [tk('Bohrmaschine'), tk('Holzbohrer 10 mm mit Zentrierspitze'), tk('Dübelspitzen'), tk('Holzleim')],
    toolsPlus: [tk('Dübelhilfe'), tk('Domino')],
    hardware: [{ id: 'holzduebel-10', qty: 4 }],
    note: tk('Für Geländer und leichte Teile.'),
    capacityKN: 3,
  },
  {
    id: 'lose',
    name: tk('Lose aufgelegt (ggf. 1 Schraube gegen Verrutschen)'),
    group: 'holz',
    kinds: ['auflage', 'kreuzung', 'beischlag'],
    difficulty: 1,
    minutes: [5, 3],
    drill: 0,
    hard: tk('Gleiche Abstände der Latten.'),
    removable: true,
    stiffness: 'gelenkig',
    residualSection: 1,
    tools: [tk('Akkuschrauber')],
    hardware: [{ id: 'schraube-5x50', qty: 1 }],
    note: tk('Für Latten der Liegefläche üblich; Filz- oder Gummistreifen gegen Quietschen.'),
    capacityKN: 1.5,
  },
  {
    id: 'stecken',
    name: tk('Rundstab in Bohrung, geleimt'),
    group: 'holz',
    kinds: ['t-stoss', 'ecke', 'kreuzung'],
    difficulty: 2,
    minutes: [30, 15],
    drill: 1,
    hard: tk('Bohrungen senkrecht und gleich tief.'),
    removable: false,
    stiffness: 'halbsteif',
    residualSection: 0.8,
    tools: [tk('Bohrmaschine'), tk('Forstner- oder Holzbohrer in Stabdicke'), tk('Holzleim')],
    toolsPlus: [tk('Bohrständer'), tk('Bohrführung')],
    hardware: [],
    note: tk('Übliche Lösung für Geländerstäbe und Leitersprossen (Buche Ø 30–35 mm). Bohrtiefe ca. 2/3 der Holzdicke, optional mit Schraube sichern.'),
    capacityKN: 2,
  },
  {
    id: 'gratnut',
    name: tk('Stufe in Gratnut, geleimt'),
    group: 'holz',
    kinds: ['t-stoss'],
    difficulty: 3,
    minutes: [150, 30],
    drill: 0,
    hard: tk('Sehr exakte Nut und Feder; mit der Hand anspruchsvoll.'),
    removable: false,
    stiffness: 'halbsteif',
    residualSection: 0.8,
    tools: [tk('Gratsäge oder Feinsäge'), tk('Stechbeitel'), tk('Grundhobel'), tk('Holzleim')],
    toolsPlus: [tk('Oberfräse mit Gratfräser'), tk('Führungsleisten')],
    hardware: [{ id: 'schraube-5x50', qty: 2 }],
    note: tk('Flache Stufen in Wangen eingelassen – angenehmer als Rundsprossen (Forenempfehlung).'),
    capacityKN: 4,
  },
  {
    id: 'seilbefestigung',
    name: tk('Seil durch Bohrung bzw. Augschraube, verknotet'),
    group: 'stahl',
    kinds: ['t-stoss', 'ecke', 'kreuzung', 'beischlag'],
    difficulty: 1,
    minutes: [15, 10],
    drill: 0,
    hard: tk('Knoten richtig setzen und nachspannen.'),
    removable: true,
    stiffness: 'gelenkig',
    residualSection: 0.95,
    tools: [tk('Bohrmaschine')],
    hardware: [{ id: 'netzhaken', qty: 1 }],
    note: tk('Nachspannen nach den ersten Tagen einplanen.'),
    capacityKN: 2,
  },
  {
    id: 'gewindestange',
    name: tk('Gewindestange mit Muttern und Unterlegscheiben'),
    group: 'stahl',
    kinds: ['t-stoss', 'kreuzung', 'beischlag', 'ecke', 'auflage'],
    difficulty: 1,
    minutes: [20, 10],
    drill: 1,
    hard: tk('Nur in tragfähige Decken; rechtwinklig bohren.'),
    removable: true,
    stiffness: 'gelenkig',
    residualSection: 0.9,
    tools: [tk('Bohrmaschine'), tk('Gabelschlüssel')],
    hardware: [],
    note: tk('Für Abhängungen nur in tragfähige Decken (Beton oder Holzbalken), nie in Stuck oder abgehängte Decken.'),
    capacityKN: 3,
  },
  {
    id: 'kopfband',
    name: tk('Kopfband/Strebe, verschraubt'),
    group: 'holz',
    kinds: ['strebe'],
    difficulty: 1,
    minutes: [30, 15],
    drill: 0,
    hard: tk('Gleiche Längen und genau 45°.'),
    removable: true,
    stiffness: 'gelenkig',
    residualSection: 1,
    tools: [tk('Gehrungssäge oder Schmiege und Handsäge'), tk('Akkuschrauber'), tk('Holzbohrer 4 mm')],
    toolsPlus: [tk('Kappsäge')],
    hardware: [{ id: 'schraube-8x160', qty: 2 }],
    note: tk('Enden auf 45° sägen, satt anlegen und je Ende 2 Schrauben durch das Kopfband in Pfosten bzw. Zarge. Steift die Ecke aus – möglichst in beiden Richtungen anordnen.'),
    capacityKN: 6,
  },
  {
    id: 'versatz',
    name: tk('Kopfband eingelassen (einfacher Versatz)'),
    group: 'holz',
    kinds: ['strebe'],
    difficulty: 2,
    minutes: [90, 40],
    drill: 0,
    hard: tk('Winkel und Tiefe der Einlassung gleichzeitig treffen.'),
    removable: true,
    stiffness: 'gelenkig',
    residualSection: 0.9,
    tools: [tk('Gehrungssäge'), tk('Japansäge'), tk('Stechbeitel'), tk('Akkuschrauber')],
    toolsPlus: [tk('Kappsäge')],
    hardware: [{ id: 'schraube-8x160', qty: 2 }],
    note: tk('Kopfbandende 15 mm tief in Pfosten und Zarge eingelassen: Der Druck geht Holz auf Holz, je eine Schraube sichert nur. Mit Säge und Stechbeitel gut machbar, trägt deutlich mehr als nur verschraubt.'),
    capacityKN: 12,
  },
]

const BY_ID = new Map(JOINT_TYPES.map((j) => [j.id, j]))

export function jointType(id: string): JointType | undefined {
  return BY_ID.get(id)
}

export function typesForKind(kind: JointKind): JointType[] {
  return JOINT_TYPES.filter((j) => j.kinds.includes(kind))
}

/** Verbindung zwischen zwei Bauteilen; ending ist das am Stoß endende Teil */
export interface JointMembers {
  kind: JointKind
  a: Member
  b: Member
  ending?: Member
}

/**
 * Warum eine Verbindungsart für genau diese zwei Bauteile nicht taugt (undefined = passt).
 * Die Typliste je Stoßart ist absichtlich weit; hier fallen Kombinationen heraus, die sich am
 * echten Holz nicht herstellen oder nicht fügen lassen.
 */
export function unsuitable(typeId: string, jm: JointMembers): string | undefined {
  const { a, b } = jm
  const E = jm.ending ?? a
  const T = E === a ? b : a
  const both = [a, b]
  const thin = (m: Member) => Math.min(m.b, m.h)
  const rope = both.some((m) => m.catalogId === 'seil-12')
  const rod = both.some((m) => m.catalogId === 'gewindestange-m10')
  const round = both.some((m) => m.round)
  const len = Math.hypot(E.end.x - E.start.x, E.end.y - E.start.y, E.end.z - E.start.z) || 1
  const horizontal = Math.abs(E.end.z - E.start.z) / len < 0.3
  // Brett bzw. Stufe: dünn und breit (Geländerbrett 18, Stufe 24 mm); Latten und Kanthölzer nicht
  const board = thin(E) <= 30 && Math.max(E.b, E.h) >= 3 * thin(E)
  if (typeId === 'seilbefestigung') return rope ? undefined : tk('Nur für Seile.')
  if (typeId === 'gewindestange') return rod ? undefined : tk('Nur für Abhängungen mit Gewindestange.')
  if (rope && typeId !== 'lose' && typeId !== 'auflage') return tk('Ein Seil wird angeknotet, nicht verschraubt oder verzapft.')
  if (rod) return tk('Die Gewindestange wird mit Muttern befestigt.')
  if (typeId === 'stecken') return E.round ? undefined : tk('Nur für Rundstäbe – ein Kantholz passt in keine Bohrung.')
  if (round && !['holzbauschraube', 'auflage', 'lose'].includes(typeId)) return tk('Rundstäbe werden gesteckt oder verschraubt; Winkel, Bolzen und Zimmermannsverbindungen finden am runden Holz keinen Halt.')
  // fast parallel (Leitergriff am Holm): nur seitlich durch die Überdeckung verbinden
  const axis = (m: Member) => {
    const l = Math.hypot(m.end.x - m.start.x, m.end.y - m.start.y, m.end.z - m.start.z) || 1
    return [(m.end.x - m.start.x) / l, (m.end.y - m.start.y) / l, (m.end.z - m.start.z) / l]
  }
  const [p, q] = [axis(a), axis(b)]
  const along = Math.abs(p[0] * q[0] + p[1] * q[1] + p[2] * q[2])
  if (along > 0.85 && !['schlossschraube', 'holzbauschraube', 'lose', 'auflage', 'seilbefestigung'].includes(typeId)) return tk('Die Hölzer liegen fast parallel – hier hilft nur, sie seitlich durch die Überdeckung zu verschrauben oder zu verbolzen.')
  switch (typeId) {
    case 'gratnut':
      return board ? undefined : tk('Nur für Bretter und Stufen, die in eine Nut geschoben werden.')
    case 'zapfen':
    case 'schwalbenschwanz':
    case 'holzduebel':
      if (thin(E) < 40 || thin(T) < 40) return tk('Holz zu dünn – Zapfen, Schwalbenschwanz und Dübel brauchen mindestens 40 mm Stärke.')
      // zwei Dübel Ø 10 tragen die Last einer Zarge nicht dauerhaft (Leim im Hirnholz hält kaum)
      if (typeId === 'holzduebel' && jm.ending && horizontal && (E.role === 'zarge' || E.role === 'quertraeger')) return tk('Dübel tragen die Last von Zarge bzw. Querträger nicht dauerhaft – Bolzen, Balkenschuh oder Zapfen nehmen.')
      return undefined
    case 'ueberblattung':
      return thin(a) < 40 || thin(b) < 40 ? tk('Holz zu dünn zum Überblatten – jedes Teil verliert die halbe Stärke.') : undefined
    case 'balkenschuh':
    case 'auflagerleiste': {
      if (!horizontal) return tk('Nur für liegende Träger, die von oben eingelegt werden.')
      if (board) return tk('Für Bretter zu schmal – eher anschrauben.')
      // Unterkanten (bei liegenden Hölzern Mitte − h/2, bei Pfosten das untere Ende)
      const bottom = (m: Member) => Math.min(m.start.z, m.end.z) - (Math.abs(m.end.z - m.start.z) / (Math.hypot(m.end.x - m.start.x, m.end.y - m.start.y, m.end.z - m.start.z) || 1) < 0.3 ? m.h / 2 : 0)
      if (typeId === 'auflagerleiste' && bottom(E) - bottom(T) < 30) return tk('Unter dem Träger ist am tragenden Holz kein Platz für eine Leiste – Balkenschuh oder Knagge nehmen.')
      // Laschen des Balkenschuhs (je 40 mm) müssen neben dem Träger auf das tragende Holz passen
      if (typeId === 'balkenschuh' && !T.round && Math.max(T.b, T.h) < E.b + 2 * 40 && Math.abs(T.end.z - T.start.z) > Math.hypot(T.end.x - T.start.x, T.end.y - T.start.y)) return tk('Der Pfosten ist zu schmal für die Laschen des Balkenschuhs – Winkel oder Bolzen nehmen.')
      return undefined
    }
    case 'bettschraube':
      return thin(E) < 44 ? tk('Holz zu dünn für die Quermutter der Bettschraube (mindestens 44 mm).') : undefined
    case 'ausklinkung':
      // die Einlassung wird wie der stumpfe Stoß ins Hirnholz verschraubt – bei Brettern spaltet das
      return jm.ending && thin(E) < 30 && !rope ? tk('Brett zu dünn für Schrauben ins Hirnholz – Stufen in eine Gratnut, Bretter mit Winkeln oder seitlich überlappend befestigen.') : undefined
    case 'holzbauschraube':
      // ins Hirnholz eines Bretts: Schraube höchstens 1/3 der Dicke und kaum Randabstand – das spaltet
      return jm.ending && thin(E) < 30 && !rope ? tk('Brett zu dünn für Schrauben ins Hirnholz – besser mit Winkeln, einer Einlassung oder seitlich überlappend befestigen.') : undefined
    case 'winkel':
      if (jm.kind === 'beischlag') return tk('Seitlich anliegende Hölzer bilden keine Ecke für einen Winkel – durchschrauben oder verbolzen.')
      // Winkel 90 mm überragen eine liegende Latte (Lattenrost): Latten werden aufgeschraubt
      if (jm.kind === 'auflage' && Math.min(...[a, b].filter((m) => Math.abs(m.end.z - m.start.z) < 1).map((m) => m.h), 999) < 60) return tk('Die Latte ist niedriger als der Winkel – Latten von oben aufschrauben.')
      return undefined
    case 'schlossschraube':
      return board && thin(E) < 25 ? tk('Brett zu dünn für einen Bolzen – eher anschrauben.') : undefined
  }
  return undefined
}

/** Verbindungsarten für diese Stoßart, jeweils mit Grund, falls sie hier nicht taugt */
export function jointOptions(jm: JointMembers): { type: JointType; reason?: string }[] {
  return typesForKind(jm.kind).map((type) => ({ type, reason: unsuitable(type.id, jm) }))
}

export function defaultJointType(kind: JointKind, pref: ProjectSettings['jointPreference']): string {
  switch (kind) {
    case 'strebe':
      return 'kopfband'
    case 'auflage':
      return 'auflage'
    case 'kreuzung':
      return pref === 'wenig-metall' ? 'ueberblattung' : 'holzbauschraube'
    case 'beischlag':
      return 'schlossschraube'
    case 'laengsstoss':
      return 'holzbauschraube'
    case 'ecke':
    case 't-stoss':
      if (pref === 'zerlegbar') return 'schlossschraube'
      if (pref === 'wenig-metall') return 'zapfen'
      return 'winkel'
  }
}

export const JOINT_KIND_LABEL: Record<JointKind, string> = {
  ecke: tk('Eckstoß'),
  't-stoss': tk('T-Stoß'),
  kreuzung: tk('Kreuzung'),
  auflage: tk('Auflage'),
  laengsstoss: tk('Längsstoß'),
  strebe: tk('Strebenanschluss'),
  beischlag: tk('Beischlag (seitlich angelegt)'),
}
