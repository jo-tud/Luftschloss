import { describe, expect, it } from 'vitest'
import { analyze } from '../src/analysis/checks'
import { computeBom } from '../src/analysis/bom'
import { analyzeWindows } from '../src/analysis/openings'
import { testProject } from '../src/model/defaults'
import { memberLength } from '../src/model/geometry'
import { cutLengths } from '../src/model/joinery'
import { resolveProject } from '../src/model/resolve'
import type { LoftBedParams, Project } from '../src/model/types'

const bed = (patch: Partial<LoftBedParams>): Project => {
  const p = testProject()
  p.furniture = []
  Object.assign(p.assemblies[0].params, patch)
  return p
}

describe('Teileliste und Geometrie', () => {
  it('Platten verschiedener Größe: je Format eine Zeile', () => {
    const p = bed({ guard: 'platte' })
    const sheets = computeBom(p, resolveProject(p)).sheets.filter((s) => s.item.id === 'leimholz-fi-18')
    const formats = sheets.map((s) => `${s.format.l}x${s.format.w}`)
    expect(new Set(formats).size).toBe(formats.length)
    expect(formats.length).toBeGreaterThan(1)
  })

  it('Kopfband mit Gehrung: Zuschnitt von Spitze zu Spitze', () => {
    const p = bed({ braces: true })
    const r = resolveProject(p)
    const cuts = cutLengths(r.joints, r.members)
    const braces = r.members.filter((m) => m.shape)
    expect(braces.length).toBeGreaterThan(0)
    for (const m of braces) expect(cuts.get(m.id)!).toBeGreaterThan(memberLength(m) + 20)
  })

  it('Gewindestangen gehen absichtlich durch das Holz und Latten bleiben frei von Geländerpfosten', () => {
    for (const patch of [{ type: 'abgehaengt' }, { type: 'wandseitig', guard: 'staebe' }, { type: 'wandseitig', guard: 'platte' }] as Partial<LoftBedParams>[]) {
      const p = bed({ frameStyle: 'aufgelegt', y: 0, ...patch })
      const ids = analyze(p, resolveProject(p)).findings.map((f) => f.id)
      expect(ids.filter((i) => i.startsWith('kreuzung:')), JSON.stringify(patch)).toEqual([])
    }
  })

  it('Personen-Platzhalter blockieren keine Fensterflügel', () => {
    const p = testProject()
    const free = analyzeWindows(p, resolveProject(p))
    const win = p.wallObjects.find((o) => o.kind === 'fenster')!
    p.furniture.push({ id: 'person-test', kind: 'person-stehend', name: 'Person', x: 3000, y: 100, z: 0, sx: 400, sy: 300, sz: 1750, rotation: 0 } as Project['furniture'][number])
    const withPerson = analyzeWindows(p, resolveProject(p))
    expect(withPerson.filter((w) => w.windowId === win.id)).toEqual(free.filter((w) => w.windowId === win.id))
  })
})
