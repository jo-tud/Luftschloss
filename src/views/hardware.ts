import * as THREE from 'three'
import { allFasteners, type Fastener, type FastenerWhen } from '../model/fasteners'
import type { Resolved } from '../model/resolve'
import { T } from './camera'

/**
 * Beschläge als Instanz-Matrizen (Meter, three-Koordinaten): Schloss- und Bettschrauben (Kopf,
 * Scheibe, Mutter bzw. Quermutter in Tasche), Bleche für Winkel und Balkenschuhe, Köpfe von
 * Holzschrauben, Holznägel, Dübel und Muttern an Gewindestangen. Reine Rechnung, damit testbar.
 */
export const BOLT_TYPES = new Set(['schlossschraube', 'bettschraube'])

export interface HardwareLists {
  heads: THREE.Matrix4[]
  washers: THREE.Matrix4[]
  nuts: THREE.Matrix4[]
  plates: THREE.Matrix4[]
  pockets: THREE.Matrix4[]
  /** Köpfe von Holzschrauben (flache Scheiben) */
  screws: THREE.Matrix4[]
  /** Holznägel und Holzdübel, deren Stirnseite sichtbar ist */
  pins: THREE.Matrix4[]
  /** verdeckte Holzdübel im Stoß (nur im Verbindungsdetail sichtbar) */
  dowels: THREE.Matrix4[]
  /** Schäfte von Bolzen und Schrauben (nur im Verbindungsdetail) */
  rods: THREE.Matrix4[]
}

/**
 * opts.only: nur diese Verbindung (Verbindungsdetail). opts.rods: auch Schäfte, die im Holz stecken.
 * opts.when: nur Befestigungsmittel dieser Bauphasen (Verbindungsdetail zeigt sie nacheinander).
 */
export function hardwareInstances(r: Resolved, opts: { only?: string; rods?: boolean; when?: FastenerWhen[] } = {}): HardwareLists {
  const list = allFasteners(r, opts.only).filter((f) => !opts.when || opts.when.includes(f.when))
  return fastenerInstances(list, !!opts.rods)
}

type V = { x: number; y: number; z: number }
const toThree = (d: V) => new THREE.Vector3(d.x, d.z, -d.y)
const up = new THREE.Vector3(0, 1, 0)
const addv = (base: V, ...terms: [V, number][]): V => terms.reduce((q, [d, k]) => ({ x: q.x + d.x * k, y: q.y + d.y * k, z: q.z + d.z * k }), base)

/**
 * Teile eines Befestigungsmittels, die im Verbindungsdetail nacheinander ankommen: kern (Schraube,
 * Bolzen mit Kopf, Blech, Holznagel), mutter (Scheibe und Mutter am Bolzenende), quermutter
 * (Zylinder- bzw. Quermutter), tasche (Querbohrung, gehört zum vorbereiteten Holz).
 */
export type FastenerPart = 'kern' | 'mutter' | 'quermutter' | 'tasche'

/** Befestigungsmittel als Instanz-Matrizen (part: nur dieser Teil) */
export function fastenerInstances(list: Fastener[], withRods: boolean, part?: FastenerPart): HardwareLists {
  const want = (p: FastenerPart) => !part || part === p
  const h: HardwareLists = { heads: [], washers: [], nuts: [], plates: [], pockets: [], screws: [], pins: [], dowels: [], rods: [] }
  const put = (target: THREE.Matrix4[], p: V, dir: THREE.Vector3, sc: [number, number, number]) => {
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize())
    target.push(new THREE.Matrix4().compose(T(p.x, p.y, p.z), q, new THREE.Vector3(...sc)))
  }
  /** Schaft von a nach b, Radius in mm */
  const rod = (a: V, b: V, radius: number, target = h.rods) => {
    if (target === h.rods && !withRods) return
    const pa = T(a.x, a.y, a.z)
    const pb = T(b.x, b.y, b.z)
    const d = pb.clone().sub(pa)
    const L = d.length()
    if (L < 1e-6) return
    const q = new THREE.Quaternion().setFromUnitVectors(up, d.normalize())
    target.push(new THREE.Matrix4().compose(pa.clone().lerp(pb, 0.5), q, new THREE.Vector3(radius / 1000, L, radius / 1000)))
  }
  for (const f of list) {
    if (part && part !== 'kern' && f.kind !== 'bolzen' && f.kind !== 'bettschraube') continue
    const inDir = toThree(f.dir)
    const outDir = inDir.clone().negate()
    const end = addv(f.head, [f.dir, f.length])
    switch (f.kind) {
      case 'bolzen':
      case 'bettschraube': {
        const r = f.d / 2
        if (want('kern')) {
          put(h.heads, f.head, outDir, [0.0125, 0.006, 0.0125])
          rod(f.head, f.nut ? addv(f.head, [f.dir, f.length + 12]) : end, r)
        }
        if (f.nut && want('mutter')) {
          put(h.washers, addv(f.head, [f.dir, f.length + 1]), inDir, [0.0105, 0.002, 0.0105])
          put(h.nuts, addv(f.head, [f.dir, f.length + 6]), inDir, [0.0095, 0.008, 0.0095])
        }
        if (f.crossNut) {
          const c = f.crossNut
          const pocket = addv(c.at, [c.dir, c.outer + 0.3])
          if (c.bore > 20) {
            // Tasche: Scheibe und Sechskantmutter auf dem Bolzen, an der Taschenwand zum Hirnholz hin
            if (want('quermutter')) {
              put(h.washers, addv(c.at, [f.dir, -c.bore / 2 + 1]), inDir, [0.0105, 0.002, 0.0105])
              put(h.nuts, addv(c.at, [f.dir, -c.bore / 2 + 6]), inDir, [0.0095, 0.008, 0.0095])
            }
          } else {
            // Zylindermutter quer zur Schraube, Schlitz außen sichtbar
            if (want('quermutter')) rod(addv(c.at, [c.dir, c.outer]), addv(c.at, [c.dir, -c.inner]), 6.5)
            if (want('quermutter')) put(h.washers, addv(pocket, [c.dir, 0.4]), toThree(c.dir), [0.0065, 0.0008, 0.0065])
          }
          // sichtbare Öffnung auf der Innenseite
          if (want('tasche')) put(h.pockets, pocket, toThree(c.dir), [c.bore / 2000, 0.001, c.bore / 2000])
        }
        break
      }
      case 'schraube': {
        const r = f.d / 2
        put(h.screws, f.head, outDir, [(r * 1.9) / 1000, 0.0015, (r * 1.9) / 1000])
        rod(f.head, end, r * 0.75)
        break
      }
      case 'holznagel':
        rod(f.head, end, f.d / 2, h.pins)
        break
      case 'duebel':
        rod(f.head, end, f.d / 2, h.dowels)
        break
      case 'stangenmutter':
        put(h.washers, addv(f.head, [f.dir, -1]), outDir, [0.015, 0.002, 0.015])
        put(h.nuts, addv(f.head, [f.dir, -6]), outDir, [0.0095, 0.008, 0.0095])
        break
      case 'blech': {
        if (!f.plate) break
        const [l, t, w] = f.plate.axes
        const a0 = toThree(l)
        const a1 = toThree(t)
        const a2 = toThree(w)
        if (new THREE.Vector3().crossVectors(a0, a1).dot(a2) < 0) a2.negate()
        const m = new THREE.Matrix4().makeBasis(a0, a1, a2)
        m.scale(new THREE.Vector3(f.length / 1000, f.plate.thick / 1000, f.d / 1000))
        m.setPosition(T(f.head.x, f.head.y, f.head.z))
        h.plates.push(m)
        break
      }
    }
  }
  return h
}
