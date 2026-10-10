import { Edges, Html, Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import * as THREE from 'three'
import { UTIL_COLOR } from '../analysis/statics'
import { catalogItem } from '../model/catalog'
import { fmtCm, fmtM, memberBoxes, panelOBB, wallFrame, type OBB } from '../model/geometry'
import { cornice, doorGeom, furnitureBox, sashBoxes, windowSashes } from '../model/room'
import type { Furniture, Member, Panel, Project, WallId, WindowObj } from '../model/types'
import { WALL_IDS } from '../model/types'
import { buildSteps } from '../analysis/assembly'
import { derive, useStore, type Derived } from '../state/store'
import { T } from './camera'

const COLORS = {
  wall: '#ece7df',
  wallEdge: '#b9b0a3',
  floor: '#caa774',
  ceiling: '#f6f4ef',
  stuck: '#f8f6f1',
  wood: '#dcb27c',
  woodDark: '#c49460',
  woodLight: '#e8c895',
  steel: '#8a9099',
  mattress: '#f4f2ec',
  sheet: '#9db7d5',
  select: '#ff8a3d',
  hover: '#ffc285',
  radiator: '#f4f4f4',
  glass: '#bcd9ef',
  frame: '#fbfbfb',
  furniture: '#b9c7d6',
  person: '#7d8fb3',
  rope: '#c9b48a',
}

export interface PickData {
  kind: 'member' | 'panel' | 'wallObject' | 'furniture' | 'rosette' | 'handle' | 'joint'
  id: string
  /** Bei Griffen: welches Stabende */
  end?: 'start' | 'end'
}

function vec(v: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.z, -v.y)
}

/** Lage eines orientierten Quaders als three-Transformation */
function obbTransform(o: OBB, roundAxis = false): { position: THREE.Vector3; quaternion: THREE.Quaternion; size: [number, number, number] } {
  const [a0, a1raw, a2] = o.axes.map(vec)
  // Quader sind symmetrisch: Linkssysteme (z. B. Wandkoordinaten) durch Umdrehen einer Achse korrigieren
  const a1 = new THREE.Vector3().crossVectors(a2, a0).dot(a1raw) < 0 ? a1raw.clone().negate() : a1raw
  const m = new THREE.Matrix4()
  if (roundAxis) m.makeBasis(a2, a0, a1)
  else m.makeBasis(a0, a1, a2)
  const q = new THREE.Quaternion().setFromRotationMatrix(m)
  const size: [number, number, number] = roundAxis ? [o.half[2] * 2, o.half[0] * 2, o.half[1] * 2] : [o.half[0] * 2, o.half[1] * 2, o.half[2] * 2]
  return { position: T(o.center.x, o.center.y, o.center.z), quaternion: q, size: size.map((s) => s / 1000) as [number, number, number] }
}

function Box({ o, color, pick, opacity = 1, edges = false, round = false, cast = true, highlight }: { o: OBB; color: string; pick?: PickData; opacity?: number; edges?: boolean; round?: boolean; cast?: boolean; highlight?: string }) {
  const t = useMemo(() => obbTransform(o, round), [o, round])
  return (
    <mesh position={t.position} quaternion={t.quaternion} userData={pick ? { pick } : {}} castShadow={cast} receiveShadow>
      {round ? <cylinderGeometry args={[t.size[0] / 2, t.size[0] / 2, t.size[1], 20]} /> : <boxGeometry args={t.size} />}
      <meshStandardMaterial color={highlight ?? color} transparent={opacity < 1} opacity={opacity} roughness={0.8} emissive={highlight ? highlight : '#000000'} emissiveIntensity={highlight ? 0.25 : 0} />
      {edges && !round && <Edges color="#6b5136" threshold={20} />}
    </mesh>
  )
}

function memberColor(m: Member): string {
  const item = catalogItem(m.catalogId)
  if (item?.kind === 'beschlag') return item.id.startsWith('seil') ? COLORS.rope : COLORS.steel
  if (m.role === 'leiste' || m.role === 'stufe') return COLORS.woodLight
  if (m.role === 'holm' || m.role === 'stab' || m.role === 'sprosse') return COLORS.woodDark
  return COLORS.wood
}

function isSelected(sel: ReturnType<typeof useStore.getState>['selection'], m: { id: string; assemblyId?: string }): boolean {
  if (!sel) return false
  if (sel.id === m.id) return true
  return sel.kind === 'assembly' && sel.id === m.assemblyId
}

export function MemberMeshes({ members, mini }: { members: Member[]; mini?: boolean }) {
  const sel = useStore((s) => s.selection)
  const hover = useStore((s) => s.hover)
  const staticsMode = useStore((s) => s.staticsMode)
  const statics = useStore((s) => s.statics)
  return (
    <group>
      {members.map((m) => {
        const boxes = memberBoxes(m)
        let highlight = mini ? undefined : isSelected(sel, m) ? COLORS.select : hover && (hover === m.id || hover === m.assemblyId) ? COLORS.hover : undefined
        let color = memberColor(m)
        if (!mini && staticsMode && statics) {
          const c = statics.members.get(m.id)
          color = c ? UTIL_COLOR(c.util) : '#c9c9c9'
          if (highlight && !isSelected(sel, m)) highlight = undefined
        }
        return (
          <BuildAnimated key={m.id} id={m.id} enabled={!mini}>
            {boxes.map((o, i) => (
              <Box key={i} o={o} color={color} pick={{ kind: 'member', id: m.id }} edges={!m.round} round={m.round} highlight={highlight} opacity={!mini && staticsMode ? 0.85 : 1} />
            ))}
          </BuildAnimated>
        )
      })}
    </group>
  )
}

/** Schrittnummer je Bauteil für die Aufbau-Animation */
const buildIndexCache = new WeakMap<object, Map<string, { step: number; order: number }>>()
function useBuildIndex(): Map<string, { step: number; order: number }> {
  const project = useStore((s) => s.project)
  let map = buildIndexCache.get(project)
  if (!map) {
    const d = derive(project)
    const m = new Map<string, { step: number; order: number }>()
    buildSteps(project, d.resolved).forEach((st, i) => {
      st.memberIds.forEach((id, k) => m.set(id, { step: i, order: k }))
      st.panelIds.forEach((id, k) => m.set(id, { step: i, order: st.memberIds.length + k }))
    })
    buildIndexCache.set(project, m)
    map = m
  }
  return map
}

/** Blendet Teile je nach Aufbauschritt ein; Teile des aktuellen Schritts fliegen von oben ein. */
function BuildAnimated({ id, enabled, children }: { id: string; enabled: boolean; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const index = useBuildIndex()
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const b = enabled ? useStore.getState().build : null
    if (!b) {
      g.visible = true
      g.position.y = 0
      return
    }
    const info = index.get(id)
    if (!info) {
      g.visible = false
      return
    }
    if (info.step < b.step) {
      g.visible = true
      g.position.y = 0
    } else if (info.step > b.step) g.visible = false
    else {
      const t = (performance.now() - b.start) / 1000 - info.order * 0.12
      const k = Math.max(0, Math.min(1, t / 0.7))
      g.visible = t > 0
      const e = 1 - Math.pow(1 - k, 3)
      g.position.y = (1 - e) * 0.9
    }
  })
  return <group ref={ref}>{children}</group>
}

/** Verformungsfigur der Statik als Linien; beim Wackeln schwingt sie hin und her */
export function StaticsShapes() {
  const st = useStore((s) => s.statics)
  const mode = useStore((s) => s.staticsMode)
  const kase = useStore((s) => s.staticsCase)
  const scale = useStore((s) => s.staticsScale)
  const wobble = useStore((s) => s.wobble)
  const ref = useRef<THREE.LineSegments>(null)
  const data = useMemo(() => {
    if (!st) return null
    const shapes = st.shapes[kase]
    const base: number[] = []
    const disp: number[] = []
    for (const pts of shapes.values()) {
      for (let i = 0; i < pts.length - 1; i++) {
        for (const q of [pts[i], pts[i + 1]]) {
          base.push(q.p.x / 1000, q.p.z / 1000, -q.p.y / 1000)
          disp.push(q.u.x / 1000, q.u.z / 1000, -q.u.y / 1000)
        }
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(base.length), 3))
    return { base, disp, geo }
  }, [st, kase])
  useFrame(({ clock }) => {
    if (!data || !ref.current) return
    const f = wobble ? Math.sin(clock.elapsedTime * 2 * Math.PI * 1.1) : 1
    const k = scale * (wobble ? Math.max(1, 15 / Math.max(0.5, Math.max(st!.sway.x, st!.sway.y))) : 1) * f
    const arr = data.geo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < data.base.length; i++) (arr.array as Float32Array)[i] = data.base[i] + data.disp[i] * k
    arr.needsUpdate = true
  })
  if (!mode || !data) return null
  return (
    <lineSegments ref={ref} geometry={data.geo} renderOrder={10}>
      <lineBasicMaterial color="#1d3fd6" depthTest={false} transparent opacity={0.9} />
    </lineSegments>
  )
}

let netTexture: THREE.CanvasTexture | null = null
function getNetTexture(): THREE.CanvasTexture {
  if (netTexture) return netTexture
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.clearRect(0, 0, 64, 64)
  g.strokeStyle = '#3d4a57'
  g.lineWidth = 5
  g.beginPath()
  g.moveTo(0, 32)
  g.lineTo(64, 32)
  g.moveTo(32, 0)
  g.lineTo(32, 64)
  g.stroke()
  netTexture = new THREE.CanvasTexture(c)
  netTexture.wrapS = netTexture.wrapT = THREE.RepeatWrapping
  return netTexture
}

export function PanelMeshes({ panels, mini }: { panels: Panel[]; mini?: boolean }) {
  const sel = useStore((s) => s.selection)
  return (
    <group>
      {panels.map((pa) => {
        const highlight = !mini && isSelected(sel, pa) ? COLORS.select : undefined
        let el: ReactElement
        if (pa.vertical) {
          const o = panelOBB(pa)
          el = pa.kind === 'netz' ? <NetPanel o={o} id={pa.id} /> : <Box o={o} color={COLORS.woodLight} pick={{ kind: 'panel', id: pa.id }} edges highlight={highlight} />
        } else if (pa.kind === 'matratze') el = <Mattress pa={pa} />
        else if (pa.kind === 'netz') el = <FlatNet pa={pa} />
        else el = <FlatPanel pa={pa} highlight={highlight} />
        return (
          <BuildAnimated key={pa.id} id={pa.id} enabled={!mini}>
            {el}
          </BuildAnimated>
        )
      })}
    </group>
  )
}

function NetPanel({ o, id }: { o: OBB; id: string }) {
  const t = useMemo(() => obbTransform(o), [o])
  const tex = useMemo(() => {
    const base = getNetTexture().clone()
    base.needsUpdate = true
    base.repeat.set(t.size[0] / 0.05, t.size[2] / 0.05)
    return base
  }, [t])
  return (
    <mesh position={t.position} quaternion={t.quaternion} userData={{ pick: { kind: 'panel', id } }}>
      <boxGeometry args={[t.size[0], 0.004, t.size[2]]} />
      <meshStandardMaterial map={tex} transparent alphaTest={0.3} side={THREE.DoubleSide} color="#ffffff" />
    </mesh>
  )
}

/** Waagerechtes, leicht durchhängendes Netz (begehbare Netz-Liegefläche) als Maschengitter */
function FlatNet({ pa }: { pa: Panel }) {
  const geom = useMemo(() => {
    const xs = pa.outline.map((q) => q.x)
    const ys = pa.outline.map((q) => q.y)
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const y0 = Math.min(...ys)
    const y1 = Math.max(...ys)
    const sag = 0.03 * Math.min(x1 - x0, y1 - y0)
    const z = (x: number, y: number) => {
      const u = (x - x0) / (x1 - x0) - 0.5
      const w = (y - y0) / (y1 - y0) - 0.5
      return pa.z - sag * (1 - 4 * u * u) * (1 - 4 * w * w)
    }
    const pts: number[] = []
    const seg = (ax: number, ay: number, bx: number, by: number) => {
      const a = T(ax, ay, z(ax, ay))
      const b = T(bx, by, z(bx, by))
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
    const mesh = 60
    const steps = 16
    for (let x = x0; x <= x1 + 1; x += (x1 - x0) / Math.round((x1 - x0) / mesh))
      for (let k = 0; k < steps; k++) seg(x, y0 + ((y1 - y0) * k) / steps, x, y0 + ((y1 - y0) * (k + 1)) / steps)
    for (let y = y0; y <= y1 + 1; y += (y1 - y0) / Math.round((y1 - y0) / mesh))
      for (let k = 0; k < steps; k++) seg(x0 + ((x1 - x0) * k) / steps, y, x0 + ((x1 - x0) * (k + 1)) / steps, y)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [pa])
  return (
    <lineSegments geometry={geom} userData={{ pick: { kind: 'panel', id: pa.id } }}>
      <lineBasicMaterial color="#3d4f5f" transparent opacity={0.75} />
    </lineSegments>
  )
}

function FlatPanel({ pa, highlight }: { pa: Panel; highlight?: string }) {
  const geom = useMemo(() => {
    const shape = new THREE.Shape(pa.outline.map((q) => new THREE.Vector2(q.x / 1000, q.y / 1000)))
    const g = new THREE.ExtrudeGeometry(shape, { depth: pa.thickness / 1000, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    g.translate(0, pa.z / 1000, 0)
    return g
  }, [pa])
  const color = pa.kind === 'platte' ? (pa.catalogId?.startsWith('osb') ? '#cfa565' : COLORS.woodLight) : pa.kind === 'dielen' ? COLORS.woodLight : '#d9c29a'
  return (
    <mesh geometry={geom} userData={{ pick: { kind: 'panel', id: pa.id } }} castShadow receiveShadow>
      <meshStandardMaterial color={highlight ?? color} roughness={0.85} />
      <Edges color="#8a6a43" threshold={20} />
    </mesh>
  )
}

function Mattress({ pa }: { pa: Panel }) {
  const xs = pa.outline.map((q) => q.x)
  const ys = pa.outline.map((q) => q.y)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const c = T((x0 + x1) / 2, (y0 + y1) / 2, pa.z + pa.thickness / 2)
  return (
    <group position={c}>
      <mesh castShadow receiveShadow userData={{ pick: { kind: 'panel', id: pa.id } }}>
        <boxGeometry args={[(x1 - x0) / 1000, pa.thickness / 1000, (y1 - y0) / 1000]} />
        <meshStandardMaterial color={COLORS.mattress} roughness={1} />
      </mesh>
      <mesh position={[0, pa.thickness / 2000 + 0.012, 0]} castShadow>
        <boxGeometry args={[((x1 - x0) * 0.98) / 1000, 0.025, ((y1 - y0) * 0.6) / 1000]} />
        <meshStandardMaterial color={COLORS.sheet} roughness={1} />
      </mesh>
    </group>
  )
}

/** Wand als Quader-Stücke um Fenster- und Türöffnungen herum */
function wallPieces(p: Project, wall: WallId): OBB[] {
  const r = p.room
  const f = wallFrame(r, wall)
  const T0 = r.wallThickness
  const openings = p.wallObjects
    .filter((o) => o.wall === wall && (o.kind === 'fenster' || o.kind === 'tuer'))
    .map((o) => ({
      s0: o.offset,
      s1: o.offset + o.width,
      z0: o.kind === 'fenster' ? o.sillHeight : 0,
      z1: o.kind === 'fenster' ? o.sillHeight + o.height : o.height,
      nicheBelow: o.kind === 'fenster' && o.niche.below ? o.niche.belowDepth : 0,
    }))
  const stations = new Set<number>([0, f.length])
  for (const o of openings) {
    stations.add(Math.max(0, o.s0))
    stations.add(Math.min(f.length, o.s1))
  }
  const st = [...stations].sort((a, b) => a - b)
  const out: OBB[] = []
  const piece = (s0: number, s1: number, z0: number, z1: number, d0 = -T0, d1 = 0) => {
    if (s1 - s0 < 1 || z1 - z0 < 1) return
    const sm = (s0 + s1) / 2
    const dm = (d0 + d1) / 2
    out.push({
      center: { x: f.start.x + f.u.x * sm + f.n.x * dm, y: f.start.y + f.u.y * sm + f.n.y * dm, z: (z0 + z1) / 2 },
      axes: [f.u, f.n, { x: 0, y: 0, z: 1 }],
      half: [(s1 - s0) / 2, (d1 - d0) / 2, (z1 - z0) / 2],
    })
  }
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i]
    const b = st[i + 1]
    const mid = (a + b) / 2
    const o = openings.find((x) => mid > x.s0 && mid < x.s1)
    if (!o) piece(a, b, 0, r.height)
    else {
      if (o.nicheBelow > 0) piece(a, b, 0, o.z0, -T0, -o.nicheBelow)
      else piece(a, b, 0, o.z0)
      piece(a, b, o.z1, r.height)
    }
  }
  return out
}

function corniceGeometry(p: Project, wall: WallId): THREE.BufferGeometry | null {
  const c = cornice(p.room, wall)
  if (!c.enabled) return null
  const f = wallFrame(p.room, wall)
  const a = c.projection / 1000
  const h = c.height / 1000
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(a, 0)
  if (c.shape === 'kehle') {
    for (let i = 1; i <= 12; i++) {
      const t = (i / 12) * (Math.PI / 2)
      shape.lineTo(a - a * Math.sin(t), -h + h * Math.cos(t))
    }
  } else if (c.shape === 'schraege') shape.lineTo(0, -h)
  else {
    shape.lineTo(a, -h)
    shape.lineTo(0, -h)
  }
  shape.lineTo(0, 0)
  const g = new THREE.ExtrudeGeometry(shape, { depth: f.length / 1000, bevelEnabled: false })
  const n = vec(f.n)
  const u = vec(f.u)
  const m = new THREE.Matrix4().makeBasis(n, new THREE.Vector3(0, 1, 0), u)
  m.setPosition(T(f.start.x, f.start.y, p.room.height))
  g.applyMatrix4(m)
  return g
}

export function RoomMeshes({ p, mini, showCeiling }: { p: Project; mini?: boolean; showCeiling: boolean }) {
  const r = p.room
  const wallRefs = useRef<Partial<Record<WallId, THREE.Group>>>({})
  const walls = useMemo(() => Object.fromEntries(WALL_IDS.map((w) => [w, wallPieces(p, w)])) as Record<WallId, OBB[]>, [p.room, p.wallObjects])
  const cornices = useMemo(() => Object.fromEntries(WALL_IDS.map((w) => [w, corniceGeometry(p, w)])) as Record<WallId, THREE.BufferGeometry | null>, [p.room])
  const labelRefs = useRef<Partial<Record<WallId, HTMLDivElement>>>({})
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    camera.getWorldDirection(tmp)
    for (const id of WALL_IDS) {
      const g = wallRefs.current[id]
      if (!g) continue
      const n = vec(wallFrame(r, id).n)
      // Wände zwischen Kamera und Raum ausblenden (Puppenhaus), in der Ich-Perspektive alle zeigen
      g.visible = showCeiling || n.dot(tmp) < 0.3
      const label = labelRefs.current[id]
      if (label) label.style.display = g.visible ? '' : 'none'
    }
  })
  return (
    <group>
      <mesh position={T(r.length / 2, r.width / 2, -1)} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[r.length / 1000, r.width / 1000]} />
        <meshStandardMaterial color={COLORS.floor} roughness={0.9} />
      </mesh>
      {showCeiling && (
        <mesh position={T(r.length / 2, r.width / 2, r.height)} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[r.length / 1000, r.width / 1000]} />
          <meshStandardMaterial color={COLORS.ceiling} side={THREE.DoubleSide} />
        </mesh>
      )}
      {WALL_IDS.map((id) => (
        <group key={id} ref={(g) => void (wallRefs.current[id] = g ?? undefined)}>
          {walls[id].map((o, i) => (
            <Box key={i} o={o} color={COLORS.wall} cast={false} />
          ))}
          {cornices[id] && (
            <mesh geometry={cornices[id]!}>
              <meshStandardMaterial color={COLORS.stuck} side={THREE.DoubleSide} roughness={0.6} emissive="#9a968e" emissiveIntensity={0.35} />
            </mesh>
          )}
          {r.skirting.enabled && <Skirting p={p} wall={id} />}
          <WallObjects p={p} wall={id} />
          {!mini && <WallLabel p={p} wall={id} labelRef={(el) => void (labelRefs.current[id] = el ?? undefined)} />}
        </group>
      ))}
      <Rosettes p={p} />
      {!mini && <PlanPoche p={p} walls={walls} />}
    </group>
  )
}

/** Draufsicht: geschnittene Wände als dunkle Fläche auf Schnitthöhe */
function PlanPoche({ p, walls }: { p: Project; walls: Record<WallId, OBB[]> }) {
  const view = useStore((s) => s.view)
  const cut = useStore((s) => s.planCut)
  if (view.kind !== 'plan') return null
  const z = Math.min(cut, p.room.height) - 2
  return (
    <group>
      {WALL_IDS.flatMap((id) =>
        walls[id]
          .filter((o) => o.center.z - o.half[2] <= z && o.center.z + o.half[2] >= z)
          .map((o, i) => <Box key={`${id}-${i}`} o={{ ...o, center: { ...o.center, z: z - 1 }, half: [o.half[0], o.half[1], 1] }} color="#5d5850" cast={false} />),
      )}
    </group>
  )
}

function WallObjects({ p, wall }: { p: Project; wall: WallId }) {
  const r = p.room
  return (
    <>
      {p.wallObjects.filter((o) => o.wall === wall).map((o) => {
        if (o.kind === 'fenster') return <WindowMesh key={o.id} p={p} w={o} />
        if (o.kind === 'tuer') return <DoorMesh key={o.id} p={p} id={o.id} />
        if (o.kind === 'heizkoerper') {
          const f = wallFrame(r, o.wall)
          const box = boxFromWall(f, o.offset, o.offset + o.width, o.wallGap, o.wallGap + o.depth, o.bottom, o.bottom + o.height)
          return <Box key={o.id} o={box} color={COLORS.radiator} pick={{ kind: 'wallObject', id: o.id }} edges />
        }
        const f = wallFrame(r, o.wall)
        return <Box key={o.id} o={boxFromWall(f, o.offset, o.offset + o.width, 0, 12, o.bottom, o.bottom + o.height)} color="#ffffff" pick={{ kind: 'wallObject', id: o.id }} edges />
      })}
    </>
  )
}

function Rosettes({ p }: { p: Project }) {
  const r = p.room
  return (
    <group>
      {r.rosettes.map((ro) => (
        <group key={ro.id} userData={{ pick: { kind: 'rosette', id: ro.id } }}>
          <mesh position={T(ro.x, ro.y, r.height - ro.depth / 2)} userData={{ pick: { kind: 'rosette', id: ro.id } }}>
            <cylinderGeometry args={[ro.diameter / 2000, ro.diameter / 2000, ro.depth / 1000, 48]} />
            <meshStandardMaterial color={COLORS.stuck} />
          </mesh>
          {ro.lampDrop > 0 && (
            <>
              <Line points={[T(ro.x, ro.y, r.height), T(ro.x, ro.y, r.height - ro.lampDrop + Math.min(ro.lampDrop, ro.lampDiameter))]} color="#222" lineWidth={1} />
              <mesh position={T(ro.x, ro.y, r.height - ro.lampDrop + Math.min(ro.lampDrop, ro.lampDiameter) / 2)} userData={{ pick: { kind: 'rosette', id: ro.id } }} castShadow>
                <cylinderGeometry args={[ro.lampDiameter / 2000, ro.lampDiameter / 2000, Math.min(ro.lampDrop, ro.lampDiameter) / 1000, 32, 1, true]} />
                <meshStandardMaterial color="#3b2f28" side={THREE.DoubleSide} roughness={0.9} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  )
}

function boxFromWall(f: ReturnType<typeof wallFrame>, s0: number, s1: number, d0: number, d1: number, z0: number, z1: number): OBB {
  const sm = (s0 + s1) / 2
  const dm = (d0 + d1) / 2
  return {
    center: { x: f.start.x + f.u.x * sm + f.n.x * dm, y: f.start.y + f.u.y * sm + f.n.y * dm, z: (z0 + z1) / 2 },
    axes: [f.u, f.n, { x: 0, y: 0, z: 1 }],
    half: [Math.abs(s1 - s0) / 2, Math.abs(d1 - d0) / 2, Math.abs(z1 - z0) / 2],
  }
}

function Skirting({ p, wall }: { p: Project; wall: WallId }) {
  const f = wallFrame(p.room, wall)
  const doors = p.wallObjects.filter((o) => o.kind === 'tuer' && o.wall === wall).sort((a, b) => a.offset - b.offset)
  const spans: [number, number][] = []
  let s = 0
  for (const d of doors) {
    if (d.offset > s) spans.push([s, d.offset])
    s = d.offset + d.width
  }
  if (s < f.length) spans.push([s, f.length])
  return (
    <>
      {spans.map(([a, b], i) => (
        <Box key={i} o={boxFromWall(f, a, b, 0, p.room.skirting.depth, 0, p.room.skirting.height)} color="#f3eee6" cast={false} edges />
      ))}
    </>
  )
}

function WallLabel({ p, wall, labelRef }: { p: Project; wall: WallId; labelRef: (el: HTMLDivElement | null) => void }) {
  const show = useStore((s) => s.layers.labels)
  const f = wallFrame(p.room, wall)
  if (!show) return null
  const pos = T(f.start.x + f.u.x * f.length / 2 + f.n.x * 250, f.start.y + f.u.y * f.length / 2 + f.n.y * 250, 5)
  return (
    <Html position={pos} center className="wall-label" zIndexRange={[10, 0]} ref={labelRef}>
      Wand {wall}
    </Html>
  )
}

function WindowMesh({ p, w }: { p: Project; w: WindowObj }) {
  const f = wallFrame(p.room, w.wall)
  const frameD0 = -w.revealDepth - 70
  const frameD1 = -w.revealDepth
  const fw = w.frameWidth
  const parts: OBB[] = [
    boxFromWall(f, w.offset, w.offset + w.width, frameD0, frameD1, w.sillHeight, w.sillHeight + fw),
    boxFromWall(f, w.offset, w.offset + w.width, frameD0, frameD1, w.sillHeight + w.height - fw, w.sillHeight + w.height),
    boxFromWall(f, w.offset, w.offset + fw, frameD0, frameD1, w.sillHeight, w.sillHeight + w.height),
    boxFromWall(f, w.offset + w.width - fw, w.offset + w.width, frameD0, frameD1, w.sillHeight, w.sillHeight + w.height),
  ]
  const sashes = windowSashes(p.room, w)
  return (
    <group>
      {parts.map((o, i) => (
        <Box key={i} o={o} color={COLORS.frame} pick={{ kind: 'wallObject', id: w.id }} cast={false} />
      ))}
      {w.sill.enabled && (
        <Box
          o={boxFromWall(f, w.offset - w.sill.sideOverhang, w.offset + w.width + w.sill.sideOverhang, -w.revealDepth, w.sill.projection, w.sillHeight - w.sill.thickness, w.sillHeight)}
          color="#e2ddd2"
          pick={{ kind: 'wallObject', id: w.id }}
          edges
        />
      )}
      {sashes.map((g, i) => {
        const angle = w.sashes[i].opening === 'fest' || w.sashes[i].opening === 'kipp' ? 0 : w.displayAngle
        const [sash, handle] = sashBoxes(g, angle, 0)
        return (
          <group key={i}>
            <Box o={sash} color={COLORS.glass} opacity={0.45} pick={{ kind: 'wallObject', id: w.id }} cast={false} />
            <Box o={{ ...sash, half: [sash.half[0], sash.half[1] + 2, sash.half[2]] }} color={COLORS.frame} opacity={0.0} edges cast={false} />
            <Box o={handle} color="#d9d9d9" cast={false} />
          </group>
        )
      })}
    </group>
  )
}

function DoorMesh({ p, id }: { p: Project; id: string }) {
  const d = p.wallObjects.find((o) => o.id === id)
  if (!d || d.kind !== 'tuer') return null
  const g = doorGeom(p.room, d)
  const r = (d.displayAngle * Math.PI) / 180
  const dir = { x: g.e.x * Math.cos(r) + g.n.x * Math.sin(r), y: g.e.y * Math.cos(r) + g.n.y * Math.sin(r), z: 0 }
  const side = { x: -dir.y, y: dir.x, z: 0 }
  const o: OBB = { center: { x: g.hinge.x + dir.x * g.width / 2 + g.n.x * 20 * Math.cos(r), y: g.hinge.y + dir.y * g.width / 2 + g.n.y * 20 * Math.cos(r), z: g.height / 2 }, axes: [dir, side, { x: 0, y: 0, z: 1 }], half: [g.width / 2 - 5, 20, g.height / 2 - 5] }
  return <Box o={o} color="#f7f5f0" pick={{ kind: 'wallObject', id }} edges />
}

export function FurnitureMeshes({ items, mini }: { items: Furniture[]; mini?: boolean }) {
  const layers = useStore((s) => s.layers)
  const sel = useStore((s) => s.selection)
  return (
    <group>
      {items.map((fu) => {
        const person = fu.kind.startsWith('person')
        if (person && !layers.persons) return null
        if (!person && !layers.furniture) return null
        const highlight = !mini && sel?.id === fu.id ? COLORS.select : undefined
        if (person) return <PersonFigure key={fu.id} fu={fu} highlight={highlight} />
        return <Box key={fu.id} o={furnitureBox(fu)} color={COLORS.furniture} opacity={0.8} pick={{ kind: 'furniture', id: fu.id }} edges highlight={highlight} />
      })}
    </group>
  )
}

function PersonFigure({ fu, highlight }: { fu: Furniture; highlight?: string }) {
  const h = fu.sz / 1000
  const sitting = fu.kind === 'person-sitzend'
  const c = T(fu.x + fu.sx / 2, fu.y + fu.sy / 2, fu.z)
  const color = highlight ?? COLORS.person
  const pick = { pick: { kind: 'furniture', id: fu.id } }
  const head = h * 0.13
  return (
    <group position={c} userData={pick}>
      {!sitting && (
        <mesh position={[0, h * 0.24, 0]} userData={pick} castShadow>
          <capsuleGeometry args={[h * 0.07, h * 0.32, 6, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {sitting && (
        <mesh position={[0, h * 0.13, h * 0.1]} rotation={[Math.PI / 2, 0, 0]} userData={pick} castShadow>
          <capsuleGeometry args={[h * 0.07, h * 0.2, 6, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      <mesh position={[0, (sitting ? h * 0.42 : h * 0.62), 0]} userData={pick} castShadow>
        <capsuleGeometry args={[h * 0.1, h * 0.22, 6, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, sitting ? h * 0.62 : h - head / 2 - 0.01, 0]} userData={pick} castShadow>
        <sphereGeometry args={[head / 2, 20, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  )
}

/** Schwenkbögen der Fensterflügel: grün bis zum freien Winkel, rot bis 90° */
export function SwingArcs({ p, d }: { p: Project; d: Derived }) {
  const show = useStore((s) => s.layers.swing)
  if (!show) return null
  const out: ReactElement[] = []
  for (const w of p.wallObjects) {
    if (w.kind !== 'fenster') continue
    windowSashes(p.room, w).forEach((g, i) => {
      if (g.opening === 'fest' || g.opening === 'kipp') return
      const res = d.analysis.windows.find((x) => x.windowId === w.id && x.sashIndex === i)
      const max = Math.min(90, res?.maxAngle ?? 90)
      const z = g.hinge.z + g.height - 20
      const arc = (a0: number, a1: number) => {
        const pts: THREE.Vector3[] = [T(g.hinge.x, g.hinge.y, z)]
        for (let a = a0; a <= a1 + 0.01; a += 3) {
          const r = (a * Math.PI) / 180
          pts.push(T(g.hinge.x + (g.e.x * Math.cos(r) + g.n.x * Math.sin(r)) * g.width, g.hinge.y + (g.e.y * Math.cos(r) + g.n.y * Math.sin(r)) * g.width, z))
        }
        pts.push(T(g.hinge.x, g.hinge.y, z))
        return pts
      }
      out.push(<Line key={`${w.id}-${i}-ok`} points={arc(0, max)} color="#2f9e5b" lineWidth={2} />)
      if (max < 90) out.push(<Line key={`${w.id}-${i}-no`} points={arc(max, 90)} color="#d64545" lineWidth={2} dashed dashSize={0.04} gapSize={0.03} />)
    })
  }
  return <group>{out}</group>
}

/** Maßlinien für den Freiraum unter und über dem Bett */
export function ClearanceMarks({ p, d }: { p: Project; d: Derived }) {
  const show = useStore((s) => s.layers.labels)
  if (!show) return null
  return (
    <group>
      {p.assemblies.map((a) => {
        const info = d.resolved.beds.get(a.id)
        const c = d.analysis.clearances.find((x) => x.assemblyId === a.id)
        if (!info || !c) return null
        const fp = info.footprint
        const front = { x: (fp[2].x + fp[3].x) / 2, y: (fp[2].y + fp[3].y) / 2 }
        const mid = { x: fp.reduce((s, q) => s + q.x, 0) / 4, y: fp.reduce((s, q) => s + q.y, 0) / 4 }
        const pt = { x: front.x + (front.x - mid.x) * 0.15, y: front.y + (front.y - mid.y) * 0.15 }
        const top = info.mattressTop + c.headroom
        return (
          <group key={a.id}>
            <Line points={[T(pt.x, pt.y, 0), T(pt.x, pt.y, info.underside)]} color="#2a6fdb" lineWidth={1.5} />
            <Html position={T(pt.x, pt.y, info.underside / 2)} center className="dim-label" zIndexRange={[10, 0]}>
              ↕ {fmtM(info.underside)} frei
            </Html>
            <Line points={[T(mid.x, mid.y, info.mattressTop), T(mid.x, mid.y, top)]} color="#2a6fdb" lineWidth={1.5} dashed dashSize={0.05} gapSize={0.03} />
            <Html position={T(mid.x, mid.y, (info.mattressTop + top) / 2)} center className="dim-label" zIndexRange={[10, 0]}>
              ↕ {fmtM(c.headroom)} Kopfraum
            </Html>
          </group>
        )
      })}
    </group>
  )
}

export function JointMarkers({ d }: { d: Derived }) {
  const show = useStore((s) => s.layers.joints)
  const sel = useStore((s) => s.selection)
  const joints = d.resolved.joints.filter((j) => show || (sel && (j.a === sel.id || j.b === sel.id)))
  return (
    <group>
      {joints.map((j) => (
        <mesh key={j.key} position={T(j.pos.x, j.pos.y, j.pos.z)} userData={{ pick: { kind: 'joint', id: j.key } }}>
          <sphereGeometry args={[0.022, 12, 10]} />
          <meshStandardMaterial color={j.kind === 'kreuzung' ? '#d64545' : j.kind === 'auflage' ? '#2f9e5b' : '#2a6fdb'} emissive="#111" />
        </mesh>
      ))}
    </group>
  )
}

/** Griffe an den Enden eines frei gezeichneten Stabs und editierbare Länge */
export function MemberHandles({ p }: { p: Project }) {
  const sel = useStore((s) => s.selection)
  const update = useStore((s) => s.update)
  const [editing, setEditing] = useState(false)
  const m = sel?.kind === 'member' ? p.members.find((x) => x.id === sel.id) : undefined
  if (!m) return null
  const L = Math.hypot(m.end.x - m.start.x, m.end.y - m.start.y, m.end.z - m.start.z)
  const mid = T((m.start.x + m.end.x) / 2, (m.start.y + m.end.y) / 2, (m.start.z + m.end.z) / 2 + m.h / 2 + 60)
  const setLength = (v: number) =>
    update((d) => {
      const x = d.members.find((y) => y.id === m.id)
      if (!x || L < 1) return
      const k = v / L
      x.end = { x: Math.round(x.start.x + (x.end.x - x.start.x) * k), y: Math.round(x.start.y + (x.end.y - x.start.y) * k), z: Math.round(x.start.z + (x.end.z - x.start.z) * k) }
    })
  return (
    <group>
      {(['start', 'end'] as const).map((end) => (
        <mesh key={end} position={T(m[end].x, m[end].y, m[end].z)} userData={{ pick: { kind: 'handle', id: m.id, end } }}>
          <sphereGeometry args={[0.035, 16, 12]} />
          <meshStandardMaterial color="#ff8a3d" emissive="#ff8a3d" emissiveIntensity={0.4} depthTest={false} transparent opacity={0.9} />
        </mesh>
      ))}
      <Html position={mid} center zIndexRange={[20, 0]}>
        {editing ? (
          <input
            className="len-input"
            autoFocus
            defaultValue={(L / 10).toFixed(1).replace('.', ',')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = Number((e.target as HTMLInputElement).value.replace(',', '.'))
                if (Number.isFinite(v) && v > 1) setLength(Math.round(v * 10))
                setEditing(false)
              }
              if (e.key === 'Escape') setEditing(false)
            }}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <button className="len-label" onClick={() => setEditing(true)} title="Länge eingeben">
            {fmtCm(L)} ✎
          </button>
        )}
      </Html>
    </group>
  )
}

export function FootprintShadows({ d }: { d: Derived }) {
  // Leiter-/Treppenfläche leicht markieren
  return (
    <group>
      {[...d.resolved.beds.values()].map((b, i) =>
        b.ladderFootprint ? (
          <mesh key={i} position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <shapeGeometry args={[new THREE.Shape(b.ladderFootprint.map((q) => new THREE.Vector2(q.x / 1000, q.y / 1000)))]} />
            <meshBasicMaterial color="#2a6fdb" transparent opacity={0.08} side={THREE.DoubleSide} />
          </mesh>
        ) : null,
      )}
    </group>
  )
}

export function SceneContent({ p, d, mini, showCeiling }: { p: Project; d: Derived; mini?: boolean; showCeiling: boolean }) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#fffaf0', '#b9a58a', 0.55]} />
      <directionalLight
        position={T(p.room.length * 0.2, -p.room.width * 0.3, p.room.height * 2.2)}
        intensity={1.25}
        castShadow={!mini}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0005}
      />
      <RoomMeshes p={p} mini={mini} showCeiling={showCeiling} />
      <MemberMeshes members={d.resolved.members} mini={mini} />
      <PanelMeshes panels={d.resolved.panels} mini={mini} />
      <FurnitureMeshes items={p.furniture} mini={mini} />
      {!mini && <SwingArcs p={p} d={d} />}
      {!mini && <ClearanceMarks p={p} d={d} />}
      {!mini && <JointMarkers d={d} />}
      {!mini && <FootprintShadows d={d} />}
      {!mini && <MemberHandles p={p} />}
      {!mini && <StaticsShapes />}
    </>
  )
}
