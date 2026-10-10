import { STRENGTH, catalogItem, type StrengthClass } from '../model/catalog'
import { add, dot, memberAxes, memberLength, scale, sub, v } from '../model/geometry'
import { jointType } from '../model/joints'
import type { Resolved } from '../model/resolve'
import type { Member, Panel, Project, Vec3 } from '../model/types'
import { solveFrame, type FrameElement, type FrameLink, type FrameModel, type FrameResult, type FrameSupport, type LoadCase } from './frame'

/**
 * Statik-Abschätzung des ganzen Gestells als 3D-Stabwerk.
 * Grundlagen: docs/recherche/statik-grundlagen.md (EC5 vereinfacht, deutscher NA).
 * Keine Tragwerksplanung – eine Orientierung, wo es knapp wird und ob das Gestell wackelt.
 */

export const LOADS = {
  /** Nutzlast Liegefläche: Bett 1,0 kN/m² (zwei Erwachsene ≈ 0,9 kN/m²), Hochebene 2,0 kN/m² (DIN EN 1991-1-1, A3) */
  qBett: 0.001, // N/mm²
  qHochebene: 0.002,
  /** Matratze und Bettzeug */
  mattress: 300, // N
  /** Toben: dynamische Einzellast (≈ 2 × Körpergewicht), über die Matratze auf ca. 50 × 50 cm verteilt */
  jump: 2000, // N
  /** Horizontallast für Standsicherheit/Wackeln */
  lateral: 500, // N
  /** Geländer horizontal (EN 747 Prüflast) */
  guard: 500, // N
}

const GAMMA_M = 1.3
const KDEF = 0.6
const PSI2 = 0.3
const PSI0 = 0.7

export type CaseId = 'g' | 'q' | 'jump' | 'hx' | 'hy' | 'guard'

export interface MemberCheck {
  memberId: string
  /** Maßgebende Ausnutzung (1 = 100 %) */
  util: number
  bending: number
  shear: number
  deflection: number
  /** Größte Durchbiegung im Gebrauch (Endzustand) in mm und zugehörige Stützweite */
  w: number
  span: number
  governing: string
}

export interface JointCheck {
  key: string
  util: number
  forceKN: number
  capacityKN: number
}

export interface StaticsResult {
  members: Map<string, MemberCheck>
  joints: Map<string, JointCheck>
  /** Horizontale Verschiebung auf Liegeflächenhöhe unter 0,5 kN (mm) */
  sway: { x: number; y: number }
  swayClass: 'steif' | 'spürbar' | 'wackelt'
  maxUtil: number
  /** Verformungsfiguren je Lastfall (Knotenlagen und Verschiebungen je Stab, mm) */
  shapes: Record<'gq' | 'jump' | 'hx' | 'hy', Map<string, { p: Vec3; u: Vec3 }[]>>
  warnings: string[]
  dof: number
}

interface Station {
  t: number
  node: number
}

const EXCLUDE_ROLES = new Set(['sprosse', 'stab', 'stufe'])

function isIncluded(m: Member): boolean {
  if (EXCLUDE_ROLES.has(m.role)) return false
  if (m.partKey?.startsWith('leiter-')) return false
  if (m.catalogId === 'seil-12') return false
  return true
}

function sectionProps(m: Member) {
  if (m.round) {
    const d = m.b
    return { A: (Math.PI * d * d) / 4, Iy: (Math.PI * d ** 4) / 64, Iz: (Math.PI * d ** 4) / 64, J: (Math.PI * d ** 4) / 32, Wy: (Math.PI * d ** 3) / 32, Wz: (Math.PI * d ** 3) / 32 }
  }
  const b = m.b
  const h = m.h
  const a = Math.max(b, h)
  const c = Math.min(b, h)
  const J = a * c ** 3 * (1 / 3 - 0.21 * (c / a) * (1 - c ** 4 / (12 * a ** 4)))
  return { A: b * h, Iy: (b * h ** 3) / 12, Iz: (h * b ** 3) / 12, J, Wy: (b * h * h) / 6, Wz: (h * b * b) / 6 }
}

function materialOf(m: Member): { E: number; G: number; steel: boolean; cls: StrengthClass; rho: number } {
  const item = catalogItem(m.catalogId)
  if (item?.kind === 'beschlag') return { E: 210000, G: 81000, steel: true, cls: 'C24', rho: 7850 }
  const cls: StrengthClass = item?.kind === 'stab' ? item.strength : 'C16'
  const s = STRENGTH[cls]
  return { E: s.e0mean, G: s.e0mean / 16, steel: false, cls, rho: s.rhoMean }
}

const toV3 = (q: Vec3): [number, number, number] => [q.x, q.y, q.z]

export function computeStatics(p: Project, r: Resolved, override?: { memberId: string; b: number; h: number; catalogId: string }): StaticsResult {
  const qArea = p.settings.loadProfile === 'hochebene' ? LOADS.qHochebene : LOADS.qBett
  const members = r.members.filter(isIncluded).map((m) => (override && m.id === override.memberId ? { ...m, b: override.b, h: override.h, catalogId: override.catalogId } : m))
  const byId = new Map(members.map((m) => [m.id, m]))
  const joints = r.joints.filter((j) => byId.has(j.a) && byId.has(j.b))
  const warnings: string[] = []

  // --- Stationen je Stab: Enden, Verbindungen, Auflager, Lastpunkte, Teilung ≤ 400 mm --------
  const stationT = new Map<string, number[]>()
  const axisT = (m: Member, q: Vec3) => Math.max(0, Math.min(memberLength(m), dot(sub(q, m.start), memberAxes(m)[0])))
  for (const m of members) stationT.set(m.id, [0, memberLength(m)])
  for (const j of joints) {
    stationT.get(j.a)!.push(axisT(byId.get(j.a)!, j.pos))
    stationT.get(j.b)!.push(axisT(byId.get(j.b)!, j.pos))
  }
  const fixMember = new Map<string, typeof r.fixings>()
  for (const f of r.fixings) fixMember.set(f.memberId, [...(fixMember.get(f.memberId) ?? []), f])
  for (const [id, fs] of fixMember) {
    const m = byId.get(id)
    if (!m) continue
    if (m.role === 'pfosten' && fs.some((f) => f.target === 'wand')) {
      // Kippsicherung knapp unter Oberkante Liegefläche
      const zTop = Math.max(m.start.z, m.end.z)
      const zFix = Math.min(zTop - 100, deckLevel(r, m) ?? zTop - 300)
      const t = m.end.z > m.start.z ? zFix - m.start.z : m.start.z - zFix
      stationT.get(id)!.push(Math.max(0, Math.min(memberLength(m), t)))
    }
  }
  // Lastflächen (Matratzen bzw. freie Platten) und ihre Träger
  const surfaces = loadSurfaces(r)
  const carrierIds = new Set<string>()
  for (const s of surfaces) {
    for (const c of s.carriers) carrierIds.add(c.id)
    for (const pc of patchCarriers(s, 250)) stationT.get(pc.m.id)!.push(pc.t)
  }

  const nodes: { p: [number, number, number] }[] = []
  const stations = new Map<string, Station[]>()
  const elements: FrameElement[] = []
  const elementMember: string[] = []
  for (const m of members) {
    const L = memberLength(m)
    const ts = [...new Set(stationT.get(m.id)!.map((t) => Math.round(t)))].sort((a, b) => a - b)
    const refined: number[] = []
    for (let i = 0; i < ts.length; i++) {
      if (i > 0) {
        const gap = ts[i] - ts[i - 1]
        const n = Math.ceil(gap / 400)
        for (let k = 1; k < n; k++) refined.push(ts[i - 1] + (gap * k) / n)
      }
      refined.push(ts[i])
    }
    const [ax, hb] = memberAxes(m)
    const st: Station[] = refined.filter((t, i) => i === 0 || t - refined[i - 1] > 2).map((t) => {
      nodes.push({ p: toV3(add(m.start, scale(ax, t))) })
      return { t, node: nodes.length - 1 }
    })
    stations.set(m.id, st)
    const sp = sectionProps(m)
    const mat = materialOf(m)
    for (let i = 0; i < st.length - 1; i++) {
      elements.push({ n1: st[i].node, n2: st[i + 1].node, E: mat.E, G: mat.G, A: sp.A, Iy: sp.Iy, Iz: sp.Iz, J: sp.J, yAxis: toV3(hb), tag: m.id })
      elementMember.push(m.id)
    }
    if (L < 1) warnings.push(`${m.name ?? m.id}: Länge 0`)
  }
  const nodeAt = (id: string, t: number) => {
    const st = stations.get(id)!
    let best = st[0]
    for (const s of st) if (Math.abs(s.t - t) < Math.abs(best.t - t)) best = s
    return best.node
  }

  // --- Verbindungen als Federn -------------------------------------------------------------
  const links: FrameLink[] = []
  const linkJoint: string[] = []
  for (const j of joints) {
    const jt = jointType(j.typeId)
    const kr = jt?.stiffness === 'steif' ? 3e8 : jt?.stiffness === 'halbsteif' ? 3e7 : 2e6
    links.push({ n1: nodeAt(j.a, axisT(byId.get(j.a)!, j.pos)), n2: nodeAt(j.b, axisT(byId.get(j.b)!, j.pos)), kt: 2e6, kr, tag: j.key })
    linkJoint.push(j.key)
  }

  // --- Auflager -------------------------------------------------------------------------------
  const supports: FrameSupport[] = []
  const T3: FrameSupport['fix'] = [true, true, true, false, false, false]
  for (const m of members) {
    const st = stations.get(m.id)!
    const zs = [m.start.z, m.end.z]
    if (Math.min(...zs) - (m.round ? 0 : 0) < 2 && Math.abs(m.start.z - m.end.z) > 10) {
      supports.push({ node: m.start.z < m.end.z ? st[0].node : st[st.length - 1].node, fix: T3 })
    }
  }
  for (const [id, fs] of fixMember) {
    const m = byId.get(id)
    if (!m) continue
    const st = stations.get(id)!
    for (const f of fs) {
      if (f.target === 'wand' && m.role === 'wandriegel') for (const s of st) supports.push({ node: s.node, fix: T3 })
      else if (f.target === 'wand' && m.role === 'pfosten') {
        const zTop = Math.max(m.start.z, m.end.z)
        const zFix = Math.min(zTop - 100, deckLevel(r, m) ?? zTop - 300)
        const t = m.end.z > m.start.z ? zFix - m.start.z : m.start.z - zFix
        supports.push({ node: nodeAt(id, t), fix: [true, true, false, false, false, false] })
      } else if (f.target === 'decke') {
        const top = m.end.z > m.start.z ? st[st.length - 1] : st[0]
        supports.push({ node: top.node, fix: T3 })
      }
    }
  }
  if (!supports.length) warnings.push('Keine Auflager gefunden')

  const model: FrameModel = { nodes, elements, links, supports }

  // --- Lastfälle -----------------------------------------------------------------------------
  const lc = (): LoadCase => ({ nodal: new Map() })
  const addLoad = (c: LoadCase, node: number, f: number[]) => {
    const cur = c.nodal.get(node) ?? [0, 0, 0, 0, 0, 0]
    f.forEach((x, i) => (cur[i] += x))
    c.nodal.set(node, cur)
  }
  const G = lc()
  const Q = lc()
  const J = lc()
  const HX = lc()
  const HY = lc()
  const GU = lc()
  // Eigengewicht
  elements.forEach((e, i) => {
    const m = byId.get(elementMember[i])!
    const mat = materialOf(m)
    const sp = sectionProps(m)
    const a = nodes[e.n1].p
    const b = nodes[e.n2].p
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const w = mat.rho * 9.81e-9 * sp.A * L
    addLoad(G, e.n1, [0, 0, -w / 2, 0, 0, 0])
    addLoad(G, e.n2, [0, 0, -w / 2, 0, 0, 0])
  })
  // Flächenlasten auf Träger verteilen (Einzugsbreite)
  const carrierNodes: number[] = []
  for (const s of surfaces) {
    const area = (s.x1 - s.x0) * (s.y1 - s.y0)
    const gArea = (LOADS.mattress + (s.panelWeight ?? 0)) / Math.max(1, area)
    distribute(s, (m, t0, t1, width) => {
      const st = stations.get(m.id)!.filter((x) => x.t >= t0 - 1 && x.t <= t1 + 1)
      for (let i = 0; i < st.length - 1; i++) {
        const seg = st[i + 1].t - st[i].t
        for (const [c, qa] of [[Q, qArea], [G, gArea]] as const) {
          const f = qa * width * seg
          addLoad(c, st[i].node, [0, 0, -f / 2, 0, 0, 0])
          addLoad(c, st[i + 1].node, [0, 0, -f / 2, 0, 0, 0])
        }
      }
      for (const x of st) carrierNodes.push(x.node)
    })
    // Sprunglast auf die Träger im Bereich ±250 mm um die Mitte verteilen
    const patch = patchCarriers(s, 250)
    for (const pc of patch) addLoad(J, nodeAt(pc.m.id, pc.t), [0, 0, -LOADS.jump / patch.length, 0, 0, 0])
  }
  const uniq = [...new Set(carrierNodes)]
  for (const n of uniq) {
    addLoad(HX, n, [LOADS.lateral / uniq.length, 0, 0, 0, 0, 0])
    addLoad(HY, n, [0, LOADS.lateral / uniq.length, 0, 0, 0, 0])
  }
  // Geländer: Handlauf vorne nach außen drücken
  const rail = members.find((m) => m.partKey?.startsWith('handlauf-vorne')) ?? members.find((m) => m.partKey?.startsWith('handlauf'))
  if (rail) {
    const asm = r.beds.get(rail.assemblyId ?? '')
    const mid = v((rail.start.x + rail.end.x) / 2, (rail.start.y + rail.end.y) / 2, rail.start.z)
    let dir = v(0, 1, 0)
    if (asm) {
      const cx = asm.footprint.reduce((s2, q) => s2 + q.x, 0) / 4
      const cy = asm.footprint.reduce((s2, q) => s2 + q.y, 0) / 4
      const d = v(mid.x - cx, mid.y - cy, 0)
      const l = Math.hypot(d.x, d.y) || 1
      dir = v(d.x / l, d.y / l, 0)
    }
    addLoad(GU, nodeAt(rail.id, memberLength(rail) / 2), [dir.x * LOADS.guard, dir.y * LOADS.guard, 0, 0, 0, 0])
  }

  let results: FrameResult[]
  try {
    results = solveFrame(model, [G, Q, J, HX, HY, GU])
  } catch (e) {
    warnings.push(`Berechnung fehlgeschlagen: ${(e as Error).message}`)
    results = []
  }
  const [rG, rQ, rJ, rHX, rHY, rGU] = results
  const combo = (parts: [FrameResult | undefined, number][]) => (i: number) => {
    const f1 = [0, 0, 0, 0, 0, 0]
    const f2 = [0, 0, 0, 0, 0, 0]
    for (const [res, k] of parts) {
      if (!res) continue
      res.elements[i].f1.forEach((x, n) => (f1[n] += k * x))
      res.elements[i].f2.forEach((x, n) => (f2[n] += k * x))
    }
    return { f1, f2 }
  }
  const ulsCombos: { name: string; kmod: number; f: (i: number) => { f1: number[]; f2: number[] }; links: [FrameResult | undefined, number][] }[] = [
    { name: 'Eigengewicht + Nutzlast', kmod: 0.8, f: combo([[rG, 1.35], [rQ, 1.5]]), links: [[rG, 1.35], [rQ, 1.5]] },
    { name: 'Toben (2 kN auf 50 × 50 cm)', kmod: 1.1, f: combo([[rG, 1.35], [rJ, 1.0]]), links: [[rG, 1.35], [rJ, 1.0]] },
    { name: 'Seitenlast längs', kmod: 0.9, f: combo([[rG, 1.35], [rQ, 1.5 * PSI0], [rHX, 1.5]]), links: [[rG, 1.35], [rQ, 1.5 * PSI0], [rHX, 1.5]] },
    { name: 'Seitenlast quer', kmod: 0.9, f: combo([[rG, 1.35], [rQ, 1.5 * PSI0], [rHY, 1.5]]), links: [[rG, 1.35], [rQ, 1.5 * PSI0], [rHY, 1.5]] },
    { name: 'Geländer 0,5 kN', kmod: 0.9, f: combo([[rG, 1.35], [rGU, 1.5]]), links: [[rG, 1.35], [rGU, 1.5]] },
  ]

  // --- Nachweise je Stab ---------------------------------------------------------------------
  const jointResidual = new Map<number, number>()
  joints.forEach((j, i) => {
    const res = jointType(j.typeId)?.residualSection ?? 1
    for (const n of [links[i].n1, links[i].n2]) jointResidual.set(n, Math.min(jointResidual.get(n) ?? 1, res))
  })
  const memberChecks = new Map<string, MemberCheck>()
  if (results.length) {
    const elementsOf = new Map<string, number[]>()
    elementMember.forEach((id, i) => elementsOf.set(id, [...(elementsOf.get(id) ?? []), i]))
    for (const m of members) {
      const mat = materialOf(m)
      if (mat.steel) continue
      const S = STRENGTH[mat.cls]
      const sp = sectionProps(m)
      const kcr = mat.cls === 'GL24h' ? 2.5 / S.fvk : 2.0 / S.fvk
      const L = memberLength(m)
      const imin = (m.round ? m.b / 4 : Math.min(m.b, m.h) / Math.sqrt(12)) || 1
      const lamRel = (L / imin / Math.PI) * Math.sqrt(S.fc0k / S.e005)
      const k = 0.5 * (1 + (mat.cls === 'GL24h' ? 0.1 : 0.2) * (lamRel - 0.3) + lamRel ** 2)
      const kc = lamRel <= 0.3 ? 1 : 1 / (k + Math.sqrt(k * k - lamRel * lamRel))
      let bending = 0
      let shear = 0
      let gov = ''
      for (const c of ulsCombos) {
        const fmd = (c.kmod * S.fmk) / GAMMA_M
        const ftd = (c.kmod * S.ft0k) / GAMMA_M
        const fcd = (c.kmod * S.fc0k) / GAMMA_M
        const fvd = (c.kmod * S.fvk) / GAMMA_M
        for (const i of elementsOf.get(m.id) ?? []) {
          const { f1, f2 } = c.f(i)
          const ends: [number[], number][] = [[f1, elements[i].n1], [f2, elements[i].n2]]
          for (const [f, node] of ends) {
            const res = jointResidual.get(node) ?? 1
            const N = node === elements[i].n1 ? -f[0] : f[0]
            const sm = (Math.abs(f[4]) / sp.Wy + Math.abs(f[5]) / sp.Wz) / res
            const sn = N >= 0 ? N / sp.A / res / ftd : Math.abs(N) / sp.A / res / (kc * fcd)
            const ub = sm / fmd + sn
            const tau = (1.5 * Math.max(Math.abs(f[1]), Math.abs(f[2]))) / (kcr * (m.round ? sp.A : m.b * m.h) * res)
            const us = tau / fvd
            if (ub > bending) {
              bending = ub
              gov = c.name
            }
            shear = Math.max(shear, us)
          }
        }
      }
      // Durchbiegung (Endzustand mit Kriechen) zwischen Verbindungs-/Auflagerpunkten
      const st = stations.get(m.id)!
      const fixedNodes = new Set<number>([...links.flatMap((l) => [l.n1, l.n2]), ...supports.map((s) => s.node)])
      const anchors = st.filter((s) => fixedNodes.has(s.node))
      let wMax = 0
      let span = 0
      let util = 0
      for (let a = 0; a < anchors.length - 1; a++) {
        const s0 = anchors[a]
        const s1 = anchors[a + 1]
        const segL = s1.t - s0.t
        if (segL < 150) continue
        for (const s of st.filter((x) => x.t > s0.t && x.t < s1.t)) {
          const k2 = (s.t - s0.t) / segL
          const wOf = (res: FrameResult | undefined) => {
            if (!res) return 0
            const u = (n: number) => [res.u[n * 6], res.u[n * 6 + 1], res.u[n * 6 + 2]]
            const ua = u(s0.node)
            const ub = u(s1.node)
            const ui = u(s.node)
            const rel = [0, 1, 2].map((c) => ui[c] - (ua[c] + (ub[c] - ua[c]) * k2))
            const [ax] = memberAxes(m)
            const along = rel[0] * ax.x + rel[1] * ax.y + rel[2] * ax.z
            return Math.hypot(rel[0] - along * ax.x, rel[1] - along * ax.y, rel[2] - along * ax.z)
          }
          const wfin = wOf(rG) * (1 + KDEF) + wOf(rQ) * (1 + PSI2 * KDEF)
          const winst = wOf(rG) + wOf(rQ)
          const u2 = Math.max(winst / (segL / 300), wfin / (segL / 200))
          if (u2 > util) {
            util = u2
            wMax = wfin
            span = segL
          }
        }
      }
      const total = Math.max(bending, shear, util)
      memberChecks.set(m.id, {
        memberId: m.id,
        util: total,
        bending,
        shear,
        deflection: util,
        w: wMax,
        span,
        governing: total === util ? `Durchbiegung ${wMax.toFixed(1)} mm auf ${(span / 10).toFixed(0)} cm` : total === shear ? 'Schub' : `Biegung/Normalkraft (${gov})`,
      })
    }
  }

  // --- Verbindungen --------------------------------------------------------------------------
  const jointChecks = new Map<string, JointCheck>()
  if (results.length) {
    joints.forEach((j, i) => {
      const cap = jointType(j.typeId)?.capacityKN ?? 3
      let worst = 0
      let force = 0
      for (const c of ulsCombos) {
        let F = 0
        // Federkräfte überlagern (Betrag der Summe ≈ Summe der Beträge, konservativ)
        for (const [res, k] of c.links) if (res) F += Math.abs(k) * res.links[i].force
        const rd = (cap * c.kmod) / GAMMA_M
        const u = F / 1000 / rd
        if (u > worst) {
          worst = u
          force = F / 1000
        }
      }
      jointChecks.set(j.key, { key: j.key, util: worst, forceKN: force, capacityKN: cap })
    })
  }

  // --- Wackeln -------------------------------------------------------------------------------
  const swayOf = (res: FrameResult | undefined, c: number) => (res ? Math.max(0, ...uniq.map((n) => Math.abs(res.u[n * 6 + c]))) : 0)
  const sway = { x: swayOf(rHX, 0), y: swayOf(rHY, 1) }
  const sMax = Math.max(sway.x, sway.y)
  const swayClass = sMax <= 5 ? 'steif' : sMax <= 15 ? 'spürbar' : 'wackelt'

  // --- Verformungsfiguren --------------------------------------------------------------------
  const shape = (parts: [FrameResult | undefined, number][]) => {
    const out = new Map<string, { p: Vec3; u: Vec3 }[]>()
    for (const m of members) {
      out.set(
        m.id,
        stations.get(m.id)!.map((s) => {
          const u = [0, 0, 0]
          for (const [res, k] of parts) if (res) for (let c = 0; c < 3; c++) u[c] += k * res.u[s.node * 6 + c]
          const pp = nodes[s.node].p
          return { p: v(pp[0], pp[1], pp[2]), u: v(u[0], u[1], u[2]) }
        }),
      )
    }
    return out
  }
  const maxUtil = Math.max(0, ...[...memberChecks.values()].map((c) => c.util), ...[...jointChecks.values()].map((c) => c.util))
  return {
    members: memberChecks,
    joints: jointChecks,
    sway,
    swayClass,
    maxUtil,
    shapes: { gq: shape([[rG, 1], [rQ, 1]]), jump: shape([[rG, 1], [rJ, 1]]), hx: shape([[rHX, 1]]), hy: shape([[rHY, 1]]) },
    warnings,
    dof: nodes.length * 6,
  }
}

interface Surface {
  x0: number
  x1: number
  y0: number
  y1: number
  carriers: Member[]
  panelWeight?: number
}

/** Matratzen (bzw. freie Platten ohne Matratze) und die Stäbe, auf denen sie lasten */
function loadSurfaces(r: Resolved): Surface[] {
  const out: Surface[] = []
  const horiz = (m: Member) => Math.abs(m.start.z - m.end.z) < 2
  const topOf = (m: Member) => (m.start.z + m.end.z) / 2 + m.h / 2
  const deckPanels = r.panels.filter((x) => !x.vertical && x.kind !== 'matratze' && x.kind !== 'netz')
  const bbox = (pa: Panel) => {
    const xs = pa.outline.map((q) => q.x)
    const ys = pa.outline.map((q) => q.y)
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
  }
  const surfaces: { pa: Panel; supportZ: number; weight?: number }[] = []
  for (const mat of r.panels.filter((x) => x.kind === 'matratze')) {
    const deck = deckPanels.find((d) => Math.abs(d.z + d.thickness - mat.z) < 3)
    if (deck) {
      const b = bbox(deck)
      const sheetW = deck.kind === 'rollrost' || deck.kind === 'lattenrost' ? 150 : 6 * deck.thickness * (b.x1 - b.x0) * (b.y1 - b.y0) * 1e-6
      surfaces.push({ pa: { ...mat }, supportZ: deck.z, weight: sheetW })
    } else surfaces.push({ pa: mat, supportZ: mat.z })
  }
  for (const d of deckPanels) {
    if (r.panels.some((m) => m.kind === 'matratze' && Math.abs(d.z + d.thickness - m.z) < 3)) continue
    surfaces.push({ pa: d, supportZ: d.z })
  }
  for (const s of surfaces) {
    const b = bbox(s.pa)
    const carriers = r.members.filter((m) => {
      if (!isIncluded(m) || !horiz(m) || Math.abs(topOf(m) - s.supportZ) > 3) return false
      const cx = (m.start.x + m.end.x) / 2
      const cy = (m.start.y + m.end.y) / 2
      const pad = 150
      return cx > b.x0 - pad && cx < b.x1 + pad && cy > b.y0 - pad && cy < b.y1 + pad
    })
    out.push({ ...b, carriers, panelWeight: s.weight })
  }
  return out
}

/** Verteilt die Fläche auf die parallele Hauptschar der Träger (Einzugsbreiten) */
function distribute(s: Surface, apply: (m: Member, t0: number, t1: number, width: number) => void) {
  if (!s.carriers.length) return
  const dirKey = (m: Member) => (Math.abs(m.end.x - m.start.x) > Math.abs(m.end.y - m.start.y) ? 'x' : 'y')
  const groups = { x: s.carriers.filter((m) => dirKey(m) === 'x'), y: s.carriers.filter((m) => dirKey(m) === 'y') }
  const main = groups.x.length >= groups.y.length ? 'x' : 'y'
  const list = groups[main]
  const perp = (m: Member) => (main === 'x' ? (m.start.y + m.end.y) / 2 : (m.start.x + m.end.x) / 2)
  const lo = main === 'x' ? s.y0 : s.x0
  const hi = main === 'x' ? s.y1 : s.x1
  const sorted = [...list].sort((a, b) => perp(a) - perp(b))
  sorted.forEach((m, i) => {
    const prev = i > 0 ? (perp(sorted[i - 1]) + perp(m)) / 2 : lo
    const next = i < sorted.length - 1 ? (perp(m) + perp(sorted[i + 1])) / 2 : hi
    const width = Math.max(0, Math.min(hi, next) - Math.max(lo, prev))
    // Abschnitt des Trägers innerhalb der Fläche
    const ax = memberAxes(m)[0]
    const tAt = (x: number, y: number) => dot(sub(v(x, y, m.start.z), m.start), ax)
    const ts = main === 'x' ? [tAt(s.x0, perp(m)), tAt(s.x1, perp(m))] : [tAt(perp(m), s.y0), tAt(perp(m), s.y1)]
    const L = memberLength(m)
    const t0 = Math.max(0, Math.min(...ts))
    const t1 = Math.min(L, Math.max(...ts))
    if (width > 0 && t1 > t0) apply(m, t0, t1, width)
  })
}

/** Träger nahe der Flächenmitte (für die verteilte Sprunglast); mindestens der nächste */
function patchCarriers(s: Surface, radius: number): { m: Member; t: number }[] {
  const c = v((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, 0)
  const out: { m: Member; t: number; d: number }[] = []
  for (const m of s.carriers) {
    const ax = memberAxes(m)[0]
    const t = Math.max(0, Math.min(memberLength(m), dot(sub(v(c.x, c.y, m.start.z), m.start), ax)))
    const q = add(m.start, scale(ax, t))
    out.push({ m, t, d: Math.hypot(q.x - c.x, q.y - c.y) })
  }
  const near = out.filter((x) => x.d <= radius)
  if (near.length) return near
  const best = out.sort((a, b) => a.d - b.d)[0]
  return best ? [best] : []
}

export function nearestCarrier(s: Surface): { m: Member; t: number } | undefined {
  const c = v((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, 0)
  let best: { m: Member; t: number; d: number } | undefined
  for (const m of s.carriers) {
    const ax = memberAxes(m)[0]
    const t = Math.max(0, Math.min(memberLength(m), dot(sub(v(c.x, c.y, m.start.z), m.start), ax)))
    const q = add(m.start, scale(ax, t))
    const d = Math.hypot(q.x - c.x, q.y - c.y)
    if (!best || d < best.d) best = { m, t, d }
  }
  return best && { m: best.m, t: best.t }
}

function deckLevel(r: Resolved, m: Member): number | undefined {
  if (!m.assemblyId) return undefined
  const info = r.beds.get(m.assemblyId)
  return info ? info.deckTop - 100 : undefined
}

export const UTIL_COLOR = (u: number) => (u <= 0.6 ? '#2f9e5b' : u <= 1 ? '#e0a400' : '#d64545')
