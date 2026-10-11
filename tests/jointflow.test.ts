import { describe, expect, it } from 'vitest'
import { testProject } from '../src/model/defaults'
import { memberAxes, memberBoxes } from '../src/model/geometry'
import { resolveProject } from '../src/model/resolve'
import { JOINT_GUIDE } from '../src/model/jointGuide'
import { JOINT_TYPES, jointOptions } from '../src/model/joints'
import { CROSS_NUT_DEPTH, POCKET_D, allFasteners, boltHeights, jointFasteners } from '../src/model/fasteners'
import { progressAt, timeline } from '../src/model/jointTimeline'
import { fill, jointDrawings, jointPlan } from '../src/model/jointPlan'
import { computeBom } from '../src/analysis/bom'
import { partTypes } from '../src/analysis/assembly'

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

  it('Geometrie: Befestigungsmittel sitzen an der Verbindung, Schraubenspitzen im Holz', () => {
    const inside = (boxes: ReturnType<typeof memberBoxes>, q: V, tol: number) =>
      boxes.some((o) => {
        const d = { x: q.x - o.center.x, y: q.y - o.center.y, z: q.z - o.center.z }
        return o.axes.every((a, i) => Math.abs(a.x * d.x + a.y * d.y + a.z * d.z) <= o.half[i] + tol)
      })
    const bad: string[] = []
    for (const { r, jt } of allTypes()) {
      const byId = new Map(r.members.map((m) => [m.id, m]))
      for (const j of r.joints.filter((x) => x.typeId === jt)) {
        const boxes = [byId.get(j.a)!, byId.get(j.b)!].flatMap((m) => memberBoxes(m))
        // fast parallele Hölzer (Haltegriff an der Wange) überlappen im Beispiel räumlich – dort nur die Lage prüfen
        const [p, q] = [byId.get(j.a)!, byId.get(j.b)!].map((m) => memberAxes(m)[0])
        const parallel = Math.abs(p.x * q.x + p.y * q.y + p.z * q.z) > 0.85
        for (const f of jointFasteners(j, byId, r)) {
          const dist = Math.hypot(f.head.x - j.pos.x, f.head.y - j.pos.y, f.head.z - j.pos.z)
          if (dist > 400) bad.push(`${jt} ${j.key}: ${f.kind} ${Math.round(dist)} mm vom Knoten`)
          if (f.kind === 'schraube' && !parallel && !inside(boxes, end(f), 1)) bad.push(`${jt} ${j.key}: Schraubenspitze ${f.d}×${f.length} außerhalb`)
        }
      }
    }
    expect(bad).toEqual([])
  })

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

describe('Werkstattzeichnung', () => {
  const setup = (typeId: string) => {
    const r0 = resolveProject(testProject())
    const j0 = r0.joints.find((j) => j.key === 'bett-1:pfosten-BL|bett-1:zarge-hinten')!
    const q = testProject()
    q.joints = [{ key: j0.key, typeId }]
    const r = resolveProject(q)
    const byId = new Map(r.members.map((m) => [m.id, m]))
    const j = r.joints.find((x) => x.key === j0.key)!
    const plan = jointPlan(j, byId, r)!
    return { plan, d: jointDrawings(plan, j, byId, r, (m) => m.name ?? m.id) }
  }

  it('Stoß mit Mutter in Tasche: Tasche Ø 35 80 mm vom Ende, Bolzenbohrungen im Verbund durch den Pfosten', () => {
    const { d } = setup('schlossschraube')
    const [E, T] = d
    expect(E.holes.some((h) => h.d === POCKET_D && h.x === CROSS_NUT_DEPTH)).toBe(true)
    const through = T.holes.filter((h) => h.d === 11)
    expect(through.length).toBe(2)
    expect(through.every((h) => h.through && h.with)).toBe(true)
  })

  it('Zapfen: Brust und Zapfendicke sind bemaßt, das Zapfenloch erscheint als Abfall', () => {
    const { plan, d } = setup('zapfen')
    const [E, T] = d
    expect(E.views.some((v) => v.dimX.includes(plan.cuts!.dims.laenge))).toBe(true)
    expect(T.views.some((v) => v.waste.length > 0)).toBe(true)
    expect(T.refName.key).toBe('oberes Ende')
  })
})

describe('Bolzenlage nach DIN EN 1995', () => {
  it('Zarge 120: 40 mm unter der Oberkante, 30 mm über der Unterkante', () => {
    expect(boltHeights(120, 10, 0)).toEqual([20, -30])
    // zweite Richtung am Eckpfosten 16 mm tiefer, Abstand untereinander mindestens 4·d
    const lo = boltHeights(120, 10, -1)
    expect(lo[0]).toBe(4)
    expect(lo[0] - lo[1]).toBeGreaterThanOrEqual(40)
  })

  it('Bolzen verschiedener Stöße kreuzen sich nirgends im Holz', () => {
    const p = testProject()
    p.joints = []
    const r = resolveProject(p)
    const bolts = allFasteners(r).filter((f) => f.kind === 'bolzen' || f.kind === 'bettschraube')
    expect(bolts.length).toBeGreaterThan(0)
    // kleinster Abstand zweier Strecken (Achsen der Bolzen)
    const segDist = (a0: V, a1: V, b0: V, b1: V) => {
      let best = Infinity
      for (let i = 0; i <= 40; i++)
        for (let k = 0; k <= 40; k++) {
          const p1 = lerp(a0, a1, i / 40)
          const p2 = lerp(b0, b1, k / 40)
          best = Math.min(best, Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z))
        }
      return best
    }
    for (let i = 0; i < bolts.length; i++)
      for (let k = i + 1; k < bolts.length; k++) {
        const a = bolts[i]
        const b = bolts[k]
        if (a.joint === b.joint) continue
        const d = segDist(a.head, end(a), b.head, end(b))
        expect(d, `${a.joint} ↔ ${b.joint}`).toBeGreaterThanOrEqual((a.d + b.d) / 2 + 2)
      }
  })
})

type V = { x: number; y: number; z: number }
const lerp = (a: V, b: V, t: number): V => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
const end = (f: { head: V; dir: V; length: number }): V => ({ x: f.head.x + f.dir.x * f.length, y: f.head.y + f.dir.y * f.length, z: f.head.z + f.dir.z * f.length })

describe('Bauplan und Zeichnung eindeutig', () => {
  it('Teile mit anderem Bohrbild bekommen eine eigene Nummer (gespiegelte Pfosten, Wangen)', () => {
    const r = resolveProject(testProject())
    const { parts } = partTypes(r)
    expect(parts.filter((p) => p.roles.includes('pfosten')).length).toBeGreaterThan(1)
  })

  it('Bolzenstoß: Pfosten wird von außen gebohrt, Taschen liegen innen; Randabstand ist gerechnet', () => {
    const r = resolveProject(testProject())
    const byId = new Map(r.members.map((m) => [m.id, m]))
    const j = r.joints.find((x) => x.typeId === 'schlossschraube' && x.ending && byId.get(x.ending)?.role === 'zarge')!
    const plan = jointPlan(j, byId, r)!
    expect(Number(plan.vars.rand)).toBeGreaterThanOrEqual(30)
    const [E, T] = jointDrawings(plan, j, byId, r, (m) => m.name ?? m.role)
    expect(T.holes.every((h) => h.face.key.startsWith('Außenseite'))).toBe(true)
    expect(E.holes.filter((h) => h.d === POCKET_D).every((h) => h.face.key.startsWith('Innenseite'))).toBe(true)
  })
})
