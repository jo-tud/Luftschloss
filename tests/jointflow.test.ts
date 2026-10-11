import { describe, expect, it } from 'vitest'
import { testProject } from '../src/model/defaults'
import { resolveProject } from '../src/model/resolve'
import { JOINT_GUIDE } from '../src/model/jointGuide'
import { JOINT_TYPES, jointOptions } from '../src/model/joints'
import { jointFasteners } from '../src/model/fasteners'
import { progressAt, timeline } from '../src/model/jointTimeline'
import { fill, jointPlan } from '../src/model/jointPlan'
import { computeBom } from '../src/analysis/bom'

describe('Ablauf einer Verbindung', () => {
  it('jede Verbindungsart hat eine Anleitung mit genau einem Fügeschritt; Leiste vorher, Befestigen danach', () => {
    for (const jt of JOINT_TYPES) {
      const g = JOINT_GUIDE[jt.id]
      expect(g, jt.id).toBeDefined()
      const anims = g.steps.flatMap((s) => s.at)
      expect(anims.filter((a) => a === 'fuegen').length, jt.id).toBe(1)
      const f = anims.indexOf('fuegen')
      anims.forEach((a, i) => {
        if (a === 'vorher') expect(i, jt.id).toBeLessThan(f)
        if (a === 'befestigen') expect(i, jt.id).toBeGreaterThan(f)
      })
    }
  })

  it('Schrauben und Bolzen kommen erst nach dem Fügen, Balkenschuh und Leiste davor', () => {
    const p = testProject()
    const r0 = resolveProject(p)
    const byId0 = new Map(r0.members.map((m) => [m.id, m]))
    let checked = 0
    for (const jt of JOINT_TYPES) {
      const q = testProject()
      // jede Verbindung, an der der Typ taugt, auf diesen Typ stellen
      q.joints = r0.joints
        .filter((j) => {
          const a = byId0.get(j.a)!
          const b = byId0.get(j.b)!
          return jointOptions({ kind: j.kind, a, b, ending: j.ending ? byId0.get(j.ending) : undefined }).some((o) => o.type.id === jt.id && !o.reason)
        })
        .map((j) => ({ key: j.key, typeId: jt.id }))
      const r = resolveProject(q)
      const byId = new Map(r.members.map((m) => [m.id, m]))
      const g = JOINT_GUIDE[jt.id]
      const anims = g.steps.flatMap((s) => s.at)
      for (const j of r.joints.filter((x) => x.typeId === jt.id)) {
        const fs = jointFasteners(j, byId, r)
        if (fs.some((f) => f.when === 'nachher')) expect(anims, jt.id).toContain('befestigen')
        if (fs.some((f) => f.when === 'vorher')) expect(anims, jt.id).toContain('vorher')
        for (const f of fs) if (['bolzen', 'bettschraube', 'holznagel'].includes(f.kind)) expect(f.when, jt.id).toBe('nachher')
        if (jt.id === 'balkenschuh') expect(fs.filter((f) => f.kind === 'blech').every((f) => f.when === 'vorher'), jt.id).toBe(true)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('Zeitleiste: Fügen ist abgeschlossen, bevor befestigt wird', () => {
    for (const jt of JOINT_TYPES) {
      const { segs } = timeline(JOINT_GUIDE[jt.id].steps)
      for (const s of segs.filter((x) => x.anim === 'befestigen')) {
        const p = progressAt(segs, s.start + 0.01)
        expect(p.fuegen, jt.id).toBe(1)
      }
      const f = segs.find((x) => x.anim === 'fuegen')!
      expect(progressAt(segs, f.start - 0.01).fuegen, jt.id).toBe(0)
    }
  })
})

describe('Arbeitsplan einer Verbindung', () => {
  const allTypes = () => {
    const out: { r: ReturnType<typeof resolveProject>; jt: string }[] = []
    const r0 = resolveProject(testProject())
    const byId0 = new Map(r0.members.map((m) => [m.id, m]))
    for (const jt of JOINT_TYPES) {
      const q = testProject()
      q.joints = r0.joints
        .filter((j) => jointOptions({ kind: j.kind, a: byId0.get(j.a)!, b: byId0.get(j.b)!, ending: j.ending ? byId0.get(j.ending) : undefined }).some((o) => o.type.id === jt.id && !o.reason))
        .map((j) => ({ key: j.key, typeId: jt.id }))
      out.push({ r: resolveProject(q), jt: jt.id })
    }
    return out
  }

  it('alle Platzhalter der Anleitung sind gefüllt', () => {
    for (const { r, jt } of allTypes()) {
      const byId = new Map(r.members.map((m) => [m.id, m]))
      for (const j of r.joints.filter((x) => x.typeId === jt)) {
        const plan = jointPlan(j, byId, r)!
        for (const s of plan.guide.steps) expect(fill(s.t, plan.vars), `${jt}: ${s.t}`).not.toMatch(/\{\w+\}/)
      }
    }
  })

  it('8er-Schrauben greifen mindestens 72 mm im tragenden Holz, Leiste mit 6 × 100', () => {
    for (const { r, jt } of allTypes()) {
      const byId = new Map(r.members.map((m) => [m.id, m]))
      for (const j of r.joints.filter((x) => x.typeId === jt))
        for (const f of jointFasteners(j, byId, r)) {
          if (f.item?.startsWith('schraube-8x') && f.first !== undefined) expect(f.length - f.first, `${jt} ${f.item}`).toBeGreaterThanOrEqual(72)
          if (jt === 'auflagerleiste' && f.kind === 'schraube') expect(f.item).toBe('schraube-6x100')
        }
    }
  })

  it('Einkaufsliste zählt die Befestigungsmittel des Modells', () => {
    const r = resolveProject(testProject())
    const byId = new Map(r.members.map((m) => [m.id, m]))
    const bolts = r.joints.flatMap((j) => jointFasteners(j, byId, r)).filter((f) => f.item?.startsWith('schlossschraube'))
    const bom = computeBom(testProject(), r)
    const inBom = bom.hardware.filter((h) => h.item.id.startsWith('schlossschraube')).reduce((s, h) => s + h.qty, 0)
    expect(inBom).toBe(bolts.length)
    expect(bolts.length).toBeGreaterThan(0)
  })
})
