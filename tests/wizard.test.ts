import { describe, expect, it } from 'vitest'
import { CLEARANCE, HEADROOM, defaultAnswers, proposals, roomProject } from '../src/model/wizard'
import { computeStatics } from '../src/analysis/statics'
import { resolveProject } from '../src/model/resolve'

describe('Planungsassistent', () => {
  it('baut das Zimmer aus den Antworten', () => {
    const a = defaultAnswers()
    const p = roomProject(a)
    expect(p.room.length).toBe(a.length)
    expect(p.wallObjects.map((o) => o.kind).sort()).toEqual(['fenster', 'tuer'])
    expect(p.room.walls.A.material).toBe('vollziegel')
    expect(p.assemblies).toHaveLength(0)
  })

  it('macht geprüfte Vorschläge ohne Fehler, mit Platz darunter und Kopfraum darüber', () => {
    const a = defaultAnswers()
    const ps = proposals(a)
    expect(ps.length).toBeGreaterThan(0)
    const best = ps[0]
    expect(best.errors).toBe(0)
    expect(best.clearance).toBeGreaterThanOrEqual(CLEARANCE[a.below] - 5)
    expect(best.headroom).toBeGreaterThanOrEqual(HEADROOM[a.age] - 5)
    // die Empfehlung verbaut kein Fenster
    expect(best.issues.some((i) => i.startsWith('Fenster'))).toBe(false)
    // verschiedene Bettarten zur Auswahl
    expect(new Set(ps.map((p) => p.type)).size).toBeGreaterThan(1)
  })

  it('niedrige Decke: Kompromiss wird benannt; kleine Kinder bekommen ein halbhohes Bett', () => {
    const a = { ...defaultAnswers(), height: 2400, below: 'stehen' as const }
    expect(proposals(a)[0].compromise).toBeTruthy()
    const k = proposals({ ...defaultAnswers(), age: 'klein' })[0]
    expect(k.params.deckHeight).toBeLessThanOrEqual(1000)
  })
})

describe('Assistent: geprüft heißt auch Statik und passende Prüfstrenge', () => {
  it('Prüfstrenge folgt dem Alter', () => {
    const a = defaultAnswers()
    expect(roomProject({ ...a, age: 'kind' }).settings.safetyProfile).toBe('kinder')
    expect(roomProject({ ...a, age: 'klein' }).settings.safetyProfile).toBe('kinder')
    expect(roomProject({ ...a, age: 'jugend' }).settings.safetyProfile).toBe('jugendliche')
    expect(roomProject({ ...a, age: 'erwachsen' }).settings.safetyProfile).toBe('erwachsene')
  })
  it('Vorschläge ohne Fehler sind auch statisch in Ordnung', () => {
    const solid = { ...defaultAnswers(), walls: { A: 'massiv', B: 'massiv', C: 'massiv', D: 'massiv' } as const }
    for (const a of [defaultAnswers(), solid, { ...solid, mattressWidth: 1400, age: 'erwachsen' as const }]) {
      for (const p of proposals(a)) {
        if (p.errors) continue
        const util = computeStatics(p.project, resolveProject(p.project)).maxUtil
        expect(util, p.key).toBeLessThanOrEqual(1.5)
      }
    }
    // rechnet viele Vorschläge samt Statik; bei voller Testlast länger als die üblichen 5 s
  }, 30000)
})
