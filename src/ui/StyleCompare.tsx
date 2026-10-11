import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import * as THREE from 'three'
import { compareStyles, type FrameStyle, type StyleVariant } from '../analysis/compare'
import { memberBoxes, obbBounds } from '../model/geometry'
import { t, tk, tr } from '../i18n'
import { useStore } from '../state/store'
import { T } from '../views/camera'
import { MemberMeshes, PanelMeshes } from '../views/Scene'
import { eur } from './fields'

/**
 * Bauweisen im Vergleich: dasselbe Bett in jeder passenden Bauweise nebeneinander, mit
 * gemeinsam drehbarer 3D-Ansicht, Kennzahlen und „Übernehmen“.
 */

const STYLE_NAME: Record<FrameStyle, string> = {
  zargen: tk('Zargen zwischen den Pfosten'),
  aufgelegt: tk('Aufgelegt'),
  aussen: tk('Zargen außen am Pfosten'),
}

const STYLE_NOTE: Record<FrameStyle, string> = {
  zargen: tk('Zargen stumpf zwischen den Pfosten, Bolzen mit Mutter in einer Tasche. Glatte Außenseite; die Bohrungen müssen genau treffen.'),
  aufgelegt: tk('Querträger liegen oben auf den Zargen statt dazwischen: leicht zu fügen. Die Zargen sitzen dafür tiefer.'),
  aussen: tk('Zargen außen an den Pfosten, quer durchgebolzt: am leichtesten zu bohren. Die Querzargen sitzen eine Zargenhöhe tiefer.'),
}

const SWAY_NAME = { steif: tk('steif'), spürbar: tk('spürbar'), wackelt: tk('wackelt') } as const

/** Gemeinsame Kamera: wer gedreht wird, gibt seine Lage an die anderen weiter */
interface CamBus {
  listeners: Map<number, (pos: THREE.Vector3) => void>
}

function SyncedControls({ id, bus, target, start }: { id: number; bus: CamBus; target: THREE.Vector3; start: THREE.Vector3 }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const { camera, invalidate } = useThree()
  const active = useRef(false)
  useEffect(() => {
    camera.position.copy(start)
    camera.lookAt(target)
    bus.listeners.set(id, (pos) => {
      if (active.current) return
      camera.position.copy(pos)
      controls.current?.update()
      invalidate()
    })
    return () => {
      bus.listeners.delete(id)
    }
  }, [bus, id, camera, invalidate, start, target])
  return (
    <OrbitControls
      ref={controls}
      target={target}
      makeDefault
      enablePan={false}
      onStart={() => (active.current = true)}
      onEnd={() => (active.current = false)}
      onChange={() => {
        if (!active.current) return
        for (const [k, f] of bus.listeners) if (k !== id) f(camera.position)
      }}
    />
  )
}

function MiniView({ v, id, bus, assemblyId }: { v: StyleVariant; id: number; bus: CamBus; assemblyId: string }) {
  const members = useMemo(() => v.resolved.members.filter((m) => m.assemblyId === assemblyId), [v, assemblyId])
  const panels = useMemo(() => v.resolved.panels.filter((p) => p.assemblyId === assemblyId), [v, assemblyId])
  const joints = useMemo(() => {
    const own = new Set(members.map((m) => m.id))
    return v.resolved.joints.filter((j) => own.has(j.a) && own.has(j.b))
  }, [v, members])
  // Bildausschnitt aus den Teilen des Betts
  const { target, start } = useMemo(() => {
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity)
    const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    for (const m of members)
      for (const o of memberBoxes(m)) {
        const b = obbBounds(o)
        lo.min(T(b.min.x, b.min.y, b.min.z))
        hi.max(T(b.min.x, b.min.y, b.min.z))
        lo.min(T(b.max.x, b.max.y, b.max.z))
        hi.max(T(b.max.x, b.max.y, b.max.z))
      }
    const target = lo.clone().add(hi).multiplyScalar(0.5)
    const r = Math.max(0.5, hi.clone().sub(lo).length() / 2)
    // schräg von vorn oben, wie die Grundansicht
    const start = target.clone().add(new THREE.Vector3(1, 0.7, 1.3).normalize().multiplyScalar(r * 2.6))
    return { target, start }
  }, [members])
  return (
    <Canvas frameloop="demand" camera={{ fov: 35, near: 0.05, far: 50 }} dpr={[1, 2]}>
      <color attach="background" args={['#f4f5f7']} />
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#fffaf0', '#b9a58a', 0.5]} />
      <directionalLight position={[target.x + 2, target.y + 4, target.z + 3]} intensity={1.2} />
      <directionalLight position={[target.x - 3, target.y + 1, target.z - 2]} intensity={0.35} />
      <SyncedControls id={id} bus={bus} target={target} start={start} />
      <MemberMeshes members={members} joints={joints} mini />
      <PanelMeshes panels={panels} mini />
    </Canvas>
  )
}

type Metric = { label: string; get: (v: StyleVariant) => number; show: (v: StyleVariant) => string; better: 'low' | 'high'; tol: number; hint?: string; bad?: (v: StyleVariant) => boolean }

const METRICS: Metric[] = [
  { label: tk('Preis'), get: (v) => v.price, show: (v) => eur(v.price), better: 'low', tol: 5 },
  { label: tk('Wackeln'), get: (v) => v.sway, show: (v) => `${tr(SWAY_NAME[v.swayClass])} (${v.sway.toFixed(1)} mm)`, better: 'low', tol: 0.3, bad: (v) => v.swayClass === 'wackelt', hint: tk('Seitliche Verschiebung der Liegefläche, wenn jemand mit 50 kg seitlich dagegen drückt') },
  { label: tk('Bohrungen'), get: (v) => v.holes, show: (v) => String(v.holes), better: 'low', tol: 0 },
  { label: tk('Teile'), get: (v) => v.parts, show: (v) => String(v.parts), better: 'low', tol: 0 },
  {
    label: tk('Arbeitszeit Verbindungen'),
    get: (v) => v.minutes[0],
    show: (v) => t('ca. {a} h (Anfänger), {b} h (geübt)', { a: Math.round(v.minutes[0] / 60), b: Math.round(v.minutes[1] / 60) }),
    better: 'low',
    tol: 30,
  },
  { label: tk('Durchgang unter dem Bett'), get: (v) => v.clearance, show: (v) => `${(v.clearance / 10).toFixed(0)} cm`, better: 'high', tol: 5, hint: tk('Unterkante der tiefsten Zarge über dem Boden') },
  { label: tk('Höchste Ausnutzung'), get: (v) => v.maxUtil, show: (v) => `${Math.round(v.maxUtil * 100)} %`, better: 'low', tol: 0.02, bad: (v) => v.maxUtil > 1, hint: tk('Am stärksten beanspruchtes Holz bzw. Verbindung (Statik)') },
]

export function StyleCompareDialog() {
  const assemblyId = useStore((s) => s.compareStyles)
  const set = useStore((s) => s.set)
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const [variants, setVariants] = useState<StyleVariant[] | null>(null)
  const bus = useMemo<CamBus>(() => ({ listeners: new Map() }), [])
  const a = p.assemblies.find((x) => x.id === assemblyId)
  // erst nach dem Öffnen rechnen (drei Mal Statik und Einkaufsliste), damit der Dialog sofort erscheint
  useEffect(() => {
    setVariants(null)
    if (!assemblyId) return
    const id = setTimeout(() => setVariants(compareStyles(useStore.getState().project, assemblyId)), 30)
    return () => clearTimeout(id)
  }, [assemblyId, p])
  if (!assemblyId || !a) return null
  const close = () => set({ compareStyles: null })
  const current = a.params.frameStyle
  const take = (style: FrameStyle) => {
    update((d) => {
      const x = d.assemblies.find((y) => y.id === assemblyId)
      if (x) x.params.frameStyle = style
    })
    close()
  }
  const best = (m: Metric, v: StyleVariant) => {
    if (!variants || variants.length < 2) return false
    const vals = variants.map(m.get)
    const goal = m.better === 'low' ? Math.min(...vals) : Math.max(...vals)
    const worst = m.better === 'low' ? Math.max(...vals) : Math.min(...vals)
    // nur hervorheben, wenn sich die Bauweisen wirklich unterscheiden
    return Math.abs(worst - goal) > m.tol && Math.abs(m.get(v) - goal) <= m.tol
  }
  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal compare" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('Bauweisen im Vergleich')}>
        <header>
          <h2>{t('Bauweisen im Vergleich')}</h2>
          <button className="close" onClick={close} aria-label={t('Schließen')}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <p className="hint">{t('Dasselbe Bett in jeder Bauweise, die hier passt. Eine Ansicht drehen dreht alle mit. Grün: am besten in dieser Zeile, rot: zu schwach bzw. wackelig.')}</p>
          {!variants ? (
            <p>{t('Rechne …')}</p>
          ) : (
            <div className="compare-grid" style={{ gridTemplateColumns: `repeat(${variants.length}, minmax(0, 1fr))` }}>
              {variants.map((v, i) => (
                <section key={v.style} className={v.style === current ? 'compare-col current' : 'compare-col'}>
                  <h3>{tr(STYLE_NAME[v.style])}</h3>
                  <div className="compare-view">
                    <MiniView v={v} id={i} bus={bus} assemblyId={assemblyId} />
                  </div>
                  <p className="compare-note">{tr(STYLE_NOTE[v.style])}</p>
                  <dl>
                    {METRICS.map((m) => (
                      <div key={m.label} className={m.bad?.(v) ? 'bad' : best(m, v) ? 'best' : undefined} title={m.hint ? tr(m.hint) : undefined}>
                        <dt>{tr(m.label)}</dt>
                        <dd>{m.show(v)}</dd>
                      </div>
                    ))}
                  </dl>
                  {v.style === current ? (
                    <p className="compare-current">{t('Gewählt')}</p>
                  ) : (
                    <button className="primary" onClick={() => take(v.style)}>
                      {t('Übernehmen')}
                    </button>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
