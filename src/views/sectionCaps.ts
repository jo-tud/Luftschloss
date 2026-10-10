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
  gl.clippingPlanes = all
  gl.autoClear = autoClear
  proxy.geometry = empty
}
