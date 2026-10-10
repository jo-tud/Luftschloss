import { tk } from '../i18n'
import type { JointKind, ProjectSettings } from './types'

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
    kinds: ['auflage', 'kreuzung'],
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
