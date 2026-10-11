import { outsideRails } from '../model/loftbed'
import { allFasteners } from '../model/fasteners'
import { memberBoxes, obbBounds } from '../model/geometry'
import { jointType } from '../model/joints'
import { resolveProject, type Resolved } from '../model/resolve'
import type { LoftBedParams, Project } from '../model/types'
import { computeBom } from './bom'
import { computeStatics } from './statics'

/**
 * Bauweisen im Vergleich (SPEZIFIKATION, Kapitel 12, Idee 7): dasselbe Bett in jeder
 * Bauweise, die für seine Liegefläche und seinen Typ taugt, mit Preis, Wackeln,
 * Bohrungen und Arbeitszeit der Verbindungen.
 */

export type FrameStyle = LoftBedParams['frameStyle']

export interface StyleVariant {
  style: FrameStyle
  project: Project
  resolved: Resolved
  /** Gesamtpreis des Projekts (Einkaufsliste) */
  price: number
  /** Seitliche Verschiebung der Liegefläche unter 0,5 kN in mm (größere Richtung) */
  sway: number
  swayClass: 'steif' | 'spürbar' | 'wackelt'
  maxUtil: number
  /** Bohrungen (vorgebohrt oder durchgebohrt, Taschen für Quermuttern mitgezählt) */
  holes: number
  /** Teile dieses Betts */
  parts: number
  /** Verbindungen dieses Betts */
  joints: number
  /** Arbeitszeit der Verbindungen in Minuten: Anfänger, geübt */
  minutes: [number, number]
  /** Unterkante der tiefsten Zarge der Liegefläche über dem Boden (mm): so viel Durchgang bleibt darunter */
  clearance: number
}

/** Bauweisen, die bei diesen Parametern eine Wirkung haben (wie die Auswahl in den Eigenschaften) */
export function availableStyles(P: LoftBedParams): FrameStyle[] {
  const styleMatters = P.deck === 'platte' || P.deck === 'dielen' || P.deck === 'lattenrost' || (P.deck === 'latten' && P.type === 'nische')
  const out: FrameStyle[] = ['zargen']
  if (styleMatters) out.push('aufgelegt')
  if (outsideRails({ ...P, frameStyle: 'aussen' })) out.push('aussen')
  return out
}

export function compareStyles(p: Project, assemblyId: string): StyleVariant[] {
  const a = p.assemblies.find((x) => x.id === assemblyId)
  if (!a) return []
  return availableStyles(a.params).map((style) => {
    const project: Project = {
      ...p,
      assemblies: p.assemblies.map((x) => (x.id === assemblyId ? { ...x, params: { ...x.params, frameStyle: style } } : x)),
    }
    const resolved = resolveProject(project)
    const statics = computeStatics(project, resolved)
    const own = new Set(resolved.members.filter((m) => m.assemblyId === assemblyId).map((m) => m.id))
    const joints = resolved.joints.filter((j) => own.has(j.a) || own.has(j.b))
    const keys = new Set(joints.map((j) => j.key))
    const fasteners = allFasteners(resolved).filter((f) => keys.has(f.joint))
    const holes = fasteners.reduce((s, f) => s + (f.drill ? 1 : 0) + (f.crossNut ? 1 : 0), 0)
    const minutes: [number, number] = [0, 0]
    for (const j of joints) {
      const tp = jointType(j.typeId)
      if (!tp) continue
      minutes[0] += tp.minutes[0]
      minutes[1] += tp.minutes[1]
    }
    let clearance = Infinity
    for (const m of resolved.members) {
      if (!own.has(m.id) || m.role !== 'zarge' || !m.partKey?.startsWith('zarge-')) continue
      for (const o of memberBoxes(m)) clearance = Math.min(clearance, obbBounds(o).min.z)
    }
    return {
      style,
      project,
      resolved,
      price: computeBom(project, resolved).total,
      sway: Math.max(statics.sway.x, statics.sway.y),
      swayClass: statics.swayClass,
      maxUtil: statics.maxUtil,
      holes,
      parts: own.size,
      joints: joints.length,
      minutes,
      clearance: Number.isFinite(clearance) ? Math.round(clearance) : 0,
    }
  })
}
