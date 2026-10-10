import { describe, expect, it } from 'vitest'
import { analyze } from '../src/analysis/checks'
import { computeStatics } from '../src/analysis/statics'
import { defaultBedParams, testProject } from '../src/model/defaults'
import { resolveProject } from '../src/model/resolve'
import type { LoftBedParams, Project } from '../src/model/types'

function withBed(over: Partial<LoftBedParams>): Project {
  const base = testProject()
  return { ...base, assemblies: [{ ...base.assemblies[0], params: defaultBedParams({ x: 1000, y: 1500, ...over }) }] }
}

describe('M7 Bauarten', () => {
  it('Etagenbett: zweite Liegefläche zwischen den Pfosten, Freiraum oben unverändert', () => {
    const p = withBed({ lowerBed: true, deckHeight: 1600 })
    const r = resolveProject(p)
    const info = r.beds.get(p.assemblies[0].id)!
    expect(r.panels.filter((x) => x.kind === 'matratze')).toHaveLength(2)
    expect(r.members.some((m) => m.partKey === 'unten-zarge-vorne')).toBe(true)
    expect(info.lowerMattressTop).toBeGreaterThan(400)
    expect(info.underside).toBeGreaterThan(1300)
    const s = computeStatics(p, r)
    expect(s.warnings).toEqual([])
    // beide Matratzen tragen: die unteren Latten sind ausgenutzt
    const lowerSlat = [...s.members.entries()].find(([id]) => id.includes('unten-latte'))
    expect(lowerSlat?.[1].util).toBeGreaterThan(0.05)
    const a = analyze(p, r)
    expect(a.findings.some((f) => f.id.startsWith('etage-info'))).toBe(true)
  })

  it('Mittelstützen tragen die lange Zarge und verringern ihre Durchbiegung', () => {
    const mk = (midPosts: number) => {
      const p = withBed({ mattressLength: 2800, mattressWidth: 1400, midPosts })
      const r = resolveProject(p)
      return { r, s: computeStatics(p, r) }
    }
    const a = mk(0)
    const b = mk(1)
    expect(b.r.members.filter((m) => m.partKey?.startsWith('stuetze-'))).toHaveLength(2)
    // Durchbiegung der vorderen Längszarge unter Eigengewicht + Nutzlast
    const sag = (x: typeof a) => Math.max(...[...x.s.shapes.gq.entries()].find(([id]) => id.endsWith('zarge-vorne'))![1].map((q) => -q.u.z))
    console.log(`Längszarge 2,80 m: Durchbiegung ohne Stütze ${sag(a).toFixed(1)} mm, mit ${sag(b).toFixed(1)} mm`)
    expect(sag(b)).toBeLessThan(sag(a) * 0.5)
  })

  it('Begehbares Netz zieht die Zargen nach innen', () => {
    const p = withBed({ deck: 'netz', deckCatalogId: 'netz-begehbar', mattressLength: 2000, mattressWidth: 1400 })
    const r = resolveProject(p)
    expect(r.panels.some((x) => x.kind === 'netz' && !x.vertical)).toBe(true)
    expect(r.panels.some((x) => x.kind === 'matratze')).toBe(false)
    const s = computeStatics(p, r)
    expect(s.warnings).toEqual([])
    const rail = [...s.members.entries()].find(([id]) => id.endsWith('zarge-vorne'))![1]
    const latten = computeStatics(withBed({ mattressLength: 2000, mattressWidth: 1400 }), resolveProject(withBed({ mattressLength: 2000, mattressWidth: 1400 })))
    const railL = [...latten.members.entries()].find(([id]) => id.endsWith('zarge-vorne'))![1]
    console.log(`Längszarge mit Netz ${(rail.util * 100).toFixed(0)} %, mit Latten ${(railL.util * 100).toFixed(0)} %`)
    expect(rail.util).toBeGreaterThan(railL.util)
    const a = analyze(p, r)
    expect(a.findings.some((f) => f.id.startsWith('netz-deck'))).toBe(true)
  })
})

describe('Mehrere Matratzen', () => {
  it('zwei Matratzen nebeneinander: breiteres Gestell, Mittelträger unter der Fuge, beide tragen', () => {
    const p = withBed({ mattressCount: 2, mattressWidth: 900 })
    const r = resolveProject(p)
    const info = r.beds.get(p.assemblies[0].id)!
    const mats = r.panels.filter((x) => x.kind === 'matratze')
    expect(mats).toHaveLength(2)
    expect(info.outerWidth).toBeGreaterThan(1800 + 160)
    const mid = r.members.find((m) => m.partKey === 'mitteltraeger')!
    expect(mid).toBeDefined()
    const s = computeStatics(p, r)
    expect(s.warnings).toEqual([])
    expect(s.members.get(mid.id)!.util).toBeGreaterThan(0.05)
  })

  it('Abstand zwischen den Matratzen: Gestell wächst um den Abstand, Mittelträger mittig in der Lücke', () => {
    const base = resolveProject(withBed({ mattressCount: 2, mattressWidth: 900 }))
    const p = withBed({ mattressCount: 2, mattressWidth: 900, mattressSpacing: 300 })
    const r = resolveProject(p)
    const id = p.assemblies[0].id
    expect(r.beds.get(id)!.outerWidth - base.beds.get(id)!.outerWidth).toBe(300 - p.assemblies[0].params.mattressGap)
    const ys = r.panels
      .filter((x) => x.kind === 'matratze')
      .map((x) => x.outline.map((q) => q.y))
      .map((qs) => [Math.min(...qs), Math.max(...qs)])
      .sort((a, b) => a[0] - b[0])
    expect(Math.round(ys[1][0] - ys[0][1])).toBe(300)
    const mid = r.members.find((m) => m.partKey === 'mitteltraeger')!
    expect(Math.abs(mid.start.y - (ys[0][1] + ys[1][0]) / 2)).toBeLessThan(1)
    expect(computeStatics(p, r).warnings).toEqual([])
  })

  it('Rollroste hintereinander: ein Rost je Matratze und ein Querträger an der Fuge', () => {
    const p = withBed({ mattressCount: 2, mattressLayout: 'hintereinander', deck: 'rollrost', deckCatalogId: 'rollrost' })
    const r = resolveProject(p)
    expect(r.panels.filter((x) => x.kind === 'rollrost')).toHaveLength(2)
    expect(r.beds.get(p.assemblies[0].id)!.outerLength).toBeGreaterThan(4000)
    expect(r.members.some((m) => m.partKey === 'quertraeger-1')).toBe(true)
    expect(computeStatics(p, r).warnings).toEqual([])
  })
})
