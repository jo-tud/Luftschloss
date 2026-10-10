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
  difficulty: 1 | 2 | 3
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
    removable: true,
    stiffness: 'gelenkig',
    residualSection: 1,
    tools: [tk('Akkuschrauber')],
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
    removable: false,
    stiffness: 'gelenkig',
    residualSection: 1,
    tools: [tk('Akkuschrauber')],
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
    removable: true,
    stiffness: 'halbsteif',
    residualSection: 0.9,
    tools: [tk('Akkuschrauber'), tk('Holzbohrer 10 mm'), tk('Gabelschlüssel 17')],
    hardware: [{ id: 'schlossschraube-m10', qty: 2 }],
    note: tk('Robust und zerlegbar. Abscheren ca. 5,7 kN char. je Bolzen bei 60 mm Holz. Nach einigen Wochen nachziehen.'),
    capacityKN: 11,
  },
  {
    id: 'holzbauschraube',
    name: tk('Holzbauschrauben 8×160 (2–4 Stück)'),
    group: 'schraube',
    kinds: ['t-stoss', 'auflage', 'beischlag', 'kreuzung', 'ecke', 'strebe'],
    difficulty: 1,
    removable: false,
    stiffness: 'gelenkig',
    residualSection: 1,
    tools: [tk('Akkuschrauber (kräftig)'), tk('TX40-Bit')],
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
    removable: true,
    stiffness: 'halbsteif',
    residualSection: 0.85,
    tools: [tk('Bohrmaschine'), tk('Forstnerbohrer'), tk('Bohrschablone')],
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
    removable: true,
    stiffness: 'halbsteif',
    residualSection: 0.75,
    tools: [tk('Handkreissäge oder Japansäge'), tk('Stechbeitel')],
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
    removable: false,
    stiffness: 'halbsteif',
    residualSection: 0.5,
    tools: [tk('Handkreissäge'), tk('Stechbeitel'), tk('Holzleim')],
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
    removable: false,
    stiffness: 'halbsteif',
    residualSection: 0.5,
    tools: [tk('Feinsäge'), tk('Stechbeitel'), tk('Schmiege (1:6 Nadelholz)')],
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
    removable: false,
    stiffness: 'steif',
    residualSection: 0.67,
    tools: [tk('Stemmeisen'), tk('Bohrmaschine'), tk('Feinsäge'), tk('Holzleim')],
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
    removable: false,
    stiffness: 'halbsteif',
    residualSection: 0.9,
    tools: [tk('Bohrmaschine'), tk('Dübelhilfe'), tk('Holzleim')],
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
    difficulty: 1,
    removable: false,
    stiffness: 'halbsteif',
    residualSection: 0.8,
    tools: [tk('Bohrmaschine'), tk('Forstner- oder Holzbohrer in Stabdicke'), tk('Holzleim')],
    hardware: [],
    note: tk('Übliche Lösung für Geländerstäbe und Leitersprossen (Buche Ø 30–35 mm). Bohrtiefe ca. 2/3 der Holzdicke, optional mit Schraube sichern.'),
    capacityKN: 2,
  },
  {
    id: 'gratnut',
    name: tk('Stufe in Gratnut, geleimt'),
    group: 'holz',
    kinds: ['t-stoss'],
    difficulty: 2,
    removable: false,
    stiffness: 'halbsteif',
    residualSection: 0.8,
    tools: [tk('Oberfräse mit Führung oder Tauchsäge'), tk('Holzleim')],
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
    removable: true,
    stiffness: 'gelenkig',
    residualSection: 1,
    tools: [tk('Kapp- oder Gehrungssäge (45°)'), tk('Akkuschrauber')],
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
    removable: true,
    stiffness: 'gelenkig',
    residualSection: 0.9,
    tools: [tk('Kapp- oder Gehrungssäge (45°)'), tk('Japansäge'), tk('Stechbeitel'), tk('Akkuschrauber')],
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
  const board = thin(E) <= 45 && Math.max(E.b, E.h) >= 2 * thin(E)
  if (typeId === 'seilbefestigung') return rope ? undefined : tk('Nur für Seile.')
  if (typeId === 'gewindestange') return rod ? undefined : tk('Nur für Abhängungen mit Gewindestange.')
  if (rope && typeId !== 'lose' && typeId !== 'auflage') return tk('Ein Seil wird angeknotet, nicht verschraubt oder verzapft.')
  if (rod) return tk('Die Gewindestange wird mit Muttern befestigt.')
  if (typeId === 'stecken') return E.round ? undefined : tk('Nur für Rundstäbe – ein Kantholz passt in keine Bohrung.')
  if (round && !['holzbauschraube', 'auflage', 'lose'].includes(typeId)) return tk('Rundstäbe werden gesteckt oder verschraubt; Winkel, Bolzen und Zimmermannsverbindungen finden am runden Holz keinen Halt.')
  switch (typeId) {
    case 'gratnut':
      return board ? undefined : tk('Nur für Bretter und Stufen, die in eine Nut geschoben werden.')
    case 'zapfen':
    case 'schwalbenschwanz':
    case 'holzduebel':
      if (thin(E) < 40 || thin(T) < 40) return tk('Holz zu dünn – Zapfen, Schwalbenschwanz und Dübel brauchen mindestens 40 mm Stärke.')
      return undefined
    case 'ueberblattung':
      return thin(a) < 40 || thin(b) < 40 ? tk('Holz zu dünn zum Überblatten – jedes Teil verliert die halbe Stärke.') : undefined
    case 'balkenschuh':
    case 'auflagerleiste':
      if (!horizontal) return tk('Nur für liegende Träger, die von oben eingelegt werden.')
      return board ? tk('Für Bretter zu schmal – eher anschrauben.') : undefined
    case 'bettschraube':
      return thin(E) < 44 ? tk('Holz zu dünn für die Quermutter der Bettschraube (mindestens 44 mm).') : undefined
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
