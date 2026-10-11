import { describe, expect, it } from 'vitest'
import { KERF, packOnFormat, packSheets, splitOversize, type SheetLayout, type SheetPiece } from '../src/analysis/sheetcut'
import { computeBom } from '../src/analysis/bom'
import { testProject } from '../src/model/defaults'
import { resolveProject } from '../src/model/resolve'

const LEIMHOLZ = [
  { l: 2000, w: 600, price: 31.95 },
  { l: 1200, w: 600, price: 19.25 },
]

/** Alle Teile liegen auf der Platte, überlappen nicht und halten die Sägefuge ein */
function valid(layouts: SheetLayout[]) {
  for (const sh of layouts) {
    const rects = sh.pieces.map((pc) => ({ x0: pc.x, y0: pc.y, x1: pc.x + (pc.rotated ? pc.w : pc.l), y1: pc.y + (pc.rotated ? pc.l : pc.w) }))
    for (const r of rects) {
      expect(r.x0).toBeGreaterThanOrEqual(0)
      expect(r.y0).toBeGreaterThanOrEqual(0)
      expect(r.x1).toBeLessThanOrEqual(sh.format.l)
      expect(r.y1).toBeLessThanOrEqual(sh.format.w)
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]
        const b = rects[j]
        const apart = a.x1 + KERF <= b.x0 || b.x1 + KERF <= a.x0 || a.y1 + KERF <= b.y0 || b.y1 + KERF <= a.y0
        expect(apart).toBe(true)
      }
  }
}

describe('Plattenzuschnitt 2D', () => {
  it('teilt zu große Teile in gleiche Stücke', () => {
    const parts = splitOversize({ label: 'Deck', l: 2020, w: 900 }, LEIMHOLZ)
    expect(parts).toHaveLength(4)
    expect(parts.every((p) => p.l <= 2000 && p.w <= 600)).toBe(true)
    expect(parts.map((p) => p.part)).toEqual(['1/4', '2/4', '3/4', '4/4'])
  })

  it('verteilt alle Teile gültig und verliert keins', () => {
    const pcs: SheetPiece[] = [
      { label: 'hinten', l: 2020, w: 252 },
      { label: 'vorne', l: 252, w: 114 },
      { label: 'vorne', l: 1494, w: 252 },
      { label: 'links', l: 1020, w: 252 },
      { label: 'rechts', l: 1020, w: 252 },
    ]
    const out = packSheets(pcs, LEIMHOLZ)
    valid(out)
    expect(out.reduce((s, x) => s + x.pieces.length, 0)).toBe(6)
    // vorher je Teil eigene Platten: 31,95 + 19,25 + 31,95 + 19,25 + 19,25 + 19,25
    expect(out.reduce((s, x) => s + x.format.price, 0)).toBeLessThan(140.9)
  })

  it('legt kleine Teile in die Reste statt auf neue Platten', () => {
    const pcs = Array.from({ length: 8 }, (_, i) => ({ label: `Brett ${i}`, l: 580, w: 280 }))
    const out = packOnFormat(pcs, { l: 1200, w: 600, price: 19.25 })
    valid(out)
    expect(out).toHaveLength(2)
  })

  it('Teileliste: Geländerplatten mit Zuschnittplan', () => {
    const p = testProject()
    p.furniture = []
    p.assemblies[0].params.guard = 'platte'
    const bom = computeBom(p, resolveProject(p))
    const lines = bom.sheets.filter((s) => s.item.id === 'leimholz-fi-18')
    expect(lines.every((s) => s.layouts?.length === s.count)).toBe(true)
    for (const s of lines) valid(s.layouts!)
  })
})
