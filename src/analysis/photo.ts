import { t, tr } from '../i18n'
import { wallFrame } from '../model/geometry'
import { cornice } from '../model/room'
import type { Project, Vec3, WallId } from '../model/types'
import { WALL_IDS } from '../model/types'

/**
 * Foto-Abgleich: Aus 4–8 angeklickten Raumpunkten im Foto werden Kamerastandort, Blickrichtung
 * und Brennweite bestimmt (Levenberg-Marquardt mit mehreren Startwerten). Danach lässt sich das
 * geplante Bett perspektivisch richtig ins Foto einblenden.
 */

export interface RefPoint {
  id: string
  label: string
  p: Vec3
  group: string
}

/** Punkte im Raum, die man auf einem Foto meist gut erkennt */
export function referencePoints(project: Project): RefPoint[] {
  const r = project.room
  const out: RefPoint[] = []
  const corners: [string, number, number][] = [
    ['AB', 0, 0],
    ['AD', r.length, 0],
    ['CB', 0, r.width],
    ['CD', r.length, r.width],
  ]
  for (const [name, x, y] of corners) {
    const walls = name.split('') as WallId[]
    const ch = Math.max(...walls.map((w) => (cornice(r, w).enabled ? cornice(r, w).height : 0)))
    const corner = { a: name[0], b: name[1] }
    out.push({ id: `boden-${name}`, label: t('Bodenecke {a}/{b}', corner), p: { x, y, z: 0 }, group: t('Raumecken') })
    out.push({ id: `decke-${name}`, label: ch > 0 ? t('Ecke {a}/{b} unter dem Stuck', corner) : t('Deckenecke {a}/{b}', corner), p: { x, y, z: r.height - ch }, group: t('Raumecken') })
  }
  for (const o of project.wallObjects) {
    if (o.kind !== 'fenster' && o.kind !== 'tuer') continue
    const f = wallFrame(r, o.wall)
    const z0 = o.kind === 'fenster' ? o.sillHeight : 0
    const z1 = o.kind === 'fenster' ? o.sillHeight + o.height : o.height
    const at = (s: number, z: number) => ({ x: f.start.x + f.u.x * s, y: f.start.y + f.u.y * s, z })
    const pts: [string, string, number, number][] = [
      ['ol', t('{name} oben links (Wandkante)', { name: tr(o.name) }), o.offset, z1],
      ['or', t('{name} oben rechts (Wandkante)', { name: tr(o.name) }), o.offset + o.width, z1],
      ['ul', t('{name} unten links (Wandkante)', { name: tr(o.name) }), o.offset, z0],
      ['ur', t('{name} unten rechts (Wandkante)', { name: tr(o.name) }), o.offset + o.width, z0],
    ]
    for (const [k, l, s, z] of pts) {
      if (o.kind === 'tuer' && k.startsWith('u')) continue
      out.push({ id: `${o.id}-${k}`, label: l, p: at(s, z), group: o.name })
    }
  }
  void WALL_IDS
  return out
}

/** Kameraparameter: Position (mm), Gieren/Nicken/Rollen (rad), Brennweite in Pixeln */
export interface PhotoCam {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  roll: number
  f: number
}

export function camBasis(c: PhotoCam): { fwd: Vec3; right: Vec3; up: Vec3 } {
  const fwd = { x: Math.cos(c.pitch) * Math.sin(c.yaw), y: Math.cos(c.pitch) * Math.cos(c.yaw), z: Math.sin(c.pitch) }
  // rechts = vorwärts × oben
  let r0 = { x: fwd.y, y: -fwd.x, z: 0 }
  const l = Math.hypot(r0.x, r0.y) || 1
  r0 = { x: r0.x / l, y: r0.y / l, z: 0 }
  const u0 = { x: r0.y * fwd.z - r0.z * fwd.y, y: r0.z * fwd.x - r0.x * fwd.z, z: r0.x * fwd.y - r0.y * fwd.x }
  const cr = Math.cos(c.roll)
  const sr = Math.sin(c.roll)
  const right = { x: r0.x * cr + u0.x * sr, y: r0.y * cr + u0.y * sr, z: r0.z * cr + u0.z * sr }
  const up = { x: -r0.x * sr + u0.x * cr, y: -r0.y * sr + u0.y * cr, z: -r0.z * sr + u0.z * cr }
  return { fwd, right, up }
}

/** Projektion eines Raumpunkts in Bildpixel (Ursprung oben links) */
export function projectPoint(c: PhotoCam, p: Vec3, w: number, h: number): { u: number; v: number; depth: number } {
  const { fwd, right, up } = camBasis(c)
  const d = { x: p.x - c.x, y: p.y - c.y, z: p.z - c.z }
  const xc = d.x * right.x + d.y * right.y + d.z * right.z
  const yc = -(d.x * up.x + d.y * up.y + d.z * up.z)
  const zc = d.x * fwd.x + d.y * fwd.y + d.z * fwd.z
  const z = Math.max(zc, 1)
  return { u: w / 2 + (c.f * xc) / z, v: h / 2 + (c.f * yc) / z, depth: zc }
}

export interface Observation {
  p: Vec3
  u: number
  v: number
}

/** Raumgrenzen für die Kamera; Fotos entstehen im Zimmer (oder in der Tür) */
interface Bounds {
  L: number
  W: number
  H: number
}

function residuals(c: PhotoCam, obs: Observation[], w: number, h: number, b?: Bounds): number[] {
  const out: number[] = []
  for (const o of obs) {
    const q = projectPoint(c, o.p, w, h)
    const penalty = q.depth < 100 ? (100 - q.depth) * 10 : 0
    out.push(q.u - o.u + penalty, q.v - o.v + penalty)
  }
  if (b) {
    // weiche Schranken: Kamera im Raum (300 mm Spiel für Türrahmen), Brennweite wie bei Handy und Kamera üblich
    const out1 = (v: number, lo: number, hi: number) => (v < lo ? lo - v : v > hi ? v - hi : 0)
    out.push(out1(c.x, -300, b.L + 300) * 0.5, out1(c.y, -300, b.W + 300) * 0.5, out1(c.z, 200, b.H) * 0.5)
    out.push(out1(c.f, Math.max(w, h) * 0.3, Math.max(w, h) * 3) * 0.5)
  }
  return out
}

const toArr = (c: PhotoCam) => [c.x, c.y, c.z, c.yaw, c.pitch, c.roll, c.f]
const fromArr = (a: number[]): PhotoCam => ({ x: a[0], y: a[1], z: a[2], yaw: a[3], pitch: a[4], roll: a[5], f: Math.max(50, a[6]) })

function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let i = 0; i < n; i++) {
    let piv = i
    for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k
    ;[M[i], M[piv]] = [M[piv], M[i]]
    const d = M[i][i] || 1e-12
    for (let k = i + 1; k < n; k++) {
      const f = M[k][i] / d
      for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n]
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]
    x[i] = s / (M[i][i] || 1e-12)
  }
  return x
}

/** Levenberg-Marquardt mit numerischer Jacobi-Matrix über einen beliebigen Parametervektor */
function lm(p0: number[], steps: number[], res: (a: number[]) => number[], iterations: number): number[] {
  let p = [...p0]
  const n = p.length
  const cost = (a: number[]) => res(a).reduce((s, r) => s + r * r, 0)
  let lambda = 1e-2
  let c0 = cost(p)
  for (let it = 0; it < iterations; it++) {
    const r0 = res(p)
    const J = r0.map(() => new Array(n).fill(0))
    for (let k = 0; k < n; k++) {
      const q = [...p]
      q[k] += steps[k]
      const r1 = res(q)
      for (let i = 0; i < r0.length; i++) J[i][k] = (r1[i] - r0[i]) / steps[k]
    }
    const JtJ = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J.reduce((s, row) => s + row[a] * row[b], 0)))
    const Jtr = Array.from({ length: n }, (_, a) => J.reduce((s, row, i) => s + row[a] * r0[i], 0))
    let improved = false
    for (let tries = 0; tries < 8; tries++) {
      const A = JtJ.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-9 : v)))
      const delta = solveLinear(A, Jtr.map((x) => -x))
      const q = p.map((x, i) => x + delta[i])
      const c1 = cost(q)
      if (c1 < c0) {
        p = q
        lambda = Math.max(1e-7, lambda / 3)
        improved = c0 - c1 > 1e-9 * c0
        c0 = c1
        break
      }
      lambda *= 4
    }
    if (!improved && lambda > 1e6) break
  }
  return p
}

const CAM_STEPS = [5, 5, 5, 1e-4, 1e-4, 1e-4, 1]

function rmsOf(cam: PhotoCam, obs: Observation[], w: number, h: number): number {
  const pix = residuals(cam, obs, w, h)
  return Math.sqrt(pix.reduce((s, r) => s + r * r, 0) / Math.max(1, obs.length))
}

function levenbergMarquardt(start: PhotoCam, obs: Observation[], w: number, h: number, b: Bounds, iterations = 120): { cam: PhotoCam; rms: number } {
  const cam = fromArr(lm(toArr(start), CAM_STEPS, (a) => residuals(fromArr(a), obs, w, h, b), iterations))
  return { cam, rms: rmsOf(cam, obs, w, h) }
}

/** Mehrere Startwerte (Standorte im Raum, Blick auf die angeklickten Punkte), bestes Ergebnis */
export function solvePhotoCam(project: Project, obs: Observation[], w: number, h: number): { cam: PhotoCam; rms: number } | null {
  if (obs.length < 4) return null
  const r = project.room
  const cx = obs.reduce((s, o) => s + o.p.x, 0) / obs.length
  const cy = obs.reduce((s, o) => s + o.p.y, 0) / obs.length
  const cz = obs.reduce((s, o) => s + o.p.z, 0) / obs.length
  const b: Bounds = { L: r.length, W: r.width, H: r.height }
  // grobe Suche: viele Standorte kurz anrechnen, die besten ausführlich
  const starts: { cam: PhotoCam; rms: number }[] = []
  const fx = [0.1, 0.3, 0.5, 0.7, 0.9]
  for (const ax of fx)
    for (const ay of fx)
      for (const z of [1100, 1700])
        for (const f of [0.55, 0.8, 1.2]) {
          const x = r.length * ax
          const y = r.width * ay
          const yaw = Math.atan2(cx - x, cy - y)
          const pitch = Math.atan2(cz - z, Math.hypot(cx - x, cy - y))
          const start: PhotoCam = { x, y, z, yaw, pitch, roll: 0, f: Math.max(w, h) * f }
          // Punkte müssen vor der Kamera liegen
          if (obs.some((o) => projectPoint(start, o.p, w, h).depth < 200)) continue
          starts.push(levenbergMarquardt(start, obs, w, h, b, 15))
        }
  starts.sort((s1, s2) => s1.rms - s2.rms)
  let best: { cam: PhotoCam; rms: number } | null = null
  for (const s of starts.slice(0, 6)) {
    const res = levenbergMarquardt(s.cam, obs, w, h, b, 150)
    if (!best || res.rms < best.rms) best = res
  }
  return best
}

/** Vertikales Blickfeld in Grad für three.js */
export function verticalFov(c: PhotoCam, h: number): number {
  return (2 * Math.atan(h / 2 / c.f) * 180) / Math.PI
}

/** Fenster- und Türmaße, die der Foto-Abgleich mitschätzt */
export interface OpeningFit {
  id: string
  name: string
  offset: number
  width: number
  bottom: number
  height: number
  before: { offset: number; width: number; bottom: number; height: number }
}

/**
 * Wie solvePhotoCam, schätzt aber zusätzlich Lage und Größe der Fenster und Türen, von denen
 * Punkte angeklickt sind. Die bisherigen Maße wirken als schwache Vorgabe (etwa ±25 cm), damit
 * wenige Punkte nicht zu Fantasiewerten führen.
 */
export function solvePhotoCamWithOpenings(
  project: Project,
  obs: { id: string; u: number; v: number }[],
  w: number,
  h: number,
): { cam: PhotoCam; rms: number; openings: OpeningFit[] } | null {
  const refs = referencePoints(project)
  const full = obs.flatMap((o) => {
    const r = refs.find((x) => x.id === o.id)
    return r ? [{ ...o, p: r.p }] : []
  })
  const first = solvePhotoCam(project, full, w, h)
  if (!first) return null
  const openings = project.wallObjects.filter((o) => (o.kind === 'fenster' || o.kind === 'tuer') && obs.some((x) => x.id.startsWith(`${o.id}-`)))
  if (!openings.length) return { ...first, openings: [] }
  const r = project.room
  const b: Bounds = { L: r.length, W: r.width, H: r.height }
  const base = openings.map((o) => ({
    offset: o.offset,
    width: o.width,
    bottom: o.kind === 'fenster' ? o.sillHeight : 0,
    height: o.height,
  }))
  const SIGMA = 250
  const PRIOR_PX = 8
  const pointOf = (a: number[], id: string): Vec3 | undefined => {
    const i = openings.findIndex((o) => id.startsWith(`${o.id}-`))
    if (i < 0) return refs.find((x) => x.id === id)?.p
    const o = openings[i]
    const [dOff, dW, dB, dH] = a.slice(7 + i * 4, 11 + i * 4)
    const f = wallFrame(r, o.wall)
    const off = o.offset + dOff
    const width = o.width + dW
    const z0 = base[i].bottom + (o.kind === 'fenster' ? dB : 0)
    const z1 = z0 + o.height + dH
    const k = id.slice(o.id.length + 1)
    const s = k.endsWith('l') ? off : off + width
    const z = k.startsWith('o') ? z1 : z0
    return { x: f.start.x + f.u.x * s, y: f.start.y + f.u.y * s, z }
  }
  const res = (a: number[]) => {
    const cam = fromArr(a)
    const o2 = obs.flatMap((o) => {
      const p = pointOf(a, o.id)
      return p ? [{ p, u: o.u, v: o.v }] : []
    })
    const out = residuals(cam, o2, w, h, b)
    for (let i = 7; i < a.length; i++) out.push((a[i] / SIGMA) * PRIOR_PX)
    return out
  }
  const a0 = [...toArr(first.cam), ...openings.flatMap(() => [0, 0, 0, 0])]
  const steps = [...CAM_STEPS, ...openings.flatMap(() => [2, 2, 2, 2])]
  const a = lm(a0, steps, res, 200)
  const cam = fromArr(a)
  const o2 = obs.flatMap((o) => {
    const p = pointOf(a, o.id)
    return p ? [{ p, u: o.u, v: o.v }] : []
  })
  return {
    cam,
    rms: rmsOf(cam, o2, w, h),
    openings: openings.map((o, i) => ({
      id: o.id,
      name: o.name,
      offset: Math.round(o.offset + a[7 + i * 4]),
      width: Math.round(o.width + a[8 + i * 4]),
      bottom: Math.round(base[i].bottom + (o.kind === 'fenster' ? a[9 + i * 4] : 0)),
      height: Math.round(o.height + a[10 + i * 4]),
      before: base[i],
    })),
  }
}

/** Projekt mit den geschätzten Öffnungsmaßen (für Anzeige und Übernahme) */
export function applyOpeningFits(project: Project, fits: OpeningFit[]): Project {
  if (!fits.length) return project
  return {
    ...project,
    wallObjects: project.wallObjects.map((o) => {
      const f = fits.find((x) => x.id === o.id)
      if (!f) return o
      return o.kind === 'fenster' ? { ...o, offset: f.offset, width: f.width, height: f.height, sillHeight: f.bottom } : { ...o, offset: f.offset, width: f.width, height: f.height }
    }),
  }
}
