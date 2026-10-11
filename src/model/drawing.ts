import { tk } from '../i18n'
import type { Fastener } from './fasteners'
import { add, dot, memberAxes, memberBoxes, memberLength, scale, sub, v, type OBB } from './geometry'
import { memberSolids, prismCorners, toLocal, type LocalBox, type MemberCut, type Range } from './joinery'
import type { Member, Vec3 } from './types'

/**
 * Werkstattzeichnung eines Werkstücks an einer Verbindung, aus derselben Geometrie wie 3D-Ansicht und
 * Verbindungsdetail. Gezeichnet wird in Stabkoordinaten (u entlang der Achse, v quer über b, w über h)
 * in drei Ansichten. Bemaßt wird steigend: alle Längen vom Bezugsende, alle Querlagen von der
 * Bezugskante – so summieren sich beim Anreißen keine Fehler.
 */

export type ViewKey = 'b' | 'h' | 'stirn'

export interface Seg {
  a: [number, number]
  b: [number, number]
}

export interface DrawHole {
  x: number
  y: number
  d: number
  /** Kreis (Bohrachse quer zur Ansicht) bzw. Linienpaar (Bohrung von der Seite gesehen) */
  round: boolean
  /** von der sichtbaren Fläche aus gebohrt bzw. durchgehend */
  visible: boolean
  /** Linienpaar: Anfang und Ende entlang der Bohrung */
  from?: [number, number]
  to?: [number, number]
}

export interface View2D {
  key: ViewKey
  title: Text
  /** Zeichenbereich in mm: x nach rechts, y nach oben */
  x: Range
  y: Range
  /** sichtbare Kanten (Umriss und offene Ausnehmungen) */
  edges: Seg[]
  /** verdeckte Kanten (gestrichelt) */
  hidden: Seg[]
  /** Abfall (wird schraffiert), nur in der Ansicht, in der er offen liegt */
  waste: { x: Range; y: Range }[]
  holes: DrawHole[]
  /** Maße entlang x (vom Bezugsende 0) und y (von der Bezugskante 0) */
  dimX: number[]
  dimY: number[]
  /** Holz geht über den Ausschnitt hinaus (Bruchkante zeichnen) */
  broken: { left: boolean; right: boolean }
  /** Länge der Querachse (für die Beschriftung „b“ bzw. „h“) */
  across: number
  /** Mittellinien schräger Nuten (Gratnut an der Wange) mit Winkel zur Längskante in Grad */
  lines: { a: [number, number]; b: [number, number]; deg: number }[]
}

export interface HoleRow {
  /** Position vom Bezugsende und von der Bezugskante */
  x: number
  y: number
  face: Text
  d: number
  /** Tiefe in mm; durch = ganz durch */
  depth: number
  through: boolean
  /** im Verbund mit diesem anderen Teil bohren */
  with?: string
  note?: string
  /** von beiden Seiten gebohrt (je eine Bohrung von jeder Seite) */
  both?: boolean
}

export interface PartDrawing {
  member: Member
  /** Zuschnittlänge (Gesamtausdehnung inkl. Zapfen und Blatt) */
  length: number
  /** Bezugsende am Anfang (u klein) oder am Ende des Stabs */
  refAtStart: boolean
  /** Name des Bezugsendes für die Beschriftung */
  refName: Text
  views: View2D[]
  holes: HoleRow[]
}

const EPS = 0.5
const r1 = (x: number) => Math.round(x)

/** Weltpunkt in Stabkoordinaten */
function local(m: Member, p: Vec3): [number, number, number] {
  const ax = memberAxes(m)
  const d = sub(p, m.start)
  return [dot(d, ax[0]), dot(d, ax[1]), dot(d, ax[2])]
}

/** Umriss einer Menge achsparalleler Rechtecke: Kanten zwischen belegten und freien Zellen */
function unionEdges(rects: { x: Range; y: Range }[]): Seg[] {
  if (!rects.length) return []
  const xs = [...new Set(rects.flatMap((r) => [r.x[0], r.x[1]].map((v) => Math.round(v * 10) / 10)))].sort((a, b) => a - b)
  const ys = [...new Set(rects.flatMap((r) => [r.y[0], r.y[1]].map((v) => Math.round(v * 10) / 10)))].sort((a, b) => a - b)
  const filled = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return false
    const cx = (xs[i] + xs[i + 1]) / 2
    const cy = (ys[j] + ys[j + 1]) / 2
    return rects.some((r) => cx > r.x[0] && cx < r.x[1] && cy > r.y[0] && cy < r.y[1])
  }
  const out: Seg[] = []
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < ys.length; j++) if (filled(i, j) !== filled(i, j - 1)) out.push({ a: [xs[i], ys[j]], b: [xs[i + 1], ys[j]] })
  for (let j = 0; j < ys.length - 1; j++)
    for (let i = 0; i < xs.length; i++) if (filled(i, j) !== filled(i - 1, j)) out.push({ a: [xs[i], ys[j]], b: [xs[i], ys[j + 1]] })
  return merge(out)
}

/** Kollineare, aneinanderstoßende Strecken zusammenfassen */
function merge(segs: Seg[]): Seg[] {
  const h = segs.filter((s) => s.a[1] === s.b[1]).sort((p, q) => p.a[1] - q.a[1] || p.a[0] - q.a[0])
  const v = segs.filter((s) => s.a[0] === s.b[0]).sort((p, q) => p.a[0] - q.a[0] || p.a[1] - q.a[1])
  const out: Seg[] = []
  for (const s of h) {
    const last = out[out.length - 1]
    if (last && last.a[1] === s.a[1] && last.b[1] === s.a[1] && Math.abs(last.b[0] - s.a[0]) < 0.05) last.b = [s.b[0], s.b[1]]
    else out.push({ a: [...s.a], b: [...s.b] })
  }
  const n = out.length
  for (const s of v) {
    const last = out.length > n ? out[out.length - 1] : undefined
    if (last && last.a[0] === s.a[0] && last.b[0] === s.a[0] && Math.abs(last.b[1] - s.a[1]) < 0.05) last.b = [s.b[0], s.b[1]]
    else out.push({ a: [...s.a], b: [...s.b] })
  }
  return out
}

/**
 * Zeichnung eines Stabs um die Stelle at (Weltpunkt, meist der Knoten). cut: Bearbeitungen des Stabs
 * (alle Verbindungen oder nur diese), fasteners: Befestigungsmittel, deren Bohrungen den Stab treffen.
 * others: Name je Bauteil-ID für „im Verbund mit …“.
 */
export interface DrawOpts {
  /** Stelle der Verbindung (Ausschnitt um diesen Punkt) */
  at?: Vec3
  fasteners: Fastener[]
  /** andere Teile, durch die Bohrungen gehen können („im Verbund mit …“), mit ihrer Ausdehnung entlang der Achse */
  others: Map<string, Member>
  ranges?: Map<string, Range>
  label: (m: Member) => string
  /** Richtung zum anderen Teil der Verbindung: von dieser Seite aus wird gezeichnet */
  toward?: Vec3
  towardName?: string
  /** Name des Bezugsendes (am Anfang bzw. Ende des Stabs) */
  endName?: (atStart: boolean) => Text
  /** Mitte des Betts: Seiten heißen dann Innen- bzw. Außenseite */
  center?: Vec3
  /** Teil der Leiter: innen heißt dann „zu den Stufen“ */
  ladder?: boolean
  /** Mittellinien von Nuten: Punkt auf der Fläche, Richtung der Nut, Außennormale der Fläche (Welt) */
  lines?: { p: Vec3; d: Vec3; n: Vec3 }[]
  /** ganzes Teil zeichnen (Teile-Arbeitsplan) statt eines Ausschnitts um die Verbindung */
  full?: boolean
  /** Bezugsende vorgeben (sonst das Ende näher an der Verbindung) */
  refAtStart?: boolean
}

export interface Text {
  key: string
  vars?: Record<string, string | number>
}

export function partDrawing(m: Member, cut: MemberCut | undefined, o: DrawOpts): PartDrawing {
  const { at, fasteners, others, label } = o
  const L = memberLength(m)
  const sol = memberSolids(m, cut)
  // Körper in Stabkoordinaten: Quader exakt, Prismen über ihre Ecken
  const boxes: LocalBox[] = sol.boxes.map((o) => toLocal(m, o))
  const prismPts = sol.prisms.map((p) => {
    const { bottom, top } = prismCorners(p)
    return { bottom: bottom.map((q) => local(m, q)), top: top.map((q) => local(m, q)) }
  })
  let u0 = 0
  let u1 = L
  for (const b of boxes) {
    u0 = Math.min(u0, b[0][0])
    u1 = Math.max(u1, b[0][1])
  }
  for (const p of prismPts)
    for (const q of [...p.bottom, ...p.top]) {
      u0 = Math.min(u0, q[0])
      u1 = Math.max(u1, q[0])
    }
  const uj = at ? local(m, at)[0] : (u0 + u1) / 2
  const refAtStart = o.refAtStart ?? uj - u0 <= u1 - uj
  const X = (u: number) => (refAtStart ? u - u0 : u1 - u)
  const xj = X(uj)
  const total = u1 - u0
  // Ausschnitt um den Knoten; nahe am Ende bis zum Ende
  const W = Math.max(m.b, m.h) * 1.6 + 60
  let wa = Math.max(0, xj - W)
  let wb = Math.min(total, xj + W)
  if (wa < W * 0.6) wa = 0
  if (total - wb < W * 0.6) wb = total
  const half = [m.b / 2, m.h / 2]
  // Ausnehmungen (Abfall): Teile des Grundquerschnitts, die nicht mehr da sind
  const base: LocalBox[] = memberBoxes(m).map((o: OBB) => toLocal(m, o))
  const subs: LocalBox[] = (cut?.sub ?? []).map((s) => s)

  const views: View2D[] = []
  const axes = memberAxes(m)
  const horizontal = Math.abs(axes[0].z) < 0.5
  const towardDot = (ax: 1 | 2) => (o.toward ? dot(o.toward, axes[ax]) : 0)
  const mid = add(m.start, scale(axes[0], L / 2))
  /**
   * Name der Fläche mit der Außennormalen n (Welt): oben/unten, innen (zur Bettmitte) bzw. außen,
   * dazu „zu“ bzw. „gegenüber“ dem anderen Teil der Verbindung – so liegt die Schablone auf der richtigen Seite
   */
  const faceText = (n: Vec3): Text | undefined => {
    if (n.z > 0.7) return { key: tk('Oberseite') }
    if (n.z < -0.7) return { key: tk('Unterseite') }
    const tw = o.toward && o.towardName ? dot(n, o.toward) : 0
    const io = o.center ? dot(v(n.x, n.y, 0), v(o.center.x - mid.x, o.center.y - mid.y, 0)) : 0
    const inner = io > 1e-6 ? true : io < -1e-6 ? false : undefined
    if (Math.abs(tw) > 0.7) {
      if (inner === undefined) return tw > 0 ? { key: tk('Seite zu {name}'), vars: { name: o.towardName! } } : { key: tk('Seite gegenüber {name}'), vars: { name: o.towardName! } }
      if (tw > 0) return inner ? { key: tk('Innenseite, zu {name}'), vars: { name: o.towardName! } } : { key: tk('Außenseite, zu {name}'), vars: { name: o.towardName! } }
      return inner ? { key: tk('Innenseite, gegenüber {name}'), vars: { name: o.towardName! } } : { key: tk('Außenseite, gegenüber {name}'), vars: { name: o.towardName! } }
    }
    // schmale Fläche eines hochkant stehenden Holzes (Kante einer Treppenwange, eines Bretts)
    const k = Math.abs(dot(n, axes[1])) >= Math.abs(dot(n, axes[2])) ? 1 : 2
    const faceW = k === 1 ? m.h : m.b
    const otherW = k === 1 ? m.b : m.h
    if (inner !== undefined && faceW < otherW / 1.3) return inner ? { key: tk('Schmalseite innen') } : { key: tk('Schmalseite außen') }
    if (inner !== undefined && o.ladder) return inner ? { key: tk('Innenseite (zu den Stufen)') } : { key: tk('Außenseite') }
    if (inner !== undefined) return inner ? { key: tk('Innenseite (zur Bettmitte)') } : { key: tk('Außenseite') }
    return undefined
  }
  const title = (ax: 1 | 2): Text => {
    const named = faceText(scale(axes[ax], side(ax)))
    if (named) return named
    if (horizontal) return ax === 2 ? { key: tk('Ansicht von oben') } : { key: tk('Ansicht von der Seite') }
    if (o.toward && o.towardName) return { key: tk('Seite daneben') }
    return { key: m.h > m.b ? (ax === 1 ? tk('Breitseite') : tk('Schmalseite')) : ax === 1 ? tk('Seite 1') : tk('Seite 2') }
  }
  // Blick auf die Seite, an der die Bearbeitung liegt (zum anderen Teil hin); waagrechte Hölzer von oben
  const side = (ax: 1 | 2): 1 | -1 => {
    const d = towardDot(ax)
    if (Math.abs(d) > 0.3) return d > 0 ? 1 : -1
    if (horizontal && ax === 2) return axes[2].z >= 0 ? 1 : -1
    // ohne Bezugsteil: die Seite, zu der die meisten Ausnehmungen offen sind (Nuten der zweiten Wange)
    const h = half[ax - 1]
    let plus = 0
    let minus = 0
    for (const s of subs) {
      const up = s[ax][1] >= h - EPS
      const down = s[ax][0] <= -h + EPS
      if (up && !down) plus++
      else if (down && !up) minus++
    }
    return minus > plus ? -1 : 1
  }
  const VIEWS: { key: ViewKey; ax: 1 | 2 }[] = [
    // Blick entlang v zeigt u × w, Blick entlang w zeigt u × v
    { key: 'h', ax: 1 },
    { key: 'b', ax: 2 },
  ]
  const holesLocal = holeList(m, fasteners, [...others.values()], boxes, o.ranges)
  // ganzes Teil: nur die Bereiche mit Bearbeitungen, je ein Ausschnitt (ein 2 m langes Holz wäre sonst ein Strich)
  const windows: [number, number][] = []
  if (o.full) {
    const xs: number[] = []
    for (const sb of subs) xs.push(X(sb[0][0]), X(sb[0][1]))
    for (const h of holesLocal) xs.push(X(h.entry[0]), X(h.exit[0]))
    for (const b of boxes) if (b[0][0] < -EPS || b[0][1] > L + EPS) xs.push(X(b[0][0]), X(b[0][1]))
    for (const p of prismPts) for (const q of [...p.bottom, ...p.top]) xs.push(X(q[0]))
    xs.sort((a, b) => a - b)
    for (const x of xs) {
      const last = windows[windows.length - 1]
      if (last && x - last[1] < 250) last[1] = Math.max(last[1], x)
      else windows.push([x, x])
    }
    for (const w of windows) {
      w[0] = w[0] - 60 < 150 ? 0 : w[0] - 60
      w[1] = total - (w[1] + 60) < 150 ? total : w[1] + 60
    }
  } else windows.push([wa, wb])
  for (const [xa, xb] of windows)
  for (const vw of VIEWS) {
    // Ansicht entlang Achse vw.ax; die andere Querachse ist y
    const yAx = vw.ax === 1 ? 2 : 1
    const yHalf = half[yAx - 1]
    const dHalf = half[vw.ax - 1]
    const sg = side(vw.ax)
    const Y = (c: number) => c + yHalf
    const clipX = (r: Range): Range | undefined => {
      const a = Math.max(xa, Math.min(X(r[0]), X(r[1])))
      const b = Math.min(xb, Math.max(X(r[0]), X(r[1])))
      return b - a > 0.2 ? [a, b] : undefined
    }
    const rects: { x: Range; y: Range }[] = []
    for (const b of boxes) {
      const x = clipX(b[0])
      if (x) rects.push({ x, y: [Y(b[yAx][0]), Y(b[yAx][1])] })
    }
    const edges = unionEdges(rects)
    const hidden: Seg[] = []
    const waste: { x: Range; y: Range }[] = []
    // Ausnehmungen: offen zur Blickseite (+) sichtbar, sonst verdeckt; durchgehende ändern den Umriss schon
    for (const s of subs) {
      const x = clipX(s[0])
      if (!x) continue
      const y: Range = [Y(Math.max(-yHalf, s[yAx][0])), Y(Math.min(yHalf, s[yAx][1]))]
      if (y[1] - y[0] < 0.2) continue
      const inBase = base.some((bb) => bb[0][0] < s[0][1] && bb[0][1] > s[0][0])
      if (!inBase) continue
      const open = sg > 0 ? s[vw.ax][1] >= dHalf - EPS : s[vw.ax][0] <= -dHalf + EPS
      const through = s[vw.ax][1] >= dHalf - EPS && s[vw.ax][0] <= -dHalf + EPS
      const sides: Seg[] = [
        { a: [x[0], y[0]], b: [x[1], y[0]] },
        { a: [x[1], y[0]], b: [x[1], y[1]] },
        { a: [x[1], y[1]], b: [x[0], y[1]] },
        { a: [x[0], y[1]], b: [x[0], y[0]] },
      ]
      if (open) {
        edges.push(...sides)
        if (!through) waste.push({ x, y })
      } else hidden.push(...sides)
    }
    // Prismen (Schwalbenschwanz, Kopfband, Auffüllungen) als Umrisse ihrer Deckflächen
    for (const p of prismPts) {
      for (const poly of [p.bottom, p.top]) {
        for (let i = 0; i < poly.length; i++) {
          const q = poly[i]
          const r = poly[(i + 1) % poly.length]
          const a: [number, number] = [X(q[0]), Y(q[yAx])]
          const b: [number, number] = [X(r[0]), Y(r[yAx])]
          if (Math.max(a[0], b[0]) < xa || Math.min(a[0], b[0]) > xb) continue
          if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.5) edges.push({ a, b })
        }
      }
      // Kanten zwischen Grund- und Deckfläche (in der Ansicht von der Seite sichtbar, z. B. ein schräger Endschnitt)
      for (let i = 0; i < p.bottom.length; i++) {
        const a: [number, number] = [X(p.bottom[i][0]), Y(p.bottom[i][yAx])]
        const b: [number, number] = [X(p.top[i][0]), Y(p.top[i][yAx])]
        if (Math.max(a[0], b[0]) < xa || Math.min(a[0], b[0]) > xb) continue
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.5) edges.push({ a, b })
      }
    }
    // Mittellinien schräger Nuten auf der Fläche, auf die man schaut, mit Winkel zur Längskante
    const lines: View2D['lines'] = []
    const lineX: number[] = []
    for (const ln of o.lines ?? []) {
      const pl = local(m, ln.p)
      const xc = X(pl[0])
      if (xc < xa - 1 || xc > xb + 1) continue
      // Nutmitte in jeder Ansicht bemaßen, die Linie nur auf der Fläche zeichnen, in der die Nut liegt
      lineX.push(r1(xc))
      if (dot(ln.n, scale(axes[vw.ax], sg)) < 0.7) continue
      const dl = [0, 1, 2].map((k) => dot(ln.d, axes[k]))
      if (Math.abs(dl[yAx]) < 1e-6) continue
      const P = (t: number): [number, number] => [X(pl[0] + t * dl[0]), Y(pl[yAx] + t * dl[yAx])]
      const a = P((-yHalf - pl[yAx]) / dl[yAx])
      const b = P((yHalf - pl[yAx]) / dl[yAx])
      const deg = Math.round((Math.atan2(Math.abs(b[1] - a[1]), Math.abs(b[0] - a[0])) * 180) / Math.PI)
      lines.push({ a, b, deg })
    }
    // schräge Endschnitte (Kopf- und Fußschnitt einer Wange) mit Winkel zur Längskante
    for (const [n, uAt] of [
      [m.ends?.start, 0],
      [m.ends?.end, L],
    ] as const) {
      if (!n) continue
      const nl = [0, 1, 2].map((k) => dot(n, axes[k]))
      if (Math.abs(nl[0]) < 0.05 || Math.abs(nl[yAx]) < 0.05) continue
      const P = (y: number): [number, number] => [X(uAt - (nl[yAx] * y) / nl[0]), Y(y)]
      const a = P(-yHalf)
      const b = P(yHalf)
      if (Math.max(a[0], b[0]) < xa - 1 || Math.min(a[0], b[0]) > xb + 1) continue
      lines.push({ a, b, deg: Math.round((Math.atan2(Math.abs(b[1] - a[1]), Math.abs(b[0] - a[0])) * 180) / Math.PI) })
    }
    // Bohrungen
    const holes: DrawHole[] = []
    for (const h of holesLocal) {
      const along = Math.abs(h.dir[vw.ax])
      if (along > 0.95) {
        const x = X(h.entry[0])
        if (x < xa - 1 || x > xb + 1) continue
        holes.push({ x, y: Y(h.entry[yAx]), d: h.d, round: true, visible: h.through || h.entry[vw.ax] * sg > 0 })
      } else {
        const a: [number, number] = [X(h.entry[0]), Y(h.entry[yAx])]
        const b: [number, number] = [X(h.exit[0]), Y(h.exit[yAx])]
        if (Math.max(a[0], b[0]) < xa || Math.min(a[0], b[0]) > xb) continue
        holes.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, d: h.d, round: false, visible: false, from: a, to: b })
      }
    }
    // Maße: alle Kanten der Bearbeitungen und Lochmitten, steigend vom Bezugsende bzw. der Bezugskante
    const dx = new Set<number>()
    const dy = new Set<number>()
    if (xa === 0) dx.add(0)
    if (xb === total) dx.add(r1(total))
    for (const s of edges) {
      if (s.a[0] === s.b[0] && s.a[0] > xa + 0.5 && s.a[0] < xb - 0.5) dx.add(r1(s.a[0]))
      if (s.a[1] === s.b[1]) dy.add(r1(s.a[1]))
    }
    for (const s of hidden) {
      if (s.a[0] === s.b[0] && s.a[0] > xa + 0.5 && s.a[0] < xb - 0.5) dx.add(r1(s.a[0]))
      if (s.a[1] === s.b[1]) dy.add(r1(s.a[1]))
    }
    for (const h of holes)
      if (h.round) {
        dx.add(r1(h.x))
        dy.add(r1(h.y))
      }
    // schräge Nuten: statt der vielen Stufen der angenäherten Ausnehmung nur die Nutmitten bemaßen
    if (lineX.length) {
      for (const x of [...dx]) if (x !== 0 && x !== r1(total) && !holes.some((h) => h.round && r1(h.x) === x)) dx.delete(x)
      for (const y of [...dy]) if (y !== 0 && y !== r1(2 * yHalf) && !holes.some((h) => h.round && r1(h.y) === y)) dy.delete(y)
      lineX.forEach((x) => dx.add(x))
    }
    views.push({
      key: vw.key,
      title: title(vw.ax),
      x: [xa, xb],
      y: [0, 2 * yHalf],
      edges,
      hidden,
      waste,
      holes,
      dimX: [...dx].sort((a, b) => a - b),
      dimY: [...dy].filter((y) => y >= -0.5 && y <= 2 * yHalf + 0.5).sort((a, b) => a - b),
      broken: { left: xa > 0, right: xb < total },
      across: 2 * yHalf,
      lines,
    })
  }
  // Bereiche ohne sichtbare Bearbeitung auf dieser Seite weglassen (es bleibt mindestens eine Ansicht je Bereich)
  if (o.full) {
    const keep = views.filter((v) => v.holes.length || v.waste.length || v.hidden.length || v.edges.length > 4)
    if (keep.length) views.splice(0, views.length, ...keep)
  }

  // Bohrtabelle; Bohrungen derselben Achse von beiden Seiten in einer Zeile
  const holes: HoleRow[] = []
  const faceName = (h: LocalHole): Text => {
    if (Math.abs(h.dir[0]) > 0.9) return { key: tk('Stirnseite') }
    // die Fläche, durch die gebohrt wird: Außennormale entgegen der Bohrrichtung
    const n = scale(add(add(scale(axes[0], h.dir[0]), scale(axes[1], h.dir[1])), scale(axes[2], h.dir[2])), -1)
    return faceText(n) ?? title(Math.abs(h.dir[1]) >= Math.abs(h.dir[2]) ? 1 : 2)
  }
  for (const h of holesLocal) {
    const faceAx = Math.abs(h.dir[1]) >= Math.abs(h.dir[2]) ? 1 : 2
    const y = faceAx === 1 ? h.entry[2] + m.h / 2 : h.entry[1] + m.b / 2
    const w = h.with.map((id) => others.get(id)).filter(Boolean) as Member[]
    const row: HoleRow = { x: r1(X(h.entry[0])), y: r1(y), face: faceName(h), d: h.d, depth: r1(h.depth), through: h.through, with: w.length ? w.map(label).join(', ') : undefined, note: h.note }
    const twin = holes.find((q) => q.x === row.x && q.y === row.y && q.d === row.d && q.face.key === row.face.key && !q.both)
    if (twin && !h.note) {
      twin.both = true
      twin.depth = Math.max(twin.depth, row.depth)
      continue
    }
    holes.push(row)
  }
  return { member: m, length: total, refAtStart, refName: o.endName ? o.endName(refAtStart) : { key: tk('Bezugsende') }, views, holes }
}

interface LocalHole {
  entry: [number, number, number]
  exit: [number, number, number]
  dir: [number, number, number]
  d: number
  depth: number
  through: boolean
  with: string[]
  note?: string
}

/** Bohrungen der Befestigungsmittel in diesem Stab (Eintritt, Austritt, Richtung in Stabkoordinaten) */
function holeList(m: Member, fasteners: Fastener[], others: Member[], boxes: LocalBox[], ranges?: Map<string, Range>): LocalHole[] {
  const ax = memberAxes(m)
  const out: LocalHole[] = []
  const add = (p0: Vec3, dir: Vec3, len: number, d: number, note?: string) => {
    const p = local(m, p0)
    const dv: [number, number, number] = [dot(dir, ax[0]), dot(dir, ax[1]), dot(dir, ax[2])]
    // Abschnitte der Strecke im tatsächlichen Holz (Teilquader, also auch im Zapfen)
    const parts: Range[] = []
    for (const b of boxes) {
      let t0 = 0
      let t1 = len
      let ok = true
      for (let k = 0; k < 3 && ok; k++) {
        if (Math.abs(dv[k]) < 1e-9) {
          if (p[k] < b[k][0] - 0.01 || p[k] > b[k][1] + 0.01) ok = false
          continue
        }
        let a = (b[k][0] - p[k]) / dv[k]
        let c = (b[k][1] - p[k]) / dv[k]
        if (a > c) [a, c] = [c, a]
        t0 = Math.max(t0, a)
        t1 = Math.min(t1, c)
      }
      if (ok && t1 - t0 > 0.5) parts.push([t0, t1])
    }
    if (!parts.length) return
    const t0 = Math.min(...parts.map((q) => q[0]))
    const t1 = Math.max(...parts.map((q) => q[1]))
    const depth = parts.reduce((sum, q) => sum + q[1] - q[0], 0)
    if (depth < 3) return
    const entry: [number, number, number] = [p[0] + dv[0] * t0, p[1] + dv[1] * t0, p[2] + dv[2] * t0]
    const exit: [number, number, number] = [p[0] + dv[0] * t1, p[1] + dv[1] * t1, p[2] + dv[2] * t1]
    // durch, wenn die Bohrung am Ende des Holzes wieder austritt
    const k = [0, 1, 2].reduce((best, i) => (Math.abs(dv[i]) > Math.abs(dv[best]) ? i : best), 0)
    const lo = Math.min(...boxes.map((b) => b[k][0]))
    const hi = Math.max(...boxes.map((b) => b[k][1]))
    const through = Math.min(entry[k], exit[k]) <= lo + 1 && Math.max(entry[k], exit[k]) >= hi - 1
    out.push({ entry, exit, dir: dv, d, depth, through, with: [], note })
    return out[out.length - 1]
  }
  for (const f of fasteners) {
    if (f.kind === 'blech' || f.kind === 'stangenmutter') continue
    const d = f.drill ?? f.d
    // Holzschrauben ohne Vorbohrung (5 × 50 in Blechen) nicht in die Bohrtabelle
    if (f.kind === 'schraube' && !f.drill) continue
    // Schraube mit Durchgangsloch: im Teil mit dem Kopf das größere Loch
    const lh = local(m, f.head)
    const headHere = boxes.some((b) => [0, 1, 2].every((k) => lh[k] >= b[k][0] - 1 && lh[k] <= b[k][1] + 1))
    const h = add(f.head, f.dir, f.length, f.drillFirst && headHere ? f.drillFirst : d)
    // Bolzen und Holznägel gehen durch mehrere Teile: zusammengespannt in einem Zug bohren
    if (h && (f.kind === 'bolzen' || f.kind === 'bettschraube' || f.kind === 'holznagel')) h.with = drilledWith(f, others, ranges).filter((id) => id !== m.id)
    if (h && f.crossNut) {
      // Querbohrung für die Mutter
      const c = f.crossNut
      const p0 = { x: c.at.x + c.dir.x * c.outer, y: c.at.y + c.dir.y * c.outer, z: c.at.z + c.dir.z * c.outer }
      add(p0, { x: -c.dir.x, y: -c.dir.y, z: -c.dir.z }, c.depth, c.bore, c.bore > 20 ? tk('Tasche für Mutter und Scheibe') : tk('Querbohrung für die Mutter'))
    }
  }
  return out
}

/** Für die Bohrtabelle: welche anderen Teile dieselbe Bohrung durchläuft (im Verbund bohren) */
export function drilledWith(f: Fastener, members: Member[], ranges?: Map<string, Range>): string[] {
  const ids: string[] = []
  for (const m of members) {
    const ax = memberAxes(m)
    const L = memberLength(m)
    const ur = ranges?.get(m.id) ?? [0, L]
    const p = sub(f.head, m.start)
    const pl = [dot(p, ax[0]), dot(p, ax[1]), dot(p, ax[2])]
    const dv = [dot(f.dir, ax[0]), dot(f.dir, ax[1]), dot(f.dir, ax[2])]
    const lo = [ur[0], -m.b / 2, -m.h / 2]
    const hi = [ur[1], m.b / 2, m.h / 2]
    let t0 = 0
    let t1 = f.length
    let ok = true
    for (let k = 0; k < 3 && ok; k++) {
      if (Math.abs(dv[k]) < 1e-9) {
        if (pl[k] < lo[k] || pl[k] > hi[k]) ok = false
        continue
      }
      let a = (lo[k] - pl[k]) / dv[k]
      let b = (hi[k] - pl[k]) / dv[k]
      if (a > b) [a, b] = [b, a]
      t0 = Math.max(t0, a)
      t1 = Math.min(t1, b)
    }
    if (ok && t1 - t0 > 3) ids.push(m.id)
  }
  return ids
}
