import { describe, expect, it } from 'vitest'
import { analyze } from '../src/analysis/checks'
import { analyzeWindows } from '../src/analysis/openings'
import { obbBounds } from '../src/model/geometry'
import { bestCorner } from '../src/model/placement'
import { projectionBox, roomObstacles } from '../src/model/room'
import { resolveProject } from '../src/model/resolve'
import { emptyProject, testProject } from '../src/model/defaults'
import type { ProjectionObj } from '../src/model/types'

const block = (patch: Partial<ProjectionObj>): ProjectionObj => ({ id: 'ecke', kind: 'vorsprung', name: 'Raumecke', wall: 'A', offset: 0, width: 1500, depth: 1200, ...patch })

describe('Raumform: Vorsprünge und L-Form', () => {
  it('Vorsprung reicht vom Boden bis zur Decke und liegt an seiner Wand', () => {
    const p = emptyProject(4000, 3000, 2600)
    const o = block({ wall: 'A', offset: 0 })
    const b = obbBounds(projectionBox(p.room, o))
    // Wand A beginnt rechts (x = L) und läuft nach links
    expect(b.min.x).toBeCloseTo(2500)
    expect(b.max.x).toBeCloseTo(4000)
    expect(b.min.y).toBeCloseTo(0)
    expect(b.max.y).toBeCloseTo(1200)
    expect(b.min.z).toBeCloseTo(0)
    expect(b.max.z).toBeCloseTo(2600)
    p.wallObjects.push(o)
    expect(roomObstacles(p).some((x) => x.kind === 'vorsprung' && x.ownerId === 'ecke')).toBe(true)
  })

  it('Bett in der ausgesparten Ecke ist eine Kollision, die Eckwahl weicht aus', () => {
    const p = testProject()
    p.furniture = []
    const before = analyze(p, resolveProject(p)).findings.filter((f) => f.severity === 'fehler').length
    // Das Beispielbett steht in der Ecke A/D – genau dort einen Kamin aufmauern
    p.wallObjects.push(block({ id: 'kamin', name: 'Kamin', offset: 0, width: 600, depth: 500 }))
    const after = analyze(p, resolveProject(p)).findings
    expect(after.some((f) => f.severity === 'fehler' && f.targets.includes('kamin'))).toBe(true)
    expect(after.filter((f) => f.severity === 'fehler').length).toBeGreaterThan(before)
    const q = emptyProject(4000, 3500, 2700)
    q.wallObjects.push(block({ wall: 'A', offset: 0, width: 1800, depth: 1500 }))
    expect(bestCorner(q, 'freistehend', {})).not.toBe('AD')
  })

  it('Fensterflügel stößt an einen Vorsprung daneben', () => {
    const p = testProject()
    p.assemblies = []
    p.furniture = []
    const w = p.wallObjects.find((o) => o.kind === 'fenster')!
    const free = analyzeWindows(p, resolveProject(p)).filter((r) => r.windowId === w.id)
    p.wallObjects.push(block({ id: 'pfeiler', wall: w.wall, offset: w.offset + w.width + 20, width: 300, depth: 400 }))
    const blocked = analyzeWindows(p, resolveProject(p)).filter((r) => r.windowId === w.id)
    expect(Math.min(...blocked.map((r) => r.maxAngle))).toBeLessThan(Math.min(...free.map((r) => r.maxAngle)))
  })
})
