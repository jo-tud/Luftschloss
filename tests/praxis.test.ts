import { describe, expect, it } from 'vitest'
import { testProject } from '../src/model/defaults'
import { allFasteners, fastenerClashes, type Fastener } from '../src/model/fasteners'
import { add, dot, len, memberBoxes, scale, sub, type OBB } from '../src/model/geometry'
import { keepWallContact, placeBed } from '../src/model/placement'
import { jointPlan } from '../src/model/jointPlan'
import { resolveProject } from '../src/model/resolve'
import type { LoftBedParams, Project, Vec3 } from '../src/model/types'

/**
 * „Fällt es beim Bauen zusammen?“ – Kollisionen und unmögliche Montage, die der zweite
 * Verbindungs-Prüflauf in Standardbetten gefunden hat (review/verbindungen, Bericht 2).
 */

function sampleWith(patch: Partial<LoftBedParams>): Project {
  const p = testProject()
  const before = p.assemblies[0].params
  p.assemblies[0].params = keepWallContact(p.room, before, { ...before, ...patch })
  return p
}
function placed(type: LoftBedParams['type'], patch: Partial<LoftBedParams>): Project {
  const p = testProject()
  p.assemblies[0].params = placeBed(p.room, type, patch, 'AD')
  return p
}
function free(patch: Partial<LoftBedParams>): Project {
  const p = testProject()
  p.assemblies[0].params = { ...p.assemblies[0].params, x: 1000, y: 1800, ...patch }
  return p
}
function pref(p: Project, jointPreference: Project['settings']['jointPreference']): Project {
  p.settings.jointPreference = jointPreference
  return p
}

/** Kleinster Abstand zweier Strecken (genähert über 40 Stützstellen je Strecke) */
function segDist(p0: Vec3, p1: Vec3, q0: Vec3, q1: Vec3): number {
  let best = Infinity
  for (let i = 0; i <= 40; i++) {
    const a = add(p0, scale(sub(p1, p0), i / 40))
    const d = sub(q1, q0)
    const l2 = dot(d, d) || 1
    const t = Math.max(0, Math.min(1, dot(sub(a, q0), d) / l2))
    best = Math.min(best, len(sub(a, add(q0, scale(d, t)))))
  }
  return best
}
const shaft = (f: Fastener): [Vec3, Vec3] => [f.head, add(f.head, scale(f.dir, f.length))]

describe('Praxistauglich bauen', () => {
  it('kein Bolzen und keine Schraube läuft durch eine Mutterntasche', () => {
    for (const p of [testProject(), sampleWith({ frameStyle: 'aussen' }), sampleWith({ ladder: 'treppe', ladderAngle: 45, ladderCatalogId: 'kvh-60x160' }), free({ frameStyle: 'aufgelegt', deck: 'platte', deckCatalogId: 'osb-22', ladder: 'senkrecht' }), sampleWith({ frameStyle: 'aufgelegt' })]) {
      const fs = allFasteners(resolveProject(p))
      const bad: string[] = []
      for (const t of fs) {
        if (!t.crossNut) continue
        const c = t.crossNut
        const pocket: [Vec3, Vec3] = [add(c.at, scale(c.dir, -c.bore / 2)), add(c.at, scale(c.dir, c.depth))]
        for (const f of fs) {
          if (f === t || f.joint === t.joint || f.kind === 'blech') continue
          const [a, b] = shaft(f)
          if (segDist(a, b, ...pocket) < (f.d + c.bore) / 2) bad.push(`${f.joint} durch Tasche von ${t.joint}`)
        }
      }
      expect(bad).toEqual([])
    }
  })

  it('Haltegriff bei „Zargen außen“: sein Bolzen trifft den Pfosten nicht', () => {
    const r = resolveProject(sampleWith({ frameStyle: 'aussen' }))
    const posts = r.members.filter((m) => m.role === 'pfosten').flatMap((m) => memberBoxes(m).map((o) => ({ m, o })))
    const inBox = (o: OBB, q: Vec3) => o.axes.every((a, i) => Math.abs(dot(sub(q, o.center), a)) < o.half[i] + 1)
    const bad: string[] = []
    for (const f of allFasteners(r)) {
      if (!f.joint.includes('leiter-griff')) continue
      const [a, b] = shaft(f)
      for (let i = 0; i <= 50; i++) {
        const q = add(a, scale(sub(b, a), i / 50))
        for (const { m, o } of posts) if (inBox(o, q)) bad.push(`${f.joint} in ${m.partKey}`)
      }
    }
    expect([...new Set(bad)]).toEqual([])
  })

  it('am Wandbalken sitzt kein Kopf zwischen Balken und Wand', () => {
    for (const type of ['wandseitig', 'eck'] as const) {
      const r = resolveProject(placed(type, { ladder: 'stufen' }))
      const byId = new Map(r.members.map((m) => [m.id, m]))
      for (const j of r.joints) {
        if (!j.ending || !['schlossschraube', 'bettschraube', 'holzbauschraube'].includes(j.typeId)) continue
        const through = byId.get(j.a === j.ending ? j.b : j.a)!
        expect(through.role, `${type} ${j.key}`).not.toBe('wandriegel')
      }
    }
  })

  it('aufgelegt mit Latten: die Latten sind verschraubt, Geländer hängen an einer Zarge', () => {
    for (const p of [sampleWith({ frameStyle: 'aufgelegt' }), placed('wandseitig', { frameStyle: 'aufgelegt', ladder: 'schraeg' }), placed('eck', { frameStyle: 'aufgelegt', ladder: 'stufen' })]) {
      const r = resolveProject(p)
      const byId = new Map(r.members.map((m) => [m.id, m]))
      const slatJoints = r.joints.filter((j) => [j.a, j.b].some((id) => byId.get(id)!.role === 'leiste') && [j.a, j.b].some((id) => ['zarge', 'wandriegel'].includes(byId.get(id)!.role)))
      expect(slatJoints.length).toBeGreaterThan(0)
      for (const j of slatJoints) expect(j.typeId).toBe('auflage')
      const tragend = new Set(['pfosten', 'zarge', 'wandriegel', 'quertraeger', 'leiste'])
      for (const m of r.members) {
        if (!/^(gelaenderpfosten|gelaenderstuetze)/.test(m.partKey ?? '')) continue
        const held = r.joints.some((j) => (j.a === m.id || j.b === m.id) && j.typeId !== 'lose' && tragend.has(byId.get(j.a === m.id ? j.b : j.a)!.role))
        expect(held, m.partKey).toBe(true)
      }
    }
  })

  it('in den Standardbetten kreuzt sich nichts: Schrauben, Bolzen und Mutterntaschen', () => {
    const variants: [string, Project][] = [
      ['Beispiel', testProject()],
      ['außen', sampleWith({ frameStyle: 'aussen' })],
      ['aufgelegt', sampleWith({ frameStyle: 'aufgelegt' })],
      ['einfach', pref(testProject(), 'einfach')],
      ['frei mit Kopfbändern', free({ braces: true, ladder: 'stufen' })],
      ['frei außen Treppe', free({ frameStyle: 'aussen', ladder: 'treppe', ladderAngle: 45, ladderCatalogId: 'kvh-60x160' })],
      ['frei aufgelegt Platte', free({ frameStyle: 'aufgelegt', deck: 'platte', deckCatalogId: 'osb-22', ladder: 'senkrecht' })],
      ['wandseitig', placed('wandseitig', { ladder: 'stufen' })],
      ['wandseitig einfach', pref(placed('wandseitig', { ladder: 'senkrecht' }), 'einfach')],
      ['wandseitig aufgelegt', placed('wandseitig', { frameStyle: 'aufgelegt', ladder: 'schraeg' })],
      ['Eckbett', placed('eck', { ladder: 'treppe', ladderAngle: 45, ladderCatalogId: 'kvh-60x160' })],
      ['Eckbett aufgelegt', placed('eck', { frameStyle: 'aufgelegt', ladder: 'stufen', deck: 'platte', deckCatalogId: 'osb-22' })],
      ['deckenhoch', placed('deckenhoch', { ladder: 'stufen' })],
      ['deckenhoch außen', placed('deckenhoch', { frameStyle: 'aussen', ladder: 'senkrecht' })],
    ]
    for (const [name, p] of variants) expect(fastenerClashes(resolveProject(p)).map((c) => c.joints.join(' ~ ')), name).toEqual([])
  })

  it('Sprossenleiter: Bohrungen für die Sprossen stehen in Bohrtabelle und Anleitung', () => {
    const r = resolveProject(placed('wandseitig', { ladder: 'senkrecht' }))
    const byId = new Map(r.members.map((m) => [m.id, m]))
    const rungs = r.joints.filter((j) => j.typeId === 'stecken')
    expect(rungs.length).toBeGreaterThan(4)
    const bores = allFasteners(r).filter((f) => f.bore)
    expect(bores.length).toBe(rungs.length)
    for (const f of bores) expect(f.drill).toBe(f.d)
    const plan = jointPlan(rungs[0], byId, r)!
    expect(Number(plan.vars.erste)).toBeGreaterThan(150)
    expect(Number(plan.vars.teilung)).toBeGreaterThan(200)
  })
})
