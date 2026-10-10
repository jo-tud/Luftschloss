import { analyze } from '../analysis/checks'
import { computeBom } from '../analysis/bom'
import { computeStatics } from '../analysis/statics'
import { t, tk, tr } from '../i18n'
import { emptyProject } from './defaults'
import { uid } from './geometry'
import { generateLoftBed } from './loftbed'
import { CORNERS, cornerWalls, placeBed, type Corner } from './placement'
import { resolveProject } from './resolve'
import type { BedType, CeilingMaterial, LoftBedParams, Mm, Project, WallId, WallMaterial, WallObject } from './types'
import { WALL_IDS } from './types'

/**
 * Planungsassistent: aus wenigen Antworten ein Zimmer aufbauen und geprüfte Bettvorschläge machen.
 * Rein rechnerisch, damit testbar; die Oberfläche steht in src/ui/Wizard.tsx.
 */

export type WallKind = 'massiv' | 'leicht' | 'unbekannt'
export type BelowUse = 'stauraum' | 'spielen' | 'sitzen' | 'schreibtisch' | 'stehen'
export type SleeperAge = 'klein' | 'kind' | 'jugend' | 'erwachsen'

export interface WizardOpening {
  id: string
  kind: 'fenster' | 'tuer' | 'heizkoerper'
  wall: WallId
  offset: Mm
  width: Mm
  height: Mm
  /** Brüstung (Fenster) bzw. Unterkante (Heizkörper) */
  bottom: Mm
}

export interface WizardAnswers {
  length: Mm
  width: Mm
  height: Mm
  ceiling: CeilingMaterial
  walls: Record<WallId, WallKind>
  openings: WizardOpening[]
  sleepers: 1 | 2
  mattressWidth: Mm
  mattressLength: Mm
  age: SleeperAge
  below: BelowUse
  /** Darf das Bett an die Wand geschraubt werden (tragend, nicht nur Kippsicherung)? */
  wallFixing: boolean
}

/** Lichte Höhe unter dem Bett je Nutzung */
export const CLEARANCE: Record<BelowUse, Mm> = { stauraum: 900, spielen: 1200, sitzen: 1350, schreibtisch: 1500, stehen: 1850 }
/** Kopfraum über der Matratze zum aufrechten Sitzen */
export const HEADROOM: Record<SleeperAge, Mm> = { klein: 750, kind: 850, jugend: 950, erwachsen: 1000 }
/** DIN EN 747: Hochbetten erst ab 6 Jahren – darunter höchstens halbhoch */
const SMALL_CHILD_MAX_DECK = 1000

export function defaultAnswers(): WizardAnswers {
  return {
    length: 4000,
    width: 3500,
    height: 2600,
    ceiling: 'beton',
    walls: { A: 'massiv', B: 'unbekannt', C: 'unbekannt', D: 'unbekannt' },
    openings: [
      { id: uid('fenster'), kind: 'fenster', wall: 'A', offset: 1500, width: 1200, height: 1400, bottom: 850 },
      { id: uid('tuer'), kind: 'tuer', wall: 'C', offset: 400, width: 885, height: 2010, bottom: 0 },
    ],
    sleepers: 1,
    mattressWidth: 900,
    mattressLength: 2000,
    age: 'kind',
    below: 'spielen',
    wallFixing: true,
  }
}

const WALL_MATERIAL: Record<WallKind, WallMaterial> = { massiv: 'vollziegel', leicht: 'trockenbau', unbekannt: 'leichtbau' }

function wallObject(o: WizardOpening): WallObject {
  if (o.kind === 'fenster')
    return {
      id: o.id,
      kind: 'fenster',
      name: tk('Fenster'),
      wall: o.wall,
      offset: o.offset,
      width: o.width,
      sillHeight: o.bottom,
      height: o.height,
      revealDepth: 150,
      frameWidth: 60,
      niche: { below: false, belowDepth: 100 },
      sashes: o.width > 1000 ? [{ opening: 'drehkipp', hinge: 'links' }, { opening: 'dreh', hinge: 'rechts' }] : [{ opening: 'drehkipp', hinge: 'links' }], // i18n-ok
      sashThickness: 75,
      handleProjection: 70,
      sill: { enabled: true, projection: 40, thickness: 30, sideOverhang: 30 },
      displayAngle: 0,
    }
  if (o.kind === 'tuer') return { id: o.id, kind: 'tuer', name: tk('Tür'), wall: o.wall, offset: o.offset, width: o.width, height: o.height, hinge: 'links', opensInward: true, displayAngle: 0 } // i18n-ok
  return { id: o.id, kind: 'heizkoerper', name: tk('Heizkörper'), wall: o.wall, offset: o.offset, width: o.width, bottom: o.bottom, height: o.height, depth: 100, wallGap: 50, convectionClearance: 100 }
}

/** Zimmer aus den Antworten (ohne Bett) */
export function roomProject(a: WizardAnswers): Project {
  const p = emptyProject(a.length, a.width, a.height)
  p.name = tk('Mein Zimmer')
  // Prüfstrenge nach Alter: Kinder streng (DIN EN 747), sonst wie gewählt
  p.settings.safetyProfile = a.age === 'klein' || a.age === 'kind' ? 'kinder' : a.age === 'jugend' ? 'jugendliche' : 'erwachsene'
  p.room.ceiling = a.ceiling
  p.room.walls = Object.fromEntries(WALL_IDS.map((w) => [w, { material: WALL_MATERIAL[a.walls[w]] }])) as Project['room']['walls']
  p.wallObjects = a.openings.map(wallObject)
  return p
}

export interface Proposal {
  key: string
  type: BedType
  corner: Corner
  params: LoftBedParams
  project: Project
  errors: number
  warnings: number
  /** wichtigste Befunde (Titel) */
  issues: string[]
  /** Gründe für den Vorschlag */
  reasons: string[]
  clearance: Mm
  headroom: Mm
  /** Ziel für unten bzw. oben nicht beides erreichbar */
  compromise?: string
  cost: number
  score: number
}

/** Bettarten, die zu den Antworten passen, je Ecke */
function candidates(a: WizardAnswers): { type: BedType; corner: Corner; patch: Partial<LoftBedParams>; reason: string }[] {
  const out: { type: BedType; corner: Corner; patch: Partial<LoftBedParams>; reason: string }[] = []
  const solid = (w: WallId) => a.walls[w] === 'massiv'
  const big = a.sleepers === 2 ? { railCatalogId: 'kvh-80x160', joistCatalogId: 'kvh-60x120' } : {}
  for (const c of CORNERS) {
    const { back, end } = cornerWalls(c)
    out.push({ type: 'freistehend', corner: c, patch: { ...big }, reason: t('Freistehend: trägt sich selbst, die Wand dient nur der Kippsicherung.') })
    if (a.wallFixing && solid(back)) out.push({ type: 'wandseitig', corner: c, patch: { frameStyle: 'aufgelegt', ...big }, reason: t('Wand {w} ist massiv: ein Wandbalken trägt mit, vorne reichen zwei Pfosten.', { w: back }) })
    if (a.wallFixing && solid(back) && solid(end) && a.sleepers === 1) out.push({ type: 'eck', corner: c, patch: { frameStyle: 'aufgelegt' }, reason: t('Wände {a} und {b} sind massiv: Eckbett mit nur einem Pfosten, viel Platz darunter.', { a: back, b: end }) })
  }
  // Wand zu Wand nur in schmalen Räumen mit massiven Querwänden
  if (a.wallFixing && a.length <= 2600 && solid('B') && solid('D'))
    for (const c of ['AD', 'CD'] as Corner[]) out.push({ type: 'nische', corner: c, patch: { frameStyle: 'aufgelegt' }, reason: t('Raum schmal genug: Hochebene von Wand zu Wand, ganz ohne Pfosten.') })
  return out
}

/** Höhe der Liegefläche aus Nutzung unten und Kopfraum oben */
function fitHeight(a: WizardAnswers, params: LoftBedParams): { deckHeight: Mm; compromise?: string } {
  const probe = generateLoftBed({ id: 'probe', kind: 'hochbett', name: '', params, detached: [] }, a.height).info
  const structure = params.deckHeight - probe.underside
  const above = probe.mattressTop - params.deckHeight
  const want = CLEARANCE[a.below] + structure
  const max = a.height - HEADROOM[a.age] - above
  let deckHeight = Math.ceil(want / 10) * 10
  let compromise: string | undefined
  if (a.age === 'klein') deckHeight = Math.min(deckHeight, SMALL_CHILD_MAX_DECK)
  if (deckHeight > max) {
    const short = deckHeight - max
    deckHeight = Math.floor(max / 10) * 10
    compromise = t('Unten fehlen {d} zur gewünschten Höhe – sonst wird es oben zu eng. Darunter eher sitzen als stehen, oder eine dünnere Matratze.', { d: `${Math.round(short / 10)} cm` })
  }
  return { deckHeight: Math.max(600, deckHeight), compromise }
}

/** Geprüfte Vorschläge, beste zuerst (höchstens n verschiedene Bettarten bzw. Ecken) */
export function proposals(a: WizardAnswers, n = 3): Proposal[] {
  const base = roomProject(a)
  const list: Proposal[] = []
  for (const c of candidates(a)) {
    const patch: Partial<LoftBedParams> = {
      ...c.patch,
      mattressWidth: a.mattressWidth,
      mattressLength: a.mattressLength,
      mattressCount: a.sleepers,
      mattressLayout: 'nebeneinander',
      braces: c.type === 'freistehend',
    }
    let params = placeBed(base.room, c.type, patch, c.corner)
    const fit = fitHeight(a, params)
    params = placeBed(base.room, c.type, { ...patch, deckHeight: fit.deckHeight }, c.corner)
    const project: Project = { ...base, assemblies: [{ id: 'bett-1', kind: 'hochbett', name: tk('Hochbett'), params, detached: [] }] }
    let r
    try {
      r = resolveProject(project)
    } catch {
      continue
    }
    const info = r.beds.get('bett-1')
    if (!info) continue
    const findings = analyze(project, r).findings
    // „geprüft“ heißt auch: die Statik trägt (wie in der Prüfliste: über 150 % Fehler, über 100 % Warnung)
    const statics = computeStatics(project, r).maxUtil
    const stab = 'Stabilität' as const // i18n-ok
    if (statics > 1) findings.push({ id: 'statik', severity: statics > 1.5 ? 'fehler' : 'warnung', category: stab, title: t('Statik: höchste Ausnutzung {pct} %', { pct: Math.round(statics * 100) }), targets: [] })
    const errors = findings.filter((f) => f.severity === 'fehler')
    const warnings = findings.filter((f) => f.severity === 'warnung')
    const cost = computeBom(project, r).total
    const clearance = info.underside
    const headroom = a.height - info.mattressTop
    // Bewertung: Fehler schwer; ein verbautes Fenster oder eine verstellte Tür wiegt fast so schwer,
    // andere Warnungen mittel; dann Kompromiss bei der Höhe und die Kosten
    const opening = warnings.filter((f) => f.category === 'Fenster & Tür').length // i18n-ok
    const score = errors.length * 1000 + opening * 300 + (warnings.length - opening) * 40 + (fit.compromise ? 250 : 0) + cost / 20 + (c.type === 'freistehend' ? 15 : 0)
    list.push({
      key: `${c.type}-${c.corner}`,
      type: c.type,
      corner: c.corner,
      params,
      project,
      errors: new Set(errors.map((f) => f.title)).size,
      warnings: new Set(warnings.map((f) => f.title)).size,
      // gleichlautende Befunde (z. B. je Pfosten) nur einmal nennen
      issues: [...new Set([...errors, ...warnings].map((f) => tr(f.title)))].slice(0, 3),
      reasons: [c.reason],
      clearance,
      headroom,
      compromise: fit.compromise,
      cost,
      score,
    })
  }
  list.sort((x, y) => x.score - y.score)
  // verschiedene Bettarten bevorzugen, dann weitere Ecken
  const out: Proposal[] = []
  for (const p of list) if (out.length < n && !out.some((o) => o.type === p.type)) out.push(p)
  for (const p of list) if (out.length < n && !out.includes(p)) out.push(p)
  return out.sort((x, y) => x.score - y.score)
}
