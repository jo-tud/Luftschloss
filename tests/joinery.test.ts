import { describe, expect, it } from 'vitest'
import { testProject } from '../src/model/defaults'
import { memberBoxes, memberLength, obbOverlap } from '../src/model/geometry'
import { cutLengths, cutMemberBoxes, jointCuts, prismCorners } from '../src/model/joinery'
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
})
