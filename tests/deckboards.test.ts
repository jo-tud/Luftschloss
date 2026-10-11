import { describe, expect, it } from 'vitest'
import { computeBom } from '../src/analysis/bom'
import { deckBoards } from '../src/model/deckBoards'
import { testProject } from '../src/model/defaults'
import { bedOuterSize } from '../src/model/loftbed'
import { resolveProject } from '../src/model/resolve'

const LEIMHOLZ = [
  { l: 2000, w: 600, price: 31.95 },
  { l: 1200, w: 600, price: 19.25 },
  { l: 1200, w: 400, price: 12.75 },
]

describe('Liegefläche aus breiten Leimholzbrettern', () => {
  it('mischt 60 und 40 cm so, dass wenige Bretter und wenig Verschnitt bleiben', () => {
    const lay = deckBoards(2000, 1000, LEIMHOLZ)!
    expect(lay.widths.reduce((s, w) => s + w, 0)).toBe(2000)
    expect(lay.ripped).toBe(0)
    expect(lay.widths.length).toBeLessThanOrEqual(4)
    const odd = deckBoards(2080, 1080, LEIMHOLZ)!
    expect(odd.widths.reduce((s, w) => s + w, 0)).toBe(2080)
    expect(odd.widths.length).toBe(4)
    // breiter als 1,20 m: nur noch das lange Format
    expect(deckBoards(2000, 1500, LEIMHOLZ)!.widths.every((w) => w <= 600)).toBe(true)
    expect(deckBoards(2000, 2500, LEIMHOLZ)).toBeUndefined()
  })

  it('Bett: ein Paneel je Brett, Querträger unter jedem Stoß, Zuschnitt aus 1200er Platten', () => {
    const p = testProject()
    p.furniture = []
    Object.assign(p.assemblies[0].params, { deck: 'platte', deckCatalogId: 'leimholz-fi-18', frameStyle: 'zargen' })
    const r = resolveProject(p)
    const boards = r.panels.filter((x) => x.partKey?.startsWith('liegeflaeche'))
    const { length } = bedOuterSize(p.assemblies[0].params)
    const lay = deckBoards(length, bedOuterSize(p.assemblies[0].params).width, LEIMHOLZ)!
    expect(boards).toHaveLength(lay.widths.length)
    const joists = r.members.filter((m) => m.role === 'quertraeger')
    expect(joists).toHaveLength(lay.widths.length - 1)
    const sheets = computeBom(p, r).sheets.filter((s) => s.item.id === 'leimholz-fi-18' && s.layouts?.some((l) => l.pieces.some((pc) => pc.label.startsWith('Liegefläche'))))
    expect(sheets.every((s) => s.format.l === 1200)).toBe(true)
    expect(sheets.reduce((n, s) => n + s.count, 0)).toBe(lay.widths.length)
  })
})
