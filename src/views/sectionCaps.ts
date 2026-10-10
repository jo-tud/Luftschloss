import * as THREE from 'three'

/**
 * Schnittflächen für die Schnittbox: Die Körper sind Hüllen, geschnitten wären sie innen hohl und
 * von innen durchsichtig. Solange geschnitten wird, zeichnen undurchsichtige Materialien auch ihre
 * Rückseiten – flach in abgedunkelter Eigenfarbe. Durch den Schnitt sieht man genau diese Innenseiten,
 * sie wirken wie eine gefüllte Schnittfläche (übliches CAD-Verfahren).
 */
const CAP = `#include <dithering_fragment>
  if (!gl_FrontFacing) gl_FragColor = vec4(diffuseColor.rgb * 0.72, 1.0);`

type Capped = THREE.MeshStandardMaterial & { userData: { cap?: { side: THREE.Side; obc: THREE.Material['onBeforeCompile']; key: () => string } } }

export function setSectionCaps(scene: THREE.Object3D, on: boolean) {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue
      const m = mat as Capped
      const cap = m.userData.cap
      if (on && !cap) {
        // durchsichtige und ohnehin beidseitige Flächen (Decke, Lampe, Laub) bleiben, wie sie sind
        if (m.transparent || m.side === THREE.DoubleSide) continue
        const obc = m.onBeforeCompile
        const key = m.customProgramCacheKey
        m.userData.cap = { side: m.side, obc, key }
        m.side = THREE.DoubleSide
        m.onBeforeCompile = (shader, renderer) => {
          obc.call(m, shader, renderer)
          shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', CAP)
        }
        m.customProgramCacheKey = () => `${key.call(m)}|schnitt`
        m.needsUpdate = true
      } else if (!on && cap) {
        m.side = cap.side
        m.onBeforeCompile = cap.obc
        m.customProgramCacheKey = cap.key
        delete m.userData.cap
        m.needsUpdate = true
      }
    }
  })
}
