import * as THREE from 'three'
import type { Project, WallId } from '../model/types'
import type { PersonPreset, ViewMode } from '../state/store'
import type { Derived } from '../state/store'
import { tk } from '../i18n'

/** Modell (mm, z oben) → three.js (m, y oben). Modell-y zeigt in three nach -z. */
export function T(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x / 1000, z / 1000, -y / 1000)
}
export function fromT(p: THREE.Vector3): { x: number; y: number; z: number } {
  return { x: p.x * 1000, y: -p.z * 1000, z: p.y * 1000 }
}

/**
 * Kamerazustand. Alle Ansichten sind dieselbe perspektivische Kamera: Draufsicht und Seitenansicht
 * nutzen ein sehr kleines Blickfeld aus großer Entfernung (praktisch orthografisch). So lassen sich
 * die Ansichten stufenlos ineinander überblenden (Dolly-Zoom).
 */
export interface CamState {
  target: THREE.Vector3
  yaw: number // Grad, 0 = Blick nach Modell +y
  pitch: number // Grad, negativ = nach unten
  viewH: number // sichtbare Höhe am Zielpunkt in m
  fov: number // Grad
}

export const ORTHO_FOV = 1.2

export function camDir(c: Pick<CamState, 'yaw' | 'pitch'>): THREE.Vector3 {
  const y = THREE.MathUtils.degToRad(c.yaw)
  const p = THREE.MathUtils.degToRad(c.pitch)
  return new THREE.Vector3(Math.cos(p) * Math.sin(y), Math.sin(p), -Math.cos(p) * Math.cos(y))
}

export function camDistance(c: Pick<CamState, 'viewH' | 'fov'>): number {
  return c.viewH / (2 * Math.tan(THREE.MathUtils.degToRad(c.fov) / 2))
}

export function applyCam(cam: THREE.PerspectiveCamera, c: CamState) {
  const dir = camDir(c)
  const d = camDistance(c)
  cam.fov = c.fov
  cam.position.copy(c.target).addScaledVector(dir, -d)
  cam.up.set(0, 1, 0)
  if (c.pitch < -89) {
    // Draufsicht: "oben" im Bild ist die Blickrichtung des Gieren
    const y = THREE.MathUtils.degToRad(c.yaw)
    cam.up.set(Math.sin(y), 0, -Math.cos(y))
  }
  cam.lookAt(c.target)
  cam.near = d < 1 ? 0.02 : Math.max(0.05, d - 40)
  cam.far = d + 60
  cam.updateProjectionMatrix()
}

export function cloneCam(c: CamState): CamState {
  return { target: c.target.clone(), yaw: c.yaw, pitch: c.pitch, viewH: c.viewH, fov: c.fov }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = ((b - a) % 360 + 540) % 360 - 180
  return a + d * t
}

export function lerpCam(a: CamState, b: CamState, t: number): CamState {
  return {
    target: a.target.clone().lerp(b.target, t),
    yaw: lerpAngle(a.yaw, b.yaw, t),
    pitch: a.pitch + (b.pitch - a.pitch) * t,
    viewH: Math.exp(Math.log(a.viewH) + (Math.log(b.viewH) - Math.log(a.viewH)) * t),
    fov: Math.exp(Math.log(a.fov) + (Math.log(b.fov) - Math.log(a.fov)) * t),
  }
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export const WALL_YAW: Record<WallId, number> = { A: 180, B: 270, C: 0, D: 90 }

export function isOrtho(c: CamState): boolean {
  return c.fov < 5
}

export function goalFor(view: ViewMode, p: Project, d: Derived, aspect: number): CamState {
  const r = p.room
  const L = r.length / 1000
  const W = r.width / 1000
  const H = r.height / 1000
  const center = T(r.length / 2, r.width / 2, 0)
  switch (view.kind) {
    case 'plan': {
      const viewH = Math.max(W, L / aspect) * 1.12
      return { target: center, yaw: 0, pitch: -89.9, viewH, fov: ORTHO_FOV }
    }
    case 'elev': {
      const along = view.wall === 'A' || view.wall === 'C' ? L : W
      const viewH = Math.max(H, along / aspect) * 1.12
      return { target: T(r.length / 2, r.width / 2, r.height / 2), yaw: WALL_YAW[view.wall], pitch: 0, viewH, fov: ORTHO_FOV }
    }
    case '3d': {
      const bed = [...d.resolved.beds.values()][0]
      const tgt = bed ? footprintCenter(bed.footprint, bed.deckTop * 0.6) : T(r.length / 2, r.width / 2, r.height * 0.4)
      return { target: tgt, yaw: 205, pitch: -26, viewH: Math.max(L, W, H) * 1.2, fov: 40 }
    }
    case 'person':
      return personGoal(view.preset, p, d)
    case 'unfold': {
      const viewH = Math.max(W, L / aspect) * 1.12
      return { target: center, yaw: 0, pitch: -89.9, viewH, fov: ORTHO_FOV }
    }
    case 'foto':
      return goalFor({ kind: '3d' }, p, d, aspect)
  }
}

function footprintCenter(fp: { x: number; y: number }[], z: number): THREE.Vector3 {
  const x = fp.reduce((s, q) => s + q.x, 0) / fp.length
  const y = fp.reduce((s, q) => s + q.y, 0) / fp.length
  return T(x, y, z)
}

export const PERSON_LABEL: Record<PersonPreset, string> = {
  tuer: tk('An der Tür stehen'),
  unter: tk('Unter dem Bett sitzen'),
  matratze: tk('Auf der Matratze sitzen'),
  liegen: tk('Im Bett liegen'),
}
export const PERSON_ICON: Record<PersonPreset, string> = { tuer: '🚪', unter: '🪑', matratze: '🛏', liegen: '😴' }

/** Augpunkt und Blickrichtung für die Ich-Perspektive */
export function personGoal(preset: PersonPreset, p: Project, d: Derived): CamState {
  const r = p.room
  const ph = p.settings.personHeight
  const bed = [...d.resolved.beds.values()][0]
  const a = p.assemblies[0]
  const fov = 75
  const tiny = 0.002
  const bedCenter = bed ? footprintCenter(bed.footprint, 0) : T(r.length / 2, r.width / 2, 0)
  const bc = fromT(bedCenter)
  const look = (from: { x: number; y: number }, to: { x: number; y: number }) => (Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI
  switch (preset) {
    case 'tuer': {
      const door = p.wallObjects.find((o) => o.kind === 'tuer')
      let pos = { x: r.length / 2, y: r.width - 600 }
      if (door) {
        // vor der Tür, einen halben Meter im Raum
        const mid = door.offset + door.width / 2
        const wf = wallInfo(p, door.wall)
        pos = { x: wf.sx + wf.ux * mid + wf.nx * 500, y: wf.sy + wf.uy * mid + wf.ny * 500 }
      }
      return { target: T(pos.x, pos.y, ph * 0.93), yaw: look(pos, bc), pitch: -8, viewH: tiny, fov }
    }
    case 'unter': {
      const z = Math.min((bed?.underside ?? 1800) - 200, 450 + ph * 0.45)
      return { target: T(bc.x, bc.y, z), yaw: a ? (360 - a.params.rotation) % 360 : 0, pitch: 10, viewH: tiny, fov: 80 }
    }
    case 'matratze': {
      const z = (bed?.mattressTop ?? 2000) + ph * 0.45
      return { target: T(bc.x, bc.y, z), yaw: a ? (360 - a.params.rotation) % 360 : 0, pitch: -5, viewH: tiny, fov: 80 }
    }
    case 'liegen': {
      const z = (bed?.mattressTop ?? 2000) + 150
      return { target: T(bc.x, bc.y, z), yaw: a ? (360 - a.params.rotation) % 360 : 0, pitch: 60, viewH: tiny, fov: 85 }
    }
  }
}

function wallInfo(p: Project, wall: WallId) {
  const L = p.room.length
  const W = p.room.width
  switch (wall) {
    case 'A':
      return { sx: L, sy: 0, ux: -1, uy: 0, nx: 0, ny: 1 }
    case 'B':
      return { sx: 0, sy: 0, ux: 0, uy: 1, nx: 1, ny: 0 }
    case 'C':
      return { sx: 0, sy: W, ux: 1, uy: 0, nx: 0, ny: -1 }
    case 'D':
      return { sx: L, sy: W, ux: 0, uy: -1, nx: -1, ny: 0 }
  }
}
