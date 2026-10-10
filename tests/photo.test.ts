import { describe, expect, it } from 'vitest'
import { projectPoint, referencePoints, solvePhotoCam, solvePhotoCamWithOpenings, type PhotoCam } from '../src/analysis/photo'
import { testProject } from '../src/model/defaults'

describe('Foto-Abgleich', () => {
  it('findet eine bekannte Kamera aus 6 Punkten wieder', () => {
    const p = testProject()
    const w = 2000
    const h = 1500
    // Kamera an der Tür, Blick zur Fensterwand (wie auf dem Testfoto)
    const truth: PhotoCam = { x: 2600, y: 5300, z: 1550, yaw: Math.PI + 0.12, pitch: 0.18, roll: 0.01, f: 1300 }
    const refs = referencePoints(p).filter((r) => ['decke-AB', 'decke-AD', 'fenster-links-ol', 'fenster-links-ul', 'fenster-rechts-or', 'fenster-rechts-ur'].includes(r.id))
    expect(refs).toHaveLength(6)
    const obs = refs.map((r) => {
      const q = projectPoint(truth, r.p, w, h)
      return { p: r.p, u: q.u + (Math.random() - 0.5) * 2, v: q.v + (Math.random() - 0.5) * 2 }
    })
    const res = solvePhotoCam(p, obs, w, h)!
    expect(res.rms).toBeLessThan(3)
    expect(Math.hypot(res.cam.x - truth.x, res.cam.y - truth.y, res.cam.z - truth.z)).toBeLessThan(150)
    expect(Math.abs(res.cam.f - truth.f) / truth.f).toBeLessThan(0.08)
  })

  it('schätzt falsch eingetragene Fenstermaße aus dem Foto nach', () => {
    const real = testProject()
    const fl = real.wallObjects.find((o) => o.id === 'fenster-links')!
    fl.offset = 600
    fl.height = 2150
    const w = 2000
    const h = 1500
    const truth: PhotoCam = { x: 1800, y: 5600, z: 1650, yaw: Math.PI - 0.08, pitch: 0.12, roll: 0, f: 1500 }
    const ids = ['decke-AB', 'decke-AD', 'boden-AD', 'fenster-links-ol', 'fenster-links-or', 'fenster-links-ul', 'fenster-links-ur', 'fenster-rechts-ol', 'fenster-rechts-ur']
    const refs = referencePoints(real)
    const obs = ids.map((id) => {
      const q = projectPoint(truth, refs.find((r) => r.id === id)!.p, w, h)
      return { id, u: q.u, v: q.v }
    })
    // geplant ist noch das geschätzte Fenster (Abstand 80 cm, Höhe 1,90 m)
    const res = solvePhotoCamWithOpenings(testProject(), obs, w, h)!
    const fit = res.openings.find((o) => o.id === 'fenster-links')!
    expect(res.rms).toBeLessThan(5)
    expect(Math.abs(fit.offset - 600)).toBeLessThan(60)
    expect(Math.abs(fit.height - 2150)).toBeLessThan(60)
  })
})
