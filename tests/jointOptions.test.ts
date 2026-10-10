import { describe, expect, it } from 'vitest'
import { testProject } from '../src/model/defaults'
import { unsuitable } from '../src/model/joints'
import { resolveProject } from '../src/model/resolve'
import type { BedType, DeckType, GuardType, LadderType, LoftBedParams } from '../src/model/types'

function defaultsOf(patch: Partial<LoftBedParams>) {
  const p = testProject()
  Object.assign(p.assemblies[0].params, patch)
  const r = resolveProject(p)
  const byId = new Map(r.members.map((m) => [m.id, m]))
  return r.joints.map((j) => {
    const a = byId.get(j.a)!
    const b = byId.get(j.b)!
    return { j, why: unsuitable(j.typeId, { kind: j.kind, a, b, ending: j.ending ? byId.get(j.ending) : undefined }) }
  })
}

describe('Praxistaugliche Verbindungen', () => {
  it('die vorgeschlagenen Verbindungen taugen für ihre Bauteile', () => {
    const variants: Partial<LoftBedParams>[] = []
    for (const type of ['freistehend', 'deckenhoch', 'wandseitig', 'eck', 'abgehaengt'] as BedType[]) variants.push({ type })
    const deckIds: Record<string, string> = { latten: 'geh-44x74', platte: 'osb-22', dielen: 'nf-kiefer-27', netz: 'netz-begehbar' }
    for (const deck of ['latten', 'platte', 'dielen', 'netz'] as DeckType[]) variants.push({ deck, deckCatalogId: deckIds[deck] }, { deck, deckCatalogId: deckIds[deck], frameStyle: 'aufgelegt' })
    for (const guard of ['staebe', 'bretter', 'platte', 'netz', 'seil'] as GuardType[]) variants.push({ guard } as Partial<LoftBedParams>)
    for (const ladder of ['senkrecht', 'schraeg', 'stufen', 'treppe'] as LadderType[]) variants.push({ ladder })
    variants.push({ braces: true })
    const bad: string[] = []
    for (const v of variants) for (const { j, why } of defaultsOf(v)) if (why) bad.push(`${JSON.stringify(v)} ${j.key} ${j.typeId}: ${why}`)
    expect(bad).toEqual([])
  })

  it('Gratnut nur für Bretter und Stufen, Stecken nur für Rundstäbe', () => {
    const all = defaultsOf({ ladder: 'stufen' })
    const step = all.find(({ j }) => j.typeId === 'gratnut')!
    expect(step).toBeDefined()
    const p = testProject()
    const r = resolveProject(p)
    const byId = new Map(r.members.map((m) => [m.id, m]))
    const post = r.members.find((m) => m.role === 'pfosten')!
    const rail = r.members.find((m) => m.role === 'zarge')!
    const jm = { kind: 't-stoss' as const, a: post, b: rail, ending: rail }
    expect(unsuitable('gratnut', jm)).toBeDefined()
    expect(unsuitable('stecken', jm)).toBeDefined()
    expect(unsuitable('zapfen', jm)).toBeUndefined()
    expect(byId.size).toBeGreaterThan(0)
  })
})
