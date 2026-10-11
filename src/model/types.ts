// Alle Längen in ganzzahligen Millimetern. Koordinaten: Ursprung in der Raumecke zwischen
// Wand A und Wand B, x entlang Wand A, y in den Raum hinein, z nach oben.

export type Mm = number

export interface Vec3 {
  x: Mm
  y: Mm
  z: Mm
}

export type WallId = 'A' | 'B' | 'C' | 'D'
export const WALL_IDS: WallId[] = ['A', 'B', 'C', 'D']

export type WallMaterial =
  | 'beton'
  | 'kalksandstein'
  | 'vollziegel'
  | 'lochziegel'
  | 'porenbeton'
  | 'trockenbau'
  | 'holzstaender'
  | 'leichtbau'

export type CeilingMaterial = 'beton' | 'holzbalken' | 'abgehaengt' | 'schwach'
export type FloorMaterial = 'estrich' | 'fussbodenheizung' | 'holzdielen'

/** Stuckleiste am Übergang Wand/Decke, vereinfacht als Profil mit Höhe an der Wand und Ausladung an der Decke. */
export interface CorniceProfile {
  enabled: boolean
  /** Höhe an der Wand, gemessen von der Decke nach unten */
  height: Mm
  /** Ausladung an der Decke, gemessen von der Wand in den Raum */
  projection: Mm
  shape: 'kehle' | 'schraege' | 'rechteck'
}

export interface Rosette {
  id: string
  x: Mm
  y: Mm
  diameter: Mm
  /** Wie weit die Rosette von der Decke nach unten ragt */
  depth: Mm
  /** Abhängung der Lampe ab Decke, 0 = Deckenleuchte direkt an der Rosette */
  lampDrop: Mm
  lampDiameter: Mm
}

export interface Room {
  length: Mm // entlang x (Wand A und C)
  width: Mm // entlang y (Wand B und D)
  height: Mm
  wallThickness: Mm
  walls: Record<WallId, { material: WallMaterial; studSpacing?: Mm }>
  floor: FloorMaterial
  ceiling: CeilingMaterial
  cornice: CorniceProfile
  /** Abweichende Stuckleiste je Wand (sonst gilt die gemeinsame) */
  corniceOverrides: Partial<Record<WallId, CorniceProfile>>
  skirting: { enabled: boolean; height: Mm; depth: Mm }
  rosettes: Rosette[]
  /** Dachschrägen je Wand (fehlt = senkrechte Wand bis zur Decke) */
  slopes?: Partial<Record<WallId, Slope>>
}

/** Dachschräge über einer Wand: senkrecht bis zum Kniestock, dann geneigt bis zur Raumhöhe */
export interface Slope {
  kneeHeight: Mm
  /** Neigung gegen die Waagrechte in Grad */
  angle: number
}

export type SashOpening = 'fest' | 'dreh' | 'kipp' | 'drehkipp'

export interface Sash {
  opening: SashOpening
  hinge: 'links' | 'rechts'
}

interface WallObjectBase {
  id: string
  name: string
  wall: WallId
  /** Abstand der linken Kante von der linken Wandecke, vom Raum aus gesehen */
  offset: Mm
  width: Mm
}

export interface WindowObj extends WallObjectBase {
  kind: 'fenster'
  sillHeight: Mm // Brüstungshöhe
  height: Mm
  /** Abstand der Rahmen-Innenseite von der inneren Wandoberfläche (Laibung innen) */
  revealDepth: Mm
  sashes: Sash[]
  sashThickness: Mm
  /** Breite des Blendrahmens; die Bänder sitzen um dieses Maß innerhalb der Nische */
  frameWidth: Mm
  handleProjection: Mm
  /**
   * Fensternische: Bei dicken Altbauwänden sitzt der Rahmen tief in der Wand. Optional reicht die
   * Nische unter der Fensterbank bis zum Boden (Heizkörpernische) mit eigener Tiefe.
   */
  niche: { below: boolean; belowDepth: Mm }
  /** Innere Fensterbank */
  sill: { enabled: boolean; projection: Mm; thickness: Mm; sideOverhang: Mm }
  /** Nur Darstellung: aktueller Öffnungswinkel der Drehflügel */
  displayAngle: number
}

export interface DoorObj extends WallObjectBase {
  kind: 'tuer'
  height: Mm
  hinge: 'links' | 'rechts'
  opensInward: boolean
  displayAngle: number
}

export interface RadiatorObj extends WallObjectBase {
  kind: 'heizkoerper'
  bottom: Mm
  height: Mm
  depth: Mm
  wallGap: Mm
  /** Freihaltebereich oberhalb für Konvektion */
  convectionClearance: Mm
}

export interface SocketObj extends WallObjectBase {
  kind: 'steckdose'
  bottom: Mm
  height: Mm
}

/**
 * Mauervorsprung vom Boden bis zur Decke: Kamin, Pfeiler, Schacht – oder, in eine Ecke gesetzt, eine
 * ausgesparte Raumecke (L-förmiger Raum)
 */
export interface ProjectionObj extends WallObjectBase {
  kind: 'vorsprung'
  /** wie weit er in den Raum ragt */
  depth: Mm
}

export type WallObject = WindowObj | DoorObj | RadiatorObj | SocketObj | ProjectionObj

export type FurnitureKind =
  | 'schreibtisch'
  | 'stuhl'
  | 'sofa'
  | 'schrank'
  | 'regal'
  | 'kommode'
  | 'koerper'
  | 'person-stehend'
  | 'person-sitzend'

export interface Furniture {
  id: string
  kind: FurnitureKind
  name: string
  x: Mm // linke untere Ecke in der Draufsicht (vor Drehung)
  y: Mm
  z: Mm
  sx: Mm
  sy: Mm
  sz: Mm
  rotation: 0 | 90 | 180 | 270
}

export type MemberRole =
  | 'pfosten'
  | 'zarge'
  | 'quertraeger'
  | 'leiste'
  | 'strebe'
  | 'holm'
  | 'sprosse'
  | 'stab'
  | 'stufe'
  | 'wandriegel'
  | 'sonstiges'

export interface Member {
  id: string
  role: MemberRole
  name?: string
  start: Vec3
  end: Vec3
  /** Katalog-Artikel; bestimmt Querschnitt und Material */
  catalogId: string
  /** Breite b und Höhe h des Querschnitts; bei Rundholz ist b = h = Durchmesser */
  b: Mm
  h: Mm
  round?: boolean
  /** Drehung des Querschnitts um die Stabachse in Grad */
  roll: number
  /** Ausklinkungen, z. B. für Sockelleiste oder Stuck */
  notches?: Notch[]
  /**
   * Abweichende Körperform für die Darstellung, z. B. Kopfband mit Gehrungsschnitten: Vieleck in
   * (eu, ev) ab origin, extrudiert entlang en über range. Statik und Kollision nutzen weiter den Quader.
   */
  shape?: MemberShape
  assemblyId?: string
  partKey?: string
  /** Selbst konstruiertes Bett, zu dem dieses freie Teil gehört */
  groupId?: string
}

export interface MemberShape {
  origin: Vec3
  eu: Vec3
  ev: Vec3
  en: Vec3
  poly: [number, number][]
  range: [number, number]
}

/**
 * Rechteckige Ausklinkung an einer Seite des Stabs. along/length entlang der Stabachse ab Start,
 * depth senkrecht zur Seite. Die Seite ist in lokalen Querschnittsachsen angegeben.
 */
export interface Notch {
  along: Mm
  length: Mm
  depth: Mm
  side: '+b' | '-b' | '+h' | '-h'
  reason: string
}

export type PanelKind = 'platte' | 'dielen' | 'rollrost' | 'lattenrost' | 'netz' | 'matratze'

export interface Panel {
  id: string
  kind: PanelKind
  name?: string
  /** Umriss in der Draufsicht (oder in der lokalen Ebene bei senkrechten Flächen) */
  outline: { x: Mm; y: Mm }[]
  /** Unterkante */
  z: Mm
  thickness: Mm
  catalogId?: string
  /** Bei Dielen: Verlegerichtung in Grad (0 = entlang x) */
  direction?: number
  /** Senkrechte Fläche (Geländerfüllung, Netz): Linie von a nach b, von z bis z + height */
  vertical?: { a: { x: Mm; y: Mm }; b: { x: Mm; y: Mm }; height: Mm }
  assemblyId?: string
  partKey?: string
  groupId?: string
}

export type BedType =
  | 'freistehend'
  | 'deckenhoch'
  | 'wandseitig'
  | 'eck'
  | 'nische'
  | 'abgehaengt'

export type DeckType = 'latten' | 'platte' | 'dielen' | 'rollrost' | 'lattenrost' | 'netz'
export type GuardType = 'staebe' | 'bretter' | 'platte' | 'netz' | 'seil' | 'keins'
export type LadderType = 'senkrecht' | 'schraeg' | 'stufen' | 'treppe' | 'keine'
export type Side = 'vorne' | 'hinten' | 'links' | 'rechts'

export interface LoftBedParams {
  type: BedType
  /** Lage der hinteren linken Außenecke des Gestells */
  x: Mm
  y: Mm
  rotation: 0 | 90 | 180 | 270
  /** Spiegeln entlang der Bettlänge (links ↔ rechts), vor der Drehung */
  mirror: boolean
  mattressLength: Mm
  mattressWidth: Mm
  /** Anzahl Matratzen auf der Liegefläche (z. B. zwei Kinder oben) */
  mattressCount: number
  /** Mehrere Matratzen nebeneinander (Liegefläche breiter) oder hintereinander (länger) */
  mattressLayout: 'nebeneinander' | 'hintereinander'
  mattressThickness: Mm
  /** Spiel zwischen Matratze und Geländer bzw. Pfosten je Seite */
  mattressGap: Mm
  /** Abstand zwischen mehreren Matratzen (z. B. für eine Ablage dazwischen); fehlt = wie mattressGap */
  mattressSpacing?: Mm
  /** Oberkante der Liegefläche (Matratzenauflage) über dem Boden */
  deckHeight: Mm
  postCatalogId: string
  railCatalogId: string
  joistCatalogId: string
  deck: DeckType
  deckCatalogId: string
  /** Maximaler Abstand der Querträger */
  joistSpacing: Mm
  /** Lichter Abstand der Latten bei Liegefläche „latten“ */
  slatGap: Mm
  guard: GuardType
  guardHeight: Mm // über Oberkante Liegefläche
  guardSides: Record<Side, boolean>
  guardCatalogId: string
  /** Kopfbänder; fehlt = Geländerholz, wenn es ein Kantholz ist, sonst 54×74 gehobelt */
  braceCatalogId?: string
  ladder: LadderType
  ladderSide: Side
  /** Bei Eckbett: Ende, das an der Wand liegt */
  wallEnd: 'links' | 'rechts'
  /** Abstand der Leiter von der linken Ecke der Seite (Außenkante Pfosten) */
  ladderOffset: Mm
  ladderWidth: Mm
  ladderCatalogId: string
  rungCatalogId: string
  /** Neigung von schrägen Leitern und Treppen in Grad (90 = senkrecht) */
  ladderAngle: number
  braces: boolean
  /**
   * zargen: Querträger hängen zwischen den Zargen (Balkenschuh, Winkel).
   * aufgelegt: Querträger bzw. Latten liegen oben auf Wandbalken und Frontbalken – die
   * einfachste und tragfähigste Bauweise, besonders an massiven Wänden.
   */
  frameStyle: 'zargen' | 'aufgelegt'
  /**
   * Freie Ecken: auf Pfosten, von der Decke abgehängt (Wand- und Eckbetten) oder ohne Pfosten auf
   * Regalen bzw. Schränken liegend (der Rahmen schließt sich dann selbst)
   */
  cornerSupport: 'pfosten' | 'decke' | 'moebel'
  /**
   * Anschluss an Wände mit Sockelleiste: Gestell um die Leistentiefe abrücken oder Pfosten
   * an der Wand ausklinken. Stuck oben wird bei deckenhohen Pfosten immer ausgeklinkt.
   */
  wallFit: 'abruecken' | 'ausklinken'
  /** Bei deckenhohen Pfosten: Luft für Stellfuß/Spindel */
  ceilingGap: Mm
  /** Etagenbett: zweite Liegefläche unten zwischen denselben Pfosten (nur mit vier Pfosten) */
  lowerBed: boolean
  /** Oberkante der unteren Liegefläche über dem Boden */
  lowerDeckHeight: Mm
  /** Zusätzliche Stützen unter jeder freien Längszarge (lange Betten, Galerien) */
  midPosts: number
  /** Eckpfosten, an die kein Geländer anschließt, enden an der Liegefläche (fehlt = ja) */
  trimPosts?: boolean
}

export interface Assembly {
  id: string
  kind: 'hochbett'
  name: string
  params: LoftBedParams
  /** Teile, die aus der Baugruppe herausgelöst wurden und nicht mehr erzeugt werden */
  detached: string[]
}

/** Selbst konstruiertes Bett: freie Teile (groupId), als Ganzes auswählbar und verschiebbar */
export interface BedGroup {
  id: string
  name: string
  /** Liegefläche: Matratze als Rechteck (Ecke x/y, Länge entlang x, Breite entlang y), Unterkante z */
  deck?: { x: Mm; y: Mm; length: Mm; width: Mm; z: Mm; thickness: Mm }
}

export type JointKind = 'ecke' | 't-stoss' | 'kreuzung' | 'auflage' | 'laengsstoss' | 'strebe' | 'beischlag'

export interface JointChoice {
  /** Schlüssel aus den beteiligten Bauteil-IDs, unabhängig von der Reihenfolge */
  key: string
  typeId: string
}

export interface ProjectSettings {
  safetyProfile: 'kinder' | 'jugendliche' | 'erwachsene'
  rentalMode: boolean
  personHeight: Mm
  acknowledged: string[]
  jointPreference: 'einfach' | 'wenig-metall' | 'zerlegbar'
  /** Nutzlast für die Statik: Bett 1,0 kN/m², Hochebene/Spielfläche 2,0 kN/m² */
  loadProfile: 'bett' | 'hochebene'
  priceOverrides: Record<string, { price: number; url?: string; date: string }>
}

export interface Project {
  version: 1
  name: string
  room: Room
  wallObjects: WallObject[]
  furniture: Furniture[]
  members: Member[]
  panels: Panel[]
  assemblies: Assembly[]
  /** Selbst konstruierte Betten aus freien Teilen */
  groups: BedGroup[]
  joints: JointChoice[]
  settings: ProjectSettings
  /** Hinweise auf geschätzte Maße (Pfad-Schlüssel wie "room.height") */
  estimated: string[]
}
