import { describe, expect, it } from 'vitest'
import { testProject } from '../src/model/defaults'
import { resolveProject } from '../src/model/resolve'
import { JOINT_GUIDE } from '../src/model/jointGuide'
import { JOINT_TYPES, jointOptions } from '../src/model/joints'
import { jointFasteners } from '../src/model/fasteners'
import { progressAt, timeline } from '../src/model/jointTimeline'

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
        if (jt.id === 'balkenschuh') expect(fs.every((f) => f.when === 'vorher'), jt.id).toBe(true)
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
