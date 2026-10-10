import { describe, expect, it } from 'vitest'
import { CLEARANCE, HEADROOM, defaultAnswers, proposals, roomProject } from '../src/model/wizard'

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
