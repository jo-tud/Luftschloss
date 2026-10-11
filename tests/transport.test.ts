import { describe, expect, it } from 'vitest'
import { analyze } from '../src/analysis/checks'
import { transportCheck } from '../src/analysis/assembly'
import { testProject } from '../src/model/defaults'
import { resolveProject } from '../src/model/resolve'
import type { Project } from '../src/model/types'

/** Beispielzimmer, Tür an Wand B (Raum dahinter = Länge 4,30 m) und wahlweise kürzer */
function withDoorOn(length: number): Project {
  const p = testProject()
  p.room.length = length
  const door = p.wallObjects.find((o) => o.kind === 'tuer')!
  door.wall = 'B'
  door.offset = 3000
  return p
}

describe('Lange Teile ins Zimmer tragen', () => {
  it('der Länge nach durch die Tür: keine Meldung, solange der Raum dahinter tief genug ist', () => {
    const p = testProject()
    const tc = transportCheck(p, resolveProject(p))
    expect(tc.longest).toBeGreaterThan(2250)
    expect(tc.depth).toBeGreaterThan(tc.longest)
    expect(analyze(p, resolveProject(p)).findings.some((f) => f.id === 'transport')).toBe(false)
  })

  it('knapp: Hinweis zum Anheben; zu lang auch angehoben: Warnung', () => {
    const tight = withDoorOn(2200)
    tight.assemblies[0].params.x = 0
    const r = resolveProject(tight)
    const tc = transportCheck(tight, r)
    expect(tc.longest).toBeGreaterThan(tc.depth!)
    const f = analyze(tight, r).findings.find((x) => x.id === 'transport')
    expect(f?.severity).toBe(tc.longest > tc.tilt! ? 'warnung' : 'hinweis')
  })
})
