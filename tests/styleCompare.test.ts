import { describe, expect, it } from 'vitest'
import { availableStyles, compareStyles } from '../src/analysis/compare'
import { testProject } from '../src/model/defaults'
import type { LoftBedParams } from '../src/model/types'

function project(patch: Partial<LoftBedParams>) {
  const p = testProject()
  Object.assign(p.assemblies[0].params, patch)
  return p
}

describe('Bauweisen im Vergleich', () => {
  it('bietet nur Bauweisen an, die bei dieser Liegefläche etwas ändern', () => {
    expect(availableStyles(project({}).assemblies[0].params)).toEqual(['zargen', 'aussen'])
    expect(availableStyles(project({ deck: 'platte', deckCatalogId: 'osb-22' }).assemblies[0].params)).toEqual(['zargen', 'aufgelegt', 'aussen'])
  })

  it('rechnet jede Bauweise durch, ohne das Projekt zu ändern', () => {
    const p = project({ deck: 'platte', deckCatalogId: 'osb-22' })
    const before = JSON.stringify(p)
    const vs = compareStyles(p, p.assemblies[0].id)
    expect(JSON.stringify(p)).toBe(before)
    expect(vs.map((v) => v.style)).toEqual(['zargen', 'aufgelegt', 'aussen'])
    for (const v of vs) {
      expect(v.project.assemblies[0].params.frameStyle).toBe(v.style)
      expect(v.price).toBeGreaterThan(0)
      expect(v.holes).toBeGreaterThan(0)
      expect(v.minutes[0]).toBeGreaterThan(v.minutes[1])
    }
    const by = Object.fromEntries(vs.map((v) => [v.style, v]))
    // außen: Querzargen eine Zargenhöhe tiefer, also weniger Durchgang
    expect(by.aussen.clearance).toBeLessThan(by.zargen.clearance)
    // aufgelegt: Querträger auf den Zargen, die Zargen sitzen tiefer
    expect(by.aufgelegt.clearance).toBeLessThan(by.zargen.clearance)
  })
})
