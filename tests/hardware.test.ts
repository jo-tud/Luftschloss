import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { testProject } from '../src/model/defaults'
import { resolveProject } from '../src/model/resolve'
import { hardwareInstances } from '../src/views/hardware'
import { memberBoxes } from '../src/model/geometry'

const pos = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(m)

describe('Beschläge', () => {
  it('Schlossschrauben: zwei je Verbindung mit Kopf, Scheibe und Mutter nahe am Knoten', () => {
    const p = testProject()
    const r = resolveProject(p)
    const h = hardwareInstances(r)
    const bolts = r.joints.filter((j) => j.typeId === 'schlossschraube').length
    expect(h.heads.length).toBeGreaterThan(0)
    expect(h.heads.length).toBeLessThanOrEqual(2 * bolts)
    // durchgebolzt: Mutter außen; stumpfer Stoß: Mutter in einer Tasche
    expect(h.nuts.length + h.pockets.length).toBe(h.heads.length)
  })

  it('Schraubenköpfe sitzen mitten auf einer Holzfläche, nicht auf der Fuge zwischen zwei Hölzern', () => {
    const r = resolveProject(testProject())
    const h = hardwareInstances(r)
    const boxes = r.members.flatMap((m) => memberBoxes(m))
    for (const m of h.heads) {
      const v = pos(m)
      const q = { x: v.x * 1000, y: -v.z * 1000, z: v.y * 1000 }
      let ok = false
      for (const o of boxes) {
        const d = { x: q.x - o.center.x, y: q.y - o.center.y, z: q.z - o.center.z }
        const loc = o.axes.map((a, i) => Math.abs(a.x * d.x + a.y * d.y + a.z * d.z) - o.half[i])
        // auf einer Fläche (eine Achse ≈ 0), auf den anderen beiden mit Randabstand
        const onFace = loc.filter((x) => Math.abs(x) < 3)
        if (onFace.length === 1 && loc.filter((x) => Math.abs(x) >= 3).every((x) => x < -10)) ok = true
      }
      expect(ok).toBe(true)
    }
  })

  it('Winkel und Balkenschuhe liegen als Bleche direkt an der Verbindung', () => {
    const p = testProject()
    p.settings.jointPreference = 'einfach'
    Object.assign(p.assemblies[0].params, { deck: 'platte', deckCatalogId: 'osb-22' })
    const r = resolveProject(p)
    const h = hardwareInstances(r)
    const winkel = r.joints.filter((j) => j.typeId === 'winkel' && j.ending)
    const schuhe = r.joints.filter((j) => j.typeId === 'balkenschuh' && j.ending)
    expect(winkel.length + schuhe.length).toBeGreaterThan(0)
    expect(h.plates.length).toBe(4 * winkel.length + 5 * schuhe.length)
    // jedes Blech höchstens 25 cm von einer Verbindung entfernt
    const js = [...winkel, ...schuhe].map((j) => new THREE.Vector3(j.pos.x / 1000, j.pos.z / 1000, -j.pos.y / 1000))
    for (const m of h.plates) expect(Math.min(...js.map((j) => j.distanceTo(pos(m))))).toBeLessThan(0.25)
  })
})
