import { describe, expect, it } from 'vitest'
import { testProject } from '../src/model/defaults'
import { memberAxes, memberBoxes } from '../src/model/geometry'
import { resolveProject } from '../src/model/resolve'
import { JOINT_GUIDE } from '../src/model/jointGuide'
import { JOINT_TYPES, jointOptions } from '../src/model/joints'
import { CROSS_NUT_DEPTH, POCKET_D, allFasteners, boltHeights, fastenerClashes, jointFasteners } from '../src/model/fasteners'
import { cutOverlaps, memberSolids, prismCorners } from '../src/model/joinery'
import { analyze } from '../src/analysis/checks'
import { progressAt, timeline } from '../src/model/jointTimeline'
import { fill, jointDrawings, jointPlan } from '../src/model/jointPlan'
import { computeBom } from '../src/analysis/bom'
import { buildSteps, partTypes } from '../src/analysis/assembly'
import { keepWallContact } from '../src/model/placement'

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
    // stehende Hölzer werden überall vom Fuß aus bemaßen
    expect(T.refName.key).toBe('unteres Ende')
  })
})

describe('Bolzenlage nach DIN EN 1995', () => {
  it('Zarge 120: 40 mm unter der Oberkante, 30 mm über der Unterkante', () => {
    expect(boltHeights(120, 10, 0)).toEqual([20, -30])
    // zweite Richtung am Eckpfosten 16 mm tiefer, Abstand untereinander mindestens 4·d
    const lo = boltHeights(120, 10, -1)
    expect(lo[0]).toBe(4)
    expect(lo[0] - lo[1]).toBeGreaterThanOrEqual(40)
    // Querzarge 6 mm tiefer: gleiche Höhen im Pfosten, in der Querzarge 30 mm über der Unterkante
    expect(boltHeights(120, 10, -1, 6)).toEqual([10, -30])
  })

  it('Beispielbett: alle Bolzenstöße mindestens 30 mm über der Unterkante ihrer Zarge, Tasche 42 mm tief', () => {
    const r = resolveProject(testProject())
    const byId = new Map(r.members.map((m) => [m.id, m]))
    let n = 0
    for (const j of r.joints.filter((x) => x.typeId === 'schlossschraube' && x.ending)) {
      const E = byId.get(j.ending!)!
      if (E.role !== 'zarge') continue
      const bottom = Math.min(E.start.z, E.end.z) - E.h / 2
      for (const f of jointFasteners(j, byId, r).filter((x) => x.crossNut)) {
        expect(f.head.z - bottom, j.key).toBeGreaterThanOrEqual(30 - 0.5)
        expect(f.crossNut!.depth).toBe(E.b / 2 + 12)
        n++
      }
    }
    expect(n).toBeGreaterThan(0)
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

describe('Eckpfosten', () => {
  it('im Beispielzimmer kreuzen sich keine Schrauben oder Bolzen', () => {
    expect(fastenerClashes(resolveProject(testProject()))).toEqual([])
  })

  it('Zapfen aus zwei Richtungen im Eckpfosten werden gemeldet', () => {
    const p = testProject()
    const r0 = resolveProject(p)
    p.joints = r0.joints.filter((j) => j.key.includes('pfosten') && j.key.includes('zarge') && j.ending).map((j) => ({ key: j.key, typeId: 'zapfen' }))
    const r = resolveProject(p)
    expect(cutOverlaps(r.joints, r.members).length).toBeGreaterThan(0)
    expect(analyze(p, r).findings.some((f) => f.id.startsWith('ueberschneidung:'))).toBe(true)
  })
})

describe('Haltegriff und Wange', () => {
  it('Griff an der Zarge verbolzt, Wange seitlich am Griff verbolzt und mit dem Kopfschnitt an der Zarge', () => {
    const p = testProject()
    const r = resolveProject(p)
    const ids = analyze(p, r).findings.map((f) => f.id)
    expect(ids.filter((i) => i.startsWith('kreuzung:') && (i.includes('griff') || i.includes('leiter-holm')))).toEqual([])
    const byId = new Map(r.members.map((m) => [m.id, m]))
    const bolts = (key: (k: string) => boolean) => {
      const j = r.joints.find((x) => key(x.key))!
      return jointFasteners(j, byId, r).filter((f) => f.kind === 'bolzen').length
    }
    expect(bolts((k) => k.includes('leiter-griff-0') && k.includes('zarge'))).toBeGreaterThan(0)
    expect(bolts((k) => k.includes('leiter-griff-0') && k.includes('leiter-holm-0'))).toBeGreaterThan(0)
    // Kopfschnitt lotrecht an der Zarge, Oberkante bündig, Fußschnitt waagrecht auf dem Boden
    for (const i of [0, 1]) {
      const head = r.joints.find((x) => x.key.includes(`leiter-holm-${i}`) && x.key.includes('zarge-vorne'))!
      expect(head.typeId).toBe('anlage')
      const plan = jointPlan(head, byId, r)!
      expect(Number(plan.vars.kopf) + Number(plan.vars.fuss)).toBe(90)
    }
    const holm = r.members.find((m) => m.partKey === 'leiter-holm-0')!
    const sol = memberSolids(holm, undefined)
    const pts = sol.prisms.flatMap((pr) => [...prismCorners(pr).bottom, ...prismCorners(pr).top])
    const zarge = r.members.find((m) => m.partKey === 'zarge-vorne')!
    expect(Math.min(...pts.map((q) => q.z))).toBeGreaterThan(-0.5)
    // die Spitze steht über der Zarge, aber nicht höher als die Matratze
    expect(Math.max(...pts.map((q) => q.z))).toBeGreaterThan(zarge.start.z + zarge.h / 2)
    expect(Math.max(...pts.map((q) => q.z))).toBeLessThan(p.assemblies[0].params.deckHeight + p.assemblies[0].params.mattressThickness)
    // jede Stufe liegt in beiden Wangen
    const steps = r.members.filter((m) => m.partKey?.startsWith('leiter-stufe'))
    for (const s of steps) expect(r.joints.filter((x) => (x.a === s.id || x.b === s.id) && x.key.includes('leiter-holm')).length, s.partKey).toBe(2)
  })
})

describe('Lose Latten', () => {
  it('Unterholm des Stäbe-Geländers liegt lose auf den Latten, seine Befestiger treffen sich nicht', () => {
    const p = testProject()
    p.assemblies[0].params.guard = 'staebe'
    const r = resolveProject(p)
    const byId = new Map(r.members.map((m) => [m.id, m]))
    const onSlats = r.joints.filter((j) => [j.a, j.b].some((id) => byId.get(id)!.role === 'leiste') && [j.a, j.b].some((id) => byId.get(id)!.partKey?.startsWith('unterholm')))
    expect(onSlats.length).toBeGreaterThan(0)
    expect(onSlats.every((j) => j.typeId === 'lose')).toBe(true)
    expect(fastenerClashes(r)).toEqual([])
  })
})

describe('Gratnut-Treppe', () => {
  it('nennt Winkel, Teilung und erste Nut; Flanken wie ein 14°-Fräser; nur geleimt', () => {
    const p = testProject()
    // Stufen auf Gratnut umstellen (Vorgabe ist die gerade Nut)
    p.joints = resolveProject(p).joints.filter((x) => x.typeId === 'nut').map((x) => ({ key: x.key, typeId: 'gratnut' }))
    const r = resolveProject(p)
    const byId = new Map(r.members.map((m) => [m.id, m]))
    const j = r.joints.find((x) => x.typeId === 'gratnut')!
    const plan = jointPlan(j, byId, r)!
    expect(plan.vars.winkel).toBeGreaterThan(45)
    expect(Number(plan.vars.teilung)).toBeGreaterThan(150)
    const { breit, schmal, tiefe } = plan.cuts!.dims
    expect(Math.abs((breit - schmal) / 2 - tiefe * Math.tan((14 * Math.PI) / 180))).toBeLessThan(1)
    // keine Schraube durch die schmale Feder
    expect(plan.fasteners).toEqual([])
    // Wangenzeichnung: Nutmitte als Linie mit Winkel zur Wangenkante
    const wange = jointDrawings(plan, j, byId, r, (m) => m.name ?? m.role).find((d) => d.member.id === plan.T!.id)!
    const lines = wange.views.flatMap((v) => v.lines)
    expect(lines.length).toBeGreaterThan(0)
    expect(Math.abs(lines[0].deg - Number(plan.vars.winkel))).toBeLessThanOrEqual(1)
  })

  it('Treppe mit zwei Trittbrettern je Stufe: eine Nut je Stufe, Teilung = Steigung / sin α', () => {
    const p = testProject()
    Object.assign(p.assemblies[0].params, { ladder: 'treppe', ladderCatalogId: 'kvh-60x160' })
    const r = resolveProject(p)
    const byId = new Map(r.members.map((m) => [m.id, m]))
    const steps = r.joints.filter((j) => j.typeId === 'nut')
    expect(steps.length).toBeGreaterThan(8)
    expect(cutOverlaps(r.joints, r.members)).toEqual([])
    expect(analyze(p, r).findings.filter((f) => f.id.startsWith('ueberschneidung:'))).toEqual([])
    const plan = jointPlan(steps[0], byId, r)!
    const P = p.assemblies[0].params
    const rise = P.deckHeight / Math.max(2, Math.round(P.deckHeight / 220))
    expect(Math.abs(Number(plan.vars.teilung) - rise / Math.sin((Number(plan.vars.winkel) * Math.PI) / 180))).toBeLessThan(2)
  })

  it('gerade Nut: Schraubenlänge nach der Wange (44 → 6 × 80, 60 → 6 × 100), Wange durchbohrt', () => {
    for (const [wange, item] of [
      ['geh-44x94', 'schraube-6x80'],
      ['kvh-60x160', 'schraube-6x100'],
    ]) {
      const p = testProject()
      p.assemblies[0].params.ladderCatalogId = wange
      const r = resolveProject(p)
      const byId = new Map(r.members.map((m) => [m.id, m]))
      const j = r.joints.find((x) => x.typeId === 'nut')!
      const plan = jointPlan(j, byId, r)!
      expect(plan.fasteners.length).toBeGreaterThan(0)
      expect(plan.fasteners.every((f) => f.item === item && f.drillFirst === 6.5), wange).toBe(true)
    }
  })
})

describe('Rahmen und Montage (Praxisprüfung)', () => {
  it('Kippsicherung mit Winkel samt Schrauben im Einkauf; bei Zargen außen Dübel 10 × 140 durch die Zarge', () => {
    const p = testProject()
    const r = resolveProject(p)
    const wall = r.fixings.filter((f) => f.target === 'wand')
    expect(wall.length).toBeGreaterThan(0)
    expect(wall.every((f) => f.extra?.some((x) => x.id === 'winkel-90'))).toBe(true)
    const q = testProject()
    const b = q.assemblies[0].params
    q.assemblies[0].params = keepWallContact(q.room, b, { ...b, frameStyle: 'aussen' })
    const r2 = resolveProject(q)
    expect(r2.fixings.filter((f) => f.target === 'wand').every((f) => f.hardwareId === 'rahmenduebel-10x140')).toBe(true)
    // an der Ecke liegt die Längszarge nur auf der Querzarge
    const byId = new Map(r2.members.map((m) => [m.id, m]))
    const corner = r2.joints.filter((j) => byId.get(j.a)!.role === 'zarge' && byId.get(j.b)!.role === 'zarge')
    expect(corner.length).toBe(4)
    expect(corner.every((j) => j.typeId === 'lose')).toBe(true)
  })

  it('Montage: vor der Wand aufbauen, Haltegriffe beim Geländer, Posten mit Ausklinkung an verschiedenen Wänden getrennt nummeriert', () => {
    const p = testProject()
    const r = resolveProject(p)
    const steps = buildSteps(p, r)
    expect(steps.some((s) => s.text.includes('60 cm davor aufbauen'))).toBe(true)
    const guard = steps.find((s) => s.title === 'Geländer')!
    expect(guard.memberIds.some((id) => id.includes('leiter-griff'))).toBe(true)
    const { parts, byMember } = partTypes(r)
    const posts = r.members.filter((m) => m.role === 'pfosten' && m.notches?.length)
    const walls = new Set(posts.map((m) => m.notches!.map((n) => n.reason).join()))
    if (walls.size > 1) expect(new Set(posts.map((m) => byMember.get(m.id))).size).toBeGreaterThan(1)
    expect(parts.length).toBeGreaterThan(0)
  })
})
