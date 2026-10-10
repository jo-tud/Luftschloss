/**
 * Kleiner 3D-Stabwerkslöser (Weggrößenverfahren, Euler-Bernoulli-Balken mit 6 Freiheitsgraden je
 * Knoten). Einheiten: N, mm, N/mm². Verbindungen sind Kopplungen zwischen zwei Knoten mit
 * Federsteifigkeiten (verschiebungsstarr, Drehfeder je nach Verbindungsart). Gleichungslöser:
 * Skyline-LDLᵀ nach Umnummerierung mit Reverse Cuthill-McKee.
 */

export type V3 = [number, number, number]

export interface FrameNode {
  p: V3
}

export interface FrameElement {
  n1: number
  n2: number
  E: number
  G: number
  A: number
  /** Trägheitsmoment um lokale y-Achse (Biegung in lokaler x-z-Ebene) */
  Iy: number
  /** Trägheitsmoment um lokale z-Achse (Biegung in lokaler x-y-Ebene) */
  Iz: number
  J: number
  /** Lokale y-Achse (senkrecht zur Stabachse), bestimmt die Querschnittslage */
  yAxis: V3
  tag?: string
}

export interface FrameLink {
  n1: number
  n2: number
  /** Verschiebungsfeder (Strafsteifigkeit), N/mm */
  kt: number
  /** Drehfeder, Nmm/rad */
  kr: number
  tag?: string
}

export interface FrameSupport {
  node: number
  /** Gesperrte Freiheitsgrade: ux, uy, uz, rx, ry, rz */
  fix: [boolean, boolean, boolean, boolean, boolean, boolean]
}

export interface FrameModel {
  nodes: FrameNode[]
  elements: FrameElement[]
  links: FrameLink[]
  supports: FrameSupport[]
}

export interface LoadCase {
  /** Knotenlasten: Knoten → [Fx, Fy, Fz, Mx, My, Mz] */
  nodal: Map<number, number[]>
}

export interface ElementResult {
  /** Lokale Schnittgrößen an beiden Enden: [N, Vy, Vz, T, My, Mz] (Knoten 1 und 2) */
  f1: number[]
  f2: number[]
}

export interface FrameResult {
  /** Verschiebungen je Knoten [ux, uy, uz, rx, ry, rz] */
  u: Float64Array
  elements: ElementResult[]
  /** Federkraft je Kopplung (Betrag der Verschiebungsfeder-Kraft, N) und Moment (Nmm) */
  links: { force: number; moment: number }[]
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
const norm = (a: V3): V3 => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** Richtungskosinus-Matrix (Zeilen = lokale Achsen in globalen Koordinaten) */
export function elementFrame(nodes: FrameNode[], e: FrameElement): { lam: number[][]; L: number } {
  const d = sub(nodes[e.n2].p, nodes[e.n1].p)
  const L = len(d)
  const x = norm(d)
  let y = sub(e.yAxis, x.map((c) => c * dot(e.yAxis, x)) as V3)
  if (len(y) < 1e-9) y = Math.abs(x[2]) < 0.9 ? cross([0, 0, 1], x) : cross([1, 0, 0], x)
  y = norm(y)
  const z = cross(x, y)
  return { lam: [x, y, z], L }
}

/** Lokale 12×12-Steifigkeitsmatrix */
function localStiffness(e: FrameElement, L: number): number[][] {
  const k = Array.from({ length: 12 }, () => new Array(12).fill(0))
  const EA = (e.E * e.A) / L
  const GJ = (e.G * e.J) / L
  const z12 = (12 * e.E * e.Iz) / L ** 3
  const z6 = (6 * e.E * e.Iz) / L ** 2
  const z4 = (4 * e.E * e.Iz) / L
  const z2 = (2 * e.E * e.Iz) / L
  const y12 = (12 * e.E * e.Iy) / L ** 3
  const y6 = (6 * e.E * e.Iy) / L ** 2
  const y4 = (4 * e.E * e.Iy) / L
  const y2 = (2 * e.E * e.Iy) / L
  const set = (i: number, j: number, v: number) => {
    k[i][j] = v
    k[j][i] = v
  }
  set(0, 0, EA); set(6, 6, EA); set(0, 6, -EA)
  set(3, 3, GJ); set(9, 9, GJ); set(3, 9, -GJ)
  // Biegung in x-y-Ebene (uy, rz)
  set(1, 1, z12); set(7, 7, z12); set(1, 7, -z12)
  set(1, 5, z6); set(1, 11, z6); set(7, 5, -z6); set(7, 11, -z6)
  set(5, 5, z4); set(11, 11, z4); set(5, 11, z2)
  // Biegung in x-z-Ebene (uz, ry)
  set(2, 2, y12); set(8, 8, y12); set(2, 8, -y12)
  set(2, 4, -y6); set(2, 10, -y6); set(8, 4, y6); set(8, 10, y6)
  set(4, 4, y4); set(10, 10, y4); set(4, 10, y2)
  return k
}

function transform(lam: number[][]): number[][] {
  const T = Array.from({ length: 12 }, () => new Array(12).fill(0))
  for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) T[b * 3 + i][b * 3 + j] = lam[i][j]
  return T
}

function mulTKT(T: number[][], K: number[][]): number[][] {
  // Tᵀ K T
  const n = 12
  const KT = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let s = 0
      for (let m = 0; m < n; m++) s += K[i][m] * T[m][j]
      KT[i][j] = s
    }
  const R = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let s = 0
      for (let m = 0; m < n; m++) s += T[m][i] * KT[m][j]
      R[i][j] = s
    }
  return R
}

/** 12×12 Kopplungsmatrix: u2 = u1 + θ1 × r (Strafe kt) und θ2 = θ1 (Drehfeder kr) */
function linkStiffness(nodes: FrameNode[], l: FrameLink): number[][] {
  const r = sub(nodes[l.n2].p, nodes[l.n1].p)
  // d = u2 − u1 + [r]× θ1   mit [r]× θ = r × θ
  const rx = [
    [0, -r[2], r[1]],
    [r[2], 0, -r[0]],
    [-r[1], r[0], 0],
  ]
  const Tm = Array.from({ length: 3 }, () => new Array(12).fill(0))
  for (let i = 0; i < 3; i++) {
    Tm[i][i] = -1
    Tm[i][6 + i] = 1
    for (let j = 0; j < 3; j++) Tm[i][3 + j] = rx[i][j]
  }
  const K = Array.from({ length: 12 }, () => new Array(12).fill(0))
  for (let a = 0; a < 12; a++)
    for (let b = 0; b < 12; b++) {
      let s = 0
      for (let i = 0; i < 3; i++) s += Tm[i][a] * Tm[i][b]
      K[a][b] = l.kt * s
    }
  for (let i = 0; i < 3; i++) {
    K[3 + i][3 + i] += l.kr
    K[9 + i][9 + i] += l.kr
    K[3 + i][9 + i] -= l.kr
    K[9 + i][3 + i] -= l.kr
  }
  return K
}

/** Reverse Cuthill-McKee für eine kleine Bandbreite */
function rcm(n: number, adj: Set<number>[]): number[] {
  const visited = new Uint8Array(n)
  const order: number[] = []
  const degree = adj.map((s) => s.size)
  const nodesByDeg = Array.from({ length: n }, (_, i) => i).sort((a, b) => degree[a] - degree[b])
  for (const startNode of nodesByDeg) {
    if (visited[startNode]) continue
    const queue = [startNode]
    visited[startNode] = 1
    while (queue.length) {
      const v = queue.shift()!
      order.push(v)
      const nb = [...adj[v]].filter((w) => !visited[w]).sort((a, b) => degree[a] - degree[b])
      for (const w of nb) {
        visited[w] = 1
        queue.push(w)
      }
    }
  }
  return order.reverse()
}

export function solveFrame(model: FrameModel, cases: LoadCase[]): FrameResult[] {
  const nn = model.nodes.length
  const adj = Array.from({ length: nn }, () => new Set<number>())
  for (const e of model.elements) {
    adj[e.n1].add(e.n2)
    adj[e.n2].add(e.n1)
  }
  for (const l of model.links) {
    adj[l.n1].add(l.n2)
    adj[l.n2].add(l.n1)
  }
  const order = rcm(nn, adj)
  const pos = new Int32Array(nn)
  order.forEach((node, i) => (pos[node] = i))
  const ndof = nn * 6
  const dofOf = (node: number, k: number) => pos[node] * 6 + k

  // Skyline: erste Zeile je Spalte
  const first = new Int32Array(ndof)
  for (let i = 0; i < ndof; i++) first[i] = i
  const touch = (nodesList: number[]) => {
    const dofs = nodesList.flatMap((nd) => [0, 1, 2, 3, 4, 5].map((k) => dofOf(nd, k)))
    const mn = Math.min(...dofs)
    for (const d of dofs) if (mn < first[d]) first[d] = mn
  }
  for (const e of model.elements) touch([e.n1, e.n2])
  for (const l of model.links) touch([l.n1, l.n2])
  const colStart = new Int32Array(ndof + 1)
  for (let j = 0; j < ndof; j++) colStart[j + 1] = colStart[j] + (j - first[j] + 1)
  const K = new Float64Array(colStart[ndof])
  const at = (i: number, j: number) => {
    // oberes Dreieck, i ≤ j
    return colStart[j] + (i - first[j])
  }
  const addBlock = (nodesList: [number, number], ke: number[][]) => {
    const dofs = nodesList.flatMap((nd) => [0, 1, 2, 3, 4, 5].map((k) => dofOf(nd, k)))
    for (let a = 0; a < 12; a++)
      for (let b = 0; b < 12; b++) {
        const i = dofs[a]
        const j = dofs[b]
        if (i > j) continue
        K[at(i, j)] += ke[a][b]
      }
  }
  const elemData = model.elements.map((e) => {
    const { lam, L } = elementFrame(model.nodes, e)
    const kl = localStiffness(e, L)
    const T = transform(lam)
    const kg = mulTKT(T, kl)
    addBlock([e.n1, e.n2], kg)
    return { kl, T }
  })
  const linkData = model.links.map((l) => {
    const kg = linkStiffness(model.nodes, l)
    addBlock([l.n1, l.n2], kg)
    return kg
  })
  // Auflager über Strafsteifigkeit
  let maxDiag = 0
  for (let j = 0; j < ndof; j++) maxDiag = Math.max(maxDiag, K[at(j, j)])
  const penalty = Math.max(1e10, maxDiag * 1e4)
  for (const s of model.supports) s.fix.forEach((f, k) => f && (K[at(dofOf(s.node, k), dofOf(s.node, k))] += penalty))
  // Freiheitsgrade ohne jede Steifigkeit (z. B. Drehung loser Knoten) stabilisieren
  for (let j = 0; j < ndof; j++) if (K[at(j, j)] < 1e-6) K[at(j, j)] = 1

  // LDLᵀ in Skyline-Form (Spaltenweise)
  for (let j = 0; j < ndof; j++) {
    const fj = first[j]
    for (let i = fj; i < j; i++) {
      const fi = first[i]
      const m = Math.max(fi, fj)
      let s = K[at(i, j)]
      for (let k = m; k < i; k++) s -= K[at(k, i)] * K[at(k, j)]
      K[at(i, j)] = s
    }
    let d = K[at(j, j)]
    for (let k = fj; k < j; k++) {
      const lkj = K[at(k, j)] / K[at(k, k)]
      d -= lkj * K[at(k, j)]
      K[at(k, j)] = lkj
    }
    K[at(j, j)] = Math.abs(d) < 1e-12 ? 1e-12 : d
  }

  const solveRhs = (f: Float64Array): Float64Array => {
    const x = Float64Array.from(f)
    // Vorwärts: L y = f
    for (let j = 0; j < ndof; j++) {
      let s = x[j]
      for (let k = first[j]; k < j; k++) s -= K[at(k, j)] * x[k]
      x[j] = s
    }
    for (let j = 0; j < ndof; j++) x[j] /= K[at(j, j)]
    // Rückwärts: Lᵀ u = y
    for (let j = ndof - 1; j >= 0; j--) {
      const xj = x[j]
      for (let k = first[j]; k < j; k++) x[k] -= K[at(k, j)] * xj
    }
    return x
  }

  return cases.map((lc) => {
    const f = new Float64Array(ndof)
    for (const [node, loads] of lc.nodal) loads.forEach((v, k) => (f[dofOf(node, k)] += v))
    const xs = solveRhs(f)
    const u = new Float64Array(ndof)
    for (let node = 0; node < nn; node++) for (let k = 0; k < 6; k++) u[node * 6 + k] = xs[dofOf(node, k)]
    const elements = model.elements.map((e, i) => {
      const ue = [...u.slice(e.n1 * 6, e.n1 * 6 + 6), ...u.slice(e.n2 * 6, e.n2 * 6 + 6)]
      const { kl, T } = elemData[i]
      const ul = T.map((row) => row.reduce((s, t, k) => s + t * ue[k], 0))
      const fl = kl.map((row) => row.reduce((s, t, k) => s + t * ul[k], 0))
      return { f1: fl.slice(0, 6), f2: fl.slice(6, 12) }
    })
    const links = model.links.map((l, i) => {
      const ue = [...u.slice(l.n1 * 6, l.n1 * 6 + 6), ...u.slice(l.n2 * 6, l.n2 * 6 + 6)]
      const fk = linkData[i].map((row) => row.reduce((s, t, k) => s + t * ue[k], 0))
      return { force: Math.hypot(fk[6], fk[7], fk[8]), moment: Math.hypot(fk[9], fk[10], fk[11]) }
    })
    return { u, elements, links }
  })
}
