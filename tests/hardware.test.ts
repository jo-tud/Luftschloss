import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { testProject } from '../src/model/defaults'
import { resolveProject } from '../src/model/resolve'
import { hardwareInstances } from '../src/views/hardware'

const pos = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(m)

describe('Beschläge', () => {
  it('Schlossschrauben: zwei je Verbindung mit Kopf, Scheibe und Mutter nahe am Knoten', () => {
    const p = testProject()
    const r = resolveProject(p)
    const h = hardwareInstances(r)
    const bolts = r.joints.filter((j) => j.typeId === 'schlossschraube').length
    expect(h.heads.length).toBeGreaterThan(0)
    expect(h.heads.length).toBeLessThanOrEqual(2 * bolts)
    expect(h.nuts.length).toBe(h.heads.length)
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
    expect(h.plates.length).toBe(2 * winkel.length + 5 * schuhe.length)
    // jedes Blech höchstens 25 cm von einer Verbindung entfernt
    const js = [...winkel, ...schuhe].map((j) => new THREE.Vector3(j.pos.x / 1000, j.pos.z / 1000, -j.pos.y / 1000))
    for (const m of h.plates) expect(Math.min(...js.map((j) => j.distanceTo(pos(m))))).toBeLessThan(0.25)
  })
})
