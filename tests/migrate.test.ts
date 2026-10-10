import { describe, expect, it } from 'vitest'
import { migrate } from '../src/state/store'
import type { Project } from '../src/model/types'

describe('Projekt laden (Datei, Speicher, Abgleich)', () => {
  it('ergänzt Fehlendes neutral statt mit dem Beispielzimmer', () => {
    const p = migrate({ version: 1, name: 'Mein Zimmer', room: { length: 4000, width: 3000, height: 2500 }, assemblies: [] } as unknown as Project)
    expect(p.wallObjects).toEqual([])
    expect(p.furniture).toEqual([])
    expect(p.room.skirting).toBeDefined()
    expect(p.room.walls.A.material).toBeDefined()
    expect(p.room.length).toBe(4000)
  })
  it('lehnt Daten ab, die kein Projekt sind', () => {
    for (const bad of [null, {}, { version: 2, room: {} }, { version: 1, room: { length: 'x' } }, { version: 1 }]) expect(() => migrate(bad as unknown as Project)).toThrow()
  })
})
