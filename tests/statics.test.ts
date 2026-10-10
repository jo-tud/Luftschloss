import { describe, expect, it } from 'vitest'
import { solveFrame, type FrameModel } from '../src/analysis/frame'
import { computeStatics } from '../src/analysis/statics'
import { defaultBedParams, testProject } from '../src/model/defaults'
import { resolveProject } from '../src/model/resolve'

function beam(n: number, L: number): FrameModel {
  const nodes = Array.from({ length: n + 1 }, (_, i) => ({ p: [(L * i) / n, 0, 0] as [number, number, number] }))
  const b = 60
  const h = 120
  const elements = Array.from({ length: n }, (_, i) => ({ n1: i, n2: i + 1, E: 11000, G: 690, A: b * h, Iy: (b * h ** 3) / 12, Iz: (h * b ** 3) / 12, J: 1e6, yAxis: [0, 1, 0] as [number, number, number] }))
  return { nodes, elements, links: [], supports: [] }
}

describe('Stabwerkslöser', () => {
  it('trifft die Durchbiegung des Einfeldträgers unter Gleichlast', () => {
    const L = 2000
    const n = 20
    const m = beam(n, L)
    m.supports.push({ node: 0, fix: [true, true, true, true, false, false] }, { node: n, fix: [false, true, true, false, false, false] })
    const q = 0.575
    const nodal = new Map<number, number[]>()
    for (let i = 0; i <= n; i++) nodal.set(i, [0, 0, -(q * L) / n / (i === 0 || i === n ? 2 : 1), 0, 0, 0])
    const [r] = solveFrame(m, [{ nodal }])
    const wMid = -r.u[(n / 2) * 6 + 2]
    const I = (60 * 120 ** 3) / 12
    expect(wMid).toBeCloseTo((5 * q * L ** 4) / (384 * 11000 * I), 1)
  })

  it('trifft den Kragarm mit Endlast', () => {
    const L = 1000
    const m = beam(10, L)
    m.supports.push({ node: 0, fix: [true, true, true, true, true, true] })
    const [r] = solveFrame(m, [{ nodal: new Map([[10, [0, 0, -1000, 0, 0, 0]]]) }])
    const I = (60 * 120 ** 3) / 12
    expect(-r.u[10 * 6 + 2]).toBeCloseTo((1000 * L ** 3) / (3 * 11000 * I), 2)
  })

  it('überträgt Kräfte über eine Kopplung mit Versatz', () => {
    const L = 1000
    const m = beam(4, L)
    m.nodes.push({ p: [L, 0, 50] })
    m.supports.push({ node: 0, fix: [true, true, true, true, true, true] })
    m.links.push({ n1: 4, n2: 5, kt: 2e6, kr: 3e8 })
    const [r] = solveFrame(m, [{ nodal: new Map([[5, [0, 0, -1000, 0, 0, 0]]]) }])
    expect(-r.u[4 * 6 + 2]).toBeGreaterThan(0.5)
    expect(r.links[0].force).toBeCloseTo(1000, -1)
  })
})

describe('Statik Beispielzimmer', () => {
  it('rechnet das Gestell durch und liefert plausible Werte', () => {
    const p = testProject()
    const t0 = performance.now()
    const s = computeStatics(p, resolveProject(p))
    const ms = performance.now() - t0
    expect(s.warnings).toEqual([])
    expect(s.members.size).toBeGreaterThan(10)
    for (const c of s.members.values()) expect(Number.isFinite(c.util)).toBe(true)
    expect(s.maxUtil).toBeGreaterThan(0.05)
    expect(s.sway.x).toBeGreaterThan(0)
    console.log(`Statik: ${s.dof} Freiheitsgrade, ${ms.toFixed(0)} ms, max. Ausnutzung ${(s.maxUtil * 100).toFixed(0)} %, Wackeln ${s.sway.x.toFixed(1)}/${s.sway.y.toFixed(1)} mm (${s.swayClass})`)
  })

  it('Kopfbänder machen ein freistehendes Bett steifer', () => {
    const base = testProject()
    const mk = (braces: boolean) => {
      const p = { ...base, assemblies: [{ ...base.assemblies[0], params: defaultBedParams({ x: 1000, y: 1500, braces }) }] }
      return computeStatics(p, resolveProject(p))
    }
    const without = mk(false)
    const withB = mk(true)
    console.log(`ohne Kopfbänder ${without.sway.x.toFixed(1)} mm, mit ${withB.sway.x.toFixed(1)} mm`)
    expect(withB.sway.x).toBeLessThan(without.sway.x)
  })
})

describe('Statik: Geländer und aufgelegte Querträger', () => {
  it('Gegen das Geländer drücken biegt keine Stirnbretter quer; aufgelegte End-Querträger hängen nicht an den Pfosten', () => {
    const p = testProject()
    Object.assign(p.assemblies[0].params, { deck: 'dielen', deckCatalogId: 'nf-kiefer-27', frameStyle: 'aufgelegt', braces: true })
    const r = resolveProject(p)
    const s = computeStatics(p, r)
    for (const [id, c] of s.members) if (id.includes(':brett-')) expect(c.util).toBeLessThan(0.6)
    // keine Querträger-Pfosten-Verbindung
    expect(r.joints.some((j) => j.key.includes('quertraeger') && j.key.includes('pfosten'))).toBe(false)
  })
})
