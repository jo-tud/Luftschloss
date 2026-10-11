import { describe, expect, it } from 'vitest'
import { analyze } from '../src/analysis/checks'
import { testProject } from '../src/model/defaults'
import { bedBounds, bestCorner, CORNERS, keepWallContact, placeBed } from '../src/model/placement'
import { resolveProject } from '../src/model/resolve'

describe('Vorlage einsetzen', () => {
  it('wählt eine Ecke ohne Fehler und mit möglichst wenigen Warnungen', () => {
    const p = testProject()
    p.assemblies = []
    const c = bestCorner(p, 'freistehend', {})
    const score = (corner: (typeof CORNERS)[number]) => {
      const q = { ...p, assemblies: [{ id: 'b', kind: 'hochbett' as const, name: '', params: placeBed(p.room, 'freistehend', {}, corner), detached: [] }] }
      const f = analyze(q, resolveProject(q)).findings
      return f.filter((x) => x.severity === 'fehler').length * 1000 + f.filter((x) => x.severity === 'warnung').length
    }
    for (const other of CORNERS) expect(score(c)).toBeLessThanOrEqual(score(other) + 300)
    expect(score(c)).toBeLessThan(1000)
  })
})

describe('Bett bleibt an der Wand', () => {
  it('dickere Pfosten: das Bett wächst von der Wand weg, nicht in sie hinein', () => {
    const p = testProject()
    const before = p.assemblies[0].params
    const after = keepWallContact(p.room, before, { ...before, postCatalogId: 'geh-90x90' })
    const b0 = bedBounds(before)
    const b1 = bedBounds(after)
    // vorher an Wand A (y = 0) und Wand D (x = Raumlänge)
    expect(b0.minY).toBeLessThan(50)
    expect(p.room.length - b0.maxX).toBeLessThan(50)
    expect(b1.maxX).toBeCloseTo(b0.maxX, 0)
    expect(b1.minY).toBeCloseTo(b0.minY, 0)
    expect(b1.maxX - b1.minX).toBeGreaterThan(b0.maxX - b0.minX)
    const q = { ...p, assemblies: [{ ...p.assemblies[0], params: after }] }
    expect(analyze(q, resolveProject(q)).findings.some((f) => f.id.startsWith('wand:') || f.id.startsWith('wand-gruppe'))).toBe(false)
  })
})
