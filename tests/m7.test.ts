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

describe('Liegefläche auf Querträgern', () => {
  it('aufgelegte Bauweise: Dielen bzw. Platte liegen oben auf den Querträgern, nicht darunter', () => {
    for (const [deck, cat] of [
      ['dielen', 'nf-kiefer-27'],
      ['platte', 'osb-22'],
    ] as const) {
      const p = withBed({ deck, deckCatalogId: cat, frameStyle: 'aufgelegt' })
      const r = resolveProject(p)
      const joists = r.members.filter((m) => m.role === 'quertraeger')
      expect(joists.length).toBeGreaterThan(0)
      const top = Math.max(...joists.map((m) => m.start.z + m.h / 2))
      const panel = r.panels.find((x) => x.kind === deck)!
      expect(Math.abs(panel.z - top)).toBeLessThan(1)
    }
  })
})

describe('Eckpfosten ohne Geländer', () => {
  it('enden an der Liegefläche, wenn an keiner der beiden Seiten ein Geländer anschließt', () => {
    const p = testProject()
    const P = p.assemblies[0].params
    P.guardSides = { ...P.guardSides, hinten: false, links: false }
    const top = (q: typeof p, k: string) => {
      const m = resolveProject(q).members.find((x) => x.partKey === k)!
      return Math.max(m.start.z, m.end.z)
    }
    expect(top(p, 'pfosten-BL')).toBe(P.deckHeight)
    expect(top(p, 'pfosten-FL')).toBe(P.deckHeight + P.guardHeight)
    expect(top(p, 'pfosten-BR')).toBe(P.deckHeight + P.guardHeight)
    P.trimPosts = false
    expect(top(p, 'pfosten-BL')).toBe(P.deckHeight + P.guardHeight)
  })
})

describe('Teile der Vorlage einzeln ändern', () => {
  it('Haltegriff aus anderem Holz und kürzer, ohne ihn herauszulösen', () => {
    const p = testProject()
    p.assemblies[0].params.ladder = 'stufen'
    const grip = (q: Project) => resolveProject(q).members.find((m) => m.partKey === 'leiter-griff-0')!
    const before = grip(p)
    const L0 = Math.hypot(before.end.x - before.start.x, before.end.y - before.start.y, before.end.z - before.start.z)
    p.assemblies[0].overrides = { 'leiter-griff-0': { catalogId: 'geh-44x74', length: L0 - 200 } }
    const after = grip(p)
    expect(after.catalogId).toBe('geh-44x74')
    expect(Math.min(after.b, after.h)).toBe(44)
    expect(Math.hypot(after.end.x - after.start.x, after.end.y - after.start.y, after.end.z - after.start.z)).toBeCloseTo(L0 - 200, 0)
    expect(after.start).toEqual(before.start)
    // bleibt bei anderen Änderungen am Bett erhalten
    p.assemblies[0].params.deckHeight += 50
    expect(grip(p).catalogId).toBe('geh-44x74')
  })

  it('Geländer aus Latten statt Brett: mehr Reihen, Spalt höchstens 6 cm', () => {
    const p = testProject()
    p.assemblies[0].params.guard = 'bretter'
    const rows = (q: Project) => resolveProject(q).members.filter((m) => m.partKey?.startsWith('brett-vorne'))
    const wide = rows(p).length
    p.assemblies[0].params.guardBoardCatalogId = 'latte-24x48'
    const slats = rows(p)
    expect(slats.length).toBeGreaterThan(wide)
    expect(slats.every((m) => m.catalogId === 'latte-24x48')).toBe(true)
    // Reihen überlappen nicht (auch nicht bei breiten Brettern)
    for (const list of [slats, rows({ ...p, assemblies: [{ ...p.assemblies[0], params: { ...p.assemblies[0].params, guardBoardCatalogId: undefined } }] })]) {
      const seg = list.filter((m) => m.partKey!.startsWith(list[0].partKey!.replace(/-\d+$/, '')))
      const zs = seg.map((m) => [m.start.z - m.h / 2, m.start.z + m.h / 2]).sort((a, b) => a[0] - b[0])
      for (let i = 1; i < zs.length; i++) expect(zs[i][0]).toBeGreaterThanOrEqual(zs[i - 1][1] - 0.5)
    }
    expect(analyze(p, resolveProject(p)).findings.some((f) => f.id.startsWith('spalt') && f.severity === 'fehler')).toBe(false)
  })
})
