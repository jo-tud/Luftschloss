import { HARDWARE, catalogItem, sheet, timber } from './catalog'
import { rotate2, v } from './geometry'
import type { Assembly, LoftBedParams, Member, MemberRole, Mm, Panel, Side, Vec3 } from './types'

/**
 * Erzeugt aus den Parametern einer Hochbett-Baugruppe alle Stäbe und Flächen.
 *
 * Lokales System: Ursprung an der hinteren linken Außenecke, x entlang der Matratzenlänge
 * (links → rechts), y von hinten nach vorne, z nach oben. Die Baugruppe wird um den Ursprung
 * gedreht und an (params.x, params.y) gesetzt.
 */

export interface BedFixing {
  memberId: string
  target: 'wand' | 'decke' | 'boden'
  hardwareId: string
  count: number
  note: string
}

export interface BedInfo {
  outerLength: Mm
  outerWidth: Mm
  deckTop: Mm
  mattressTop: Mm
  /** Tiefste Unterkante des Rahmens */
  underside: Mm
  /** Außenumriss in Weltkoordinaten */
  footprint: { x: Mm; y: Mm }[]
  /** Fläche der Leiter/Treppe einschließlich Ausstieg, Weltkoordinaten */
  ladderFootprint?: { x: Mm; y: Mm }[]
  accessWidth?: Mm
  walls: Side[]
  ceilingHigh: boolean
  rungPitch?: Mm
  rodGap?: Mm
}

export interface GeneratedBed {
  members: Member[]
  panels: Panel[]
  fixings: BedFixing[]
  info: BedInfo
}

type Corner = 'BL' | 'BR' | 'FL' | 'FR'

export function wallSides(p: LoftBedParams): Side[] {
  switch (p.type) {
    case 'wandseitig':
    case 'abgehaengt':
      return ['hinten']
    case 'eck':
      return ['hinten', p.wallEnd]
    case 'nische':
      return ['links', 'rechts']
    default:
      return []
  }
}

export function bedOuterSize(p: LoftBedParams): { length: Mm; width: Mm } {
  const post = timber(p.postCatalogId)
  return {
    length: p.mattressLength + 2 * p.mattressGap + 2 * post.b,
    width: p.mattressWidth + 2 * p.mattressGap + 2 * post.b,
  }
}

export function generateLoftBed(a: Assembly, ceilingHeight: Mm): GeneratedBed {
  const P = a.params
  const post = timber(P.postCatalogId)
  const rail = timber(P.railCatalogId)
  const joist = timber(P.joistCatalogId)
  const guard = timber(P.guardCatalogId)
  const stile = timber(P.ladderCatalogId)
  const rung = timber(P.rungCatalogId)
  const slatDeck = P.deck === 'latten'
  const deckSheet = slatDeck ? undefined : sheet(P.deckCatalogId)
  const slat = slatDeck ? timber(P.deckCatalogId) : undefined

  const p = post.b
  const rb = rail.b
  const rh = rail.h
  const { length: Lo, width: Wo } = bedOuterSize(P)
  const H = P.deckHeight
  const t = slat ? slat.b : deckSheet!.thickness
  const walls = wallSides(P)
  const isWall = (s: Side) => walls.includes(s)
  // Aufgelegte Bauweise: Träger laufen vorne/hinten (bei Wand-zu-Wand links/rechts an den Wänden),
  // Querträger bzw. Latten liegen oben drauf.
  const aufgelegt = P.frameStyle === 'aufgelegt'
  const carriersLR = isWall('links') && isWall('rechts')
  const carrierSides: Side[] = carriersLR ? ['links', 'rechts'] : ['hinten', 'vorne']
  const needsJoists = P.deck === 'platte' || P.deck === 'dielen' || P.deck === 'lattenrost' || (P.deck === 'latten' && carriersLR)
  const deckTopOfFrame = H - t
  const railTop = aufgelegt && needsJoists ? deckTopOfFrame - joist.h : deckTopOfFrame
  const railBottom = railTop - rh
  const guardTop = H + P.guardHeight
  const detached = new Set(a.detached)

  const members: Member[] = []
  const panels: Panel[] = []
  const fixings: BedFixing[] = []

  const toWorld = (q: Vec3): Vec3 => {
    const r = rotate2(q.x, q.y, P.rotation)
    return v(Math.round((P.x + r.x) * 10) / 10, Math.round((P.y + r.y) * 10) / 10, q.z)
  }
  const to2 = (x: number, y: number) => {
    const w = toWorld(v(x, y, 0))
    return { x: w.x, y: w.y }
  }

  function add(
    key: string,
    role: MemberRole,
    catalogId: string,
    s: Vec3,
    e: Vec3,
    b: Mm,
    h: Mm,
    extra: Partial<Member> = {},
  ): Member | undefined {
    if (detached.has(key)) return undefined
    const item = catalogItem(catalogId)
    const m: Member = {
      id: `${a.id}:${key}`,
      role,
      start: toWorld(s),
      end: toWorld(e),
      catalogId,
      b,
      h,
      roll: 0,
      round: item?.kind === 'stab' ? item.round : undefined,
      assemblyId: a.id,
      partKey: key,
      ...extra,
    }
    // Senkrechte Stäbe richten b nach Welt-x aus; bei gedrehtem Bett b/h tauschen, damit die
    // Querschnittslage relativ zum Bett gleich bleibt.
    if (Math.abs(s.x - e.x) < 1e-6 && Math.abs(s.y - e.y) < 1e-6 && (P.rotation === 90 || P.rotation === 270)) {
      m.b = h
      m.h = b
    }
    members.push(m)
    return m
  }

  function addPanel(key: string, panel: Omit<Panel, 'id' | 'assemblyId' | 'partKey'>) {
    if (detached.has(key)) return
    panels.push({ id: `${a.id}:${key}`, assemblyId: a.id, partKey: key, ...panel })
  }

  // --- Pfosten -------------------------------------------------------------------------
  const ceilingHigh = P.type === 'deckenhoch'
  const fullPost: Record<Corner, boolean> = { BL: false, BR: false, FL: false, FR: false }
  if (P.type === 'freistehend' || P.type === 'deckenhoch') {
    fullPost.BL = fullPost.BR = fullPost.FL = fullPost.FR = true
  } else if (P.type === 'wandseitig' || P.type === 'abgehaengt') {
    fullPost.FL = fullPost.FR = true
  } else if (P.type === 'eck') {
    if (P.wallEnd === 'rechts') fullPost.FL = true
    else fullPost.FR = true
  }
  // Freie Ecken von der Decke abhängen statt auf Pfosten stellen
  const hangCorners: Corner[] = []
  const hang = P.type === 'abgehaengt' || ((P.type === 'wandseitig' || P.type === 'eck') && P.cornerSupport === 'decke')
  if (hang) {
    for (const c of ['BL', 'BR', 'FL', 'FR'] as Corner[]) {
      if (fullPost[c]) {
        fullPost[c] = false
        hangCorners.push(c)
      }
    }
  }

  const guardOn = (s: Side) => P.guard !== 'keins' && P.guardSides[s] && !isWall(s)
  const cornerSides: Record<Corner, [Side, Side]> = {
    BL: ['hinten', 'links'],
    BR: ['hinten', 'rechts'],
    FL: ['vorne', 'links'],
    FR: ['vorne', 'rechts'],
  }
  const shortPost: Record<Corner, boolean> = { BL: false, BR: false, FL: false, FR: false }
  for (const c of Object.keys(cornerSides) as Corner[]) {
    if (!fullPost[c] && cornerSides[c].some(guardOn)) shortPost[c] = true
  }
  const hasPost = (c: Corner) => fullPost[c] || shortPost[c]
  const cornerPos: Record<Corner, { x: Mm; y: Mm }> = {
    BL: { x: 0, y: 0 },
    BR: { x: Lo - p, y: 0 },
    FL: { x: 0, y: Wo - p },
    FR: { x: Lo - p, y: Wo - p },
  }
  const postTop = ceilingHigh ? ceilingHeight - P.ceilingGap : guardTop
  for (const c of Object.keys(cornerPos) as Corner[]) {
    if (!hasPost(c)) continue
    const { x, y } = cornerPos[c]
    const cx = x + p / 2
    const cy = y + p / 2
    const z0 = fullPost[c] ? 0 : railBottom
    const m = add(`pfosten-${c}`, 'pfosten', P.postCatalogId, v(cx, cy, z0), v(cx, cy, fullPost[c] ? postTop : guardTop), post.b, post.h, {
      name: fullPost[c] ? `Pfosten ${cornerLabel(c)}` : `Geländerpfosten ${cornerLabel(c)}`,
    })
    if (m && ceilingHigh && fullPost[c]) {
      fixings.push({ memberId: m.id, target: 'decke', hardwareId: 'stellfuss-m16', count: 1, note: 'Pfosten gegen die Decke verspannen (Stellfuß/Spindel)' })
    }
  }

  // --- Zargen und Wandriegel -----------------------------------------------------------
  const xStart = (s: Side) => (hasPost(s === 'hinten' ? 'BL' : 'FL') ? p : isWall('links') && !isWall(s) ? rb : 0)
  const xEnd = (s: Side) => Lo - (hasPost(s === 'hinten' ? 'BR' : 'FR') ? p : isWall('rechts') && !isWall(s) ? rb : 0)
  const yStart = (s: Side) => (hasPost(s === 'links' ? 'BL' : 'BR') ? p : isWall('hinten') || !isWall(s) ? rb : 0)
  const yEnd = (s: Side) => Wo - (hasPost(s === 'links' ? 'FL' : 'FR') ? p : isWall('vorne') || !isWall(s) ? rb : 0)
  const zc = railBottom + rh / 2

  // Breite Liegeflächen mit Latten brauchen einen Mittelträger, der auf den Querzargen liegt
  const wideSlats = P.deck === 'latten' && !carriersLR && Wo - 2 * rb > 1250
  const keepRail = (s: Side) => !aufgelegt || isWall(s) || carrierSides.includes(s) || ((s === 'links' || s === 'rechts') && wideSlats)
  for (const s of ['hinten', 'vorne'] as Side[]) {
    if (!keepRail(s)) continue
    const y = s === 'hinten' ? rb / 2 : Wo - rb / 2
    const wall = isWall(s)
    const m = add(`zarge-${s}`, wall ? 'wandriegel' : 'zarge', P.railCatalogId, v(xStart(s), y, zc), v(xEnd(s), y, zc), rb, rh, {
      name: wall ? `Wandriegel ${s}` : `Längszarge ${s}`,
    })
    if (m && wall) wallFixing(m, xEnd(s) - xStart(s))
  }
  for (const s of ['links', 'rechts'] as Side[]) {
    if (!keepRail(s)) continue
    const x = s === 'links' ? rb / 2 : Lo - rb / 2
    const wall = isWall(s)
    const m = add(`zarge-${s}`, wall ? 'wandriegel' : 'zarge', P.railCatalogId, v(x, yStart(s), zc), v(x, yEnd(s), zc), rb, rh, {
      name: wall ? `Wandriegel ${s}` : `Querzarge ${s}`,
    })
    if (m && wall) wallFixing(m, yEnd(s) - yStart(s))
  }

  function wallFixing(m: Member, length: Mm) {
    fixings.push({
      memberId: m.id,
      target: 'wand',
      hardwareId: 'rahmenduebel-10',
      count: Math.max(3, Math.ceil(length / 400) + 1),
      note: 'Wandriegel mit Rahmendübeln/Holzbauschrauben, Abstand ca. 40 cm',
    })
  }

  // Abhängung: Gewindestangen von den freien Ecken zur Decke, durch die vordere Zarge gebolzt
  for (const c of hangCorners) {
    const x = c[1] === 'L' ? p + 40 : Lo - p - 40
    const y = c[0] === 'F' ? Wo - rb / 2 : rb / 2
    const m = add(`haenger-${c}`, 'sonstiges', 'gewindestange-m10', v(x, y, railBottom - 30), v(x, y, ceilingHeight), 10, 10, {
      round: true,
      name: `Gewindestange ${cornerLabel(c)}`,
    })
    if (m) fixings.push({ memberId: m.id, target: 'decke', hardwareId: 'rahmenduebel-10', count: 2, note: 'Deckenanker für Gewindestange – nur in tragfähige Decke' })
  }

  // --- Querträger ----------------------------------------------------------------------
  const x0 = rb
  const x1 = Lo - rb
  let joistCount = 0
  if (aufgelegt && needsJoists) {
    // Querträger liegen auf den Trägern, jeweils auch an beiden Enden
    const spacing = P.deck === 'lattenrost' ? 1000 : Math.max(200, Math.min(P.joistSpacing, deckSheet?.maxSpan ?? P.joistSpacing))
    const along = carriersLR ? Wo : Lo
    const a0 = p + joist.b / 2
    const a1 = along - p - joist.b / 2
    const n = Math.max(2, Math.ceil((a1 - a0) / spacing) + 1)
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / (n - 1)
      const zc2 = deckTopOfFrame - joist.h / 2
      const [s0, e0] = carriersLR ? [v(0, a, zc2), v(Lo, a, zc2)] : [v(a, 0, zc2), v(a, Wo, zc2)]
      add(`quertraeger-${i + 1}`, 'quertraeger', P.joistCatalogId, s0, e0, joist.b, joist.h, { name: `Querträger ${i + 1} (aufgelegt)` })
    }
  } else if (P.deck === 'platte' || P.deck === 'dielen') {
    const spacing = Math.max(200, Math.min(P.joistSpacing, deckSheet?.maxSpan ?? P.joistSpacing))
    joistCount = Math.max(0, Math.ceil((x1 - x0) / spacing) - 1)
  } else if (P.deck === 'lattenrost') {
    joistCount = 1
  }
  if (aufgelegt) joistCount = 0
  for (let i = 1; i <= joistCount; i++) {
    const x = x0 + ((x1 - x0) * i) / (joistCount + 1)
    add(`quertraeger-${i}`, 'quertraeger', P.joistCatalogId, v(x, rb, railTop - joist.h / 2), v(x, Wo - rb, railTop - joist.h / 2), joist.b, joist.h, {
      name: `Querträger ${i}`,
    })
  }

  // Kopfbänder unter den Zargen, je Pfosten in beiden Richtungen
  if (P.braces && (P.type === 'freistehend' || P.type === 'deckenhoch' || P.type === 'wandseitig' || P.type === 'eck')) {
    const len = 350
    for (const c of Object.keys(cornerPos) as Corner[]) {
      if (!fullPost[c]) continue
      const { x, y } = cornerPos[c]
      const right = c === 'BL' || c === 'FL'
      const front = c === 'BL' || c === 'BR'
      // Strebe in der Ebene der Längszarge
      const yPlane = c[0] === 'B' ? rb / 2 : Wo - rb / 2
      const xFace = right ? x + p : x
      const dx = right ? len : -len
      add(`kopfband-${c}-x`, 'strebe', P.guardCatalogId, v(xFace, yPlane, railBottom - len), v(xFace + dx, yPlane, railBottom), guard.b, guard.h, {
        name: `Kopfband ${cornerLabel(c)} längs`,
      })
      if (!keepRail(c[1] === 'L' ? 'links' : 'rechts')) continue
      const xPlane = c[1] === 'L' ? rb / 2 : Lo - rb / 2
      const yFace = front ? y + p : y
      const dy = front ? len : -len
      add(`kopfband-${c}-y`, 'strebe', P.guardCatalogId, v(xPlane, yFace, railBottom - len), v(xPlane, yFace + dy, railBottom), guard.b, guard.h, {
        name: `Kopfband ${cornerLabel(c)} quer`,
      })
    }
  }

  // --- Liegefläche ---------------------------------------------------------------------
  if (slat) {
    // Lose aufgelegte Latten quer über die Längszargen (Forenpraxis: Abstand 6–10 cm, belüftet)
    const w = slat.h
    const span = Lo - 2 * p
    const n = Math.max(2, Math.floor((span + P.slatGap) / (w + P.slatGap)))
    const gap = (span - n * w) / (n - 1)
    for (let i = 0; i < n; i++) {
      const x = p + w / 2 + i * (w + gap)
      add(`latte-${i}`, 'leiste', P.deckCatalogId, v(x, 0, railTop + t / 2), v(x, Wo, railTop + t / 2), w, t, { name: `Latte ${i + 1}` })
    }
    if (wideSlats) {
      add('mitteltraeger', 'quertraeger', P.joistCatalogId, v(rb, Wo / 2, railTop - joist.h / 2), v(Lo - rb, Wo / 2, railTop - joist.h / 2), joist.b, joist.h, { name: 'Mittelträger' })
    }
  } else if (P.deck === 'platte' || P.deck === 'dielen') {
    const outline: { x: number; y: number }[] = []
    const n = (c: Corner) => (hasPost(c) ? p : 0)
    outline.push({ x: n('BL'), y: 0 }, { x: Lo - n('BR'), y: 0 })
    if (n('BR')) outline.push({ x: Lo - p, y: p }, { x: Lo, y: p })
    outline.push({ x: Lo, y: Wo - n('FR') })
    if (n('FR')) outline.push({ x: Lo - p, y: Wo - p }, { x: Lo - p, y: Wo })
    outline.push({ x: n('FL'), y: Wo })
    if (n('FL')) outline.push({ x: p, y: Wo - p }, { x: 0, y: Wo - p })
    outline.push({ x: 0, y: n('BL') })
    if (n('BL')) outline.push({ x: p, y: p }, { x: p, y: 0 })
    const clean = outline.filter((q, i) => i === 0 || q.x !== outline[i - 1].x || q.y !== outline[i - 1].y)
    addPanel('liegeflaeche', {
      kind: P.deck,
      name: P.deck === 'platte' ? 'Liegefläche (Platte)' : 'Liegefläche (Dielen)',
      outline: clean.map((q) => to2(q.x, q.y)),
      z: railTop,
      thickness: t,
      catalogId: P.deckCatalogId,
      direction: P.rotation,
    })
  } else {
    addPanel('liegeflaeche', {
      kind: P.deck === 'rollrost' ? 'rollrost' : 'lattenrost',
      name: P.deck === 'rollrost' ? 'Rollrost' : 'Lattenrost',
      outline: rect(p, p, Lo - p, Wo - p).map((q) => to2(q.x, q.y)),
      z: railTop,
      thickness: t,
      catalogId: P.deckCatalogId,
      direction: P.rotation,
    })
  }
  const mx0 = p + P.mattressGap
  const my0 = p + P.mattressGap
  addPanel('matratze', {
    kind: 'matratze',
    name: `Matratze ${P.mattressWidth / 10}×${P.mattressLength / 10}`,
    outline: rect(mx0, my0, mx0 + P.mattressLength, my0 + P.mattressWidth).map((q) => to2(q.x, q.y)),
    z: H,
    thickness: P.mattressThickness,
  })

  // --- Leiter (vor dem Geländer, weil die Öffnung von ihr abhängt) -----------------------
  let ladderFootprint: { x: Mm; y: Mm }[] | undefined
  let accessWidth: Mm | undefined
  let opening: [Mm, Mm] | undefined
  let rungPitch: Mm | undefined
  if (P.ladder !== 'keine') {
    const side = P.ladderSide
    const frame = sideFrame(side, Lo, Wo)
    const a0 = Math.max(0, Math.min(P.ladderOffset, frame.length - P.ladderWidth))
    const a1 = a0 + P.ladderWidth
    const sb = stile.b
    const sh = stile.h
    const angle = P.ladder === 'senkrecht' ? 90 : P.ladder === 'treppe' ? Math.min(P.ladderAngle, 50) : P.ladder === 'stufen' ? Math.min(P.ladderAngle, 70) : P.ladderAngle
    const run = angle >= 89.9 ? 0 : H / Math.tan((angle * Math.PI) / 180)
    const pt = (along: number, out: number, z: number) => {
      const q = frame.at(along, out)
      return v(q.x, q.y, z)
    }
    opening = [a0 + sb, a1 - sb]
    accessWidth = a1 - a0 - 2 * sb
    // Holme
    for (const [i, a] of [a0 + sb / 2, a1 - sb / 2].entries()) {
      if (angle >= 89.9) {
        const [bx, by] = alongSide(side, sb, sh)
        add(`leiter-holm-${i}`, 'holm', P.ladderCatalogId, pt(a, sh / 2, 0), pt(a, sh / 2, guardTop), bx, by, {
          name: `Leiterholm ${i + 1}`,
        })
      } else {
        add(`leiter-holm-${i}`, 'holm', P.ladderCatalogId, pt(a, run + sh / 2, 0), pt(a, sh / 2, H), sb, sh, {
          name: `Treppenwange ${i + 1}`,
        })
        // senkrechte Haltegriffe an der Öffnung
        const [gx, gy] = alongSide(side, guard.b, guard.h)
        add(`leiter-griff-${i}`, 'holm', P.guardCatalogId, pt(a, guard.h / 2, railTop), pt(a, guard.h / 2, guardTop + 150), gx, gy, {
          name: `Haltegriff ${i + 1}`,
        })
      }
    }
    // Sprossen oder Stufen
    const stepTarget = P.ladder === 'senkrecht' || P.ladder === 'schraeg' ? 260 : 220
    const steps = Math.max(2, Math.round(H / stepTarget))
    rungPitch = H / steps
    for (let i = 1; i < steps; i++) {
      const z = rungPitch * i
      const out = run * (1 - z / H) + sh / 2
      if (P.ladder === 'senkrecht' || P.ladder === 'schraeg') {
        add(`leiter-sprosse-${i}`, 'sprosse', P.rungCatalogId, pt(a0 + sb, out, z), pt(a1 - sb, out, z), rung.b, rung.h, {
          name: `Sprosse ${i}`,
        })
      } else {
        const depth = P.ladder === 'treppe' ? 2 : 1
        for (let k = 0; k < depth; k++) {
          add(`leiter-stufe-${i}-${k}`, 'stufe', 'geh-24x94', pt(a0 + sb, out + (k - (depth - 1) / 2) * 96, z - 12), pt(a1 - sb, out + (k - (depth - 1) / 2) * 96, z - 12), 94, 24, {
            name: `Stufe ${i}`,
          })
        }
      }
    }
    const reach = run + sh + 600
    ladderFootprint = [frame.at(a0, 0), frame.at(a1, 0), frame.at(a1, reach), frame.at(a0, reach)].map((q) => to2(q.x, q.y))
  }

  // --- Geländer ------------------------------------------------------------------------
  let rodGap: Mm | undefined
  if (P.guard !== 'keins') {
    for (const s of ['hinten', 'vorne', 'links', 'rechts'] as Side[]) {
      if (!guardOn(s)) continue
      const frame = sideFrame(s, Lo, Wo)
      const g0 = p
      const g1 = frame.length - p
      const gb = guard.b
      const gh = guard.h
      const inPlane = gb / 2
      const pt = (along: number, z: number, out = -inPlane) => {
        const q = frame.at(along, out)
        return v(q.x, q.y, z)
      }
      const segs: [Mm, Mm][] = []
      if (opening && P.ladderSide === s) {
        const [o0, o1] = opening
        if (o0 - g0 > 20) segs.push([g0, o0])
        if (g1 - o1 > 20) segs.push([o1, g1])
      } else {
        segs.push([g0, g1])
      }
      segs.forEach(([s0, s1], si) => {
        const key = `${s}-${si}`
        // Handlauf
        add(`handlauf-${key}`, 'holm', P.guardCatalogId, pt(s0, guardTop - gh / 2), pt(s1, guardTop - gh / 2), gb, gh, { name: `Handlauf ${s}` })
        // Die Öffnungskanten halten die Leiterholme bzw. Haltegriffe.
        const innerTop = guardTop - gh
        const lowTop = H + gh
        switch (P.guard) {
          case 'staebe': {
            add(`unterholm-${key}`, 'holm', P.guardCatalogId, pt(s0, H + gh / 2), pt(s1, H + gh / 2), gb, gh, { name: `Unterholm ${s}` })
            const d = 25
            const maxGap = 70
            const span = s1 - s0
            const n = Math.max(1, Math.ceil((span - maxGap) / (d + maxGap)))
            const gap = (span - n * d) / (n + 1)
            rodGap = rodGap === undefined ? gap : Math.max(rodGap, gap)
            for (let i = 0; i < n; i++) {
              const a = s0 + gap * (i + 1) + d * i + d / 2
              add(`stab-${key}-${i}`, 'stab', 'rund-buche-25', pt(a, lowTop), pt(a, innerTop), d, d, { round: true, name: `Geländerstab ${s}` })
            }
            break
          }
          case 'bretter': {
            const board = 200
            const gap = 60
            const space = innerTop - H
            const n = Math.max(1, Math.floor((space + gap) / (board + gap)))
            for (let i = 0; i < n; i++) {
              const zc2 = H + gap + i * (board + gap) + board / 2
              if (zc2 + board / 2 > innerTop) break
              add(`brett-${key}-${i}`, 'holm', 'leimholz-fi-18x200', pt(s0, zc2, -9), pt(s1, zc2, -9), 18, board, { name: `Geländerbrett ${s}` })
            }
            rodGap = gap
            break
          }
          case 'platte':
          case 'netz': {
            add(`unterholm-${key}`, 'holm', P.guardCatalogId, pt(s0, H + gh / 2), pt(s1, H + gh / 2), gb, gh, { name: `Unterholm ${s}` })
            const a = frame.at(s0, -inPlane)
            const b = frame.at(s1, -inPlane)
            addPanel(`fuellung-${key}`, {
              kind: P.guard === 'netz' ? 'netz' : 'platte',
              name: P.guard === 'netz' ? `Netz ${s}` : `Geländerplatte ${s}`,
              outline: [],
              z: lowTop,
              thickness: P.guard === 'netz' ? 6 : 18,
              catalogId: P.guard === 'netz' ? 'netz' : 'leimholz-fi-18',
              vertical: { a: to2(a.x, a.y), b: to2(b.x, b.y), height: innerTop - lowTop },
            })
            rodGap = P.guard === 'netz' ? 45 : 0
            break
          }
          case 'seil': {
            for (const [i, f] of [1 / 3, 2 / 3].entries()) {
              const z = H + (innerTop - H) * f
              add(`seil-${key}-${i}`, 'sonstiges', 'seil-12', pt(s0, z), pt(s1, z), 12, 12, { round: true, name: `Seil ${s}` })
            }
            rodGap = Math.round((innerTop - H) / 3)
            break
          }
        }
      })
    }
  }

  const undersides = members.filter((m) => m.role === 'zarge' || m.role === 'quertraeger' || m.role === 'wandriegel').map((m) => Math.min(m.start.z, m.end.z) - m.h / 2)

  return {
    members,
    panels,
    fixings,
    info: {
      outerLength: Lo,
      outerWidth: Wo,
      deckTop: H,
      mattressTop: H + P.mattressThickness,
      underside: undersides.length ? Math.min(...undersides) : railBottom,
      footprint: rect(0, 0, Lo, Wo).map((q) => to2(q.x, q.y)),
      ladderFootprint,
      accessWidth,
      walls,
      ceilingHigh,
      rungPitch,
      rodGap,
    },
  }
}

/** Lokales System einer Bettseite: along läuft von der linken zur rechten Ecke (von außen gesehen), out zeigt nach außen. */
function sideFrame(s: Side, Lo: Mm, Wo: Mm) {
  switch (s) {
    case 'vorne':
      return { length: Lo, at: (a: number, o: number) => ({ x: a, y: Wo + o }) }
    case 'hinten':
      return { length: Lo, at: (a: number, o: number) => ({ x: Lo - a, y: -o }) }
    case 'links':
      return { length: Wo, at: (a: number, o: number) => ({ x: -o, y: a }) }
    case 'rechts':
      return { length: Wo, at: (a: number, o: number) => ({ x: Lo + o, y: Wo - a }) }
  }
}

/** Querschnitt eines senkrechten Stabs: Maß entlang der Bettseite und nach außen, als (lokal x, lokal y). */
function alongSide(s: Side, along: Mm, out: Mm): [Mm, Mm] {
  return s === 'vorne' || s === 'hinten' ? [along, out] : [out, along]
}

function rect(x0: number, y0: number, x1: number, y1: number) {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

function cornerLabel(c: string): string {
  return { BL: 'hinten links', BR: 'hinten rechts', FL: 'vorne links', FR: 'vorne rechts' }[c] ?? c
}

export const BED_TYPE_LABEL: Record<LoftBedParams['type'], string> = {
  freistehend: 'Freistehend, 4 Pfosten',
  deckenhoch: 'Deckenhoch verspannt, 4 Pfosten',
  wandseitig: 'Wandseitig, 2 Pfosten',
  eck: 'Eckhochbett, 1 Pfosten',
  nische: 'Hochebene Wand zu Wand',
  abgehaengt: 'Abgehängt (Wand + Decke)',
}

export const HARDWARE_IDS = new Set(HARDWARE.map((h) => h.id))
