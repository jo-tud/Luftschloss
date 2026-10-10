import { produce } from 'immer'
import { create } from 'zustand'
import { analyze, type Analysis } from '../analysis/checks'
import { computeBom, type Bom } from '../analysis/bom'
import { testProject } from '../model/defaults'
import { resolveProject, type Resolved } from '../model/resolve'
import type { StaticsResult } from '../analysis/statics'
import type { Project, Vec3, WallId } from '../model/types'

export type ViewMode =
  | { kind: 'plan' }
  | { kind: 'elev'; wall: WallId }
  | { kind: '3d' }
  | { kind: 'person'; preset: PersonPreset }
  | { kind: 'unfold' }

export type PersonPreset = 'tuer' | 'unter' | 'matratze' | 'liegen'

export type Selection =
  | { kind: 'member'; id: string }
  | { kind: 'assembly'; id: string }
  | { kind: 'wallObject'; id: string }
  | { kind: 'furniture'; id: string }
  | { kind: 'panel'; id: string }
  | { kind: 'joint'; id: string }
  | { kind: 'rosette'; id: string }

export type Tool = 'select' | 'balken' | 'pfosten'

export interface Layers {
  joints: boolean
  obstacles: boolean
  persons: boolean
  furniture: boolean
  labels: boolean
  swing: boolean
}

interface State {
  project: Project
  past: Project[]
  future: Project[]
  coalesce: string | null
  selection: Selection | null
  hover: string | null
  view: ViewMode
  /** Erhöht sich bei jedem Wunsch, die Kamera neu auszurichten (auch bei gleicher Ansicht) */
  viewNonce: number
  tool: Tool
  toolCatalogId: string
  workingHeight: number
  workingDepth: number
  grid: number
  snap: boolean
  planCut: number
  cursor: Vec3 | null
  layers: Layers
  sidebar: 'raum' | 'ausstattung' | 'bett' | 'moebel'
  showMaterial: boolean
  showHelp: boolean
  focusRequest: { id: string; nonce: number } | null
  /** Schnittbox in 3D (mm); null = aus */
  sectionBox: { x0: number; x1: number; y0: number; y1: number; z1: number } | null
  /** Mausbelegung: standard = links ziehen dreht; cad = mittlere Taste dreht, links nur Auswahl */
  mouseProfile: 'standard' | 'cad'
  /** Geöffnete Detailansicht einer Verbindung */
  jointDetail: string | null
  /** Statik: zuletzt berechnetes Ergebnis (verzögert nach Änderungen) und Anzeige-Einstellungen */
  statics: StaticsResult | null
  staticsFor: Project | null
  staticsMode: boolean
  staticsCase: 'gq' | 'jump' | 'hx' | 'hy'
  staticsScale: number
  wobble: boolean
  /** Aufbau-Animation: aktueller Schritt und Startzeit (performance.now) */
  build: { step: number; start: number; auto: boolean } | null
  showPlan: boolean
  /** Änderung am Projekt; coalesce fasst viele Schritte (z. B. Ziehen) zu einem Undo-Schritt zusammen */
  update: (recipe: (d: Project) => void, coalesce?: string) => void
  /** Wie update, aber ausgehend von einem festen Ausgangsstand (für Ziehen ohne Rundungsfehler) */
  updateFrom: (base: Project, recipe: (d: Project) => void, coalesce: string) => void
  replaceProject: (p: Project) => void
  endCoalesce: () => void
  undo: () => void
  redo: () => void
  select: (s: Selection | null) => void
  setHover: (id: string | null) => void
  setView: (v: ViewMode) => void
  set: (partial: Partial<State>) => void
  toggleLayer: (k: keyof Layers) => void
  focus: (id: string) => void
}

const STORAGE_KEY = 'luftschloss.projekt.v1'

function loadProject(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Project
      if (p && p.version === 1 && p.room) return migrate(p)
    }
  } catch {
    // ohne gespeicherten Stand mit dem Testzimmer starten
  }
  return testProject()
}

/** Ergänzt Felder, die in älteren gespeicherten Projekten fehlen. */
export function migrate(p: Project): Project {
  const base = testProject()
  return {
    ...base,
    ...p,
    settings: { ...base.settings, ...p.settings },
    estimated: p.estimated ?? [],
    assemblies: p.assemblies.map((a) => ({ ...a, params: { ...base.assemblies[0].params, ...a.params } })),
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function persist(p: Project) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
    } catch {
      // Speichern ist Komfort; Export bleibt möglich
    }
  }, 300)
}

export const useStore = create<State>((set, get) => ({
  project: loadProject(),
  past: [],
  future: [],
  coalesce: null,
  selection: null,
  hover: null,
  view: { kind: '3d' },
  viewNonce: 0,
  tool: 'select',
  toolCatalogId: 'kvh-60x120',
  workingHeight: 1900,
  workingDepth: 500,
  grid: 10,
  snap: true,
  planCut: 2600,
  cursor: null,
  layers: { joints: false, obstacles: true, persons: true, furniture: true, labels: true, swing: true },
  sidebar: 'bett',
  showMaterial: false,
  showHelp: false,
  focusRequest: null,
  sectionBox: null,
  mouseProfile: (() => {
    try {
      return localStorage.getItem('luftschloss.maus') === 'cad' ? 'cad' : 'standard'
    } catch {
      return 'standard'
    }
  })(),
  jointDetail: null,
  statics: null,
  staticsFor: null,
  staticsMode: false,
  staticsCase: 'gq',
  staticsScale: 30,
  wobble: false,
  build: null,
  showPlan: false,
  update: (recipe, coalesce) => {
    const { project, past, coalesce: current } = get()
    const next = produce(project, recipe)
    if (next === project) return
    const merge = coalesce !== undefined && coalesce === current
    set({ project: next, past: merge ? past : [...past.slice(-199), project], future: [], coalesce: coalesce ?? null })
    persist(next)
  },
  updateFrom: (base, recipe, coalesce) => {
    const { project, past, coalesce: current } = get()
    const next = produce(base, recipe)
    const merge = coalesce === current
    set({ project: next, past: merge ? past : [...past.slice(-199), project], future: [], coalesce })
    persist(next)
  },
  replaceProject: (p) => {
    const { project, past } = get()
    set({ project: p, past: [...past.slice(-199), project], future: [], selection: null, coalesce: null })
    persist(p)
  },
  endCoalesce: () => set({ coalesce: null }),
  undo: () => {
    const { past, project, future } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future], coalesce: null })
    persist(prev)
  },
  redo: () => {
    const { past, project, future } = get()
    if (!future.length) return
    const next = future[0]
    set({ project: next, past: [...past, project], future: future.slice(1), coalesce: null })
    persist(next)
  },
  select: (selection) => set({ selection }),
  setHover: (hover) => (get().hover === hover ? undefined : set({ hover })),
  setView: (view) => set({ view, viewNonce: get().viewNonce + 1 }),
  set: (partial) => set(partial),
  toggleLayer: (k) => set({ layers: { ...get().layers, [k]: !get().layers[k] } }),
  focus: (id) => set({ focusRequest: { id, nonce: (get().focusRequest?.nonce ?? 0) + 1 } }),
}))

export interface Derived {
  resolved: Resolved
  analysis: Analysis
  bom: Bom
}

let cacheKey: Project | null = null
let cacheValue: Derived | null = null

/** Abgeleitete Daten (Bauteile, Prüfungen, Stückliste), einmal je Projektstand berechnet. */
export function derive(p: Project): Derived {
  if (cacheKey === p && cacheValue) return cacheValue
  const resolved = resolveProject(p)
  const analysis = analyze(p, resolved)
  const bom = computeBom(p, resolved)
  cacheKey = p
  cacheValue = { resolved, analysis, bom }
  return cacheValue
}

export function useDerived(): Derived {
  const project = useStore((s) => s.project)
  return derive(project)
}

/** Zu welchem Projektobjekt gehört eine ID (Bauteile einer Baugruppe gehören zur Baugruppe)? */
export function selectionFor(p: Project, id: string): Selection | null {
  if (p.assemblies.some((a) => a.id === id)) return { kind: 'assembly', id }
  if (p.wallObjects.some((o) => o.id === id)) return { kind: 'wallObject', id }
  if (p.furniture.some((f) => f.id === id)) return { kind: 'furniture', id }
  if (p.room.rosettes.some((r) => r.id === id)) return { kind: 'rosette', id }
  if (id.includes(':')) return { kind: 'member', id }
  if (p.members.some((m) => m.id === id)) return { kind: 'member', id }
  if (p.panels.some((x) => x.id === id)) return { kind: 'panel', id }
  return null
}
