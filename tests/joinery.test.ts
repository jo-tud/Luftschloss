import { describe, expect, it } from 'vitest'
import { testProject } from '../src/model/defaults'
import { memberAxes, memberBoxes, memberLength, obbOverlap } from '../src/model/geometry'
import { assemblyDir, cutLengths, cutMemberBoxes, jointCuts, jointFrame, prismCorners } from '../src/model/joinery'
import { partTypes } from '../src/analysis/assembly'
import { resolveProject } from '../src/model/resolve'
import type { Project } from '../src/model/types'

const vol = (bs: { half: number[] }[]) => bs.reduce((s, o) => s + 8 * o.half[0] * o.half[1] * o.half[2], 0)

function withJoint(key: string, typeId: string): Project {
  const p = testProject()
  p.joints = [{ key, typeId }]
  return p
}

const T_STOSS = 'bett-1:pfosten-BL|bett-1:zarge-hinten'

function cutsFor(typeId: string, key = T_STOSS) {
  const r = resolveProject(withJoint(key, typeId))
  const j = r.joints.find((x) => x.key === key)!
  expect(j.typeId).toBe(typeId)
  const byId = new Map(r.members.map((m) => [m.id, m]))
  const c = jointCuts(j, byId)!
  expect(c).toBeDefined()
  const A = byId.get(j.a)!
  const B = byId.get(j.b)!
  return { j, A, B, c, a: cutMemberBoxes(A, c.members.get(A.id)), b: cutMemberBoxes(B, c.members.get(B.id)) }
}

/** keine zwei Hölzer stecken ineinander (bis auf Rundungsfehler) */
function noClash(a: ReturnType<typeof memberBoxes>, b: ReturnType<typeof memberBoxes>) {
  for (const x of a) for (const y of b) expect(obbOverlap(x, y)).toBeLessThan(0.6)
}

describe('Holzverbindungen als Geometrie', () => {
  it('Zapfen: Zarge bekommt einen Zapfen, der Pfosten ein gleich großes Zapfenloch', () => {
    const { A, B, a, b } = cutsFor('zapfen')
    const dA = vol(a) - vol(memberBoxes(A))
    const dB = vol(b) - vol(memberBoxes(B))
    // eines wächst, das andere verliert genau so viel
    expect(Math.abs(dA + dB)).toBeLessThan(1)
    expect(Math.max(dA, dB)).toBeGreaterThan(20 * 50 * 40)
    noClash(a, b)
  })

  it('Überblattung am T-Stoß: Zarge läuft über den Pfosten, beide halb ausgenommen, nichts durchdringt sich', () => {
    const { A, B, a, b } = cutsFor('ueberblattung')
    // Die Zarge ist über die ganze Pfostendicke verlängert
    const zarge = A.id.includes('zarge') ? a : b
    const zargeM = A.id.includes('zarge') ? A : B
    expect(vol(zarge)).toBeGreaterThan(vol(memberBoxes(zargeM)) - 60 * 120 * 80)
    noClash(a, b)
  })

  it('Schwalbenschwanz und Gratnut: Prisma an E, Keile in T, Ausnehmung in T', () => {
    for (const t of ['schwalbenschwanz', 'gratnut']) {
      const { c, j } = cutsFor(t)
      const E = c.members.get(j.ending!)!
      const other = [...c.members.entries()].find(([id]) => id !== j.ending)![1]
      expect(E.prisms).toHaveLength(1)
      expect(other.prisms).toHaveLength(2)
      expect(other.sub).toHaveLength(1)
      // Schwalbenschwanz wird zum Ende hin breiter
      const pr = prismCorners(E.prisms[0])
      const w0 = Math.hypot(pr.bottom[0].x - pr.bottom[3].x, pr.bottom[0].y - pr.bottom[3].y, pr.bottom[0].z - pr.bottom[3].z)
      const w1 = Math.hypot(pr.bottom[1].x - pr.bottom[2].x, pr.bottom[1].y - pr.bottom[2].y, pr.bottom[1].z - pr.bottom[2].z)
      expect(w1).toBeGreaterThan(w0)
    }
  })

  it('Einlassung und Auflagerleiste', () => {
    const e = cutsFor('ausklinkung')
    noClash(e.a, e.b)
    const l = cutsFor('auflagerleiste')
    expect(l.c.extras).toHaveLength(1)
    // Leiste liegt unter der Zarge, berührt sie aber nicht
    const zarge = l.A.id.includes('zarge') ? l.A : l.B
    const top = l.c.extras[0].center.z + l.c.extras[0].half[2]
    expect(Math.abs(top - (zarge.start.z - zarge.h / 2))).toBeLessThan(1)
  })

  it('Zuschnitt: der Zapfen verlängert die Zarge, die Teileliste nennt die Bearbeitung', () => {
    const r = resolveProject(withJoint(T_STOSS, 'zapfen'))
    const zarge = r.members.find((m) => m.id === 'bett-1:zarge-hinten')!
    const len = cutLengths(r.joints, r.members).get(zarge.id)!
    const j = r.joints.find((x) => x.key === T_STOSS)!
    const dims = jointCuts(j, new Map(r.members.map((m) => [m.id, m])))!.dims
    expect(len - memberLength(zarge)).toBeCloseTo(dims.laenge, 0)
    const { parts, byMember } = partTypes(r)
    expect(parts[byMember.get(zarge.id)! - 1].joinery).toContain('Zapfen bzw. Zapfenloch')
  })

  it('Kopfbänder: auf Gehrung, ragen nicht in Pfosten oder Zarge; eingelassen mit Sitz', () => {
    const p = testProject()
    p.assemblies[0].params.braces = true
    const r = resolveProject(p)
    const braces = r.members.filter((m) => m.role === 'strebe')
    expect(braces.length).toBeGreaterThan(0)
    const solid = r.members.filter((m) => m.role === 'pfosten' || m.role === 'zarge')
    for (const b of braces) {
      expect(b.shape).toBeDefined()
      const c = prismCorners(b.shape!)
      for (const q of [...c.bottom, ...c.top])
        for (const m of solid)
          for (const o of memberBoxes(m)) {
            const d = { x: q.x - o.center.x, y: q.y - o.center.y, z: q.z - o.center.z }
            const inside = o.axes.every((a, i) => Math.abs(a.x * d.x + a.y * d.y + a.z * d.z) < o.half[i] - 0.5)
            expect(inside).toBe(false)
          }
    }
    const key = `${braces[0].id}|bett-1:pfosten-BL`
    const pv = testProject()
    pv.assemblies[0].params.braces = true
    pv.joints = [{ key, typeId: 'versatz' }]
    const rv = resolveProject(pv)
    const j = rv.joints.find((x) => x.key === key)!
    expect(j.kind).toBe('strebe')
    const c = jointCuts(j, new Map(rv.members.map((m) => [m.id, m])))!
    expect(c.members.get('bett-1:pfosten-BL')!.sub).toHaveLength(1)
    expect(c.members.get(braces[0].id)!.prisms).toHaveLength(1)
  })

  it('Fügerichtung: jede Verbindung lässt sich in ihrer Richtung auseinanderziehen, ohne dass Holz durch Holz geht', () => {
    for (const t of ['zapfen', 'ueberblattung', 'ausklinkung']) {
      const { j, A, B, a, b } = cutsFor(t)
      const F = jointFrame(j, A, B)!
      const d = assemblyDir(j, F)
      const [eBoxes, tBoxes] = F.E === A ? [a, b] : [b, a]
      const moved = (k: number) => eBoxes.map((o) => ({ ...o, center: { x: o.center.x + d.x * k, y: o.center.y + d.y * k, z: o.center.z + d.z * k } }))
      for (let k = 0; k <= 200; k += 5) noClash(moved(k), tBoxes)
      // in Gegenrichtung ginge es nicht (sonst sagt der Test nichts)
      const back = eBoxes.map((o) => ({ ...o, center: { x: o.center.x - d.x * 30, y: o.center.y - d.y * 30, z: o.center.z - d.z * 30 } }))
      expect(back.some((x) => tBoxes.some((y) => obbOverlap(x, y) > 0.6))).toBe(true)
    }
    // Gratnut und Schwalbenschwanz: quer zur Stabachse, entlang der Nut bzw. zur offenen Seite
    for (const t of ['gratnut', 'schwalbenschwanz']) {
      const { j, A, B } = cutsFor(t)
      const F = jointFrame(j, A, B)!
      const d = assemblyDir(j, F)
      expect(Math.abs(d.x * F.into.x + d.y * F.into.y + d.z * F.into.z)).toBeLessThan(0.01)
      expect(Math.abs(d.x * F.across.x + d.y * F.across.y + d.z * F.across.z)).toBeCloseTo(1, 3)
      // der Sitz in T ist zu dieser Seite hin offen
      const [Tm, cut] = [F.T, cutsFor(t).c.members.get(F.T.id)!]
      const ax = memberAxes(Tm)
      const dd = (q: { x: number; y: number; z: number }) => q.x * d.x + q.y * d.y + q.z * d.z
      const housing = dd(Tm.start) + cut.sub[0].reduce((s2, r, i) => s2 + Math.max(r[0] * dd(ax[i]), r[1] * dd(ax[i])), 0)
      const surface = Math.max(...memberBoxes(Tm).map((o) => dd(o.center) + o.axes.reduce((s2, a, i) => s2 + Math.abs(dd(a)) * o.half[i], 0)))
      expect(housing).toBeGreaterThanOrEqual(surface - 0.5)
    }
    // Balkenschuh: von oben eingelegt
    const r = resolveProject(withJoint(T_STOSS, 'balkenschuh'))
    const j = r.joints.find((x) => x.key === T_STOSS)!
    const byId = new Map(r.members.map((m) => [m.id, m]))
    expect(assemblyDir(j, jointFrame(j, byId.get(j.a)!, byId.get(j.b)!)!).z).toBe(1)
  })
})
