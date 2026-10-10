import * as THREE from 'three'

/**
 * Schnittflächen: Die Körper sind Hüllen – aufgeschnitten sähe man in sie hinein (Innenseiten, Maserung
 * quer, Matratzenbezug von unten) und sie wirkten hohl. Deshalb wird nach dem Bild für jede
 * Schnittebene und jeden davon getroffenen Körper genau dessen Querschnitt flach gefüllt
 * (Stencil-Verfahren): Jede Fläche des Körpers, die hinter der Ebene liegt, kippt ein Bit. Wo der
 * Blick in den Körper hinein-, aber nicht wieder herausführt, bleibt es gesetzt – dort liegt der
 * Schnitt, und dort wird eine Fläche auf der Ebene gezeichnet.
 *
 * Nur geschlossene, undurchsichtige Körper bekommen eine Schnittfläche; Flächen wie Boden und Decke,
 * Glas und Hilfsgrafik nicht. Wände nehmen die dunkle Schnittfarbe aus dem Material (userData.capColor).
 */

const parity = new THREE.MeshBasicMaterial({
  side: THREE.DoubleSide,
  colorWrite: false,
  depthWrite: false,
  depthTest: false,
  stencilWrite: true,
  stencilFunc: THREE.AlwaysStencilFunc,
  stencilFail: THREE.InvertStencilOp,
  stencilZFail: THREE.InvertStencilOp,
  stencilZPass: THREE.InvertStencilOp,
})

const capMaterial = new THREE.MeshBasicMaterial({
  side: THREE.DoubleSide,
  stencilWrite: true,
  stencilRef: 0,
  stencilFunc: THREE.NotEqualStencilFunc,
  stencilFail: THREE.KeepStencilOp,
  stencilZFail: THREE.ZeroStencilOp,
  stencilZPass: THREE.ZeroStencilOp,
})

const capScene = new THREE.Scene()
capScene.matrixWorldAutoUpdate = false
const empty = new THREE.BufferGeometry()
const proxy = new THREE.Mesh(empty)
proxy.matrixAutoUpdate = false
proxy.frustumCulled = false
const cap = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), capMaterial)
cap.matrixAutoUpdate = false
cap.frustumCulled = false
capScene.add(proxy, cap)

const FLAT = new Set(['PlaneGeometry', 'CircleGeometry', 'RingGeometry', 'ShapeGeometry'])
const box = new THREE.Box3()
const zAxis = new THREE.Vector3(0, 0, 1)
const point = new THREE.Vector3()
const color = new THREE.Color()

/** Kann der Körper einen Querschnitt haben? Geschlossen, undurchsichtig, einseitig */
function solid(mesh: THREE.Mesh): THREE.Material | null {
  if ((mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || mesh.userData.noCap) return null
  const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  if (!m || !m.visible || m.transparent || !m.colorWrite || m.side !== THREE.FrontSide) return null
  // nur beleuchtete Oberflächen; Hilfsgrafik (MeshBasic, dicke Linien von drei = Mesh mit Linienshader) nicht
  const lit = m as THREE.MeshStandardMaterial & THREE.MeshLambertMaterial & THREE.MeshPhongMaterial
  if (!lit.isMeshStandardMaterial && !lit.isMeshLambertMaterial && !lit.isMeshPhongMaterial) return null
  if (FLAT.has(mesh.geometry.type)) return null
  return m
}

function capColor(m: THREE.Material): THREE.Color {
  const c = m.userData.capColor as string | undefined
  if (c) return color.set(c)
  const base = (m as THREE.MeshStandardMaterial).color
  return base ? color.copy(base).multiplyScalar(0.78) : color.set('#5d5850')
}

const corner = new THREE.Vector3()
const size = new THREE.Vector2()

/**
 * Scissor auf das Bildschirmrechteck des Quaders setzen. false, wenn er ganz außerhalb liegt; liegt eine
 * Ecke hinter der Kamera, gilt das ganze Bild.
 */
function scissorTo(gl: THREE.WebGLRenderer, camera: THREE.Camera, b: THREE.Box3): boolean {
  gl.getSize(size)
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(camera.matrixWorldInverse)
    if (corner.z > -1e-3 && (camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      gl.setScissor(0, 0, size.x, size.y)
      gl.setScissorTest(true)
      return true
    }
    corner.applyMatrix4(camera.projectionMatrix)
    x0 = Math.min(x0, corner.x)
    x1 = Math.max(x1, corner.x)
    y0 = Math.min(y0, corner.y)
    y1 = Math.max(y1, corner.y)
  }
  if (x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1) return false
  const px = (v: number, n: number) => Math.round(((Math.max(-1, Math.min(1, v)) + 1) / 2) * n)
  const sx = px(x0, size.x)
  const sy = px(y0, size.y)
  gl.setScissor(sx - 1, sy - 1, px(x1, size.x) - sx + 2, px(y1, size.y) - sy + 2)
  gl.setScissorTest(true)
  return true
}

/** Schnittflächen für die gerade aktiven Schnittebenen des Renderers zeichnen (nach dem Bild) */
export function drawSectionCaps(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const all = gl.clippingPlanes.slice()
  if (!all.length) return
  const meshes: { mesh: THREE.Mesh; mat: THREE.Material }[] = []
  scene.traverseVisible((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const mat = solid(mesh)
    if (mat) meshes.push({ mesh, mat })
  })
  const autoClear = gl.autoClear
  gl.autoClear = false
  for (let i = 0; i < all.length; i++) {
    const plane = all[i]
    const others = all.filter((_, j) => j !== i)
    cap.position.copy(plane.coplanarPoint(point))
    cap.quaternion.setFromUnitVectors(zAxis, plane.normal)
    cap.updateMatrix()
    cap.matrixWorld.copy(cap.matrix)
    for (const { mesh, mat } of meshes) {
      const g = mesh.geometry
      if (!g.boundingBox) g.computeBoundingBox()
      if (!box.copy(g.boundingBox!).applyMatrix4(mesh.matrixWorld).intersectsPlane(plane)) continue
      // nur im Bildausschnitt des Körpers arbeiten – sonst wäre jede Schnittfläche ein Vollbild-Durchgang
      if (!scissorTo(gl, camera, box)) continue
      gl.clear(false, false, true)
      // 1. Querschnitt ins Stencil: alle Flächen des Körpers, mit allen Ebenen beschnitten
      gl.clippingPlanes = all
      proxy.geometry = g
      proxy.matrixWorld.copy(mesh.matrixWorld)
      proxy.material = parity
      proxy.visible = true
      cap.visible = false
      gl.render(capScene, camera)
      // 2. Fläche auf der Ebene, nur im Querschnitt, von den übrigen Ebenen begrenzt
      gl.clippingPlanes = others
      capMaterial.color.copy(capColor(mat))
      proxy.visible = false
      cap.visible = true
      gl.render(capScene, camera)
    }
  }
  gl.setScissorTest(false)
  gl.clippingPlanes = all
  gl.autoClear = autoClear
  proxy.geometry = empty
}
