import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { timber } from '../model/catalog'
import { uid, wallFrame } from '../model/geometry'
import { bedOuterSize } from '../model/loftbed'
import type { Member, Project, Vec3 } from '../model/types'
import { derive, groupOf, isFreePart, selectionFor, useStore } from '../state/store'
import { groupParts } from '../model/groups'
import { drawSectionCaps } from './sectionCaps'
import { applyCam, camDir, camDistance, cloneCam, easeInOut, fromT, goalFor, isOrtho, lerpCam, ORTHO_FOV, T, type CamState } from './camera'
import type { PickData } from './Scene'
import { tk } from '../i18n'

interface DragState {
  kind: 'nav-orbit' | 'nav-pan' | 'nav-look' | 'object' | 'box'
  startX: number
  startY: number
  moved: boolean
  cam0: CamState
  plane?: THREE.Plane
  hit0?: THREE.Vector3
  pick?: PickData
  coalesce?: string
  apply?: (delta: Vec3, p: Project) => void
  snapshot?: Project
}

/** Gemeinsamer Kamerazustand der Hauptansicht (auch für die Übersichtskarte) */
export const mainCam: { state: CamState | null } = { state: null }

export function Controller() {
  const { camera, gl, scene, size } = useThree()
  const cam = useRef<CamState | null>(null)
  const anim = useRef<{ from: CamState; to: CamState; t0: number; dur: number } | null>(null)
  const drag = useRef<DragState | null>(null)
  const keys = useRef(new Set<string>())
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const [preview, setPreview] = useState<Member | null>(null)
  const drawStart = useRef<Vec3 | null>(null)
  const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 2.6), [])
  const boxPlanes = useMemo(() => Array.from({ length: 5 }, () => new THREE.Plane()), [])

  const view = useStore((s) => s.view)
  const viewNonce = useStore((s) => s.viewNonce)
  const focusRequest = useStore((s) => s.focusRequest)

  // Ansichtswechsel: animiert zur Zielkamera fliegen
  useEffect(() => {
    const st = useStore.getState()
    const goal = goalFor(view, st.project, derive(st.project), size.width / Math.max(1, size.height))
    if (!cam.current) {
      cam.current = goal
      applyCam(camera as THREE.PerspectiveCamera, goal)
      return
    }
    anim.current = { from: cloneCam(cam.current), to: goal, t0: performance.now(), dur: view.kind === 'person' ? 1100 : 750 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewNonce])

  // Auf ein Objekt fokussieren
  useEffect(() => {
    if (!focusRequest || !cam.current) return
    const obj = findPickObject(scene, focusRequest.id)
    if (!obj) return
    const box = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    const sz = box.getSize(new THREE.Vector3()).length()
    const to = cloneCam(cam.current)
    to.target = center
    if (!isOrtho(to) && to.viewH > 0.01) to.viewH = Math.max(0.8, sz * 1.6)
    anim.current = { from: cloneCam(cam.current), to, t0: performance.now(), dur: 600 }
  }, [focusRequest, scene])

  useFrame((_, dt) => {
    if (!cam.current) return
    if (anim.current) {
      const a = anim.current
      const t = Math.min(1, (performance.now() - a.t0) / a.dur)
      cam.current = lerpCam(a.from, a.to, easeInOut(t))
      if (t >= 1) anim.current = null
    }
    // Ich-Perspektive: mit WASD/Pfeiltasten gehen
    const st = useStore.getState()
    if (st.view.kind === 'person' && keys.current.size) {
      const c = cam.current
      const speed = 1.4 * dt
      const yaw = THREE.MathUtils.degToRad(c.yaw)
      const fwd = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw))
      const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw))
      const k = keys.current
      if (k.has('w') || k.has('arrowup')) c.target.addScaledVector(fwd, speed)
      if (k.has('s') || k.has('arrowdown')) c.target.addScaledVector(fwd, -speed)
      if (k.has('d') || k.has('arrowright')) c.target.addScaledVector(right, speed)
      if (k.has('a') || k.has('arrowleft')) c.target.addScaledVector(right, -speed)
      if (k.has('e')) c.target.y += speed
      if (k.has('q')) c.target.y -= speed
      const r = st.project.room
      c.target.x = THREE.MathUtils.clamp(c.target.x, 0.15, r.length / 1000 - 0.15)
      c.target.z = THREE.MathUtils.clamp(c.target.z, -r.width / 1000 + 0.15, -0.15)
      c.target.y = THREE.MathUtils.clamp(c.target.y, 0.2, r.height / 1000 - 0.1)
    }
    // Kamera nicht unter den Boden fahren lassen
    if (!isOrtho(cam.current) && st.view.kind !== 'person' && !anim.current) {
      const c = cam.current
      const dist = camDistance(c)
      const maxSin = (c.target.y - 0.15) / dist
      const maxPitch = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(maxSin, -1, 1)))
      if (c.pitch > maxPitch) c.pitch = maxPitch
    }
    applyCam(camera as THREE.PerspectiveCamera, cam.current)
    mainCam.state = cam.current
    // Draufsicht: oberhalb der Schnitthöhe abschneiden, damit Lampe und Stuck nicht verdecken
    const planClip = cam.current.pitch < -80 && isOrtho(cam.current)
    const boxClip = !!st.sectionBox && !isOrtho(cam.current)
    if (planClip) {
      // 1 mm unter der Wandkrone: läge die Ebene genau auf ihr (Schnitt = Raumhöhe), entschiede die
      // Rechengenauigkeit je Pixel, ob die helle Krone oder der dunkle Wandschnitt zu sehen ist (Streifen)
      clipPlane.constant = (Math.min(st.planCut, st.project.room.height) - 1) / 1000
      gl.clippingPlanes = [clipPlane]
    } else if (boxClip) {
      const b = st.sectionBox!
      // 3 mm nach außen: liegt eine Ebene genau auf einer Wandfläche (Anfangszustand = Raummaße),
      // entscheidet sonst die Rechengenauigkeit je Pixel, und die Wand wirkt gegrisselt
      const e = 3
      boxPlanes[0].set(new THREE.Vector3(1, 0, 0), -(b.x0 - e) / 1000)
      boxPlanes[1].set(new THREE.Vector3(-1, 0, 0), (b.x1 + e) / 1000)
      boxPlanes[2].set(new THREE.Vector3(0, 0, -1), -(b.y0 - e) / 1000)
      boxPlanes[3].set(new THREE.Vector3(0, 0, 1), (b.y1 + e) / 1000)
      boxPlanes[4].set(new THREE.Vector3(0, -1, 0), (b.z1 + e) / 1000)
      gl.clippingPlanes = boxPlanes
    } else gl.clippingPlanes = []
  })

  // Bild selbst zeichnen, danach die Schnittflächen (Priorität 1: läuft nach allen anderen useFrame)
  useFrame(({ gl, scene, camera }) => {
    gl.render(scene, camera)
    drawSectionCaps(gl, scene, camera)
  }, 1)

  useEffect(() => {
    const el = gl.domElement
    el.style.touchAction = 'none'
    const ndc = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect()
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }
    const ray = (e: { clientX: number; clientY: number }) => {
      raycaster.setFromCamera(ndc(e), camera)
      return raycaster.ray
    }
    const pick = (e: { clientX: number; clientY: number }): { data: PickData; point: THREE.Vector3 } | null => {
      raycaster.setFromCamera(ndc(e), camera)
      const hits = raycaster.intersectObjects(scene.children, true)
      for (const h of hits) {
        if (!visibleChain(h.object)) continue
        if (clipPlaneActive() && h.point.y > clipPlane.constant) continue
        const data = pickOf(h.object)
        if (data) return { data, point: h.point }
        // Wände/Boden verdecken dahinterliegende Objekte nicht für die Auswahl
      }
      return null
    }
    const clipPlaneActive = () => gl.clippingPlanes.length > 0
    const worldPerPixel = () => {
      const c = cam.current!
      return c.viewH / el.clientHeight
    }
    const viewPlaneThrough = (pt: THREE.Vector3): THREE.Plane => {
      const c = cam.current!
      const st = useStore.getState()
      if (st.view.kind === 'elev' || (isOrtho(c) && c.pitch > -45)) {
        const n = camDir(c).multiplyScalar(-1)
        n.y = 0
        n.normalize()
        return new THREE.Plane().setFromNormalAndCoplanarPoint(n, pt)
      }
      return new THREE.Plane(new THREE.Vector3(0, 1, 0), -pt.y)
    }

    // Auswahlrahmen (Shift + Ziehen)
    const boxDiv = document.createElement('div')
    boxDiv.className = 'select-box'
    el.parentElement?.appendChild(boxDiv)
    const selectInBox = (x0: number, y0: number, x1: number, y1: number) => {
      const st = useStore.getState()
      const r = el.getBoundingClientRect()
      const [lx, hx, ly, hy] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)]
      const inside = (q: { x: number; y: number; z: number }) => {
        const v = T(q.x, q.y, q.z).project(camera)
        const sx = r.left + ((v.x + 1) / 2) * r.width
        const sy = r.top + ((1 - v.y) / 2) * r.height
        return v.z < 1 && sx >= lx && sx <= hx && sy >= ly && sy <= hy
      }
      const p = st.project
      const ids = [
        ...p.members.filter((m) => !m.groupId && inside({ x: (m.start.x + m.end.x) / 2, y: (m.start.y + m.end.y) / 2, z: (m.start.z + m.end.z) / 2 })).map((m) => m.id),
        ...p.panels
          .filter((x) => {
            if (x.groupId) return false
            const n = x.outline.length || 1
            return inside({ x: x.outline.reduce((a, q) => a + q.x, 0) / n, y: x.outline.reduce((a, q) => a + q.y, 0) / n, z: x.z + (x.vertical ? x.vertical.height / 2 : x.thickness / 2) })
          })
          .map((x) => x.id),
      ]
      if (!ids.length) return
      // zur bestehenden Auswahl hinzufügen
      const cur = st.multi.length ? st.multi : st.selection && isFreePart(p, st.selection.id) ? [st.selection.id] : []
      const all = [...new Set([...cur, ...ids])]
      if (all.length > 1) useStore.setState({ multi: all, selection: selectionFor(p, all[all.length - 1]) })
      else st.select(selectionFor(p, all[0]))
    }

    // Finger auf dem Bildschirm (für Zwei-Finger-Gesten) und Doppeltipp
    const touches = new Map<number, { x: number; y: number }>()
    let gesture: { d0: number; mx: number; my: number; a0: number; cam0: CamState } | null = null
    let lastTap = { t: 0, x: 0, y: 0 }
    const startGesture = () => {
      const [a, b] = [...touches.values()]
      const c = cam.current!
      gesture = { d0: Math.hypot(b.x - a.x, b.y - a.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, a0: Math.atan2(b.y - a.y, b.x - a.x), cam0: cloneCam(c) }
      // laufendes Ziehen eines Objekts abschließen, Navigation abbrechen
      if (drag.current?.kind !== 'object') drag.current = null
    }

    const onPointerDown = (e: PointerEvent) => {
      // Ein Eingabefeld zuerst übernehmen lassen: sonst wechselt die Auswahl vor dem Blur und der getippte
      // Wert landet am neu gewählten Objekt
      const ae = document.activeElement as HTMLElement | null
      if (ae && ae !== el && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA')) ae.blur()
      el.setPointerCapture(e.pointerId)
      const st = useStore.getState()
      const c = cam.current
      if (!c) return
      anim.current = null
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (touches.size === 2) {
          startGesture()
          return
        }
        if (touches.size > 2) return
      }
      const base: DragState = { kind: 'nav-pan', startX: e.clientX, startY: e.clientY, moved: false, cam0: cloneCam(c) }
      const person = st.view.kind === 'person'
      const cad = st.mouseProfile === 'cad'
      if (e.button === 2 || (e.button === 0 && e.altKey)) {
        drag.current = { ...base, kind: person ? 'nav-look' : cad ? 'nav-pan' : 'nav-orbit' }
        return
      }
      if (e.button === 1) {
        // mittlere Taste verschiebt immer, im CAD-Profil dreht Shift + mittlere Taste
        drag.current = { ...base, kind: person ? 'nav-look' : cad && e.shiftKey ? 'nav-orbit' : 'nav-pan' }
        return
      }
      if (e.button !== 0) return
      if (st.tool !== 'select') {
        drawClick(e)
        return
      }
      const hit = pick(e)
      if (hit?.data.kind === 'joint') {
        st.set({ jointDetail: hit.data.id })
        return
      }
      if (hit?.data.kind === 'handle') {
        const plane = viewPlaneThrough(hit.point)
        const m = st.project.members.find((x) => x.id === hit.data.id)
        const end = hit.data.end!
        if (m) {
          const p0 = m[end]
          const elev = st.view.kind === 'elev' || (isOrtho(c) && c.pitch > -45)
          drag.current = {
            ...base,
            kind: 'object',
            plane,
            hit0: hit.point.clone(),
            pick: hit.data,
            coalesce: `griff-${Date.now()}`,
            snapshot: st.project,
            apply: (delta, d) => {
              const dm = d.members.find((x) => x.id === m.id)!
              let q = { x: p0.x + delta.x, y: p0.y + delta.y, z: p0.z + (elev ? delta.z : 0) }
              if (st.snap) q = snapPoint(q, { ...d, members: d.members.filter((x) => x.id !== m.id) } as Project, st.grid, worldPerPixel() * 12 * 1000)
              dm[end] = { x: Math.round(q.x), y: Math.round(q.y), z: Math.round(elev ? q.z : p0.z) }
            },
          }
        }
        return
      }
      if (hit && e.shiftKey && isFreePart(st.project, hit.data.id)) {
        // Shift-Klick: freies Teil zur Mehrfachauswahl hinzufügen bzw. herausnehmen
        st.toggleMulti(hit.data.id)
        drag.current = { ...base, kind: person ? 'nav-look' : isOrtho(c) || st.mouseProfile === 'cad' ? 'nav-pan' : 'nav-orbit', pick: hit.data }
        return
      }
      if (e.shiftKey && e.button === 0 && !person) {
        // Shift + Ziehen neben einem freien Teil: Rahmen aufziehen, freie Teile darin auswählen
        drag.current = { ...base, kind: 'box', pick: hit?.data }
        return
      }
      if (hit) {
        const sel = selectionFor(st.project, hit.data.id)
        // Erst anklicken/antippen = auswählen; Ziehen verschiebt nur, was schon ausgewählt ist
        // (ein Teil eines ausgewählten Betts verschiebt das ganze Bett). Sonst dreht bzw. schiebt die Ansicht.
        const asmOf = (id?: string) => (id?.includes(':') ? id.split(':')[0] : id)
        const cur = st.selection
        // eigenes Bett: über ein freies Teil oder seine Matratze (ID mit Bett-Präfix)
        const prefix = hit.data.id.split(':')[0]
        const grp = groupOf(st.project, hit.data.id) ?? (st.project.groups.some((g) => g.id === prefix) ? prefix : undefined)
        const already =
          st.multi.includes(hit.data.id) ||
          (!!cur &&
            !!sel &&
            ((cur.kind === sel.kind && cur.id === sel.id) ||
              (hit.data.id.includes(':') && asmOf(cur.id) === asmOf(hit.data.id)) ||
              (!!grp && (cur.id === grp || groupOf(st.project, cur.id) === grp))))
        if (!already) st.select(sel)
        if (!already) {
          drag.current = { ...base, kind: person ? 'nav-look' : isOrtho(c) || st.mouseProfile === 'cad' ? 'nav-pan' : 'nav-orbit', pick: hit.data }
          return
        }
        const plane = viewPlaneThrough(hit.point)
        // ein selbst konstruiertes Bett bzw. eine Mehrfachauswahl wird als Ganzes verschoben
        const together = st.multi.includes(hit.data.id) ? st.multi : grp ? groupParts(st.project, grp) : undefined
        const mover = makeMover(st.project, hit.data, st.view.kind === 'elev' || (isOrtho(c) && c.pitch > -45), together, st.multi.includes(hit.data.id) ? undefined : grp)
        if (mover) {
          drag.current = { ...base, kind: 'object', plane, hit0: hit.point.clone(), pick: hit.data, apply: mover, coalesce: `drag-${Date.now()}`, snapshot: st.project }
          return
        }
      }
      drag.current = { ...base, kind: person ? 'nav-look' : isOrtho(c) || st.mouseProfile === 'cad' ? 'nav-pan' : 'nav-orbit', pick: undefined }
    }

    const onPointerMove = (e: PointerEvent) => {
      const st = useStore.getState()
      const c = cam.current
      if (!c) return
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (gesture && touches.size >= 2) {
          const [a, b] = [...touches.values()]
          const d = Math.hypot(b.x - a.x, b.y - a.y)
          const mx = (a.x + b.x) / 2
          const my = (a.y + b.y) / 2
          const g = gesture
          if (st.view.kind === 'person') {
            c.fov = THREE.MathUtils.clamp((g.cam0.fov * g.d0) / Math.max(1, d), 35, 110)
            return
          }
          // Pinch = Zoom, zwei Finger verschieben = Pan, Drehen = Ansicht drehen (3D)
          c.viewH = THREE.MathUtils.clamp((g.cam0.viewH * g.d0) / Math.max(1, d), 0.3, 40)
          const wpp = c.viewH / el.clientHeight
          const dir = camDir(c)
          const right = new THREE.Vector3().crossVectors(dir, (camera as THREE.PerspectiveCamera).up).normalize()
          const up = new THREE.Vector3().crossVectors(right, dir).normalize()
          c.target.copy(g.cam0.target).addScaledVector(right, -(mx - g.mx) * wpp).addScaledVector(up, (my - g.my) * wpp)
          if (!isOrtho(c)) c.yaw = g.cam0.yaw - THREE.MathUtils.radToDeg(Math.atan2(b.y - a.y, b.x - a.x) - g.a0)
          return
        }
      }
      const dr = drag.current
      if (!dr) {
        hoverAndCursor(e)
        return
      }
      const dx = e.clientX - dr.startX
      const dy = e.clientY - dr.startY
      if (!dr.moved && Math.hypot(dx, dy) < (dr.kind === 'object' ? 7 : 4)) return
      dr.moved = true
      if (dr.kind === 'nav-orbit') {
        if (isOrtho(dr.cam0)) {
          // Aus Draufsicht/Seitenansicht heraus drehen: weich in die 3D-Ansicht wechseln
          useStore.setState({ view: { kind: '3d' } })
          const to = cloneCam(dr.cam0)
          to.fov = 40
          to.pitch = Math.max(-80, Math.min(-10, dr.cam0.pitch < -80 ? -55 : -15))
          anim.current = { from: cloneCam(c), to, t0: performance.now(), dur: 500 }
          dr.cam0 = to
          dr.startX = e.clientX
          dr.startY = e.clientY
          return
        }
        c.yaw = dr.cam0.yaw + dx * 0.3
        c.pitch = THREE.MathUtils.clamp(dr.cam0.pitch - dy * 0.25, -89, 60)
      } else if (dr.kind === 'box') {
        boxDiv.style.display = 'block'
        const r = el.getBoundingClientRect()
        boxDiv.style.left = `${Math.min(dr.startX, e.clientX) - r.left}px`
        boxDiv.style.top = `${Math.min(dr.startY, e.clientY) - r.top}px`
        boxDiv.style.width = `${Math.abs(dx)}px`
        boxDiv.style.height = `${Math.abs(dy)}px`
      } else if (dr.kind === 'nav-look') {
        c.yaw = dr.cam0.yaw - dx * 0.2
        c.pitch = THREE.MathUtils.clamp(dr.cam0.pitch + dy * 0.2, -85, 85)
      } else if (dr.kind === 'nav-pan') {
        const wpp = worldPerPixel()
        const dir = camDir(c)
        const right = new THREE.Vector3().crossVectors(dir, (camera as THREE.PerspectiveCamera).up).normalize()
        const up = new THREE.Vector3().crossVectors(right, dir).normalize()
        c.target.copy(dr.cam0.target).addScaledVector(right, -dx * wpp).addScaledVector(up, dy * wpp)
      } else if (dr.kind === 'object' && dr.plane && dr.hit0 && dr.apply && dr.snapshot) {
        const p = ray(e).intersectPlane(dr.plane, new THREE.Vector3())
        if (!p) return
        const d = fromT(p.clone().sub(dr.hit0))
        const g = st.snap ? st.grid : 1
        const delta = { x: Math.round(d.x / g) * g, y: Math.round(d.y / g) * g, z: Math.round(d.z / g) * g }
        // vom Ausgangszustand aus anwenden, damit sich Rundungen nicht aufsummieren
        st.updateFrom(dr.snapshot, (draft) => dr.apply!(delta, draft), dr.coalesce!)
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      el.releasePointerCapture(e.pointerId)
      const st = useStore.getState()
      if (e.pointerType === 'touch') {
        touches.delete(e.pointerId)
        if (gesture) {
          if (touches.size < 2) gesture = null
          drag.current = null
          st.endCoalesce()
          return
        }
      }
      const dr = drag.current
      drag.current = null
      if (dr?.kind === 'box') {
        boxDiv.style.display = 'none'
        if (dr.moved) selectInBox(dr.startX, dr.startY, e.clientX, e.clientY)
        // Shift-Klick ohne Ziehen auf ein Teil, das nicht frei ist: ganz normal auswählen
        else if (dr.pick) st.select(selectionFor(st.project, dr.pick.id))
        st.endCoalesce()
        return
      }
      // Klick ins Leere hebt die Auswahl auf, mit Shift (Mehrfachauswahl) nicht
      if (dr && !dr.moved && dr.kind !== 'object' && !dr.pick && e.button === 0 && st.tool === 'select' && !e.shiftKey) st.select(null)
      // Doppeltipp = auf das Teil zentrieren
      if (e.pointerType === 'touch' && dr && !dr.moved) {
        const now = performance.now()
        if (now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) onDblClick(e)
        lastTap = { t: now, x: e.clientX, y: e.clientY }
      }
      st.endCoalesce()
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const c = cam.current
      if (!c) return
      // Beim Ziehen mit gedrücktem Mausrad melden manche Mäuse kleine Drehungen mit:
      // solange eine Taste gedrückt ist bzw. gezogen wird, nicht zoomen
      if (e.buttons !== 0 || drag.current) return
      anim.current = null
      const st = useStore.getState()
      if (st.view.kind === 'person') {
        c.fov = THREE.MathUtils.clamp(c.fov * Math.exp(e.deltaY * 0.001), 35, 110)
        return
      }
      const k = Math.exp(e.deltaY * 0.0012)
      // zum Mauszeiger hin zoomen
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir(c).multiplyScalar(-1), c.target)
      const p = ray(e).intersectPlane(plane, new THREE.Vector3())
      c.viewH = THREE.MathUtils.clamp(c.viewH * k, 0.3, 40)
      if (p) c.target.sub(p).multiplyScalar(k).add(p)
    }

    const onDblClick = (e: MouseEvent) => {
      const hit = pick(e)
      const st = useStore.getState()
      // Doppelklick mit Shift gehört zur Mehrfachauswahl, nicht zum Heranholen
      if (e.shiftKey) return
      if (hit) {
        const sel = selectionFor(st.project, hit.data.id)
        st.select(sel)
        // Heranholen: weich zum angeklickten Punkt fliegen, jeder weitere Doppelklick geht näher heran
        const c = cam.current
        if (c && st.view.kind !== 'person') {
          const to = cloneCam(c)
          to.target = hit.point.clone()
          to.viewH = Math.max(0.35, c.viewH * 0.45)
          anim.current = { from: cloneCam(c), to, t0: performance.now(), dur: 650 }
        } else st.focus(sel?.kind === 'member' && hit.data.id.includes(':') ? hit.data.id.split(':')[0] : hit.data.id)
      }
    }

    let hoverFrame = 0
    const hoverAndCursor = (e: PointerEvent) => {
      if (hoverFrame) return
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0
        const st = useStore.getState()
        const hit = pick(e)
        const id = hit ? (hit.data.id.includes(':') ? hit.data.id.split(':')[0] : hit.data.id) : null
        st.setHover(id)
        el.style.cursor = st.tool !== 'select' ? 'crosshair' : hit ? 'pointer' : 'default'
        const pt = workPoint(e)
        useStore.setState({ cursor: pt })
        if (st.tool === 'balken' && drawStart.current && pt) setPreview(makeBeam(drawStart.current, constrain(drawStart.current, pt, e.shiftKey), st.toolCatalogId))
        else if (st.tool === 'pfosten' && pt) setPreview(makePost(pt, st.toolCatalogId, st.workingHeight))
        else setPreview(null)
      })
    }

    /** Punkt auf der Arbeitsebene (Draufsicht/3D: waagrecht auf Arbeitshöhe; Seitenansicht: parallel zur Wand) */
    const workPoint = (e: { clientX: number; clientY: number }): Vec3 | null => {
      const st = useStore.getState()
      const c = cam.current!
      let plane: THREE.Plane
      if (st.view.kind === 'elev') {
        const f = wallFrame(st.project.room, st.view.wall)
        const pt = T(f.start.x + f.n.x * st.workingDepth, f.start.y + f.n.y * st.workingDepth, 0)
        plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(f.n.x, 0, -f.n.y), pt)
      } else {
        const z = st.tool === 'pfosten' ? 0 : st.workingHeight
        plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -z / 1000)
      }
      void c
      const p = ray(e).intersectPlane(plane, new THREE.Vector3())
      if (!p) return null
      let q = fromT(p)
      if (st.snap) q = snapPoint(q, st.project, st.grid, worldPerPixel() * 12 * 1000)
      return { x: Math.round(q.x), y: Math.round(q.y), z: Math.round(q.z) }
    }

    const constrain = (a: Vec3, b: Vec3, shift: boolean): Vec3 => {
      if (!shift) return b
      const d = { x: Math.abs(b.x - a.x), y: Math.abs(b.y - a.y), z: Math.abs(b.z - a.z) }
      const m = Math.max(d.x, d.y, d.z)
      return { x: d.x === m ? b.x : a.x, y: d.y === m ? b.y : a.y, z: d.z === m ? b.z : a.z }
    }

    const drawClick = (e: PointerEvent) => {
      const st = useStore.getState()
      const pt = workPoint(e)
      if (!pt) return
      if (st.tool === 'pfosten') {
        const m = makePost(pt, st.toolCatalogId, st.workingHeight)
        st.update((d) => void d.members.push(m))
        st.select({ kind: 'member', id: m.id })
        return
      }
      if (!drawStart.current) {
        drawStart.current = pt
        return
      }
      const end = constrain(drawStart.current, pt, e.shiftKey)
      if (Math.hypot(end.x - drawStart.current.x, end.y - drawStart.current.y, end.z - drawStart.current.z) < 20) return
      const m = makeBeam(drawStart.current, end, st.toolCatalogId)
      st.update((d) => void d.members.push(m))
      st.select({ kind: 'member', id: m.id })
      drawStart.current = e.ctrlKey ? end : null
      setPreview(null)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      const k = e.key.toLowerCase()
      if (useStore.getState().view.kind === 'person' && ['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        keys.current.add(k)
        e.preventDefault()
      }
      if (k === 'escape') {
        drawStart.current = null
        setPreview(null)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    const noMenu = (e: Event) => e.preventDefault()
    // mittlere Taste: kein Auto-Scrollen (Windows) und kein Einfügen (Linux)
    const noMiddle = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault()
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('dblclick', onDblClick)
    el.addEventListener('contextmenu', noMenu)
    el.addEventListener('mousedown', noMiddle)
    el.addEventListener('auxclick', noMiddle)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      boxDiv.remove()
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('dblclick', onDblClick)
      el.removeEventListener('contextmenu', noMenu)
      el.removeEventListener('mousedown', noMiddle)
      el.removeEventListener('auxclick', noMiddle)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [camera, gl, scene, raycaster, clipPlane])

  // Beim Werkzeugwechsel angefangene Zeichnung verwerfen
  const tool = useStore((s) => s.tool)
  useEffect(() => {
    drawStart.current = null
    setPreview(null)
  }, [tool])

  if (!preview) return null
  const len = Math.hypot(preview.end.x - preview.start.x, preview.end.y - preview.start.y, preview.end.z - preview.start.z)
  const mid = T((preview.start.x + preview.end.x) / 2, (preview.start.y + preview.end.y) / 2, (preview.start.z + preview.end.z) / 2)
  const dir = T(preview.end.x - preview.start.x, preview.end.y - preview.start.y, preview.end.z - preview.start.z).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), len > 0 ? dir : new THREE.Vector3(1, 0, 0))
  return (
    <mesh position={mid} quaternion={q}>
      <boxGeometry args={[Math.max(len, 1) / 1000, preview.b / 1000, preview.h / 1000]} />
      <meshStandardMaterial color="#ff8a3d" transparent opacity={0.6} />
    </mesh>
  )
}

function visibleChain(o: THREE.Object3D | null): boolean {
  while (o) {
    if (!o.visible) return false
    o = o.parent
  }
  return true
}

function pickOf(o: THREE.Object3D | null): PickData | null {
  while (o) {
    if (o.userData?.pick) return o.userData.pick as PickData
    o = o.parent
  }
  return null
}

function findPickObject(scene: THREE.Scene, id: string): THREE.Object3D | null {
  const found: THREE.Object3D[] = []
  scene.traverse((o) => {
    const p = o.userData?.pick as PickData | undefined
    if (p && (p.id === id || p.id.startsWith(`${id}:`))) found.push(o)
  })
  if (!found.length) return null
  if (found.length === 1) return found[0]
  const g = new THREE.Group()
  // Hüllkörper über mehrere Objekte: temporäre Gruppe aus Klonen der Weltlage
  for (const o of found) {
    const box = new THREE.Box3().setFromObject(o)
    const m = new THREE.Mesh(new THREE.BoxGeometry(...box.getSize(new THREE.Vector3()).toArray()))
    m.position.copy(box.getCenter(new THREE.Vector3()))
    g.add(m)
  }
  return g
}

function makeBeam(a: Vec3, b: Vec3, catalogId: string): Member {
  const item = timber(catalogId)
  const vertical = Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1
  // Arbeitshöhe = Oberkante: Achse um h/2 tiefer
  const dz = vertical ? 0 : item.h / 2
  return {
    id: uid('balken'),
    role: vertical ? 'pfosten' : 'zarge',
    name: vertical ? tk('Pfosten') : tk('Balken'),
    start: { x: a.x, y: a.y, z: a.z - dz },
    end: { x: b.x, y: b.y, z: b.z - dz },
    catalogId,
    b: item.b,
    h: item.h,
    round: item.round,
    roll: 0,
  }
}

function makePost(pt: Vec3, catalogId: string, height: number): Member {
  const item = timber(catalogId)
  return {
    id: uid('pfosten'),
    role: 'pfosten',
    name: tk('Pfosten'),
    start: { x: pt.x, y: pt.y, z: 0 },
    end: { x: pt.x, y: pt.y, z: height },
    catalogId,
    b: item.b,
    h: item.b === item.h ? item.h : item.h,
    round: item.round,
    roll: 0,
  }
}

/** Fang: Bauteilenden, Wände, Raster */
function snapPoint(q: Vec3, p: Project, grid: number, radius: number): Vec3 {
  const d = derive(p)
  let best: Vec3 | null = null
  let bestD = radius
  for (const m of d.resolved.members) {
    for (const e of [m.start, m.end]) {
      const dd = Math.hypot(e.x - q.x, e.y - q.y)
      if (dd < bestD) {
        bestD = dd
        best = { x: e.x, y: e.y, z: q.z }
      }
    }
  }
  if (best) return best
  const r = p.room
  const out = { x: Math.round(q.x / grid) * grid, y: Math.round(q.y / grid) * grid, z: Math.round(q.z / grid) * grid }
  if (Math.abs(q.x) < radius) out.x = 0
  if (Math.abs(q.x - r.length) < radius) out.x = r.length
  if (Math.abs(q.y) < radius) out.y = 0
  if (Math.abs(q.y - r.width) < radius) out.y = r.width
  return out
}

/** Liefert eine Funktion, die ein gezogenes Objekt um delta verschiebt (vom Ausgangszustand aus). */
function makeMover(p: Project, pick: PickData, elevation: boolean, together?: string[], groupId?: string): ((delta: Vec3, d: Project) => void) | null {
  if (together?.length) {
    const ms = p.members.filter((m) => together.includes(m.id))
    const ps = p.panels.filter((x) => together.includes(x.id))
    const deck = p.groups.find((g) => g.id === groupId)?.deck
    return (delta, d) => {
      const dz = elevation ? delta.z : 0
      // die Liegefläche wandert mit dem Bett
      const dg = d.groups.find((g) => g.id === groupId)
      if (deck && dg) dg.deck = { ...deck, x: deck.x + delta.x, y: deck.y + delta.y, z: deck.z + dz }
      const mv = (q: Vec3) => ({ x: q.x + delta.x, y: q.y + delta.y, z: q.z + dz })
      for (const m of ms) {
        const dm = d.members.find((x) => x.id === m.id)!
        dm.start = mv(m.start)
        dm.end = mv(m.end)
      }
      for (const pa of ps) {
        const dp = d.panels.find((x) => x.id === pa.id)!
        dp.outline = pa.outline.map((q) => ({ x: q.x + delta.x, y: q.y + delta.y }))
        dp.z = pa.z + dz
        if (pa.vertical) dp.vertical = { ...pa.vertical, a: { x: pa.vertical.a.x + delta.x, y: pa.vertical.a.y + delta.y }, b: { x: pa.vertical.b.x + delta.x, y: pa.vertical.b.y + delta.y } }
      }
    }
  }
  const assemblyId = pick.id.includes(':') ? pick.id.split(':')[0] : null
  if (assemblyId) {
    const a = p.assemblies.find((x) => x.id === assemblyId)
    if (!a) return null
    return (delta, d) => {
      const da = d.assemblies.find((x) => x.id === assemblyId)!
      if (elevation) {
        // In der Seitenansicht: waagrecht verschieben, senkrecht die Liegehöhe ändern
        da.params.deckHeight = Math.max(300, a.params.deckHeight + delta.z)
        da.params.x = a.params.x + delta.x
        da.params.y = a.params.y + delta.y
        return
      }
      let x = a.params.x + delta.x
      let y = a.params.y + delta.y
      // an Wände andocken
      const { length, width } = bedOuterSize(a.params)
      const rot = a.params.rotation
      const ex = rot === 90 || rot === 270 ? width : length
      const ey = rot === 90 || rot === 270 ? length : width
      const ox = rot === 90 || rot === 180 ? -ex : 0
      const oy = rot === 180 || rot === 270 ? -ey : 0
      const snap = 60
      const r = d.room
      if (Math.abs(x + ox) < snap) x = -ox
      if (Math.abs(x + ox + ex - r.length) < snap) x = r.length - ex - ox
      if (Math.abs(y + oy) < snap) y = -oy
      if (Math.abs(y + oy + ey - r.width) < snap) y = r.width - ey - oy
      // an den Wänden anhalten statt hindurchzufahren
      if (ex <= r.length) x = Math.min(Math.max(x, -ox), r.length - ex - ox)
      if (ey <= r.width) y = Math.min(Math.max(y, -oy), r.width - ey - oy)
      da.params.x = x
      da.params.y = y
    }
  }
  if (pick.kind === 'member') {
    const m = p.members.find((x) => x.id === pick.id)
    if (!m) return null
    return (delta, d) => {
      const dm = d.members.find((x) => x.id === pick.id)!
      dm.start = { x: m.start.x + delta.x, y: m.start.y + delta.y, z: m.start.z + (elevation ? delta.z : 0) }
      dm.end = { x: m.end.x + delta.x, y: m.end.y + delta.y, z: m.end.z + (elevation ? delta.z : 0) }
    }
  }
  if (pick.kind === 'furniture') {
    const f = p.furniture.find((x) => x.id === pick.id)
    if (!f) return null
    return (delta, d) => {
      const df = d.furniture.find((x) => x.id === pick.id)!
      df.x = f.x + delta.x
      df.y = f.y + delta.y
      if (elevation) df.z = Math.max(0, f.z + delta.z)
    }
  }
  if (pick.kind === 'rosette') {
    const ro = p.room.rosettes.find((x) => x.id === pick.id)
    if (!ro) return null
    return (delta, d) => {
      const dr = d.room.rosettes.find((x) => x.id === pick.id)!
      dr.x = ro.x + delta.x
      dr.y = ro.y + delta.y
    }
  }
  if (pick.kind === 'wallObject') {
    const o = p.wallObjects.find((x) => x.id === pick.id)
    if (!o) return null
    const f = wallFrame(p.room, o.wall)
    return (delta, d) => {
      const dobj = d.wallObjects.find((x) => x.id === pick.id)!
      const along = delta.x * f.u.x + delta.y * f.u.y
      dobj.offset = Math.max(0, Math.min(f.length - o.width, o.offset + along))
      if (elevation) {
        if (dobj.kind === 'fenster' && o.kind === 'fenster') dobj.sillHeight = Math.max(0, o.sillHeight + delta.z)
        if ((dobj.kind === 'heizkoerper' || dobj.kind === 'steckdose') && (o.kind === 'heizkoerper' || o.kind === 'steckdose')) dobj.bottom = Math.max(0, o.bottom + delta.z)
      }
    }
  }
  return null
}

export { ORTHO_FOV, camDistance }
