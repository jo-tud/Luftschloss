import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { WallId } from '../model/types'
import { useDerived, useStore, type PersonPreset, type ViewMode } from '../state/store'
import { applyCam, goalFor, PERSON_LABEL, T } from './camera'
import { Controller, mainCam } from './Controller'
import { SceneContent } from './Scene'
import { PhotoView } from './PhotoView'
import { UnfoldView } from './Unfold'
import { StaticsPanel } from '../ui/Statics'
import { BuildPlayer } from '../ui/BuildPlayer'

export function viewLabel(v: ViewMode): string {
  switch (v.kind) {
    case 'plan':
      return 'Draufsicht'
    case 'elev':
      return `Seitenansicht Wand ${v.wall}`
    case '3d':
      return '3D'
    case 'person':
      return PERSON_LABEL[v.preset]
    case 'unfold':
      return 'Abwicklung'
    case 'foto':
      return 'Foto-Abgleich'
  }
}

function MainScene() {
  const project = useStore((s) => s.project)
  const view = useStore((s) => s.view)
  const d = useDerived()
  return (
    <>
      <color attach="background" args={['#eef1f5']} />
      <SceneContent p={project} d={d} showCeiling={view.kind === 'person'} />
      <Controller />
    </>
  )
}

function StaticCam({ view }: { view: ViewMode }) {
  const { camera, size, invalidate } = useThree()
  const project = useStore((s) => s.project)
  const d = useDerived()
  useEffect(() => {
    const goal = goalFor(view, project, d, size.width / Math.max(1, size.height))
    applyCam(camera as THREE.PerspectiveCamera, goal)
    invalidate()
  }, [view, project, d, size, camera, invalidate])
  return null
}

function MiniScene({ view }: { view: ViewMode }) {
  const project = useStore((s) => s.project)
  const d = useDerived()
  return (
    <>
      <color attach="background" args={['#f7f8fa']} />
      <SceneContent p={project} d={d} mini showCeiling={false} />
      <StaticCam view={view} />
    </>
  )
}

/** Die beiden Ansichten, die gerade nicht groß sind */
function miniViews(main: ViewMode, lastWall: WallId): ViewMode[] {
  const all: ViewMode[] = [{ kind: 'plan' }, { kind: 'elev', wall: lastWall }, { kind: '3d' }]
  return all.filter((v) => v.kind !== main.kind).slice(0, 2)
}

export function Viewport() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const lastWall = useRef<WallId>('A')
  if (view.kind === 'elev') lastWall.current = view.wall
  const minis = miniViews(view, lastWall.current)
  return (
    <div className={`viewport${view.kind === 'unfold' || view.kind === 'foto' ? ' unfold-on' : ''}`}>
      <Canvas shadows camera={{ fov: 40, near: 0.05, far: 200, position: [3, 3, 3] }} gl={{ antialias: true, preserveDrawingBuffer: true }} dpr={[1, 2]}>
        <MainScene />
      </Canvas>
      {view.kind === 'unfold' && <UnfoldView />}
      {view.kind === 'foto' && <PhotoView />}
      <ViewSwitcher />
      {view.kind !== 'unfold' && view.kind !== 'foto' && <MiniMap />}
      <SectionBoxPanel />
      <StaticsPanel />
      <BuildPlayer />
      <div className="minis">
        {minis.map((v) => (
          <button key={v.kind} className="mini" onClick={() => setView(v)} title={`${viewLabel(v)} groß anzeigen`}>
            <Canvas frameloop="demand" camera={{ fov: 40, near: 0.05, far: 300 }} dpr={1}>
              <MiniScene view={v} />
            </Canvas>
            <span>{viewLabel(v)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ViewSwitcher() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const walls: WallId[] = ['A', 'B', 'C', 'D']
  const presets: PersonPreset[] = ['tuer', 'unter', 'matratze', 'liegen']
  const personRef = useRef<HTMLDetailsElement>(null)
  return (
    <div className="view-switcher">
      <button className={view.kind === 'plan' ? 'on' : ''} onClick={() => setView({ kind: 'plan' })} title="Draufsicht (1)">
        Draufsicht
      </button>
      <span className="seg">
        {walls.map((w) => (
          <button key={w} className={view.kind === 'elev' && view.wall === w ? 'on' : ''} onClick={() => setView({ kind: 'elev', wall: w })} title={`Seitenansicht auf Wand ${w} (2)`} aria-label={`Seitenansicht Wand ${w}`}>
            {w}
          </button>
        ))}
      </span>
      <button className={view.kind === '3d' ? 'on' : ''} onClick={() => setView({ kind: '3d' })} title="3D-Ansicht (3)">
        3D
      </button>
      <details className="dropdown person-menu" ref={personRef}>
        <summary className={view.kind === 'person' ? 'on' : ''} title="Ich-Perspektive: den Raum aus Augenhöhe erleben (4)">
          👁 Ich ▾
        </summary>
        <div className="menu">
          {presets.map((p) => (
            <button
              key={p}
              className={view.kind === 'person' && view.preset === p ? 'on' : ''}
              onClick={() => {
                setView({ kind: 'person', preset: p })
                personRef.current?.removeAttribute('open')
              }}
            >
              {p === 'tuer' ? '🚪' : p === 'unter' ? '🪑' : p === 'matratze' ? '🛏' : '😴'} {PERSON_LABEL[p]}
            </button>
          ))}
        </div>
      </details>
      <button className={view.kind === 'unfold' ? 'on' : ''} onClick={() => setView({ kind: 'unfold' })} title="Raum aufgeklappt: Wände von innen, Fenster und Heizkörper direkt ziehen (5)">
        Abwicklung
      </button>
      <button className={view.kind === 'foto' ? 'on' : ''} onClick={() => setView({ kind: 'foto' })} title="Das geplante Bett in ein Foto des Zimmers einblenden (6)">
        📷 Foto
      </button>
      <button onClick={() => setView({ kind: '3d' })} title="Ansicht zurücksetzen (0)" aria-label="Ansicht zurücksetzen">
        ⌂<span className="lbl"> Zurück</span>
      </button>
      <SectionToggle />
      <span className="view-name">{viewLabel(view)}</span>
    </div>
  )
}

function SectionToggle() {
  const box = useStore((s) => s.sectionBox)
  const view = useStore((s) => s.view)
  const room = useStore((s) => s.project.room)
  const set = useStore((s) => s.set)
  if (view.kind !== '3d' && view.kind !== 'person') return null
  return (
    <button className={box ? 'on' : ''} onClick={() => set({ sectionBox: box ? null : { x0: 0, x1: room.length, y0: 0, y1: room.width, z1: room.height } })} title="Schnittbox: Raum in 3D zuschneiden">
      ✂ Schnitt
    </button>
  )
}

function SectionBoxPanel() {
  const box = useStore((s) => s.sectionBox)
  const view = useStore((s) => s.view)
  const room = useStore((s) => s.project.room)
  const set = useStore((s) => s.set)
  if (!box || (view.kind !== '3d' && view.kind !== 'person')) return null
  const slider = (label: string, key: keyof typeof box, max: number) => (
    <label key={key}>
      <span>{label}</span>
      <input type="range" min={0} max={max} step={50} value={box[key]} onChange={(e) => set({ sectionBox: { ...box, [key]: Number(e.target.value) } })} />
    </label>
  )
  return (
    <div className="section-box">
      <b>Schnittbox</b>
      {slider('x von', 'x0', room.length)}
      {slider('x bis', 'x1', room.length)}
      {slider('y von', 'y0', room.width)}
      {slider('y bis', 'y1', room.width)}
      {slider('Höhe bis', 'z1', room.height)}
      <button className="link" onClick={() => set({ sectionBox: null })}>
        Schnitt aus
      </button>
    </div>
  )
}

/** Kleine Draufsicht mit Kamerastandort; Klick setzt Standort bzw. Blickziel */
function MiniMap() {
  const project = useStore((s) => s.project)
  const view = useStore((s) => s.view)
  const d = useDerived()
  const camRef = useRef<SVGGElement>(null)
  const r = project.room
  const S = 150 / Math.max(r.length, r.width)
  const w = r.length * S
  const h = r.width * S
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const c = mainCam.state
      if (c && camRef.current) {
        // Standort der Kamera (in 3D außerhalb des Raums möglich, dann am Rand)
        const dist = c.viewH / (2 * Math.tan((c.fov * Math.PI) / 360))
        const yawR = (c.yaw * Math.PI) / 180
        const pitchR = (c.pitch * Math.PI) / 180
        const px = c.target.x - Math.cos(pitchR) * Math.sin(yawR) * dist
        const pz = c.target.z + Math.cos(pitchR) * Math.cos(yawR) * dist
        const x = Math.max(0, Math.min(w, px * 1000 * S))
        const y = Math.max(0, Math.min(h, h - -pz * 1000 * S))
        camRef.current.setAttribute('transform', `translate(${x} ${y}) rotate(${c.yaw})`)
        camRef.current.style.display = c.fov < 5 ? 'none' : ''
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [S, h, w])
  if (view.kind === 'plan') return null
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const x = (e.clientX - rect.left - 6) / S
    const y = (h - (e.clientY - rect.top - 6)) / S
    const c = mainCam.state
    if (!c) return
    const t = T(x, y, c.target.y * 1000)
    c.target.set(t.x, c.target.y, t.z)
  }
  return (
    <svg className="minimap" width={w + 12} height={h + 12} onClick={onClick}>
      <title>Übersicht – klicken, um Standort bzw. Blickziel zu setzen</title>
      <g transform="translate(6 6)">
        <rect x={0} y={0} width={w} height={h} className="mm-room" />
        {[...d.resolved.beds.values()].map((b, i) => (
          <polygon key={i} className="mm-bed" points={b.footprint.map((q) => `${q.x * S},${h - q.y * S}`).join(' ')} />
        ))}
        {project.wallObjects
          .filter((o) => o.kind === 'fenster' || o.kind === 'tuer')
          .map((o) => {
            const f = wallPos(project.room, o.wall)
            const a = { x: f.sx + f.ux * o.offset, y: f.sy + f.uy * o.offset }
            const b = { x: f.sx + f.ux * (o.offset + o.width), y: f.sy + f.uy * (o.offset + o.width) }
            return <line key={o.id} x1={a.x * S} y1={h - a.y * S} x2={b.x * S} y2={h - b.y * S} className={o.kind === 'fenster' ? 'mm-win' : 'mm-door'} />
          })}
        <g ref={camRef}>
          <path d="M0,0 L-9,-16 A18,18 0 0 1 9,-16 Z" className="mm-cone" />
          <circle r={3.5} className="mm-cam" />
        </g>
      </g>
    </svg>
  )
}

function wallPos(room: { length: number; width: number }, wall: WallId) {
  switch (wall) {
    case 'A':
      return { sx: room.length, sy: 0, ux: -1, uy: 0 }
    case 'B':
      return { sx: 0, sy: 0, ux: 0, uy: 1 }
    case 'C':
      return { sx: 0, sy: room.width, ux: 1, uy: 0 }
    case 'D':
      return { sx: room.length, sy: room.width, ux: 0, uy: -1 }
  }
}
