import * as THREE from 'three'

/**
 * Prozedurale Materialien (ohne Texturen, offline): Holz mit Faser und Jahresringen, Dielenboden, Putz.
 * Alles in GLSL über onBeforeCompile an MeshStandardMaterial – Licht, Schatten und Auswahl-Leuchten
 * bleiben wie gewohnt.
 */

const NOISE = /* glsl */ `
float lsHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float lsNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lsHash(i), lsHash(i + vec3(1, 0, 0)), f.x), mix(lsHash(i + vec3(0, 1, 0)), lsHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(lsHash(i + vec3(0, 0, 1)), lsHash(i + vec3(1, 0, 1)), f.x), mix(lsHash(i + vec3(0, 1, 1)), lsHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float lsFbm(vec3 x) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * lsNoise(x);
    x = x * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}
`

/** Holzarten: Ringe je Meter, Kontrast Spätholz, Rauheit */
export type WoodKind = 'kvh' | 'gehobelt' | 'latte' | 'leimholz' | 'osb' | 'dielen'

const WOOD: Record<WoodKind, { rings: number; late: number; rough: number; fibre: number }> = {
  kvh: { rings: 190, late: 0.24, rough: 0.82, fibre: 0.07 },
  gehobelt: { rings: 230, late: 0.2, rough: 0.6, fibre: 0.05 },
  latte: { rings: 160, late: 0.26, rough: 0.85, fibre: 0.08 },
  leimholz: { rings: 260, late: 0.16, rough: 0.55, fibre: 0.04 },
  osb: { rings: 0, late: 0, rough: 0.85, fibre: 0 },
  dielen: { rings: 200, late: 0.18, rough: 0.5, fibre: 0.05 },
}

const cache = new Map<string, THREE.MeshStandardMaterial>()

/**
 * Holzmaterial für Quader, deren lokale x-Achse in Faserrichtung liegt. Der Zufallswert je Bauteil
 * kommt aus seiner Lage (modelMatrix), daher braucht es kein eigenes Material je Teil.
 */
export function woodMaterial(kind: WoodKind, color: string, opts: { emissive?: string; opacity?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${kind}|${color}|${opts.emissive ?? ''}|${opts.opacity ?? 1}`
  let m = cache.get(key)
  if (m) return m
  const w = WOOD[kind]
  m = new THREE.MeshStandardMaterial({
    color,
    roughness: w.rough,
    transparent: (opts.opacity ?? 1) < 1,
    opacity: opts.opacity ?? 1,
    emissive: opts.emissive ?? '#000000',
    // Auswahl: warme Tönung, Holz und Maserung bleiben sichtbar
    emissiveIntensity: opts.emissive ? 0.38 : 0,
  })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLsLocal;\nvarying vec3 vLsLocalN;\nvarying float vLsSeed;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLsLocal = position;
        vLsLocalN = normal;
        vLsSeed = fract(sin(dot(modelMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);`,
      )
    const body =
      kind === 'osb'
        ? `
        // OSB: längliche, gedrehte Späne in Flächenzellen
        vec2 q = (abs(vLsLocalN.z) > 0.5 ? vLsLocal.xy : abs(vLsLocalN.y) > 0.5 ? vLsLocal.xz : vLsLocal.yz) * 18.0;
        vec2 cell = floor(q);
        float h = lsHash(vec3(cell, vLsSeed * 13.0));
        float ang = h * 6.2831;
        vec2 d = fract(q) - 0.5;
        vec2 r2 = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d;
        float strand = smoothstep(0.5, 0.15, abs(r2.y) * 2.2) * smoothstep(0.55, 0.3, abs(r2.x));
        vec3 woodCol = diffuseColor.rgb * (0.8 + 0.35 * h) * (0.9 + 0.12 * strand);
        diffuseColor.rgb = woodCol;`
        : `
        vec3 p = vLsLocal;
        float s = vLsSeed;
        // Mark (Herz) neben dem Querschnitt – KVH ist herzgetrennt
        vec2 pith = vec2(-0.11 - 0.08 * s, -0.07 + 0.14 * fract(s * 7.13));
        float wobble = lsFbm(vec3(p.x * 2.2, p.y * 9.0, p.z * 9.0) + s * 31.0);
        float r = length(p.yz - pith) + wobble * 0.006 + 0.002 * sin(p.x * 3.0 + s * 9.0);
        float ring = fract(r * ${w.rings.toFixed(1)});
        float late = smoothstep(0.62, 0.92, ring) * (1.0 - smoothstep(0.96, 1.0, ring));
        float fibre = lsNoise(vec3(p.x * 6.0, p.y * 900.0, p.z * 900.0));
        vec3 woodCol = diffuseColor.rgb * (1.0 - ${w.late.toFixed(3)} * late) * (0.93 + 0.14 * s) * (1.0 - ${w.fibre.toFixed(3)} + ${w.fibre.toFixed(3)} * 2.0 * fibre);
        // Hirnholz an den Stirnseiten etwas dunkler
        woodCol *= mix(1.0, 0.84, step(0.5, abs(vLsLocalN.x)));
        // Äste: selten, dunkel, elliptisch auf den Längsseiten
        float knot = lsNoise(vec3(p.x * 4.0, p.y * 4.0 + s * 5.0, p.z * 4.0));
        woodCol *= 1.0 - 0.35 * smoothstep(0.86, 0.95, knot);
        diffuseColor.rgb = woodCol;`
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLsLocal;\nvarying vec3 vLsLocalN;\nvarying float vLsSeed;\n${NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${body}`)
  }
  m.customProgramCacheKey = () => `ls-wood-${kind}`
  cache.set(key, m)
  return m
}

/** Dielenboden in Weltkoordinaten (Meter): Bretter längs, versetzte Stöße, Fugen */
export function floorMaterial(color: string): THREE.MeshStandardMaterial {
  const key = `floor|${color}`
  let m = cache.get(key)
  if (m) return m
  m = new THREE.MeshStandardMaterial({ color, roughness: 0.55 })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLsWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLsWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLsWorld;\n${NOISE}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Bretter 16 cm breit entlang der Raumtiefe, Stöße alle 2,4 m versetzt
        float bw = 0.16;
        float bx = vLsWorld.x / bw;
        float bi = floor(bx);
        float off = lsHash(vec3(bi, 3.0, 7.0)) * 2.4;
        float along = vLsWorld.z + off;
        float bj = floor(along / 2.4);
        float seed = lsHash(vec3(bi, bj, 1.0));
        float fx = fract(bx);
        float fz = fract(along / 2.4);
        float seam = max(1.0 - smoothstep(0.0, 0.012, fx) * smoothstep(1.0, 0.988, fx), 1.0 - smoothstep(0.0, 0.0015, fz) * smoothstep(1.0, 0.9985, fz));
        float grain = lsFbm(vec3(vLsWorld.x * 40.0, vLsWorld.z * 2.0, seed * 50.0));
        float rings = fract((vLsWorld.x * 30.0 + grain * 1.8) + seed * 3.0);
        vec3 col = diffuseColor.rgb * (0.86 + 0.24 * seed) * (0.94 + 0.1 * grain) * (1.0 - 0.1 * smoothstep(0.7, 0.95, rings));
        col *= 1.0 - 0.45 * seam;
        diffuseColor.rgb = col;`,
      )
  }
  m.customProgramCacheKey = () => 'ls-floor'
  cache.set(key, m)
  return m
}

/** Putz: leichte, großflächige Farbschwankung */
export function plasterMaterial(color: string, opts: { opacity?: number; side?: THREE.Side } = {}): THREE.MeshStandardMaterial {
  const key = `putz|${color}|${opts.opacity ?? 1}|${opts.side ?? THREE.FrontSide}`
  let m = cache.get(key)
  if (m) return m
  m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLsWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLsWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLsWorld;\n${NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\ndiffuseColor.rgb *= 0.965 + 0.05 * lsFbm(vLsWorld * 3.0) + 0.012 * lsNoise(vLsWorld * 140.0);`)
  }
  m.customProgramCacheKey = () => 'ls-putz'
  cache.set(key, m)
  return m
}

/** Holzart aus Katalog-ID */
export function woodKindFor(catalogId: string | undefined): WoodKind {
  if (!catalogId) return 'kvh'
  if (catalogId.startsWith('osb')) return 'osb'
  if (catalogId.startsWith('leimholz') || catalogId.startsWith('3s') || catalogId.startsWith('mpx')) return 'leimholz'
  if (catalogId.startsWith('geh-')) return 'gehobelt'
  if (catalogId.startsWith('latte')) return 'latte'
  if (catalogId.startsWith('nf-') || catalogId.includes('diele')) return 'dielen'
  return 'kvh'
}
