import { describe, expect, it } from 'vitest'
import { analyze } from '../src/analysis/checks'
import { defaultBedParams, testProject } from '../src/model/defaults'
import { allFasteners, fastenerClashes } from '../src/model/fasteners'
import { cutOverlaps } from '../src/model/joinery'
import { bedOuterSize, generateLoftBed, outsideRails } from '../src/model/loftbed'
import { keepWallContact } from '../src/model/placement'
import { resolveProject } from '../src/model/resolve'
import type { Assembly, LoftBedParams } from '../src/model/types'

const bed = (over: Partial<LoftBedParams>): Assembly => ({ id: 'b', kind: 'hochbett', name: 'B', detached: [], params: defaultBedParams({ x: 1000, y: 1000, ...over }) })
const part = (a: Assembly, key: string) => generateLoftBed(a, 2600).members.find((m) => m.partKey === key)!

/** Beispielzimmer mit dem Bett in der Bauweise „Zargen außen“, an den Wänden belassen wie in der App */
function sample(patch: Partial<LoftBedParams> = {}) {
  const p = testProject()
  const before = p.assemblies[0].params
  p.assemblies[0].params = keepWallContact(p.room, before, { ...before, frameStyle: 'aussen', ...patch })
  return p
}

describe('Bauweise Zargen außen, durchgebolzt', () => {
  it('rückt die Pfosten um eine Zargendicke ein und lässt die Zargen außen durchlaufen', () => {
    const inner = bed({})
    const outer = bed({ frameStyle: 'aussen' })
    expect(outsideRails(outer.params)).toBe(true)
    // gleiche Matratze, das Bett wird je Seite um eine Zargendicke (60 mm) größer
    expect(bedOuterSize(outer.params).length - bedOuterSize(inner.params).length).toBe(120)
    const { length: Lo } = bedOuterSize(outer.params)
    const post = part(outer, 'pfosten-BL')
    expect(post.start.x).toBe(1000 + 60 + 40)
    expect(post.start.y).toBe(1000 + 60 + 40)
    // ohne Geländer an den Pfosten enden sie unter der Liegefläche
    expect(post.end.z).toBe(1800 - 44)
    const long = part(outer, 'zarge-vorne')
    expect([long.start.x, long.end.x]).toEqual([1000, 1000 + Lo])
    // Querzargen eine Zargenhöhe tiefer: an den Ecken liegen die Längszargen auf
    const cross = part(outer, 'zarge-links')
    expect(long.start.z - cross.start.z).toBe(120)
    // keine Kopfbänder in dieser Bauweise
    expect(generateLoftBed(outer, 2600).members.some((m) => m.role === 'strebe')).toBe(false)
  })

  it('gilt nur mit vier Pfosten; sonst bleibt alles wie bei Zargen zwischen den Pfosten', () => {
    for (const over of [{ type: 'wandseitig' }, { deck: 'netz' }, { cornerSupport: 'moebel' }] as Partial<LoftBedParams>[]) {
      const a = bed({ ...over, frameStyle: 'aussen' })
      expect(outsideRails(a.params)).toBe(false)
      expect(generateLoftBed(a, 2600).members).toEqual(generateLoftBed(bed({ ...over, frameStyle: 'zargen' }), 2600).members)
    }
  })

  it('bolzt jede Zarge durch ihren Pfosten, ohne dass sich Bolzen oder Ausnehmungen treffen', () => {
    const variants: Partial<LoftBedParams>[] = [
      {},
      { deck: 'platte', deckCatalogId: 'osb-22' },
      { type: 'deckenhoch' },
      { lowerBed: true },
      { midPosts: 1, mattressLength: 2800 },
      { mattressWidth: 1400 },
      { ladderSide: 'links', ladderOffset: 300 },
    ]
    for (const v of variants) {
      const p = sample(v)
      const r = resolveProject(p)
      const byId = new Map(r.members.map((m) => [m.id, m]))
      const railJoints = r.joints.filter((j) => {
        const roles = [byId.get(j.a)!, byId.get(j.b)!].map((m) => m.partKey ?? '')
        return roles.some((k) => k.startsWith('pfosten-')) && roles.some((k) => k.startsWith('zarge-'))
      })
      expect(railJoints.length, JSON.stringify(v)).toBe(8)
      for (const j of railJoints) {
        expect(j.kind).toBe('beischlag')
        expect(j.typeId).toBe('schlossschraube')
      }
      const bolts = allFasteners(r).filter((f) => railJoints.some((j) => j.key === f.joint) && f.kind === 'bolzen')
      expect(bolts.length, JSON.stringify(v)).toBeGreaterThanOrEqual(16)
      expect(fastenerClashes(r), JSON.stringify(v)).toEqual([])
      expect(cutOverlaps(r.joints, r.members), JSON.stringify(v)).toEqual([])
      const ids = analyze(p, r).findings.map((f) => f.id)
      expect(ids.filter((id) => id.startsWith('kreuzung:') || id.startsWith('befestiger-kreuzung:')), JSON.stringify(v)).toEqual([])
    }
  })

  it('befestigt die Zarge an der Wand gegen Kippen, frei im Raum warnt die Prüfung vor dem Wackeln', () => {
    const p = sample()
    const r = resolveProject(p)
    expect(r.fixings.some((f) => f.target === 'wand')).toBe(true)
    expect(analyze(p, r).findings.some((f) => f.id.startsWith('wackeln:'))).toBe(false)
    const q = testProject()
    q.assemblies[0].params = { ...q.assemblies[0].params, frameStyle: 'aussen', braces: true, x: 1500, y: 2000 }
    expect(analyze(q, resolveProject(q)).findings.some((f) => f.id.startsWith('wackeln:'))).toBe(true)
  })
})
