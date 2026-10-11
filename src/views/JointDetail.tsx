import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { catalogItem } from '../model/catalog'
import { fmtCm, memberLength, type OBB } from '../model/geometry'
import { assemblyDir, clipBoxesNear, jointCuts, jointFrame, jointViewDir, memberSolids, type Prism } from '../model/joinery'
import { JOINT_KIND_LABEL, jointType } from '../model/joints'
import { assemblyHint, DrillHelp, JointEffortInfo, JointGuide, JointMaterial } from '../ui/JointGuide'
import { jointDrawings, jointPlan } from '../model/jointPlan'
import { printTemplate, WorkDrawing } from '../ui/WorkDrawing'
import type { GuideStep } from '../model/jointGuide'
import { HOLD, progressAt, stepTimes, timeline } from '../model/jointTimeline'
import { Ico } from '../ui/icons'
import { Pause, Play } from 'lucide-react'
import { jointFasteners, type Fastener } from '../model/fasteners'
import { add, norm, scale, sub, v } from '../model/geometry'
import type { Vec3 } from '../model/types'
import { JointTypeSelect } from '../ui/JointTypeSelect'
import type { DetectedJoint } from '../model/resolve'
import type { Member } from '../model/types'
import { useDerived, useStore } from '../state/store'
import { t, tr } from '../i18n'
import { fastenerInstances, type HardwareLists } from './hardware'
import { woodKindFor } from './materials'
import { Box, COLORS, HoleDisc, PrismMesh, headGeo, metal, nutGeo, pinMat, plateGeo, pocketMat, washerGeo } from './Scene'
import { reducedMotion } from './motion'

/** Instanzen einer Liste, als fertige Meshes (werden beim Wechsel freigegeben) */
function meshes(h: HardwareLists): THREE.InstancedMesh[] {
  const make = (geo: THREE.BufferGeometry, list: THREE.Matrix4[], mat: THREE.Material) => {
    if (!list.length) return null
    const im = new THREE.InstancedMesh(geo, mat, list.length)
    list.forEach((m, i) => im.setMatrixAt(i, m))
    im.castShadow = true
    return im
  }
  return [
    make(headGeo, h.heads, metal),
    make(washerGeo, h.washers, metal),
    make(nutGeo, h.nuts, metal),
    make(plateGeo, h.plates, metal),
    make(washerGeo, h.pockets, pocketMat),
    make(washerGeo, h.screws, metal),
    make(washerGeo, h.rods, metal),
    make(washerGeo, h.pins, pinMat),
    make(washerGeo, h.dowels, pinMat),
  ].filter(Boolean) as THREE.InstancedMesh[]
}

/** Fortschritt innerhalb eines Fensters [a, b] von k */
const win = (k: number, a: number, b: number) => Math.min(1, Math.max(0, (k - a) / (b - a)))

interface Mover {
  meshes: THREE.InstancedMesh[]
  /** Anflug aus dieser Lage (mm, Modellkoordinaten), am Ziel 0 */
  from: Vec3
  phase: 'vorher' | 'befestigen'
  chunk: number
  win: [number, number]
}

export interface StepClock {
  t: number
  playing: boolean
  /** anhalten, sobald t diese Zeit erreicht (ein einzelner Schritt wird abgespielt) */
  stopAt: number
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

const toThree = (d: Vec3) => new THREE.Vector3(d.x, d.z, -d.y).multiplyScalar(0.001)

function DetailScene({ j, ending, through, steps, clock, onStep }: { j: DetectedJoint; ending?: Member; through?: Member; steps: GuideStep[]; clock: { current: StepClock }; onStep: (i: number) => void }) {
  const d = useDerived()
  const moving = useRef<THREE.Group>(null)
  const extrasRef = useRef<THREE.Group>(null)
  const moverRefs = useRef<(THREE.Group | null)[]>([])
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const last = useRef(performance.now())
  const shown = useRef(-1)
  const byId = useMemo(() => new Map(d.resolved.members.map((m) => [m.id, m])), [d])
  const A = byId.get(j.a)
  const B = byId.get(j.b)
  const frame = useMemo(() => (A && B ? jointFrame(j, A, B) : undefined), [j, A, B])
  const cuts = useMemo(() => jointCuts(j, byId), [j, byId])
  const tl = useMemo(() => timeline(steps), [steps])
  // Richtung, in der sich die Verbindung fügen lässt; 2 mm Fuge auch im zusammengesetzten Zustand,
  // sonst flimmern die aufeinanderliegenden Flächen
  const dir = useMemo(() => toThree(frame ? assemblyDir(j, frame) : v(0, 0, 1)).normalize(), [j, frame])
  const fasteners = useMemo(() => jointFasteners(j, byId, d.resolved), [j, byId, d])
  const parts = useMemo(() => {
    // fest am anzusetzenden Teil: Dübel und die Querbohrungen für Muttern
    const withE = [...meshes(fastenerInstances(fasteners.filter((f) => f.when === 'mit'), true)), ...meshes(fastenerInstances(fasteners, true, 'tasche'))]
    const movers: Mover[] = []
    const out = frame?.out ?? v(0, 0, -1)
    for (const f of fasteners.filter((x) => x.when === 'vorher'))
      movers.push({ meshes: meshes(fastenerInstances([f], true, 'kern')), from: f.kind === 'blech' ? scale(out, -80) : scale(f.dir, -(f.length + 30)), phase: 'vorher', chunk: 0, win: cuts?.extras.length ? [0.5, 1] : [0, 1] })
    // nach dem Fügen: in Einheiten (Schraube, Bolzen, Winkel aus zwei Schenkeln) auf die Schritte verteilt
    const later = fasteners.filter((x) => x.when === 'nachher')
    const units: Fastener[][] = []
    for (const f of later) {
      const prev = units[units.length - 1]
      if (prev && f.group !== undefined && prev[0].group === f.group) prev.push(f)
      else units.push([f])
    }
    const n = Math.max(1, tl.chunks)
    units.forEach((u, ui) => {
      const chunk = Math.min(n - 1, Math.floor((ui * n) / units.length))
      if (u[0].kind === 'blech') {
        const c = scale(u.reduce((s2, f) => add(s2, f.head), v(0, 0, 0)), 1 / u.length)
        movers.push({ meshes: meshes(fastenerInstances(u, true, 'kern')), from: scale(norm(sub(c, j.pos)), 70), phase: 'befestigen', chunk, win: [0, 1] })
        return
      }
      for (const f of u) {
        const kern: [number, number] = f.crossNut ? [0.3, 1] : f.nut ? [0, 0.65] : [0, 1]
        if (f.crossNut) movers.push({ meshes: meshes(fastenerInstances([f], true, 'quermutter')), from: scale(f.crossNut.dir, 60), phase: 'befestigen', chunk, win: [0, 0.35] })
        movers.push({ meshes: meshes(fastenerInstances([f], true, 'kern')), from: scale(f.dir, -(Math.min(f.length, 200) + 40)), phase: 'befestigen', chunk, win: kern })
        if (f.nut) movers.push({ meshes: meshes(fastenerInstances([f], true, 'mutter')), from: scale(f.dir, 50), phase: 'befestigen', chunk, win: [0.6, 1] })
      }
    })
    return { withE, movers }
  }, [fasteners, frame, cuts, tl.chunks, j.pos])
  useEffect(() => () => [...parts.withE, ...parts.movers.flatMap((m) => m.meshes)].forEach((m) => m.dispose()), [parts])
  useFrame(() => {
    const now = performance.now()
    const c = clock.current
    const dt = Math.min(0.1, (now - last.current) / 1000)
    last.current = now
    if (c.playing) {
      c.t += dt
      if (c.t >= c.stopAt) {
        c.t = c.stopAt
        c.playing = false
        c.stopAt = Infinity
      } else if (c.t >= tl.total) c.t = 0
    }
    const p = progressAt(tl.segs, Math.min(c.t, tl.total - HOLD))
    if (p.step !== shown.current) {
      shown.current = p.step
      onStep(p.step)
    }
    if (moving.current) moving.current.position.copy(dir).multiplyScalar(0.002 + 0.12 * (1 - p.fuegen))
    if (extrasRef.current) {
      const k = win(p.vorher, 0, 0.6)
      extrasRef.current.visible = k > 0
      extrasRef.current.position.copy(toThree(scale(frame?.out ?? v(0, 0, -1), -80 * (1 - k))))
    }
    parts.movers.forEach((m, i) => {
      const g = moverRefs.current[i]
      if (!g) return
      const base = m.phase === 'vorher' ? p.vorher : (p.chunk[m.chunk] ?? 0)
      const k = win(base, m.win[0], m.win[1])
      g.visible = k > 0
      g.position.copy(toThree(scale(m.from, 1 - k)))
    })
  })
  const center = useMemo(() => new THREE.Vector3(j.pos.x, j.pos.z, -j.pos.y).multiplyScalar(0.001), [j])
  // Licht auf den Knoten gerichtet, Schattenkamera eng darum: sonst grobe, flackernde Schatten
  const target = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.copy(center)
    return o
  }, [center])
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
      <primitive object={target} />
      <directionalLight
        position={[center.x + 1, center.y + 2, center.z + 1.5]}
        target={target}
        intensity={1.3}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-0.4}
        shadow-camera-right={0.4}
        shadow-camera-top={0.4}
        shadow-camera-bottom={-0.4}
        shadow-camera-near={0.5}
        shadow-camera-far={5}
        shadow-bias={-0.0003}
        shadow-normalBias={0.002}
      />
      <directionalLight position={[center.x - 1.5, center.y + 0.5, center.z - 1]} intensity={0.35} />
      {/* wie in der Hauptansicht: mittlere Taste verschiebt, Mausrad zoomt */}
      <OrbitControls
        ref={controls}
        target={center}
        makeDefault
        mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }}
        // während des Ziehens nicht zoomen: manche Mäuse drehen beim Drücken des Rads mit
        onStart={() => controls.current && (controls.current.enableZoom = false)}
        onEnd={() => controls.current && (controls.current.enableZoom = true)}
      />
      {piece(Tm, COLORS.wood)}
      <group ref={extrasRef}>
        {cuts?.extras.map((o, i) => (
          <Box key={`x${i}`} o={o} color={COLORS.woodLight} edges wood="latte" />
        ))}
      </group>
      {cuts?.holes.map((h, i) => (
        <HoleDisc key={`h${i}`} at={h.at} normal={h.normal} r={h.r} />
      ))}
      {parts.movers.map((m, i) => (
        <group key={`m${i}`} ref={(g) => void (moverRefs.current[i] = g)} visible={false}>
          {m.meshes.map((x, k) => (
            <primitive key={k} object={x} />
          ))}
        </group>
      ))}
      <group ref={moving}>
        {piece(E, COLORS.woodLight)}
        {parts.withE.map((m, i) => (
          <primitive key={`e${i}`} object={m} />
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
      <div className="modal joint-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('Verbindung')}>
        <header>
          <h2>
            {tr(JOINT_KIND_LABEL[j.kind])}: {tr(ending?.name ?? '')} ↔ {tr(through?.name ?? '')}
          </h2>
          <button className="close" onClick={() => set({ jointDetail: null })} aria-label={t('Schließen')}>
            ✕
          </button>
        </header>
        <JointDetailBody key={`${j.key}|${j.typeId}`} j={j} ending={ending} through={through} cam={cam}>
            <label className="field stacked">
              <span>{t('Verbindung')}</span>
              <JointTypeSelect
                j={j}
                byId={byId}
                onChange={(v) =>
                  update((dd) => {
                    const x = dd.joints.find((y) => y.key === j.key)
                    if (x) x.typeId = v
                    else dd.joints.push({ key: j.key, typeId: v })
                  })
                }
              />
            </label>
            {jt && <p>{tr(jt.note)}</p>}
        </JointDetailBody>
      </div>
    </div>
  )
}

/** 3D-Ablauf und Anleitung; der aktuelle Schritt ist in beiden hervorgehoben */
function JointDetailBody({ j, ending, through, cam, children }: { j: DetectedJoint; ending?: Member; through?: Member; cam: THREE.Vector3; children: ReactNode }) {
  const d = useDerived()
  const byId = useMemo(() => new Map(d.resolved.members.map((m) => [m.id, m])), [d])
  const plan = useMemo(() => jointPlan(j, byId, d.resolved), [j, byId, d])
  const steps = useMemo(() => plan?.guide.steps ?? [], [plan])
  const still = reducedMotion()
  const clock = useRef<StepClock>({ t: still ? 1e6 : 0, playing: !still, stopAt: Infinity })
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(!still)
  const [mode, setMode] = useState<'3d' | 'zeichnung'>('3d')
  const drawings = useMemo(() => (plan && mode === 'zeichnung' ? jointDrawings(plan, j, byId, d.resolved, (m) => tr(m.name ?? m.role)) : []), [plan, mode, j, byId, d])
  const pick = (i: number) => {
    const [a, b] = stepTimes(steps, i)
    // ohne Bewegung gleich das Ergebnis des Schritts zeigen
    clock.current = still ? { t: b - 1e-3, playing: false, stopAt: Infinity } : { t: a, playing: true, stopAt: b }
    setPlaying(!still)
    setMode('3d')
  }
  const toggle = () => {
    const c = clock.current
    c.playing = !c.playing
    c.stopAt = Infinity
    setPlaying(c.playing)
  }
  return (
    <div className="joint-body">
      <div className="joint-left">
        <div className="seg joint-tabs" role="tablist">
          <button role="tab" aria-selected={mode === '3d'} className={mode === '3d' ? 'on' : ''} onClick={() => setMode('3d')}>
            {t('3D-Ablauf')}
          </button>
          <button role="tab" aria-selected={mode === 'zeichnung'} className={mode === 'zeichnung' ? 'on' : ''} onClick={() => setMode('zeichnung')}>
            {t('Werkstattzeichnung')}
          </button>
        </div>
        {mode === '3d' ? (
          <div className="joint-canvas">
            <Canvas shadows="percentage" camera={{ position: cam.toArray(), fov: 40, near: 0.01, far: 20 }}>
              <color attach="background" args={['#f4f5f7']} />
              <DetailScene
                j={j}
                ending={ending}
                through={through}
                steps={steps}
                clock={clock}
                onStep={(i) => {
                  setStep(i)
                  setPlaying(clock.current.playing)
                }}
              />
            </Canvas>
            {steps.length > 0 && (
              <div className="joint-player">
                <button onClick={toggle} aria-label={playing ? t('Anhalten') : t('Abspielen')} title={playing ? t('Anhalten') : t('Abspielen')}>
                  {playing ? <Ico i={Pause} /> : <Ico i={Play} />}
                </button>
                <span>{t('Schritt {i} von {n}', { i: step + 1, n: steps.length })}</span>
              </div>
            )}
            <span className="hint">{t('Ziehen = drehen · mittlere Taste = verschieben · Mausrad = zoomen')}</span>
          </div>
        ) : (
          <div className="joint-drawings">
            {drawings.map((dr) => (
              <WorkDrawing key={dr.member.id} d={dr} title={tr(dr.member.name ?? dr.member.role)} onTemplate={() => printTemplate(dr, tr(dr.member.name ?? dr.member.role))} />
            ))}
            <p className="hint">{t('Maße in mm, steigend vom Bezug (Ende) und von der Bezugskante (unten). Schraffiert: Abfall. Gestrichelt: verdeckte Kanten und Bohrungen.')}</p>
          </div>
        )}
      </div>
      <div className="joint-info">
        {children}
        {plan && (
          <>
            <JointEffortInfo plan={plan} />
            <p className="muted">
              {plan.type.removable ? t('zerlegbar') : t('fest')} · {t('wirkt {s}', { s: stiffnessLabel(plan.type.stiffness) })}
            </p>
            <JointGuide plan={plan} hint={assemblyHint(j, byId)} current={step} onPick={pick} />
            <p>
              <b>{t('Werkzeug:')}</b> {plan.type.tools.map((x) => tr(x)).join(', ')}
              {plan.type.toolsPlus && (
                <>
                  <br />
                  <span className="muted">
                    {t('Komfortabler mit:')} {plan.type.toolsPlus.map((x) => tr(x)).join(', ')}
                  </span>
                </>
              )}
            </p>
            <JointMaterial plan={plan} />
            {plan.effort.drill > 0 && <DrillHelp />}
            {plan.type.residualSection < 1 && <p className="hint">{t('Restquerschnitt an der Verbindung ca. {p} %.', { p: Math.round(plan.type.residualSection * 100) })}</p>}
            <p className="hint">
              {tr(ending?.name ?? '')}: {ending ? t('{item}, Länge {len}', { item: tr(catalogItem(ending.catalogId)?.name ?? ''), len: fmtCm(memberLength(ending)) }) : ''}
              <br />
              {tr(through?.name ?? '')}: {through ? t('{item}, Länge {len}', { item: tr(catalogItem(through.catalogId)?.name ?? ''), len: fmtCm(memberLength(through)) }) : ''}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
