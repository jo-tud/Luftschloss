import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { catalogItem } from '../model/catalog'
import { fmtCm, memberLength, type OBB } from '../model/geometry'
import { clipBoxesNear, jointCuts, jointFrame, jointViewDir, memberSolids, type Prism } from '../model/joinery'
import { JOINT_KIND_LABEL, jointType, typesForKind } from '../model/joints'
import type { DetectedJoint } from '../model/resolve'
import type { Member } from '../model/types'
import { useDerived, useStore } from '../state/store'
import { t, tr } from '../i18n'
import { hardwareInstances } from './hardware'
import { woodKindFor } from './materials'
import { Box, COLORS, HoleDisc, PrismMesh, headGeo, metal, nutGeo, pinMat, plateGeo, pocketMat, washerGeo } from './Scene'

/** Beschläge einer Verbindung als Instanzen, wie in der 3D-Ansicht, dazu Schäfte und Dübel */
function useHardware(key: string) {
  const d = useDerived()
  return useMemo(() => {
    const h = hardwareInstances(d.resolved, { only: key, rods: true })
    const make = (geo: THREE.BufferGeometry, list: THREE.Matrix4[], mat: THREE.Material) => {
      if (!list.length) return null
      const im = new THREE.InstancedMesh(geo, mat, list.length)
      list.forEach((m, i) => im.setMatrixAt(i, m))
      im.castShadow = true
      return im
    }
    const fixed = [
      make(headGeo, h.heads, metal),
      make(washerGeo, h.washers, metal),
      make(nutGeo, h.nuts, metal),
      make(plateGeo, h.plates, metal),
      make(washerGeo, h.pockets, pocketMat),
      make(washerGeo, h.screws, metal),
      make(washerGeo, h.rods, metal),
      make(washerGeo, h.pins, pinMat),
    ].filter(Boolean) as THREE.InstancedMesh[]
    const moving = [make(washerGeo, h.dowels, pinMat)].filter(Boolean) as THREE.InstancedMesh[]
    return { fixed, moving }
  }, [d, key])
}

function Pieces({ m, boxes, prisms, color }: { m: Member; boxes: OBB[]; prisms: Prism[]; color: string }) {
  const wood = catalogItem(m.catalogId)?.kind === 'beschlag' ? undefined : woodKindFor(m.catalogId)
  return (
    <>
      {boxes.map((o, i) => (
        <Box key={i} o={o} color={m.round ? '#9aa1aa' : color} edges={!m.round} round={m.round} wood={wood} />
      ))}
      {prisms.map((p, i) => (
        <PrismMesh key={`p${i}`} m={m} prism={p} color={color} />
      ))}
    </>
  )
}

function DetailScene({ j, ending, through }: { j: DetectedJoint; ending?: Member; through?: Member }) {
  const d = useDerived()
  const moving = useRef<THREE.Group>(null)
  const t0 = useRef(performance.now())
  const byId = useMemo(() => new Map(d.resolved.members.map((m) => [m.id, m])), [d])
  const A = byId.get(j.a)
  const B = byId.get(j.b)
  const frame = useMemo(() => (A && B ? jointFrame(j, A, B) : undefined), [j, A, B])
  const cuts = useMemo(() => jointCuts(j, byId), [j, byId])
  const hw = useHardware(j.key)
  // Teile langsam auseinander- und wieder zusammenfahren: E bewegt sich von T weg
  const dir = frame ? new THREE.Vector3(frame.into.x, frame.into.z, -frame.into.y) : new THREE.Vector3(0, 1, 0)
  useFrame(() => {
    const t = (performance.now() - t0.current) / 1000
    const k = (Math.sin(t * 1.1 - Math.PI / 2) + 1) / 2
    if (moving.current) moving.current.position.copy(dir).multiplyScalar(0.11 * k)
  })
  const center = new THREE.Vector3(j.pos.x, j.pos.z, -j.pos.y).multiplyScalar(0.001)
  const E = frame?.E ?? ending
  const Tm = frame?.T ?? through
  const piece = (m: Member | undefined, color: string) => {
    if (!m) return null
    const mc = cuts?.members.get(m.id)
    const sol = memberSolids(m, mc)
    return <Pieces m={m} boxes={clipBoxesNear(sol.boxes, j.pos, 260)} prisms={sol.prisms} color={color} />
  }
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#fffaf0', '#b9a58a', 0.5]} />
      <directionalLight position={[center.x + 1, center.y + 2, center.z + 1.5]} intensity={1.3} castShadow />
      <directionalLight position={[center.x - 1.5, center.y + 0.5, center.z - 1]} intensity={0.35} />
      <OrbitControls target={center} makeDefault />
      {piece(Tm, COLORS.wood)}
      {cuts?.extras.map((o, i) => (
        <Box key={`x${i}`} o={o} color={COLORS.woodLight} edges wood="latte" />
      ))}
      {cuts?.holes.map((h, i) => (
        <HoleDisc key={`h${i}`} at={h.at} normal={h.normal} r={h.r} />
      ))}
      {hw.fixed.map((m, i) => (
        <primitive key={`f${i}`} object={m} />
      ))}
      <group ref={moving}>
        {piece(E, COLORS.woodLight)}
        {hw.moving.map((m, i) => (
          <primitive key={`m${i}`} object={m} />
        ))}
      </group>
    </>
  )
}

function stiffnessLabel(s: 'gelenkig' | 'halbsteif' | 'steif'): string {
  return s === 'gelenkig' ? t('gelenkig') : s === 'halbsteif' ? t('halbsteif') : t('steif')
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
  const fr = a && b ? jointFrame(j, a, b) : undefined
  // Blick schräg von der Seite, aus der die Verbindung am besten zu sehen ist
  const look = jointViewDir(fr)
  const ln = Math.hypot(look.x, look.y, look.z) || 1
  const cam = new THREE.Vector3(j.pos.x + (look.x / ln) * 650, j.pos.z + (look.z / ln) * 650, -(j.pos.y + (look.y / ln) * 650)).multiplyScalar(0.001)
  return (
    <div className="modal-bg" onClick={() => set({ jointDetail: null })}>
      <div className="modal joint-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>
            {tr(JOINT_KIND_LABEL[j.kind])}: {tr(ending?.name ?? '')} ↔ {tr(through?.name ?? '')}
          </h2>
          <button className="close" onClick={() => set({ jointDetail: null })}>
            ✕
          </button>
        </header>
        <div className="joint-body">
          <div className="joint-canvas">
            <Canvas key={j.key} shadows camera={{ position: cam.toArray(), fov: 40, near: 0.01, far: 20 }}>
              <color attach="background" args={['#f4f5f7']} />
              <DetailScene key={`${j.key}|${j.typeId}`} j={j} ending={ending} through={through} />
            </Canvas>
            <span className="hint">{t('Ziehen = drehen · Mausrad = zoomen')}</span>
          </div>
          <div className="joint-info">
            <label className="field">
              <span>{t('Verbindung')}</span>
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
                {typesForKind(j.kind).map((ty) => (
                  <option key={ty.id} value={ty.id}>
                    {tr(ty.name)}
                  </option>
                ))}
                {!typesForKind(j.kind).some((ty) => ty.id === j.typeId) && <option value={j.typeId}>{jt ? tr(jt.name) : j.typeId}</option>}
              </select>
            </label>
            {jt && (
              <>
                <p>{tr(jt.note)}</p>
                <p>
                  <b>{t('Schwierigkeit:')}</b> {'●'.repeat(jt.difficulty)}
                  {'○'.repeat(3 - jt.difficulty)} · {jt.removable ? t('zerlegbar') : t('fest')} · {t('wirkt {s}', { s: stiffnessLabel(jt.stiffness) })}
                </p>
                <p>
                  <b>{t('Werkzeug:')}</b> {jt.tools.map((x) => tr(x)).join(', ')}
                </p>
                {jt.hardware.length > 0 && (
                  <p>
                    <b>{t('Material je Verbindung:')}</b> {jt.hardware.map((h) => `${h.qty} × ${tr(catalogItem(h.id)?.name ?? h.id)}`).join(', ')}
                  </p>
                )}
                {jt.residualSection < 1 && <p className="hint">{t('Restquerschnitt an der Verbindung ca. {p} %.', { p: Math.round(jt.residualSection * 100) })}</p>}
              </>
            )}
            <p className="hint">
              {tr(ending?.name ?? '')}: {ending ? t('{item}, Länge {len}', { item: tr(catalogItem(ending.catalogId)?.name ?? ''), len: fmtCm(memberLength(ending)) }) : ''}
              <br />
              {tr(through?.name ?? '')}: {through ? t('{item}, Länge {len}', { item: tr(catalogItem(through.catalogId)?.name ?? ''), len: fmtCm(memberLength(through)) }) : ''}
            </p>
            <p className="hint">{t('Die Werkstattskizze mit Maßen steht im Bauplan unter „Verbindungen“.')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
