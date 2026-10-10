// Materialkatalog, ausgerichtet am Sortiment eines typischen deutschen Hornbach-Markts.
// Quellen und Erhebungsweise: docs/recherche/hornbach-sortiment.md. Preise sind Richtpreise
// (Stand 2025/26, aus Suchmaschinen-Snapshots); "geschätzt" markiert abgeleitete Werte.

export type StrengthClass = 'C16' | 'C24' | 'GL24h'

export interface Strength {
  /** Biegefestigkeit f_m,k in N/mm² */
  fmk: number
  /** Zugfestigkeit f_t,0,k */
  ft0k: number
  /** Druckfestigkeit f_c,0,k */
  fc0k: number
  /** E-Modul E_0,mean in N/mm² */
  e0mean: number
  /** E-Modul E_0,05 (5-%-Fraktile, für Knicken) */
  e005: number
  /** Schubfestigkeit f_v,k in N/mm² */
  fvk: number
  /** mittlere Rohdichte in kg/m³ */
  rhoMean: number
}

// DIN EN 338:2016 bzw. EN 14080, siehe docs/recherche/statik-grundlagen.md
export const STRENGTH: Record<StrengthClass, Strength> = {
  C16: { fmk: 16, ft0k: 8.5, fc0k: 17, e0mean: 8000, e005: 5400, fvk: 3.2, rhoMean: 370 },
  C24: { fmk: 24, ft0k: 14.5, fc0k: 21, e0mean: 11000, e005: 7400, fvk: 4.0, rhoMean: 420 },
  GL24h: { fmk: 24, ft0k: 19.2, fc0k: 24, e0mean: 11500, e005: 9600, fvk: 3.5, rhoMean: 420 },
}

export type TimberGroup = 'kvh' | 'bsh' | 'kantholz' | 'gehobelt' | 'latte' | 'leiste' | 'rundstab'

export interface TimberItem {
  id: string
  kind: 'stab'
  group: TimberGroup
  name: string
  wood: 'Fichte' | 'Kiefer' | 'Buche' | 'Fichte/Kiefer'
  /** Festigkeitsklasse für die spätere Statik; unsortierte Ware wird mit C16 gerechnet */
  strength: StrengthClass
  sorted: boolean
  surface: 'gehobelt' | 'sägerau' | 'roh'
  b: number
  h: number
  round?: boolean
  /** Handelslängen in mm */
  lengths: number[]
  /** Richtpreis €/lfm */
  pricePerM: number
  priceEstimated?: boolean
  source?: string
}

export type SheetGroup = 'osb' | 'osb-nf' | 'dreischicht' | 'multiplex' | 'leimholz' | 'diele' | 'rollrost' | 'lattenrost' | 'netz' | 'matratze'

export interface SheetItem {
  id: string
  kind: 'platte'
  group: SheetGroup
  name: string
  thickness: number
  /** Format L × B in mm; bei Dielen B = Deckbreite */
  formats: { l: number; w: number; price: number }[]
  /** Elastizitätsmodul bei Plattenbeanspruchung parallel, N/mm² (für spätere Statik) */
  eMean?: number
  /** Empfohlener maximaler Abstand der Unterkonstruktion, Faustregel */
  maxSpan?: number
  priceEstimated?: boolean
  source?: string
}

export type HardwareGroup = 'winkel' | 'balkenschuh' | 'schraube' | 'bolzen' | 'beschlag' | 'duebel' | 'lochband' | 'spindel' | 'netzzubehoer'

export interface HardwareItem {
  id: string
  kind: 'beschlag'
  group: HardwareGroup
  name: string
  /** Packungsgröße und Preis je Packung */
  pack: number
  packPrice: number
  /** Meterware: pack ist dann 1000 mm, packPrice der Meterpreis */
  perMeter?: boolean
  priceEstimated?: boolean
}

export type CatalogItem = TimberItem | SheetItem | HardwareItem

const KVH_LENGTHS = [3000, 3500, 4000, 4500, 5000, 5500, 6000]
const HB = 'https://www.hornbach.de'

function kvh(b: number, h: number, pricePerM: number, estimated = false, source?: string): TimberItem {
  return {
    id: `kvh-${b}x${h}`,
    kind: 'stab',
    group: 'kvh',
    name: `KVH Fichte C24 ${b}×${h} mm, gehobelt`,
    wood: 'Fichte',
    strength: 'C24',
    sorted: true,
    surface: 'gehobelt',
    b,
    h,
    lengths: KVH_LENGTHS,
    pricePerM,
    priceEstimated: estimated,
    source,
  }
}

function bsh(b: number, h: number, lengths: number[], pricePerM: number, estimated = false): TimberItem {
  return {
    id: `bsh-${b}x${h}`,
    kind: 'stab',
    group: 'bsh',
    name: `Brettschichtholz Fichte GL24h ${b}×${h} mm`,
    wood: 'Fichte',
    strength: 'GL24h',
    sorted: true,
    surface: 'gehobelt',
    b,
    h,
    lengths,
    pricePerM,
    priceEstimated: estimated,
  }
}

function planed(b: number, h: number, lengths: number[], pricePerM: number, estimated = false): TimberItem {
  return {
    id: `geh-${b}x${h}`,
    kind: 'stab',
    group: 'gehobelt',
    name: `Kantholz Fichte gehobelt ${b}×${h} mm`,
    wood: 'Fichte',
    strength: 'C16',
    sorted: false,
    surface: 'gehobelt',
    b,
    h,
    lengths,
    pricePerM,
    priceEstimated: estimated,
  }
}

function rough(b: number, h: number, lengths: number[], pricePerM: number): TimberItem {
  return {
    id: `kant-${b}x${h}`,
    kind: 'stab',
    group: 'kantholz',
    name: `Kantholz Fichte sägerau ${b}×${h} mm`,
    wood: 'Fichte',
    strength: 'C16',
    sorted: false,
    surface: 'sägerau',
    b,
    h,
    lengths,
    pricePerM,
  }
}

export const TIMBER: TimberItem[] = [
  kvh(60, 80, 4.46, false, `${HB}/p/konsta-konstruktionsvollholz-3000-x-80-x-60-mm-fichte-nsi-nicht-sichtbarer-einbau/5958901/`),
  kvh(60, 100, 5.58),
  kvh(60, 120, 6.7, true),
  kvh(60, 140, 7.8, true),
  kvh(60, 160, 8.9, true),
  kvh(80, 80, 6.15),
  kvh(80, 100, 7.43),
  kvh(80, 120, 8.9, true),
  kvh(80, 140, 10.02),
  kvh(80, 160, 11.5, true),
  kvh(100, 100, 9.3, true),
  kvh(100, 120, 11.52),
  kvh(120, 120, 12.9),
  bsh(60, 100, [3000], 6.6),
  bsh(80, 100, [3000], 8.8),
  bsh(80, 120, [3000, 4500], 10.5, true),
  bsh(100, 100, [3000, 3500], 11.0),
  bsh(100, 120, [3000], 13.2),
  bsh(120, 120, [3000, 3500], 15.83),
  rough(40, 60, [2000], 1.79),
  rough(60, 80, [2000, 3000, 4000], 3.99),
  rough(80, 80, [2000, 3000], 5.75),
  rough(80, 100, [2000, 3000, 4000], 7.08),
  rough(100, 100, [3000], 8.7),
  planed(24, 44, [2500], 2.2, true),
  planed(24, 74, [2500], 2.9, true),
  planed(24, 94, [2500], 3.32),
  planed(34, 54, [2500], 2.88),
  planed(44, 44, [2500], 3.38),
  planed(44, 74, [2500], 5.68),
  planed(44, 94, [2500], 6.1),
  planed(54, 54, [2500], 4.3),
  planed(54, 74, [2500], 5.5, true),
  planed(70, 70, [2000, 3000], 7.45),
  planed(90, 90, [2000, 3000], 11.95),
  {
    id: 'brett-38x140',
    kind: 'stab',
    group: 'gehobelt',
    name: 'Universalbrett Kiefer gehobelt 38×140 mm',
    wood: 'Kiefer',
    strength: 'C16',
    sorted: false,
    surface: 'gehobelt',
    b: 38,
    h: 140,
    lengths: [2500],
    pricePerM: 4.8,
    priceEstimated: true,
  },
  {
    id: 'leimholz-fi-18x200',
    kind: 'stab',
    group: 'leiste',
    name: 'Leimholz Fichte B/C 18×200 mm (Brett)',
    wood: 'Fichte',
    strength: 'C16',
    sorted: false,
    surface: 'gehobelt',
    b: 18,
    h: 200,
    lengths: [800, 1200, 2000, 2500],
    pricePerM: 5.3,
    priceEstimated: true,
  },
  {
    id: 'latte-24x48',
    kind: 'stab',
    group: 'latte',
    name: 'Latte Fichte sägerau 24×48 mm',
    wood: 'Fichte',
    strength: 'C16',
    sorted: false,
    surface: 'sägerau',
    b: 24,
    h: 48,
    lengths: [2000, 2500, 3000, 4000],
    pricePerM: 0.84,
  },
  {
    id: 'latte-s10-40x60',
    kind: 'stab',
    group: 'latte',
    name: 'Latte S10 Fichte sägerau 40×60 mm',
    wood: 'Fichte',
    strength: 'C24',
    sorted: true,
    surface: 'sägerau',
    b: 40,
    h: 60,
    lengths: [2500, 4000, 5000],
    pricePerM: 1.6,
    priceEstimated: true,
  },
  {
    id: 'leiste-20x40',
    kind: 'stab',
    group: 'leiste',
    name: 'Rechteckleiste Kiefer/Fichte 20×40 mm, astfrei',
    wood: 'Fichte/Kiefer',
    strength: 'C16',
    sorted: false,
    surface: 'roh',
    b: 20,
    h: 40,
    lengths: [2000],
    pricePerM: 2.4,
    priceEstimated: true,
  },
  {
    id: 'leiste-20x60',
    kind: 'stab',
    group: 'leiste',
    name: 'Rechteckleiste Kiefer/Fichte 20×60 mm, astfrei',
    wood: 'Fichte/Kiefer',
    strength: 'C16',
    sorted: false,
    surface: 'roh',
    b: 20,
    h: 60,
    lengths: [2000],
    pricePerM: 3.2,
    priceEstimated: true,
  },
  ...[20, 25, 30].map<TimberItem>((d) => ({
    id: `rund-buche-${d}`,
    kind: 'stab',
    group: 'rundstab',
    name: `Rundstab Buche Ø ${d} mm`,
    wood: 'Buche',
    strength: 'C24',
    sorted: false,
    surface: 'roh',
    b: d,
    h: d,
    round: true,
    lengths: [1000],
    pricePerM: d === 20 ? 3.55 : d === 25 ? 5.6 : 6.7,
  })),
  {
    id: 'rund-kiefer-23',
    kind: 'stab',
    group: 'rundstab',
    name: 'Rundstab Kiefer Ø 23 mm, astfrei',
    wood: 'Kiefer',
    strength: 'C16',
    sorted: false,
    surface: 'roh',
    b: 23,
    h: 23,
    round: true,
    lengths: [2000],
    pricePerM: 4.23,
  },
]

export const SHEETS: SheetItem[] = [
  { id: 'osb-18', kind: 'platte', group: 'osb', name: 'OSB/3 18 mm stumpf', thickness: 18, formats: [{ l: 2500, w: 1250, price: 31.09 }], eMean: 4930, maxSpan: 500 },
  { id: 'osb-22', kind: 'platte', group: 'osb', name: 'OSB/3 22 mm stumpf', thickness: 22, formats: [{ l: 2500, w: 1250, price: 38.13 }], eMean: 4930, maxSpan: 625 },
  { id: 'osb-25', kind: 'platte', group: 'osb', name: 'OSB/3 25 mm stumpf', thickness: 25, formats: [{ l: 2500, w: 1250, price: 46.72 }], eMean: 4930, maxSpan: 650 },
  { id: 'osb-nf-18', kind: 'platte', group: 'osb-nf', name: 'OSB/3 Verlegeplatte N+F 18 mm', thickness: 18, formats: [{ l: 2500, w: 675, price: 14.5 }], eMean: 4930, maxSpan: 500 },
  { id: 'osb-nf-22', kind: 'platte', group: 'osb-nf', name: 'OSB/3 Verlegeplatte N+F 22 mm', thickness: 22, formats: [{ l: 2050, w: 675, price: 17.28 }], eMean: 4930, maxSpan: 625 },
  { id: '3s-19', kind: 'platte', group: 'dreischicht', name: 'Fichte 3-Schichtplatte B/C 19 mm', thickness: 19, formats: [{ l: 2500, w: 1250, price: 129 }], eMean: 10000, maxSpan: 600 },
  { id: '3s-27', kind: 'platte', group: 'dreischicht', name: 'Fichte 3-Schichtplatte B/C 27 mm', thickness: 27, formats: [{ l: 2500, w: 1250, price: 179 }], eMean: 8200, maxSpan: 800 },
  { id: 'mpx-18', kind: 'platte', group: 'multiplex', name: 'Multiplex Eukalyptus/Birke 18 mm', thickness: 18, formats: [{ l: 2500, w: 1220, price: 112 }], eMean: 10048, maxSpan: 600 },
  { id: 'leimholz-fi-18', kind: 'platte', group: 'leimholz', name: 'Leimholzplatte Fichte B/C 18 mm', thickness: 18, formats: [{ l: 2000, w: 600, price: 31.95 }, { l: 1200, w: 600, price: 19.25 }] },
  { id: 'leimholz-ki-18', kind: 'platte', group: 'leimholz', name: 'Leimholzplatte Kiefer B/C 18 mm', thickness: 18, formats: [{ l: 2000, w: 600, price: 28.95 }] },
  { id: 'leimholz-fi-28', kind: 'platte', group: 'leimholz', name: 'Leimholzplatte Fichte A/B 28 mm', thickness: 28, formats: [{ l: 2000, w: 600, price: 79.95 }] },
  { id: 'rauspund-18', kind: 'platte', group: 'diele', name: 'Rauspund Fichte 18×96 mm', thickness: 18, formats: [{ l: 2400, w: 96, price: 2.75 }, { l: 2100, w: 96, price: 2.41 }, { l: 2700, w: 96, price: 3.1 }], maxSpan: 500, eMean: 8000 },
  { id: 'nf-kiefer-27', kind: 'platte', group: 'diele', name: 'Nut+Feder-Diele Kiefer 27×146 mm', thickness: 27, formats: [{ l: 2000, w: 146, price: 6.4 }, { l: 2500, w: 146, price: 8.0 }, { l: 3000, w: 146, price: 9.6 }, { l: 4000, w: 146, price: 12.8 }], maxSpan: 800, eMean: 8000, priceEstimated: true },
  { id: 'douglasie-21', kind: 'platte', group: 'diele', name: 'Universaldiele Douglasie 21×124 mm', thickness: 21, formats: [{ l: 2500, w: 124, price: 6.5 }], maxSpan: 600, eMean: 8000 },
  { id: 'rollrost', kind: 'platte', group: 'rollrost', name: 'Rollrost (Fertigteil)', thickness: 40, formats: [{ l: 2000, w: 900, price: 30 }, { l: 2000, w: 1000, price: 35 }, { l: 2000, w: 1200, price: 45 }, { l: 2000, w: 1400, price: 55 }], priceEstimated: true },
  { id: 'lattenrost', kind: 'platte', group: 'lattenrost', name: 'Lattenrost (Fertigteil)', thickness: 80, formats: [{ l: 2000, w: 900, price: 60 }, { l: 2000, w: 1000, price: 70 }, { l: 2000, w: 1200, price: 90 }, { l: 2000, w: 1400, price: 110 }], priceEstimated: true },
  { id: 'netz', kind: 'platte', group: 'netz', name: 'Sicherheitsnetz, Maschenweite ≤ 50 mm', thickness: 5, formats: [{ l: 3000, w: 1000, price: 25 }], priceEstimated: true },
]

export const HARDWARE: HardwareItem[] = [
  { id: 'winkel-90', kind: 'beschlag', group: 'winkel', name: 'Winkelverbinder 90×90×65 mit Sicke, verzinkt', pack: 1, packPrice: 1.8, priceEstimated: true },
  { id: 'balkenschuh-60', kind: 'beschlag', group: 'balkenschuh', name: 'Balkenschuh innen, passend zum Querschnitt', pack: 1, packPrice: 3.5, priceEstimated: true },
  { id: 'schraube-5x50', kind: 'beschlag', group: 'schraube', name: 'Holzbauschraube / Winkelschraube 5×50, Packung 250', pack: 250, packPrice: 14, priceEstimated: true },
  { id: 'schraube-8x160', kind: 'beschlag', group: 'schraube', name: 'Tellerkopf-Holzbauschraube 8×160, Packung 50', pack: 50, packPrice: 22, priceEstimated: true },
  { id: 'schlossschraube-m10', kind: 'beschlag', group: 'bolzen', name: 'Schlossschraube M10 × 180 mit Mutter und U-Scheibe', pack: 1, packPrice: 1.6, priceEstimated: true },
  { id: 'bettschraube-m8', kind: 'beschlag', group: 'beschlag', name: 'Bettschraube M8 mit Zylindermutter', pack: 1, packPrice: 1.2, priceEstimated: true },
  { id: 'gewindestange-m10', kind: 'beschlag', group: 'bolzen', name: 'Gewindestange M10 verzinkt (je 1 m)', pack: 1000, packPrice: 3.5, perMeter: true, priceEstimated: true },
  { id: 'lochband', kind: 'beschlag', group: 'lochband', name: 'Lochband 20 mm × 10 m', pack: 1, packPrice: 12, priceEstimated: true },
  { id: 'rahmenduebel-10', kind: 'beschlag', group: 'duebel', name: 'Rahmendübel 10 × 115 mit Schraube', pack: 10, packPrice: 9, priceEstimated: true },
  { id: 'stellfuss-m16', kind: 'beschlag', group: 'spindel', name: 'Stellfuß / Gewindespindel M16 für Deckenverspannung', pack: 1, packPrice: 6, priceEstimated: true },
  { id: 'holzduebel-10', kind: 'beschlag', group: 'beschlag', name: 'Holzdübel Buche 10 × 40, Packung 100', pack: 100, packPrice: 5, priceEstimated: true },
  { id: 'seil-12', kind: 'beschlag', group: 'netzzubehoer', name: 'Polypropylen-Seil Ø 12 mm (Meterware)', pack: 1000, packPrice: 1.5, perMeter: true, priceEstimated: true },
  { id: 'netzhaken', kind: 'beschlag', group: 'netzzubehoer', name: 'Ösen/Haken und Spannschnur für Netz', pack: 1, packPrice: 15, priceEstimated: true },
]

const ALL: CatalogItem[] = [...TIMBER, ...SHEETS, ...HARDWARE]
const BY_ID = new Map(ALL.map((i) => [i.id, i]))

export function catalogItem(id: string): CatalogItem | undefined {
  return BY_ID.get(id)
}

export function timber(id: string): TimberItem {
  const item = BY_ID.get(id)
  if (!item || item.kind !== 'stab') throw new Error(`Unbekanntes Holz im Katalog: ${id}`)
  return item
}

export function sheet(id: string): SheetItem {
  const item = BY_ID.get(id)
  if (!item || item.kind !== 'platte') throw new Error(`Unbekannte Platte im Katalog: ${id}`)
  return item
}

export function maxLength(item: TimberItem): number {
  return Math.max(...item.lengths)
}

export const GROUP_LABEL: Record<TimberGroup, string> = {
  kvh: 'KVH (C24, tragend)',
  bsh: 'Brettschichtholz (GL24h)',
  kantholz: 'Kantholz sägerau',
  gehobelt: 'Kantholz gehobelt',
  latte: 'Latten',
  leiste: 'Leisten',
  rundstab: 'Rundstäbe',
}

export const PRICE_STAND = 'Richtpreise Hornbach, Stand 2025/26'
