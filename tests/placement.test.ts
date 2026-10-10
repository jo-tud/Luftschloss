import { describe, expect, it } from 'vitest'
import { analyze } from '../src/analysis/checks'
import { testProject } from '../src/model/defaults'
import { bestCorner, CORNERS, placeBed } from '../src/model/placement'
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
