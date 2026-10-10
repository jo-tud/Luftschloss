import { Line } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { applyOpeningFits, camBasis, projectPoint, referencePoints, solvePhotoCam, solvePhotoCamWithOpenings, verticalFov, type OpeningFit, type PhotoCam } from '../analysis/photo'
import { fmtCm, fmtM } from '../model/geometry'
import { locale, t, tr } from '../i18n'
import { wallFrame } from '../model/geometry'
import type { Project } from '../model/types'
import { useDerived, useStore } from '../state/store'
import { T } from './camera'
import { MemberMeshes, PanelMeshes } from './Scene'

/** Foto und Klickpunkte bleiben lokal im Browser (IndexedDB), nichts wird hochgeladen. */
interface StoredPhoto {
  blob: Blob
  w: number
  h: number
  obs: { id: string; u: number; v: number }[]
}

let db: Promise<IDBDatabase> | null = null
/** Eine Verbindung für alle Zugriffe (nicht bei jedem Speichern neu öffnen) */
function idb(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('luftschloss', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('fotos')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      db = null
      reject(req.error)
    }
  })
  return db
}
async function loadPhoto(): Promise<StoredPhoto | undefined> {
  try {
    const db = await idb()
    return await new Promise((resolve) => {
      const r = db.transaction('fotos').objectStore('fotos').get('zimmer')
      r.onsuccess = () => resolve(r.result as StoredPhoto | undefined)
      r.onerror = () => resolve(undefined)
    })
  } catch {
    return undefined
  }
}
async function savePhoto(p: StoredPhoto | null) {
  try {
    const db = await idb()
    const tx = db.transaction('fotos', 'readwrite')
    if (p) tx.objectStore('fotos').put(p, 'zimmer')
    else tx.objectStore('fotos').delete('zimmer')
  } catch {
    // ohne IndexedDB bleibt das Foto nur bis zum Neuladen
  }
}

function PhotoCamera({ cam, w, h }: { cam: PhotoCam; w: number; h: number }) {
  const { camera } = useThree()
  useEffect(() => {
    const c = camera as THREE.PerspectiveCamera
    const { fwd, up } = camBasis(cam)
    c.fov = verticalFov(cam, h)
    c.aspect = w / h
    c.near = 0.05
    c.far = 50
    c.position.copy(T(cam.x, cam.y, cam.z))
    c.up.set(up.x, up.z, -up.y)
    c.lookAt(T(cam.x + fwd.x * 1000, cam.y + fwd.y * 1000, cam.z + fwd.z * 1000))
    c.updateProjectionMatrix()
  }, [cam, w, h, camera])
  return null
}

function RoomEdges({ p }: { p: Project }) {
  const r = p.room
  const lines: THREE.Vector3[][] = []
  const corners = [
    [0, 0],
    [r.length, 0],
    [r.length, r.width],
    [0, r.width],
  ]
  for (const z of [0, r.height]) lines.push([...corners, corners[0]].map(([x, y]) => T(x, y, z)))
  for (const [x, y] of corners) lines.push([T(x, y, 0), T(x, y, r.height)])
  for (const o of p.wallObjects) {
    if (o.kind !== 'fenster' && o.kind !== 'tuer') continue
    const f = wallFrame(r, o.wall)
    const off = o.offset
    const wd = o.width
    const z0 = o.kind === 'fenster' ? o.sillHeight : 0
    const z1 = z0 + o.height
    const at = (s: number, z: number) => T(f.start.x + f.u.x * s, f.start.y + f.u.y * s, z)
    lines.push([at(off, z0), at(off + wd, z0), at(off + wd, z1), at(off, z1), at(off, z0)])
  }
  return (
    <group>
      {lines.map((pts, i) => (
        <Line key={i} points={pts} color="#19c37d" lineWidth={2} transparent opacity={0.9} />
      ))}
    </group>
  )
}

function fitBox(w: number, h: number, sw: number, sh: number) {
  const k = Math.max(0.01, Math.min(sw / w, sh / h))
  return { width: Math.round(w * k), height: Math.round(h * k) }
}

export function PhotoView() {
  const p = useStore((s) => s.project)
  const d = useDerived()
  const [photo, setPhoto] = useState<StoredPhoto | null>(null)
  const [url, setUrl] = useState<string>()
  const [active, setActive] = useState<string | null>(null)
  const [opacity, setOpacity] = useState(0.92)
  const [showEdges, setShowEdges] = useState(true)
  const [fitOpenings, setFitOpenings] = useState(true)
  const update = useStore((s) => s.update)
  const [dragId, setDragId] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState({ w: 800, h: 600 })
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth - 24, h: el.clientHeight - 24 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [url])
  const refs = useMemo(() => referencePoints(p), [p])

  useEffect(() => {
    loadPhoto().then((ph) => ph && setPhoto(ph))
  }, [])
  useEffect(() => {
    if (!photo) return
    const u = URL.createObjectURL(photo.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [photo?.blob])

  // beim Ziehen nur anzeigen, gespeichert wird beim Loslassen (sonst je Mausbewegung das ganze Foto)
  const store = (ph: StoredPhoto, persist = true) => {
    setPhoto(ph)
    if (persist) void savePhoto(ph)
  }
  const endDrag = () => {
    if (!dragId) return
    setDragId(null)
    if (photo) void savePhoto(photo)
  }
  const onFile = async (file: File) => {
    const bmp = await createImageBitmap(file)
    const size = { w: bmp.width, h: bmp.height }
    bmp.close()
    store({ blob: file, ...size, obs: [] })
    setActive(refs[0]?.id ?? null)
  }
  const obsFull = useMemo(() => (photo ? photo.obs.map((o) => ({ ...o, ref: refs.find((r) => r.id === o.id) })).filter((o) => o.ref) : []), [photo, refs])
  const solution = useMemo(() => {
    if (!photo || obsFull.length < 4) return null
    if (fitOpenings) return solvePhotoCamWithOpenings(p, photo.obs, photo.w, photo.h)
    const s = solvePhotoCam(p, obsFull.map((o) => ({ p: o.ref!.p, u: o.u, v: o.v })), photo.w, photo.h)
    return s && { ...s, openings: [] as OpeningFit[] }
  }, [photo, obsFull, p, fitOpenings])
  const fitted = useMemo(() => (solution ? applyOpeningFits(p, solution.openings) : p), [solution, p])
  const fittedRefs = useMemo(() => referencePoints(fitted), [fitted])
  const changed = (solution?.openings ?? []).filter((o) => Math.max(Math.abs(o.offset - o.before.offset), Math.abs(o.width - o.before.width), Math.abs(o.bottom - o.before.bottom), Math.abs(o.height - o.before.height)) >= 30)
  const adopt = () =>
    update((dd) => {
      for (const f of changed) {
        const o = dd.wallObjects.find((x) => x.id === f.id)
        if (!o) continue
        Object.assign(o, { offset: f.offset, width: f.width, height: f.height })
        if (o.kind === 'fenster') o.sillHeight = f.bottom
      }
    })

  const toImage = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect()
    return { u: ((e.clientX - r.left) / r.width) * photo!.w, v: ((e.clientY - r.top) / r.height) * photo!.h }
  }
  const setObs = (id: string, u: number, v: number, persist = true) => store({ ...photo!, obs: [...photo!.obs.filter((o) => o.id !== id), { id, u, v }] }, persist)

  if (!photo || !url)
    return (
      <div className="photo-view empty">
        <div className="photo-intro">
          <h2>📷 {t('Dein Hochbett im Foto deines Zimmers')}</h2>
          <p>{t('Fotografiere das Zimmer so, dass ein paar Raumecken und Fensterkanten gut zu sehen sind. Dann tippst du 4–6 dieser Punkte an – Luftschloss errechnet daraus den Kamerastandort und setzt das geplante Bett perspektivisch richtig ins Foto.')}</p>
          <label className="file-btn">
            {t('Foto wählen oder aufnehmen')}
            <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <p className="hint">{t('Das Foto bleibt in diesem Browser und wird nirgendwohin hochgeladen.')}</p>
        </div>
      </div>
    )

  const quality = !solution ? null : solution.rms < 6 ? t('sehr gut') : solution.rms < 15 ? t('gut') : solution.rms < 35 ? t('ungefähr – Maße prüfen') : t('passt nicht – Punkte prüfen')
  return (
    <div className="photo-view">
      <aside className="photo-side">
        <b>{t('Punkte zuordnen')}</b>
        <p className="hint">{t('Punkt wählen, dann im Foto antippen. Mindestens 4, besser 6 Punkte, verteilt über das Bild. Marker lassen sich verschieben.')}</p>
        <ul>
          {refs.map((r) => {
            const o = photo.obs.find((x) => x.id === r.id)
            return (
              <li key={r.id} className={`${active === r.id ? 'on' : ''}${o ? ' set' : ''}`} onClick={() => setActive(r.id)}>
                <span className="mark">{o ? '●' : '○'}</span>
                {tr(r.label)}
                {o && (
                  <button
                    className="link"
                    onClick={(e) => {
                      e.stopPropagation()
                      store({ ...photo, obs: photo.obs.filter((x) => x.id !== r.id) })
                    }}
                  >
                    ✕
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        <div className="photo-status">
          {solution ? (
            <>
              <b>{t('Abgleich {q}', { q: quality ?? '' })}</b>
              <span className="hint">
                {t('Abweichung ⌀ {px} px · Kamera {h} hoch', { px: solution.rms.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }), h: fmtM(solution.cam.z) })}
              </span>
            </>
          ) : (
            <span className="hint">{t('Noch {n} Punkt(e) für den Abgleich.', { n: Math.max(0, 4 - obsFull.length) })}</span>
          )}
          {solution && solution.rms >= 15 && <p className="hint">{t('Liegen die grünen Raumkanten neben dem Foto, stimmen Raummaße oder Fensterlage noch nicht – ein guter Anlass, nachzumessen.')}</p>}
        </div>
        <label className="check">
          <input type="checkbox" checked={fitOpenings} onChange={(e) => setFitOpenings(e.target.checked)} />
          <span>{t('Fenster- und Türmaße mitschätzen')}</span>
        </label>
        {fitOpenings && changed.length > 0 && (
          <div className="photo-fit">
            <b>{t('Laut Foto eher so')}</b>
            <table>
              <tbody>
                {changed.map((o) => (
                  <tr key={o.id}>
                    <td>{tr(o.name)}</td>
                    <td>
                      {fmtCm(o.width, 0)} × {fmtCm(o.height, 0)}
                      <small>
                        {t('ab {x}', { x: fmtCm(o.offset, 0) })}, {o.bottom > 0 ? t('Brüstung {h}', { h: fmtCm(o.bottom, 0) }) : t('ab Boden')}
                      </small>
                      <small className="muted">
                        {t('bisher {w} × {h}, ab {x}', { w: fmtCm(o.before.width, 0), h: fmtCm(o.before.height, 0), x: fmtCm(o.before.offset, 0) })}
                        {o.before.bottom > 0 && `, ${t('Brüstung {h}', { h: fmtCm(o.before.bottom, 0) })}`}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={adopt}>{t('Übernehmen')}</button>
            <p className="hint">{t('Schätzung aus einem Foto: gut genug zum Planen, für den Zuschnitt aber nachmessen.')}</p>
          </div>
        )}
        <label className="field">
          <span>{t('Bett-Deckkraft')}</span>
          <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={showEdges} onChange={(e) => setShowEdges(e.target.checked)} />
          <span>{t('Raumkanten zeigen')}</span>
        </label>
        <div className="row">
          <label className="file-btn small">
            {t('Anderes Foto')}
            <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <button
            className="link danger"
            onClick={() => {
              setPhoto(null)
              setUrl(undefined)
              void savePhoto(null)
            }}
          >
            {t('Foto entfernen')}
          </button>
        </div>
      </aside>
      <div className="photo-stage" ref={stageRef}>
        <div
          ref={boxRef}
          className="photo-box"
          style={fitBox(photo.w, photo.h, stage.w, stage.h)}
          onPointerDown={(e) => {
            if (dragId || !active) return
            const q = toImage(e)
            setObs(active, q.u, q.v)
            // bis 6 Punkte den nächsten freien vorschlagen, danach nichts mehr versehentlich setzen
            const count = photo.obs.filter((o) => o.id !== active).length + 1
            const next = count < 6 ? refs.find((r) => r.id !== active && !photo.obs.some((o) => o.id === r.id)) : undefined
            setActive(next?.id ?? null)
          }}
          onPointerMove={(e) => {
            if (!dragId) return
            const q = toImage(e)
            setObs(dragId, q.u, q.v, false)
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <img src={url} alt={t('Zimmerfoto')} draggable={false} />
          {solution && (
            <div className="photo-overlay" style={{ opacity }}>
              <Canvas gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }} camera={{ fov: 50 }} style={{ pointerEvents: 'none' }}>
                <PhotoCamera cam={solution.cam} w={photo.w} h={photo.h} />
                <ambientLight intensity={0.8} />
                <directionalLight position={[2, 6, 3]} intensity={1.2} />
                <MemberMeshes members={d.resolved.members} mini />
                <PanelMeshes panels={d.resolved.panels} mini />
                {showEdges && <RoomEdges p={fitted} />}
              </Canvas>
            </div>
          )}
          {solution &&
            fittedRefs.map((r) => {
              const q = projectPoint(solution.cam, r.p, photo.w, photo.h)
              if (q.depth < 0 || q.u < 0 || q.v < 0 || q.u > photo.w || q.v > photo.h) return null
              return <span key={`p-${r.id}`} className="proj-dot" style={{ left: `${(q.u / photo.w) * 100}%`, top: `${(q.v / photo.h) * 100}%` }} title={tr(r.label)} />
            })}
          {photo.obs.map((o) => {
            const r = refs.find((x) => x.id === o.id)
            if (!r) return null
            return (
              <span
                key={o.id}
                className={`marker${active === o.id ? ' on' : ''}`}
                style={{ left: `${(o.u / photo.w) * 100}%`, top: `${(o.v / photo.h) * 100}%` }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  // Zeiger festhalten: auch beim Loslassen außerhalb des Fotos endet das Ziehen
                  boxRef.current?.setPointerCapture(e.pointerId)
                  setActive(o.id)
                  setDragId(o.id)
                }}
                title={tr(r.label)}
              >
                {active === o.id && <i>{tr(r.label).replace(/\s*\([^)]*\)$/, '')}</i>}
              </span>
            )
          })}
        </div>
        {active && <div className="photo-hint">{t('Tippe im Foto auf: {point}', { point: tr(refs.find((r) => r.id === active)?.label ?? '') })}</div>}
      </div>
    </div>
  )
}
