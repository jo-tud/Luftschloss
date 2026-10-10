import { describe, expect, it } from 'vitest'
import { analyze } from '../src/analysis/checks'
import { testProject } from '../src/model/defaults'
import { placeBed } from '../src/model/placement'
import { resolveProject } from '../src/model/resolve'
import type { LoftBedParams, Project } from '../src/model/types'

function withBed(patch: Partial<LoftBedParams>, edit?: (p: Project) => void): Project {
  const p = testProject()
  p.furniture = []
  Object.assign(p.assemblies[0].params, patch)
  edit?.(p)
  return p
}
const ids = (p: Project) => analyze(p, resolveProject(p)).findings.map((f) => f.id)

describe('Sicherheitsprüfungen aus der Geometrie', () => {
  it('gespiegeltes Bett: die offene Seite wird an ihrer tatsächlichen Lage geprüft', () => {
    const sides = { vorne: true, hinten: true, links: false, rechts: true }
    const plain = withBed({ type: 'freistehend', x: 0, guardSides: sides })
    expect(ids(plain).some((i) => i.startsWith('offen:bett-1:links'))).toBe(false)
    const mirrored = withBed({ type: 'freistehend', x: 0, guardSides: sides, mirror: true })
    expect(ids(mirrored).some((i) => i.startsWith('offen:bett-1:links'))).toBe(true)
  })

  it('Bretter-Geländer: auch bei hohem Geländer kein Spalt über 6 cm', () => {
    for (const guardHeight of [400, 450, 500, 550]) {
      const p = withBed({ guard: 'bretter', guardHeight })
      const r = resolveProject(p)
      expect(r.beds.get('bett-1')!.rodGap, `Geländer ${guardHeight}`).toBeLessThanOrEqual(60)
      // tatsächlicher Spalt zwischen oberstem Brett und Handlauf (vorne)
      const top = (id: string) => r.members.filter((m) => m.id.startsWith(id))
      const boards = top('bett-1:brett-vorne')
      const rails = top('bett-1:handlauf-vorne')
      expect(boards.length).toBeGreaterThan(0)
      const boardTop = Math.max(...boards.map((m) => m.start.z + m.h / 2))
      const railBottom = Math.min(...rails.map((m) => m.start.z - m.h / 2))
      expect(railBottom - boardTop, `Geländer ${guardHeight}`).toBeLessThanOrEqual(61)
    }
  })

  it('Wandseite ohne Wand dahinter ist ein Fehler', () => {
    const p = withBed({ type: 'wandseitig', frameStyle: 'aufgelegt', y: 1000 })
    expect(ids(p)).toContain('wandseite:bett-1:hinten')
    const ok = withBed({ type: 'wandseitig', frameStyle: 'aufgelegt', y: 0 })
    expect(ids(ok).some((i) => i.startsWith('wandseite:'))).toBe(false)
  })

  it('tragender Wandbalken über einem Fenster ist ein Fehler', () => {
    const p = withBed({ type: 'wandseitig', frameStyle: 'aufgelegt', y: 0, deckHeight: 1900 })
    expect(ids(p).some((i) => i.startsWith('wandbalken-oeffnung:'))).toBe(true)
  })

  it('DIN EN 747: Geländer mindestens 26 cm über der Liegefläche', () => {
    const p = withBed({ guardHeight: 250, mattressThickness: 80 })
    expect(ids(p)).toContain('gelaender-hoehe:bett-1')
  })

  it('Wandbalken in der Ecke wird an der Wand geprüft, an der er entlangläuft', () => {
    const p = testProject()
    p.furniture = []
    p.room.walls = { A: { material: 'beton' }, B: { material: 'beton' }, C: { material: 'trockenbau' }, D: { material: 'beton' } }
    p.assemblies[0].params = placeBed(p.room, 'wandseitig', { frameStyle: 'aufgelegt' }, 'CB')
    const f = analyze(p, resolveProject(p)).findings.filter((x) => x.id.startsWith('wandmaterial:'))
    expect(f.some((x) => x.severity === 'fehler' && x.title.includes('C'))).toBe(true)
  })
})
