import { describe, expect, it } from 'vitest'
import { analyze } from '../src/analysis/checks'
import { computeStatics } from '../src/analysis/statics'
import { emptyProject } from '../src/model/defaults'
import { deckOnFurniture, placeBed, shelvesUnderBed } from '../src/model/placement'
import { resolveProject } from '../src/model/resolve'
import { furnitureBearings } from '../src/model/room'
import type { Project } from '../src/model/types'

/** Leerer Raum mit einem Bett ohne Pfosten; mit shelves zwei Regale unter den Enden, Höhe angepasst */
function bedOnShelves(shelves: boolean): Project {
  const p = emptyProject(4000, 3500, 2700)
  const params = placeBed(p.room, 'freistehend', { cornerSupport: 'moebel', braces: false }, 'AB')
  p.assemblies.push({ id: 'bett', kind: 'hochbett', name: 'Auf Regalen', params, detached: [] })
  if (shelves) {
    p.furniture.push(...shelvesUnderBed(params, 1500))
    params.deckHeight = deckOnFurniture(p, p.assemblies[0])!
  }
  return p
}

describe('Bett auf Regal/Schrank', () => {
  it('ohne Pfosten; Rahmen liegt nach dem Anpassen genau auf den Regalen', () => {
    const p = bedOnShelves(true)
    const r = resolveProject(p)
    expect(r.members.some((m) => m.role === 'pfosten' && m.partKey?.startsWith('pfosten-'))).toBe(false)
    const b = furnitureBearings(p, r.members)
    expect(new Set(b.map((x) => x.furnitureId)).size).toBe(2)
  })

  it('Statik findet die Auflager auf den Regalen', () => {
    const p = bedOnShelves(true)
    const s = computeStatics(p, resolveProject(p))
    expect(s.warnings).not.toContain('Keine Auflager gefunden')
    expect(s.maxUtil).toBeLessThan(1)
    expect(s.swayClass).toBe('steif')
  })

  it('Prüfung: Hinweis je tragendem Möbel, Fehler ohne Möbel darunter', () => {
    const ok = bedOnShelves(true)
    const ids = analyze(ok, resolveProject(ok)).findings.map((f) => f.id)
    expect(ids.filter((id) => id.startsWith('moebel-traeger:'))).toHaveLength(2)
    expect(ids.some((id) => id.startsWith('moebel-auflage:'))).toBe(false)
    const bare = bedOnShelves(false)
    expect(analyze(bare, resolveProject(bare)).findings.some((f) => f.id === 'moebel-auflage:bett' && f.severity === 'fehler')).toBe(true)
  })
})
