import { t } from '../i18n'
import { add, dot, memberAxes, memberBoxes, memberLength, obbBounds, obbOverlap, scale, sub, v, wallFrame, type OBB } from './geometry'
import { defaultJointType } from './joints'
import { generateLoftBed, type BedFixing, type BedInfo } from './loftbed'
import { cornice, corniceIntrusion } from './room'
import type { Assembly, JointKind, Member, Notch, Panel, Project, Room, Vec3, WallId } from './types'
import { WALL_IDS } from './types'

export interface DetectedJoint {
  key: string
  a: string
  b: string
  kind: JointKind
  pos: Vec3
  typeId: string
  /** Stab, dessen Ende anschließt (bei T-Stoß und Auflage) */
  ending?: string
}

export interface Resolved {
  members: Member[]
  panels: Panel[]
  beds: Map<string, BedInfo>
  fixings: BedFixing[]
  joints: DetectedJoint[]
  /** Ausklinkungen, die zu tief wären (Restquerschnitt zu klein) */
  deepNotches: { memberId: string; reason: string; depth: number; max: number }[]
  /** Automatisch vorgenommene Verschiebungen (Abrücken von der Sockelleiste) */
  shifts: { assemblyId: string; dx: number; dy: number }[]
}

export function jointKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function resolveProject(p: Project): Resolved {
  const beds = new Map<string, BedInfo>()
  const members: Member[] = p.members.map((m) => ({ ...m, notches: m.notches ? [...m.notches] : undefined }))
  const panels: Panel[] = [...p.panels]
  const fixings: BedFixing[] = []
  const shifts: Resolved['shifts'] = []

  for (const a of p.assemblies) {
    let asm: Assembly = a
    if (a.params.wallFit === 'abruecken' && p.room.skirting.enabled) {
      const probe = generateLoftBed(a, p.room.height, p.room)
      const { dx, dy } = skirtingShift(p.room, probe.info.footprint)
      if (dx || dy) {
        asm = { ...a, params: { ...a.params, x: a.params.x + dx, y: a.params.y + dy } }
        shifts.push({ assemblyId: a.id, dx, dy })
      }
    }
    const g = generateLoftBed(asm, p.room.height, p.room)
    beds.set(a.id, g.info)
    members.push(...g.members)
    panels.push(...g.panels)
    fixings.push(...g.fixings)
    if (a.params.type === 'freistehend') {
      for (const m of g.members.filter((x) => x.role === 'pfosten' && x.start.z < 1)) {
        if (nearestWall(p.room, m).gap < 40) {
          fixings.push({ memberId: m.id, target: 'wand', hardwareId: 'rahmenduebel-10', count: 2, note: t('Kippsicherung: Pfosten mit Winkel an der Wand befestigen') })
        }
      }
    }
  }

  const deepNotches: Resolved['deepNotches'] = []
  for (const m of members) {
    const isVertical = Math.abs(m.start.x - m.end.x) < 1 && Math.abs(m.start.y - m.end.y) < 1
    if (!isVertical || m.round) continue
    const fit = m.assemblyId ? p.assemblies.find((a) => a.id === m.assemblyId)?.params.wallFit : 'ausklinken'
    addWallNotches(p.room, m, fit ?? 'ausklinken', deepNotches)
  }

  const joints = detectJoints(members, p)
  return { members, panels, beds, fixings, joints, deepNotches, shifts }
}

function skirtingShift(room: Room, fp: { x: number; y: number }[]): { dx: number; dy: number } {
  const d = room.skirting.depth
  const minX = Math.min(...fp.map((q) => q.x))
  const maxX = Math.max(...fp.map((q) => q.x))
  const minY = Math.min(...fp.map((q) => q.y))
  const maxY = Math.max(...fp.map((q) => q.y))
  let dx = 0
  let dy = 0
  if (minX < d) dx = d - minX
  else if (room.length - maxX < d) dx = room.length - maxX - d
  if (minY < d) dy = d - minY
  else if (room.width - maxY < d) dy = room.width - maxY - d
  return { dx, dy }
}

function nearestWall(room: Room, m: Member): { wall: WallId; gap: number } {
  const bounds = memberBoxes(m).map(obbBounds)
  const minX = Math.min(...bounds.map((b) => b.min.x))
  const maxX = Math.max(...bounds.map((b) => b.max.x))
  const minY = Math.min(...bounds.map((b) => b.min.y))
  const maxY = Math.max(...bounds.map((b) => b.max.y))
  const gaps: [WallId, number][] = [
    ['A', minY],
    ['B', minX],
    ['C', room.width - maxY],
    ['D', room.length - maxX],
  ]
  gaps.sort((a, b) => a[1] - b[1])
  return { wall: gaps[0][0], gap: gaps[0][1] }
}

/** Seite des Querschnitts, die zur Wand zeigt */
function sideTowards(m: Member, dir: Vec3): Notch['side'] | undefined {
  const [, hb, hh] = memberAxes(m)
  const db = dot(hb, dir)
  const dh = dot(hh, dir)
  if (db > 0.9) return '+b'
  if (db < -0.9) return '-b'
  if (dh > 0.9) return '+h'
  if (dh < -0.9) return '-h'
  return undefined
}

function addWallNotches(room: Room, m: Member, fit: 'ausklinken' | 'abruecken', deep: Resolved['deepNotches']) {
  const L = memberLength(m)
  const up = m.end.z > m.start.z
  const zLow = Math.min(m.start.z, m.end.z)
  const zHigh = Math.max(m.start.z, m.end.z)
  const along = (z: number) => (up ? z - m.start.z : m.start.z - z)
  const box = obbBounds(memberBoxes(m)[0])
  for (const id of WALL_IDS) {
    const f = wallFrame(room, id)
    // Abstand der wandseitigen Fläche von der Wand
    const corners = [box.min, box.max, v(box.min.x, box.max.y, 0), v(box.max.x, box.min.y, 0)]
    const gap = Math.min(...corners.map((q) => (q.x - f.start.x) * f.n.x + (q.y - f.start.y) * f.n.y))
    const side = sideTowards(m, scale(f.n, -1))
    if (!side) continue
    const thickness = side === '+b' || side === '-b' ? m.b : m.h
    const maxDepth = thickness / 2
    // Sockelleiste
    if (fit === 'ausklinken' && room.skirting.enabled && gap < room.skirting.depth && zLow < room.skirting.height) {
      const depth = room.skirting.depth - gap + 2
      const top = room.skirting.height + 5
      pushNotch(m, { along: Math.min(along(zLow), along(top)), length: top - zLow, depth, side, reason: t('Sockelleiste Wand {id}', { id }) }, maxDepth, deep, L)
    }
    // Stuck
    const c = cornice(room, id)
    if (c.enabled && gap < c.projection && zHigh > room.height - c.height) {
      const topCorners = corners.map((q) => v(q.x, q.y, zHigh))
      const depths = topCorners.map((q) => corniceIntrusion(room, q)).filter((x) => x && x.wall === id).map((x) => x!.depth)
      if (depths.length) {
        const depth = Math.ceil(Math.max(...depths)) + 3
        const z0 = room.height - c.height - 5
        pushNotch(m, { along: Math.min(along(z0), along(zHigh)), length: zHigh - z0, depth, side, reason: t('Stuck Wand {id}', { id }) }, maxDepth, deep, L)
      }
    }
  }
}

function pushNotch(m: Member, n: Notch, maxDepth: number, deep: Resolved['deepNotches'], L: number) {
  if (n.depth > maxDepth) deep.push({ memberId: m.id, reason: n.reason, depth: n.depth, max: maxDepth })
  const clamped = { ...n, along: Math.max(0, n.along), length: Math.min(n.length, L), depth: Math.min(n.depth, m.b - 10, m.h - 10) }
  m.notches = [...(m.notches ?? []), clamped]
}

export function pointOBBDistance(q: Vec3, o: OBB): number {
  const d = sub(q, o.center)
  let sum = 0
  for (let i = 0; i < 3; i++) {
    const t = dot(d, o.axes[i])
    const ex = Math.abs(t) - o.half[i]
    if (ex > 0) sum += ex * ex
  }
  return Math.sqrt(sum)
}

function inflate(o: OBB, by: number): OBB {
  return { ...o, half: [o.half[0] + by, o.half[1] + by, o.half[2] + by] }
}

export function detectJoints(members: Member[], p: Project): DetectedJoint[] {
  const boxes = new Map(members.map((m) => [m.id, memberBoxes(m)]))
  const bounds = new Map(members.map((m) => [m.id, boxes.get(m.id)!.map(obbBounds)]))
  const choices = new Map(p.joints.map((j) => [j.key, j.typeId]))
  const out: DetectedJoint[] = []
  for (let i = 0; i < members.length; i++) {
    const A = members[i]
    const ba = bounds.get(A.id)!
    for (let j = i + 1; j < members.length; j++) {
      const B = members[j]
      const bb = bounds.get(B.id)!
      if (!ba.some((x) => bb.some((y) => x.min.x <= y.max.x + 3 && y.min.x <= x.max.x + 3 && x.min.y <= y.max.y + 3 && y.min.y <= x.max.y + 3 && x.min.z <= y.max.z + 3 && y.min.z <= x.max.z + 3)))
        continue
      let pen = -Infinity
      for (const x of boxes.get(A.id)!) for (const y of boxes.get(B.id)!) pen = Math.max(pen, obbOverlap(inflate(x, 1.5), inflate(y, 1.5)))
      if (pen <= 0) continue
      const kindInfo = classify(A, B, boxes.get(A.id)!, boxes.get(B.id)!, pen - 3)
      const key = jointKey(A.id, B.id)
      const endingMember = kindInfo.ending ? (kindInfo.ending === 'a' ? A : B) : undefined
      let typeId = choices.get(key)
      if (!typeId) {
        typeId = endingMember?.round || (A.round && B.round) ? 'stecken' : defaultJointType(kindInfo.kind, p.settings.jointPreference)
        const upper = kindInfo.kind === 'auflage' ? (endingMember ?? (A.start.z + A.end.z > B.start.z + B.end.z ? A : B)) : undefined
        if (kindInfo.kind === 't-stoss' && endingMember?.role === 'quertraeger') typeId = 'balkenschuh'
        if (kindInfo.kind === 't-stoss' && endingMember?.role === 'stufe') typeId = 'gratnut'
        if (kindInfo.kind === 't-stoss' && endingMember?.role === 'holm' && !endingMember.round && p.settings.jointPreference !== 'wenig-metall') typeId = 'holzbauschraube'
        if (upper?.role === 'leiste') typeId = 'lose'
        // Geländerbretter werden angeschraubt, nicht gebolzt; Latten liegen nur lose an
        if (kindInfo.kind === 'beischlag' && (A.catalogId.startsWith('leimholz') || B.catalogId.startsWith('leimholz'))) typeId = 'holzbauschraube'
        if (kindInfo.kind === 'beischlag' && (A.role === 'leiste' || B.role === 'leiste')) typeId = 'lose'
        if ((A.catalogId === 'seil-12' || B.catalogId === 'seil-12') && kindInfo.kind !== 'auflage') typeId = 'seilbefestigung'
        if (A.catalogId === 'gewindestange-m10' || B.catalogId === 'gewindestange-m10') typeId = 'gewindestange'
      }
      out.push({ key, a: A.id, b: B.id, kind: kindInfo.kind, pos: kindInfo.pos, typeId, ending: endingMember?.id })
    }
  }
  return out
}

function classify(A: Member, B: Member, boxesA: OBB[], boxesB: OBB[], penetration: number): { kind: JointKind; pos: Vec3; ending?: 'a' | 'b' } {
  const near = (q: Vec3, bs: OBB[]) => Math.min(...bs.map((o) => pointOBBDistance(q, o)))
  const aEndPt = [A.start, A.end].find((q) => near(q, boxesB) < 3)
  const bEndPt = [B.start, B.end].find((q) => near(q, boxesA) < 3)
  const [ax] = memberAxes(A)
  const [bx] = memberAxes(B)
  const parallel = Math.abs(dot(ax, bx)) > 0.99
  const ba = obbBounds(boxesA[0])
  const bb = obbBounds(boxesB[0])
  const mid = v(
    (Math.max(ba.min.x, bb.min.x) + Math.min(ba.max.x, bb.max.x)) / 2,
    (Math.max(ba.min.y, bb.min.y) + Math.min(ba.max.y, bb.max.y)) / 2,
    (Math.max(ba.min.z, bb.min.z) + Math.min(ba.max.z, bb.max.z)) / 2,
  )
  if (A.role === 'strebe' || B.role === 'strebe') return { kind: 'strebe', pos: aEndPt ?? bEndPt ?? mid }
  if (parallel) {
    if (aEndPt && bEndPt && penetration < 2) return { kind: 'laengsstoss', pos: aEndPt }
    return { kind: 'beischlag', pos: mid }
  }
  const stacked = (top: typeof ba, bottom: typeof ba) => Math.abs(top.min.z - bottom.max.z) < 3
  if (aEndPt && bEndPt) return { kind: 'ecke', pos: add(scale(aEndPt, 0.5), scale(bEndPt, 0.5)) }
  if (aEndPt || bEndPt) {
    const endA = !!aEndPt
    const e = endA ? ba : bb
    const t = endA ? bb : ba
    return { kind: stacked(e, t) ? 'auflage' : 't-stoss', pos: (aEndPt ?? bEndPt)!, ending: endA ? 'a' : 'b' }
  }
  if (stacked(ba, bb) || stacked(bb, ba)) return { kind: 'auflage', pos: mid }
  if (penetration < 2) return { kind: 'beischlag', pos: mid }
  return { kind: 'kreuzung', pos: mid }
}
