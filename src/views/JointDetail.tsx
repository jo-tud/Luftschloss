import { Edges, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { catalogItem } from '../model/catalog'
import { add, dot, fmtCm, memberAxes, memberLength, norm, scale, sub, v } from '../model/geometry'
import { JOINT_KIND_LABEL, jointType, typesForKind } from '../model/joints'
import type { DetectedJoint } from '../model/resolve'
import type { Member, Vec3 } from '../model/types'
import { useDerived, useStore } from '../state/store'

/** Ausschnitt eines Stabs rund um den Knoten (±range entlang der Achse) */
function clipMember(m: Member, center: Vec3, range: number): { s: Vec3; e: Vec3 } {
  const L = memberLength(m)
  const [ax] = memberAxes(m)
  const t = dot(sub(center, m.start), ax)
  const a = Math.max(0, t - range)
  const b = Math.min(L, t + range)
  return { s: add(m.start, scale(ax, a)), e: add(m.start, scale(ax, b)) }
}

function PieceMesh({ m, seg, offset, color }: { m: Member; seg: { s: Vec3; e: Vec3 }; offset: React.MutableRefObject<THREE.Vector3>; color: string }) {
  const ref = useRef<THREE.Group>(null)
  const geo = useMemo(() => {
    const [ax, hb, hh] = memberAxes(m)
    const len = Math.hypot(seg.e.x - seg.s.x, seg.e.y - seg.s.y, seg.e.z - seg.s.z)
    const c = { x: (seg.s.x + seg.e.x) / 2, y: (seg.s.y + seg.e.y) / 2, z: (seg.s.z + seg.e.z) / 2 }
    const toT = (q: Vec3) => new THREE.Vector3(q.x, q.z, -q.y)
    const a1 = toT(hb)
    const a0 = toT(ax)
    const a2 = toT(hh)
    const fix = new THREE.Vector3().crossVectors(a2, a0).dot(a1) < 0 ? a1.clone().negate() : a1
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(a0, fix, a2))
    return { pos: toT(c).multiplyScalar(0.001), q, size: [len / 1000, m.b / 1000, m.h / 1000] as [number, number, number] }
  }, [m, seg])
  useFrame(() => {
    if (ref.current) ref.current.position.copy(geo.pos).add(offset.current)
  })
  return (
    <group ref={ref} quaternion={geo.q}>
      <mesh castShadow receiveShadow>
        {m.round ? <cylinderGeometry args={[geo.size[1] / 2, geo.size[1] / 2, geo.size[0], 24]} /> : <boxGeometry args={geo.size} />}
        <meshStandardMaterial color={color} roughness={0.8} />
        {!m.round && <Edges color="#6b5136" />}
      </mesh>
    </group>
  )
}

/** Schematische Beschläge je Verbindungstyp */
function Hardware({ typeId, j, ending, through }: { typeId: string; j: DetectedJoint; ending?: Member; through?: Member }) {
  const toT = (q: Vec3) => new THREE.Vector3(q.x, q.z, -q.y).multiplyScalar(0.001)
  const steel = <meshStandardMaterial color="#8e959e" metalness={0.6} roughness={0.35} />
  const p = toT(j.pos)
  const [axE] = ending ? memberAxes(ending) : [v(1, 0, 0)]
  const [axT] = through ? memberAxes(through) : [v(0, 0, 1)]
  // Richtung durch beide Hölzer (Bolzen): senkrecht zu beiden Achsen
  const across = norm(v(axE.y * axT.z - axE.z * axT.y, axE.z * axT.x - axE.x * axT.z, axE.x * axT.y - axE.y * axT.x))
  const dir = toT(scale(across.x || across.y || across.z ? across : v(0, 1, 0), 1000)).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  if (typeId === 'schlossschraube' || typeId === 'gewindestange' || typeId === 'bettschraube') {
    const up = toT(scale(norm(axT), 1000)).normalize().multiplyScalar(0.035)
    return (
      <group>
        {[-1, 1].map((k) => (
          <mesh key={k} position={p.clone().add(up.clone().multiplyScalar(k))} quaternion={q}>
            <cylinderGeometry args={[0.005, 0.005, 0.22, 12]} />
            {steel}
          </mesh>
        ))}
      </group>
    )
  }
  if (typeId === 'holzbauschraube' || typeId === 'auflage' || typeId === 'lose' || typeId === 'kopfband') {
    const vdir = new THREE.Vector3(0, 1, 0)
    return (
      <group>
        {[-0.02, 0.02].map((k) => (
          <mesh key={k} position={p.clone().add(new THREE.Vector3(k, 0, 0))} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vdir)}>
            <cylinderGeometry args={[0.004, 0.004, 0.16, 10]} />
            {steel}
          </mesh>
        ))}
      </group>
    )
  }
  if (typeId === 'winkel' || typeId === 'balkenschuh') {
    return (
      <group position={p}>
        <mesh position={[0, -0.045, 0.0]}>
          <boxGeometry args={[0.09, 0.0025, 0.065]} />
          {steel}
        </mesh>
        <mesh position={[0, 0, -0.033]}>
          <boxGeometry args={[0.09, 0.09, 0.0025]} />
          {steel}
        </mesh>
      </group>
    )
  }
  return null
}

function DetailScene({ j, ending, through, typeId }: { j: DetectedJoint; ending?: Member; through?: Member; typeId: string }) {
  const offset = useRef(new THREE.Vector3())
  const t0 = useRef(performance.now())
  useFrame(() => {
    // Teile langsam auseinander- und wieder zusammenfahren
    const t = (performance.now() - t0.current) / 1000
    const k = (Math.sin(t * 1.3) + 1) / 2
    if (ending) {
      const [ax] = memberAxes(ending)
      const sign = dot(sub(ending.start, j.pos), ax) < 0 && dot(sub(ending.end, j.pos), ax) > 0 ? 1 : Math.sign(dot(sub(midpoint(ending), j.pos), ax)) || 1
      const dirT = new THREE.Vector3(ax.x, ax.z, -ax.y).multiplyScalar(sign * 0.09 * k)
      if (j.kind === 'auflage') offset.current.set(0, 0.07 * k, 0)
      else offset.current.copy(dirT)
    } else offset.current.set(0, 0.07 * k, 0)
  })
  const zero = useRef(new THREE.Vector3())
  const center = new THREE.Vector3(j.pos.x, j.pos.z, -j.pos.y).multiplyScalar(0.001)
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[center.x + 1, center.y + 2, center.z + 1.5]} intensity={1.2} />
      <OrbitControls target={center} makeDefault />
      {through && <PieceMesh m={through} seg={clipMember(through, j.pos, 260)} offset={zero} color="#dcb27c" />}
      {ending && <PieceMesh m={ending} seg={clipMember(ending, j.pos, 260)} offset={offset} color="#e8c895" />}
      <Hardware typeId={typeId} j={j} ending={ending} through={through} />
    </>
  )
}

function midpoint(m: Member): Vec3 {
  return v((m.start.x + m.end.x) / 2, (m.start.y + m.end.y) / 2, (m.start.z + m.end.z) / 2)
}

export function JointDetailDialog() {
  const key = useStore((s) => s.jointDetail)
  const set = useStore((s) => s.set)
  const update = useStore((s) => s.update)
  const d = useDerived()
  if (!key) return null
  const j = d.resolved.joints.find((x) => x.key === key)
  if (!j) return null
  const byId = new Map(d.resolved.members.map((m) => [m.id, m]))
  const a = byId.get(j.a)
  const b = byId.get(j.b)
  const ending = j.ending ? byId.get(j.ending) : a
  const through = ending === a ? b : a
  const jt = jointType(j.typeId)
  const center = j.pos
  const cam = new THREE.Vector3(center.x / 1000 + 0.5, center.z / 1000 + 0.35, -center.y / 1000 + 0.5)
  return (
    <div className="modal-bg" onClick={() => set({ jointDetail: null })}>
      <div className="modal joint-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>
            {JOINT_KIND_LABEL[j.kind]}: {ending?.name} ↔ {through?.name}
          </h2>
          <button className="close" onClick={() => set({ jointDetail: null })}>
            ✕
          </button>
        </header>
        <div className="joint-body">
          <div className="joint-canvas">
            <Canvas camera={{ position: cam.toArray(), fov: 40, near: 0.01, far: 20 }}>
              <color attach="background" args={['#f4f5f7']} />
              <DetailScene j={j} ending={ending} through={through} typeId={j.typeId} />
            </Canvas>
            <span className="hint">Ziehen = drehen · Mausrad = zoomen</span>
          </div>
          <div className="joint-info">
            <label className="field">
              <span>Verbindung</span>
              <select
                value={j.typeId}
                onChange={(e) =>
                  update((dd) => {
                    const x = dd.joints.find((y) => y.key === j.key)
                    if (x) x.typeId = e.target.value
                    else dd.joints.push({ key: j.key, typeId: e.target.value })
                  })
                }
              >
                {typesForKind(j.kind).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                {!typesForKind(j.kind).some((t) => t.id === j.typeId) && <option value={j.typeId}>{jt?.name ?? j.typeId}</option>}
              </select>
            </label>
            {jt && (
              <>
                <p>{jt.note}</p>
                <p>
                  <b>Schwierigkeit:</b> {'●'.repeat(jt.difficulty)}
                  {'○'.repeat(3 - jt.difficulty)} · {jt.removable ? 'zerlegbar' : 'fest'} · wirkt {jt.stiffness}
                </p>
                <p>
                  <b>Werkzeug:</b> {jt.tools.join(', ')}
                </p>
                {jt.hardware.length > 0 && (
                  <p>
                    <b>Material je Verbindung:</b> {jt.hardware.map((h) => `${h.qty} × ${catalogItem(h.id)?.name ?? h.id}`).join(', ')}
                  </p>
                )}
                {jt.residualSection < 1 && <p className="hint">Restquerschnitt an der Verbindung ca. {Math.round(jt.residualSection * 100)} %.</p>}
              </>
            )}
            <p className="hint">
              {ending?.name}: {ending ? `${catalogItem(ending.catalogId)?.name ?? ''}, Länge ${fmtCm(memberLength(ending))}` : ''}
              <br />
              {through?.name}: {through ? `${catalogItem(through.catalogId)?.name ?? ''}, Länge ${fmtCm(memberLength(through))}` : ''}
            </p>
            <p className="hint">Maßzeichnungen für die Werkstatt folgen im Bauplan.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
