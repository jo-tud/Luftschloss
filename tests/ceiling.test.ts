import { describe, expect, it } from 'vitest'
import { analyze } from '../src/analysis/checks'
import { ceilingAt, ceilingFaces, ceilingRange, flatSpans, wallTop } from '../src/model/ceiling'
import { emptyProject, testProject } from '../src/model/defaults'
import { corniceIntrusion, cornice } from '../src/model/room'
import { resolveProject } from '../src/model/resolve'
import { migrate } from '../src/state/store'
import type { Project, WallId } from '../src/model/types'

const sloped = (wall: WallId, kneeHeight: number, angle: number): Project => {
  const p = emptyProject(4000, 3000, 2800)
  p.room.slopes = { [wall]: { kneeHeight, angle } }
  return p
}

describe('Dachschräge', () => {
  it('Deckenhöhe: Kniestock an der Wand, steigt mit der Neigung bis zur Raumhöhe', () => {
    const r = sloped('A', 1000, 45).room
    expect(ceilingAt(r, 2000, 0)).toBeCloseTo(1000)
    expect(ceilingAt(r, 2000, 500)).toBeCloseTo(1500)
    expect(ceilingAt(r, 2000, 2500)).toBeCloseTo(2800)
    const c = sloped('C', 1000, 45).room
    expect(ceilingAt(c, 2000, 3000)).toBeCloseTo(1000)
    expect(ceilingAt(c, 2000, 2500)).toBeCloseTo(1500)
    const b = sloped('B', 1200, 45).room
    expect(ceilingAt(b, 300, 1000)).toBeCloseTo(1500)
    const d = sloped('D', 1200, 45).room
    expect(ceilingAt(d, 3700, 1000)).toBeCloseTo(1500)
  })

  it('Deckenflächen decken den Grundriss genau ab, auch mit zwei Schrägen', () => {
    const p = sloped('A', 1000, 45)
    p.room.slopes!.B = { kneeHeight: 800, angle: 30 }
    const faces = ceilingFaces(p.room)
    expect(faces.map((f) => f.wall ?? '-').sort()).toEqual(['-', 'A', 'B'])
    let area = 0
    for (const f of faces) {
      for (let i = 0; i < f.poly.length; i++) {
        const a = f.poly[i]
        const b = f.poly[(i + 1) % f.poly.length]
        area += (a.x * b.y - b.x * a.y) / 2
      }
      // jede Ecke liegt auf der Decke
      for (const q of f.poly) expect(q.z).toBeCloseTo(ceilingAt(p.room, q.x, q.y), 3)
    }
    expect(Math.abs(area)).toBeCloseTo(4000 * 3000, -2)
  })

  it('Wandoberkante: Knick am Ende der Schräge, Stuck nur unter der flachen Decke', () => {
    const p = sloped('A', 1000, 45)
    // Wand B läuft von A (s = 0) nach C: Schräge bis 1800 mm, dann flach
    const top = wallTop(p.room, 'B')
    expect(top[0]).toEqual({ s: 0, z: 1000 })
    expect(top.some((q) => Math.abs(q.s - 1800) < 1 && Math.abs(q.z - 2800) < 1)).toBe(true)
    expect(flatSpans(p.room, 'B')).toEqual([[expect.closeTo(1800, 0), 3000]])
    expect(wallTop(p.room, 'A').every((q) => q.z === 1000)).toBe(true)
    expect(cornice(p.room, 'A').enabled).toBe(false)
    expect(corniceIntrusion(p.room, { x: 100, y: 500, z: 2750 })).toBeUndefined()
  })

  it('ohne Schräge bleibt alles wie bisher', () => {
    const p = testProject()
    expect(ceilingFaces(p.room)).toHaveLength(1)
    expect(ceilingRange(p.room, { minX: 0, maxX: 1000, minY: 0, maxY: 1000 })).toEqual({ min: p.room.height, max: p.room.height })
    expect(migrate(JSON.parse(JSON.stringify(p))).room.slopes).toEqual({})
  })

  it('Bett unter der Schräge: Kollision mit der Schräge und Hinweis zum Kopfraum', () => {
    const p = testProject()
    const before = analyze(p, resolveProject(p))
    expect(before.findings.some((f) => f.id.startsWith('decke:'))).toBe(false)
    // Schräge über der Wand, an der das Bett steht
    const info = [...resolveProject(p).beds.values()][0]
    const ys = info.footprint.map((q) => q.y)
    const xs = info.footprint.map((q) => q.x)
    const gaps: [WallId, number][] = [
      ['A', Math.min(...ys)],
      ['B', Math.min(...xs)],
      ['C', p.room.width - Math.max(...ys)],
      ['D', p.room.length - Math.max(...xs)],
    ]
    const wall = gaps.sort((a, b) => a[1] - b[1])[0][0]
    p.room.slopes = { [wall]: { kneeHeight: 1600, angle: 35 } }
    const after = analyze(p, resolveProject(p))
    const ids = after.findings.map((f) => f.id)
    expect(ids.some((id) => id.startsWith('decke'))).toBe(true)
    expect(ids.some((id) => id.startsWith('kopf-schraege:'))).toBe(true)
  })
})
