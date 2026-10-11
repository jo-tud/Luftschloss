import { t, tk } from '../i18n'
import { catalogItem, sheet, timber } from './catalog'
import { clipHalf, rotate2, v } from './geometry'
import type { Assembly, LoftBedParams, Member, MemberRole, MemberShape, Mm, Panel, Side, Vec3 } from './types'
import { deckBoards } from './deckBoards'

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
  /** Stellmaß einschließlich Leiter bzw. Treppe (ohne Ausstiegsfläche), in Bettrichtung */
  standLength: Mm
  standWidth: Mm
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
  /** Etagenbett: Oberkante der unteren Matratze */
  lowerMattressTop?: Mm
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
      return ['hinten'] // i18n-ok
    case 'eck':
      return ['hinten', p.wallEnd] // i18n-ok
    case 'nische':
      return ['links', 'rechts'] // i18n-ok
    default:
      return []
  }
}

/** Anzahl Matratzen und ob sie nebeneinander liegen */
export function mattressSetup(p: LoftBedParams): { n: number; side: boolean; spacing: Mm } {
  return {
    n: Math.max(1, Math.min(3, Math.round(p.mattressCount ?? 1))),
    side: (p.mattressLayout ?? 'nebeneinander') === 'nebeneinander',
    spacing: Math.max(0, p.mattressSpacing ?? p.mattressGap),
  }
}

/** Matratzen im lokalen System (x längs, y quer), ab der Innenkante der Pfosten */
export function mattressRects(p: LoftBedParams, postB: Mm): { x0: Mm; y0: Mm; x1: Mm; y1: Mm }[] {
  const { n, side, spacing } = mattressSetup(p)
  const g = p.mattressGap
  return Array.from({ length: n }, (_, i) => {
    const x0 = postB + g + (side ? 0 : i * (p.mattressLength + spacing))
    const y0 = postB + g + (side ? i * (p.mattressWidth + spacing) : 0)
    return { x0, y0, x1: x0 + p.mattressLength, y1: y0 + p.mattressWidth }
  })
}

/**
 * Zargen außen an den Pfosten, durchgebolzt: nur bei vier Pfosten, die bis zum Boden reichen.
 * Ein begehbares Netz bleibt bei Zargen zwischen den Pfosten, an denen es ringsum gespannt wird.
 */
export function outsideRails(p: LoftBedParams): boolean {
  return p.frameStyle === 'aussen' && p.deck !== 'netz' && (p.type === 'deckenhoch' || (p.type === 'freistehend' && p.cornerSupport !== 'moebel'))
}

/** Innenkante der Pfosten, gemessen von der Außenkante des Betts */
export function postInner(p: LoftBedParams): Mm {
  return timber(p.postCatalogId).b + (outsideRails(p) ? timber(p.railCatalogId).b : 0)
}

export function bedOuterSize(p: LoftBedParams): { length: Mm; width: Mm } {
  const { n, side, spacing } = mattressSetup(p)
  const pIn = postInner(p)
  return {
    length: (side ? 1 : n) * p.mattressLength + 2 * p.mattressGap + (side ? 0 : n - 1) * spacing + 2 * pIn,
    width: (side ? n : 1) * p.mattressWidth + 2 * p.mattressGap + (side ? n - 1 : 0) * spacing + 2 * pIn,
  }
}

export function generateLoftBed(a: Assembly, ceilingHeight: Mm, room?: { length: Mm; width: Mm }): GeneratedBed {
  const P = a.params
  const post = timber(P.postCatalogId)
  const rail = timber(P.railCatalogId)
  const joist = timber(P.joistCatalogId)
  const guard = timber(P.guardCatalogId)
  const stile = timber(P.ladderCatalogId)
  const rung = timber(P.rungCatalogId)
  const slatDeck = P.deck === 'latten'
  const netDeck = P.deck === 'netz'
  const deckSheet = slatDeck ? undefined : sheet(netDeck ? 'netz-begehbar' : P.deckCatalogId)
  const slat = slatDeck ? timber(P.deckCatalogId) : undefined

  const p = post.b
  const rb = rail.b
  const rh = rail.h
  const { length: Lo, width: Wo } = bedOuterSize(P)
  const H = P.deckHeight
  const deckT = slat ? slat.b : deckSheet!.thickness
  const walls = wallSides(P)
  const isWall = (s: Side) => walls.includes(s)
  // Aufgelegte Bauweise: Träger laufen vorne/hinten (bei Wand-zu-Wand links/rechts an den Wänden),
  // Querträger bzw. Latten liegen oben drauf.
  // Ein begehbares Netz braucht ringsum Zargen, an denen es gespannt wird
  const aufgelegt = P.frameStyle === 'aufgelegt' && !netDeck
  // Zargen außen: Pfosten um eine Zargendicke eingerückt, Längszargen laufen außen durch, Querzargen
  // eine Zargenhöhe tiefer (so kreuzen sich die Bolzen im Pfosten nicht, an den Ecken liegen die
  // Längszargen auf den Querzargen)
  const aussen = outsideRails(P)
  const o = aussen ? rb : 0
  const pIn = p + o
  const carriersLR = isWall('links') && isWall('rechts') // i18n-ok
  const carrierSides: Side[] = carriersLR ? ['links', 'rechts'] : ['hinten', 'vorne'] // i18n-ok
  const needsJoists = P.deck === 'platte' || P.deck === 'dielen' || P.deck === 'lattenrost' || (P.deck === 'latten' && carriersLR)
  const deckTopOfFrame = H - deckT
  const railTop = aufgelegt && needsJoists ? deckTopOfFrame - joist.h : deckTopOfFrame
  // Unterkante der Liegefläche: bei aufgelegter Bauweise auf den Querträgern, sonst auf den Zargen
  const deckZ = aufgelegt && needsJoists ? deckTopOfFrame : railTop
  const railBottom = railTop - rh
  const cross = (s: Side) => s === 'links' || s === 'rechts' // i18n-ok
  /** Unterkante der Zarge einer Seite (Querzargen bei Zargen außen eine Zargenhöhe tiefer) */
  const railBottomAt = (s: Side) => (aussen && cross(s) ? railBottom - rh : railBottom)
  const guardTop = H + P.guardHeight
  const detached = new Set(a.detached)

  const members: Member[] = []
  const panels: Panel[] = []
  const fixings: BedFixing[] = []

  const toWorld = (q: Vec3): Vec3 => {
    const r = rotate2(P.mirror ? Lo - q.x : q.x, q.y, P.rotation)
    return v(Math.round((P.x + r.x) * 10) / 10, Math.round((P.y + r.y) * 10) / 10, q.z)
  }
  const to2 = (x: number, y: number) => {
    const w = toWorld(v(x, y, 0))
    return { x: w.x, y: w.y }
  }

  /** Abstand der Außenseite einer Bettseite zur gegenüberliegenden Wand (Mitte der Seite) */
  const wallGap = (s: Side): number => {
    if (!room) return Infinity
    const f = sideFrame(s, Lo, Wo)
    const q0 = toWorld(v(f.at(f.length / 2, 0).x, f.at(f.length / 2, 0).y, 0))
    const q1 = toWorld(v(f.at(f.length / 2, 100).x, f.at(f.length / 2, 100).y, 0))
    const dx = q1.x - q0.x
    const dy = q1.y - q0.y
    if (dx > 50) return room.length - q0.x
    if (dx < -50) return q0.x
    if (dy > 50) return room.width - q0.y
    return q0.y
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
    // abweichendes Holz bzw. Länge für dieses Teil (Querschnitt in gleicher Lage: schmale Seite bleibt schmal)
    const ov = a.overrides?.[key]
    const alt = ov?.catalogId ? catalogItem(ov.catalogId) : undefined
    if (alt?.kind === 'stab') {
      const [lo, hi] = alt.b <= alt.h ? [alt.b, alt.h] : [alt.h, alt.b]
      ;[b, h] = b <= h ? [lo, hi] : [hi, lo]
      catalogId = alt.id
    }
    if (ov?.length && ov.length > 10) {
      const d = Math.hypot(e.x - s.x, e.y - s.y, e.z - s.z)
      if (d > 1) e = v(s.x + ((e.x - s.x) * ov.length) / d, s.y + ((e.y - s.y) * ov.length) / d, s.z + ((e.z - s.z) * ov.length) / d)
    }
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

  // Auf Regal/Schrank: keine Pfosten, der Rahmen liegt auf den Möbeln (Auflager siehe statics.ts)
  if (P.cornerSupport === 'moebel' && P.type !== 'deckenhoch' && P.type !== 'abgehaengt') for (const c of ['BL', 'BR', 'FL', 'FR'] as Corner[]) fullPost[c] = false

  const guardOn = (s: Side) => P.guard !== 'keins' && P.guardSides[s] && !isWall(s)
  const cornerSides: Record<Corner, [Side, Side]> = {
    BL: ['hinten', 'links'], // i18n-ok
    BR: ['hinten', 'rechts'], // i18n-ok
    FL: ['vorne', 'links'], // i18n-ok
    FR: ['vorne', 'rechts'], // i18n-ok
  }
  // Ecken ohne Pfosten schließt der Rahmen selbst (Zarge an Zarge); ein Geländer dort hält ein
  // Geländerpfosten außen an der Zarge (siehe Geländer), kein kurzes Pfostenstück zwischen den Zargen
  const hasPost = (c: Corner) => fullPost[c]
  const cornerPos: Record<Corner, { x: Mm; y: Mm }> = {
    BL: { x: o, y: o },
    BR: { x: Lo - pIn, y: o },
    FL: { x: o, y: Wo - pIn },
    FR: { x: Lo - pIn, y: Wo - pIn },
  }
  const postTop = ceilingHigh ? ceilingHeight - P.ceilingGap : guardTop
  for (const c of Object.keys(cornerPos) as Corner[]) {
    if (!hasPost(c)) continue
    const { x, y } = cornerPos[c]
    const cx = x + p / 2
    const cy = y + p / 2
    // ohne Geländer an beiden angrenzenden Seiten reicht der Pfosten nur bis zur Liegefläche
    // Zargen außen: das Geländer hält eigene Pfosten außen an den Zargen, die Liegefläche liegt auch auf den Pfosten
    const top = aussen && !ceilingHigh ? railTop : !ceilingHigh && P.trimPosts !== false && !cornerSides[c].some(guardOn) ? H : postTop
    const m = add(`pfosten-${c}`, 'pfosten', P.postCatalogId, v(cx, cy, 0), v(cx, cy, top), post.b, post.h, {
      name: t('Pfosten {c}', { c: cornerLabel(c) }),
    })
    if (m && ceilingHigh) {
      fixings.push({ memberId: m.id, target: 'decke', hardwareId: 'stellfuss-m16', count: 1, note: t('Pfosten gegen die Decke verspannen (Stellfuß/Spindel)') })
    }
  }

  // --- Zargen und Wandriegel -----------------------------------------------------------
  const xStart = (s: Side) => (aussen ? 0 : hasPost(s === 'hinten' ? 'BL' : 'FL') ? p : isWall('links') && !isWall(s) ? rb : 0) // i18n-ok
  const xEnd = (s: Side) => Lo - (aussen ? 0 : hasPost(s === 'hinten' ? 'BR' : 'FR') ? p : isWall('rechts') && !isWall(s) ? rb : 0) // i18n-ok
  const yStart = (s: Side) => (aussen ? 0 : hasPost(s === 'links' ? 'BL' : 'BR') ? p : isWall('hinten') || !isWall(s) ? rb : 0) // i18n-ok
  const yEnd = (s: Side) => Wo - (aussen ? 0 : hasPost(s === 'links' ? 'FL' : 'FR') ? p : isWall('vorne') || !isWall(s) ? rb : 0) // i18n-ok
  const zc = railBottom + rh / 2

  // Breite Liegeflächen mit Latten brauchen einen Mittelträger, der auf den Querzargen liegt
  // Fugen zwischen mehreren Matratzen (nebeneinander: längs laufend bei y, hintereinander: quer bei x)
  const { n: nMat, side: matSide } = mattressSetup(P)
  const mats = mattressRects(P, pIn)
  const matSpacing = mattressSetup(P).spacing
  const seamYs = matSide ? mats.slice(1).map((m) => m.y0 - matSpacing / 2) : []
  const seamXs = matSide ? [] : mats.slice(1).map((m) => m.x0 - matSpacing / 2)
  // Mittelträger längs: unter Matratzenfugen (Latten, Roste) bzw. bei breiter Lattung in der Mitte
  const rost = P.deck === 'rollrost' || P.deck === 'lattenrost'
  const midYs = carriersLR || !(P.deck === 'latten' || rost) ? [] : seamYs.length ? seamYs : P.deck === 'latten' && Wo - 2 * rb > 1250 ? [Wo / 2] : []
  const wideSlats = midYs.length > 0
  const keepRail = (s: Side) => !aufgelegt || isWall(s) || carrierSides.includes(s) || ((s === 'links' || s === 'rechts') && wideSlats)
  for (const s of ['hinten', 'vorne'] as Side[]) {
    if (!keepRail(s)) continue
    const y = s === 'hinten' ? rb / 2 : Wo - rb / 2
    const wall = isWall(s)
    const m = add(`zarge-${s}`, wall ? 'wandriegel' : 'zarge', P.railCatalogId, v(xStart(s), y, zc), v(xEnd(s), y, zc), rb, rh, {
      name: wall ? t('Wandriegel {s}', { s: sideLabel(s) }) : t('Längszarge {s}', { s: sideLabel(s) }),
    })
    if (m && wall) wallFixing(m, xEnd(s) - xStart(s))
  }
  for (const s of ['links', 'rechts'] as Side[]) {
    if (!keepRail(s)) continue
    const x = s === 'links' ? rb / 2 : Lo - rb / 2
    const wall = isWall(s)
    const zq = railBottomAt(s) + rh / 2
    const m = add(`zarge-${s}`, wall ? 'wandriegel' : 'zarge', P.railCatalogId, v(x, yStart(s), zq), v(x, yEnd(s), zq), rb, rh, {
      name: wall ? t('Wandriegel {s}', { s: sideLabel(s) }) : t('Querzarge {s}', { s: sideLabel(s) }),
    })
    if (m && wall) wallFixing(m, yEnd(s) - yStart(s))
  }

  function wallFixing(m: Member, length: Mm) {
    fixings.push({
      memberId: m.id,
      target: 'wand',
      hardwareId: 'rahmenduebel-10',
      count: Math.max(3, Math.ceil(length / 400) + 1),
      note: t('Wandriegel mit Rahmendübeln/Holzbauschrauben, Abstand ca. 40 cm'),
    })
  }

  // Mittelstützen unter langen freien Zargen (Galerie): Zarge liegt auf, außen bündig mit den Eckpfosten
  const midX = (n: number) => Array.from({ length: n }, (_, i) => (Lo * (i + 1)) / (n + 1))
  const mids = Math.max(0, Math.min(3, Math.round(P.midPosts ?? 0)))
  const midSides = (['hinten', 'vorne'] as Side[]).filter((s) => {
    const ends: Corner[] = s === 'hinten' ? ['BL', 'BR'] : ['FL', 'FR']
    return mids > 0 && keepRail(s) && !isWall(s) && ends.some((c) => fullPost[c])
  })
  for (const s of midSides) {
    // Zargen außen: Stütze in der Flucht der Eckpfosten, die Zarge ist außen angebolzt
    const y = s === 'hinten' ? o + p / 2 : Wo - o - p / 2
    midX(mids).forEach((x, i) => {
      // bei Zargen außen 5 mm unter der Zargenoberkante, damit die Latten nur auf den Zargen liegen
      add(`stuetze-${s}-${i + 1}`, 'pfosten', P.postCatalogId, v(x, y, 0), v(x, y, aussen ? railTop - 5 : railBottom), post.b, post.h, { name: t('Mittelstütze {s} {n}', { s: sideLabel(s), n: i + 1 }) })
    })
  }

  // Etagenbett: untere Liegefläche zwischen den vier Pfosten
  const lower = !!P.lowerBed && (['BL', 'BR', 'FL', 'FR'] as Corner[]).every((c) => fullPost[c])
  const lowerSlat = timber(slat ? P.deckCatalogId : 'geh-44x74')
  // Zargen außen: die untere Querzarge sitzt eine Zargenhöhe tiefer und muss über dem Boden bleiben
  const lowerRailTop = Math.max((aussen ? 2 : 1) * rh + 20, (P.lowerDeckHeight ?? 300) - lowerSlat.b)
  if (lower) {
    const zl = lowerRailTop - rh / 2
    for (const s of ['hinten', 'vorne'] as Side[]) {
      const y = s === 'hinten' ? rb / 2 : Wo - rb / 2
      // an Mittelstützen wird die untere Zarge gestoßen
      const xs = aussen ? [0, Lo] : [p, ...(midSides.includes(s) ? midX(mids).flatMap((x) => [x - p / 2, x + p / 2]) : []), Lo - p]
      for (let i = 0; i < xs.length; i += 2) {
        const seg = xs.length > 2 ? `-${i / 2 + 1}` : ''
        add(`unten-zarge-${s}${seg}`, 'zarge', P.railCatalogId, v(xs[i], y, zl), v(xs[i + 1], y, zl), rb, rh, { name: t('Untere Längszarge {s}', { s: sideLabel(s) }) }) // i18n-ok
      }
    }
    for (const s of ['links', 'rechts'] as Side[]) {
      const x = s === 'links' ? rb / 2 : Lo - rb / 2
      const zq = aussen ? zl - rh : zl
      add(`unten-zarge-${s}`, 'zarge', P.railCatalogId, v(x, aussen ? 0 : p, zq), v(x, aussen ? Wo : Wo - p, zq), rb, rh, { name: t('Untere Querzarge {s}', { s: sideLabel(s) }) }) // i18n-ok
    }
    const w = lowerSlat.h
    const tl = lowerSlat.b
    const span = Lo - 2 * pIn - 10
    const n = Math.max(2, Math.floor((span + P.slatGap) / (w + P.slatGap)))
    const gap = (span - n * w) / (n - 1)
    // Latten liegen zwischen den Pfosten auf den Längszargen (an Mittelstützen ausgespart)
    const blocked = (x: number) => midSides.length > 0 && midX(mids).some((m) => Math.abs(m - x) < p / 2 + w / 2 + 3)
    for (let i = 0; i < n; i++) {
      const x = pIn + 5 + w / 2 + i * (w + gap)
      if (blocked(x)) continue
      add(`unten-latte-${i}`, 'leiste', lowerSlat.id, v(x, 5, lowerRailTop + tl / 2), v(x, Wo - 5, lowerRailTop + tl / 2), w, tl, { name: t('Untere Latte {n}', { n: i + 1 }) }) // i18n-ok
    }
    const lowerMids = seamYs.length ? seamYs : Wo - 2 * rb > 1250 ? [Wo / 2] : []
    for (const [k, my] of lowerMids.entries()) {
      const key = k ? `unten-mitteltraeger-${k + 1}` : 'unten-mitteltraeger' // i18n-ok
      // Zargen außen: Mittelträger im Zargenquerschnitt, liegt auf den tieferen Querzargen auf
      if (aussen) add(key, 'quertraeger', P.railCatalogId, v(0, my, lowerRailTop - rh / 2), v(Lo, my, lowerRailTop - rh / 2), rb, rh, { name: t('Unterer Mittelträger') })
      else add(key, 'quertraeger', P.joistCatalogId, v(rb, my, lowerRailTop - joist.h / 2), v(Lo - rb, my, lowerRailTop - joist.h / 2), joist.b, joist.h, { name: t('Unterer Mittelträger') })
    }
    mats.forEach((m, i) =>
      addPanel(i ? `matratze-unten-${i + 1}` : 'matratze-unten', { // i18n-ok
        kind: 'matratze',
        name:
          nMat > 1
            ? t('Untere Matratze {n} {w}×{l}', { n: i + 1, w: P.mattressWidth / 10, l: P.mattressLength / 10 })
            : t('Untere Matratze {w}×{l}', { w: P.mattressWidth / 10, l: P.mattressLength / 10 }),
        outline: rect(m.x0, m.y0, m.x1, m.y1).map((q) => to2(q.x, q.y)),
        z: lowerRailTop + tl,
        thickness: P.mattressThickness,
      }),
    )
  }

  // Abhängung: Gewindestangen von den freien Ecken zur Decke, durch die vordere Zarge gebolzt
  for (const c of hangCorners) {
    const x = c[1] === 'L' ? p + 40 : Lo - p - 40
    const y = c[0] === 'F' ? Wo - rb / 2 : rb / 2
    const m = add(`haenger-${c}`, 'sonstiges', 'gewindestange-m10', v(x, y, railBottom - 30), v(x, y, ceilingHeight), 10, 10, {
      round: true,
      name: t('Gewindestange {c}', { c: cornerLabel(c) }),
    })
    if (m) fixings.push({ memberId: m.id, target: 'decke', hardwareId: 'rahmenduebel-10', count: 2, note: t('Deckenanker für Gewindestange – nur in tragfähige Decke') })
  }

  // --- Querträger ----------------------------------------------------------------------
  const x0 = aussen ? pIn : rb
  const x1 = Lo - x0
  // Breite Leimholzbretter quer von Zarge zu Zarge: Querträger genau unter den Stößen
  const boards = P.deck === 'platte' && deckSheet?.group === 'leimholz' && !aufgelegt && !carriersLR ? deckBoards(Lo, Wo, deckSheet.formats)?.widths : undefined
  const boardSeams = boards ? boards.slice(0, -1).map((_, i) => boards.slice(0, i + 1).reduce((s, w) => s + w, 0)) : []
  let joistCount = 0
  if (aufgelegt && needsJoists) {
    // Querträger liegen auf den Trägern, jeweils auch an beiden Enden
    const spacing = P.deck === 'lattenrost' ? 1000 : Math.max(200, Math.min(P.joistSpacing, deckSheet?.maxSpan ?? P.joistSpacing))
    const along = carriersLR ? Wo : Lo
    // 5 mm Luft zu den Pfosten: Querträger liegen nur auf den Trägern und werden nicht mit den
    // Pfosten verbolzt (sonst ziehen die schlanken Hölzer Rahmenkräfte an)
    const a0 = p + 5 + joist.b / 2
    const a1 = along - p - 5 - joist.b / 2
    const n = Math.max(2, Math.ceil((a1 - a0) / spacing) + 1)
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / (n - 1)
      const zc2 = deckTopOfFrame - joist.h / 2
      const [s0, e0] = carriersLR ? [v(0, a, zc2), v(Lo, a, zc2)] : [v(a, 0, zc2), v(a, Wo, zc2)]
      add(`quertraeger-${i + 1}`, 'quertraeger', P.joistCatalogId, s0, e0, joist.b, joist.h, { name: t('Querträger {n} (aufgelegt)', { n: i + 1 }) })
    }
  } else if (P.deck === 'platte' || P.deck === 'dielen') {
    const spacing = Math.max(200, Math.min(P.joistSpacing, deckSheet?.maxSpan ?? P.joistSpacing))
    joistCount = Math.max(0, Math.ceil((x1 - x0) / spacing) - 1)
  } else if (P.deck === 'lattenrost') {
    joistCount = 1
  }
  if (aufgelegt) joistCount = 0
  let joistXs = boards ? boardSeams : Array.from({ length: joistCount }, (_, i) => x0 + ((x1 - x0) * (i + 1)) / (joistCount + 1))
  // Roste hintereinander: an jeder Fuge ein Querträger
  if (!aufgelegt && rost && seamXs.length) joistXs = P.deck === 'lattenrost' ? [...seamXs, ...mats.map((m) => (m.x0 + m.x1) / 2)] : seamXs
  joistXs.forEach((x, k) => {
    const i = k + 1
    add(`quertraeger-${i}`, 'quertraeger', P.joistCatalogId, v(x, rb, railTop - joist.h / 2), v(x, Wo - rb, railTop - joist.h / 2), joist.b, joist.h, {
      name: t('Querträger {n}', { n: i }),
    })
  })

  // Kopfbänder unter den Zargen, je Pfosten in beiden Richtungen. Beide Enden auf Gehrung (45°)
  // geschnitten: liegt satt an Pfosten und Zargenunterkante, nichts ragt hinein.
  // Bei Zargen außen steifen die durchgebolzten Zargen den Rahmen aus, Kopfbänder lägen nicht in ihrer Ebene
  if (P.braces && !aussen && (P.type === 'freistehend' || P.type === 'deckenhoch' || P.type === 'wandseitig' || P.type === 'eck')) {
    const L = 350
    // Kopfband aus Kantholz – ein dünnes Geländerbrett taugt dafür nicht
    const braceId = P.braceCatalogId ?? (guard.b >= 40 && guard.h <= 100 ? P.guardCatalogId : 'geh-54x74')
    const bt = timber(braceId)
    const w = bt.h
    const band = w * Math.SQRT2
    const c = L - w / Math.SQRT2
    const dirW = (d: Vec3) => {
      const o = toWorld(v(0, 0, 0))
      const q = toWorld(v(d.x * 1000, d.y * 1000, d.z * 1000))
      return v((q.x - o.x) / 1000, (q.y - o.y) / 1000, (q.z - o.z) / 1000)
    }
    const brace = (key: string, name: string, corner: Vec3, along: Vec3, across: Vec3) => {
      const down = v(0, 0, -1)
      const s0 = v(corner.x + down.x * c, corner.y + down.y * c, corner.z + down.z * c)
      const e0 = v(corner.x + along.x * c, corner.y + along.y * c, corner.z)
      const shape: MemberShape = {
        origin: toWorld(corner),
        eu: dirW(along),
        ev: dirW(down),
        en: dirW(across),
        poly: [
          [0, L],
          [L, 0],
          [L - band, 0],
          [0, L - band],
        ],
        range: [-bt.b / 2, bt.b / 2],
      }
      add(key, 'strebe', braceId, s0, e0, bt.b, bt.h, { name, shape })
    }
    for (const cn of Object.keys(cornerPos) as Corner[]) {
      if (!fullPost[cn]) continue
      const { x, y } = cornerPos[cn]
      const right = cn === 'BL' || cn === 'FL'
      const front = cn === 'BL' || cn === 'BR'
      // Strebe in der Ebene der Längszarge
      const yPlane = cn[0] === 'B' ? rb / 2 : Wo - rb / 2
      const xFace = right ? x + p : x
      brace(`kopfband-${cn}-x`, t('Kopfband {c} längs', { c: cornerLabel(cn) }), v(xFace, yPlane, railBottom), v(right ? 1 : -1, 0, 0), v(0, 1, 0))
      if (!keepRail(cn[1] === 'L' ? 'links' : 'rechts')) continue // i18n-ok
      const xPlane = cn[1] === 'L' ? rb / 2 : Lo - rb / 2
      const yFace = front ? y + p : y
      brace(`kopfband-${cn}-y`, t('Kopfband {c} quer', { c: cornerLabel(cn) }), v(xPlane, yFace, railBottom), v(0, front ? 1 : -1, 0), v(1, 0, 0))
    }
  }

  // --- Liegefläche ---------------------------------------------------------------------
  const slatXs: number[] = []
  if (slat) {
    // Lose aufgelegte Latten quer über die Längszargen (Forenpraxis: Abstand 6–10 cm, belüftet)
    // 5 mm Luft zu den Pfosten, damit die Latten lose liegen und nicht mit den Pfosten verschraubt werden
    const w = slat.h
    // An einer Querseite an der Wand sitzen die Geländerpfosten innen auf der Zarge – dort enden die Latten davor
    const guardIn = (s: Side) => (P.guard !== 'keins' && P.guardSides[s] && wallGap(s) < guard.h + 10 ? (P.guard === 'bretter' ? 18 : guard.b) + guard.b : 0)
    const m0 = Math.max(pIn, guardIn('links')) // i18n-ok
    const m1 = Math.max(pIn, guardIn('rechts')) // i18n-ok
    const span = Lo - m0 - m1 - 10
    const n = Math.max(2, Math.floor((span + P.slatGap) / (w + P.slatGap)))
    const gap = (span - n * w) / (n - 1)
    for (let i = 0; i < n; i++) {
      const x = m0 + 5 + w / 2 + i * (w + gap)
      // 5 mm vor der Außenkante enden, damit außen angeschraubte Geländerstützen frei bleiben
      slatXs.push(x)
      add(`latte-${i}`, 'leiste', P.deckCatalogId, v(x, 5, deckZ + deckT / 2), v(x, Wo - 5, deckZ + deckT / 2), w, deckT, { name: t('Latte {n}', { n: i + 1 }) })
    }
    addMidCarriers()
  } else if (netDeck) {
    addPanel('liegeflaeche', {
      kind: 'netz',
      name: t('Begehbares Netz'),
      outline: rect(rb, rb, Lo - rb, Wo - rb).map((q) => to2(q.x, q.y)),
      z: deckZ,
      thickness: deckT,
      catalogId: 'netz-begehbar',
      direction: P.rotation,
    })
  } else if (P.deck === 'platte' || P.deck === 'dielen') {
    const outline: { x: number; y: number }[] = []
    // Ausschnitt für Pfosten, die durch die Liegefläche reichen (bei Zargen außen nur deckenhoch)
    const n = (c: Corner) => (!hasPost(c) ? 0 : !aussen ? p : ceilingHigh ? pIn : 0)
    outline.push({ x: n('BL'), y: 0 }, { x: Lo - n('BR'), y: 0 })
    if (n('BR')) outline.push({ x: Lo - n('BR'), y: n('BR') }, { x: Lo, y: n('BR') })
    outline.push({ x: Lo, y: Wo - n('FR') })
    if (n('FR')) outline.push({ x: Lo - n('FR'), y: Wo - n('FR') }, { x: Lo - n('FR'), y: Wo })
    outline.push({ x: n('FL'), y: Wo })
    if (n('FL')) outline.push({ x: n('FL'), y: Wo - n('FL') }, { x: 0, y: Wo - n('FL') })
    outline.push({ x: 0, y: n('BL') })
    if (n('BL')) outline.push({ x: n('BL'), y: n('BL') }, { x: n('BL'), y: 0 })
    const clean = outline.filter((q, i) => i === 0 || q.x !== outline[i - 1].x || q.y !== outline[i - 1].y)
    if (boards) {
      // je Brett ein Paneel, an den Stößen eine haarfeine Fuge (Maße bleiben auf den mm genau)
      let xa = 0
      boards.forEach((w, i) => {
        const lo = i ? xa + 0.25 : xa
        const hi = i < boards.length - 1 ? xa + w - 0.25 : xa + w
        const piece = clipHalf(clipHalf(clean, lo, -1, 0), -hi, 1, 0)
        xa += w
        if (piece.length < 3) return
        addPanel(i ? `liegeflaeche-${i + 1}` : 'liegeflaeche', {
          kind: 'platte',
          name: t('Liegefläche, Brett {n}', { n: i + 1 }),
          outline: piece.map((q) => to2(q.x, q.y)),
          z: deckZ,
          thickness: deckT,
          catalogId: P.deckCatalogId,
          direction: P.rotation,
        })
      })
    } else
      addPanel('liegeflaeche', {
        kind: P.deck,
        name: P.deck === 'platte' ? t('Liegefläche (Platte)') : t('Liegefläche (Dielen)'),
        outline: clean.map((q) => to2(q.x, q.y)),
        z: deckZ,
        thickness: deckT,
        catalogId: P.deckCatalogId,
        direction: P.rotation,
      })
  } else {
    // ein Rost je Matratze, Stoß über Mittel- bzw. Querträger
    const xs = [pIn, ...seamXs, Lo - pIn]
    const ys = [pIn, ...seamYs, Wo - pIn]
    mats.forEach((_, i) => {
      const [ax0, ax1] = matSide ? [pIn, Lo - pIn] : [xs[i], xs[i + 1]]
      const [ay0, ay1] = matSide ? [ys[i], ys[i + 1]] : [pIn, Wo - pIn]
      addPanel(i ? `liegeflaeche-${i + 1}` : 'liegeflaeche', {
        kind: P.deck === 'rollrost' ? 'rollrost' : 'lattenrost',
        name:
          P.deck === 'rollrost'
            ? nMat > 1
              ? t('Rollrost {n}', { n: i + 1 })
              : t('Rollrost')
            : nMat > 1
              ? t('Lattenrost {n}', { n: i + 1 })
              : t('Lattenrost'),
        outline: rect(ax0, ay0, ax1, ay1).map((q) => to2(q.x, q.y)),
        z: deckZ,
        thickness: deckT,
        catalogId: P.deckCatalogId,
        direction: P.rotation,
      })
    })
    addMidCarriers()
  }
  if (!netDeck)
    mats.forEach((m, i) =>
      addPanel(i ? `matratze-${i + 1}` : 'matratze', {
        kind: 'matratze',
        name:
          nMat > 1
            ? t('Matratze {n} {w}×{l}', { n: i + 1, w: P.mattressWidth / 10, l: P.mattressLength / 10 })
            : t('Matratze {w}×{l}', { w: P.mattressWidth / 10, l: P.mattressLength / 10 }),
        outline: rect(m.x0, m.y0, m.x1, m.y1).map((q) => to2(q.x, q.y)),
        z: H,
        thickness: P.mattressThickness,
      }),
    )

  function addMidCarriers() {
    midYs.forEach((y, i) => {
      const key = i ? `mitteltraeger-${i + 1}` : 'mitteltraeger' // i18n-ok
      const name = midYs.length > 1 ? t('Mittelträger {n}', { n: i + 1 }) : t('Mittelträger')
      // Zargen außen: im Zargenquerschnitt über die volle Länge, liegt auf den tieferen Querzargen auf
      if (aussen) add(key, 'quertraeger', P.railCatalogId, v(0, y, railTop - rh / 2), v(Lo, y, railTop - rh / 2), rb, rh, { name })
      else add(key, 'quertraeger', P.joistCatalogId, v(rb, y, railTop - joist.h / 2), v(Lo - rb, y, railTop - joist.h / 2), joist.b, joist.h, { name })
    })
  }

  // --- Leiter (vor dem Geländer, weil die Öffnung von ihr abhängt) -----------------------
  let ladderFootprint: { x: Mm; y: Mm }[] | undefined
  let accessWidth: Mm | undefined
  let opening: [Mm, Mm] | undefined
  let rungPitch: Mm | undefined
  let standPts: { x: Mm; y: Mm }[] = []
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
          name: t('Leiterholm {n}', { n: i + 1 }),
        })
      } else {
        add(`leiter-holm-${i}`, 'holm', P.ladderCatalogId, pt(a, run + sh / 2, 0), pt(a, sh / 2, H), sb, sh, {
          name: t('Treppenwange {n}', { n: i + 1 }),
        })
        // senkrechte Haltegriffe neben der Wange (außerhalb der Öffnung, nicht in ihr), außen an der Zarge
        // verbolzt: bis 40 mm unter die Zarge, damit der untere Bolzen weit genug vom Griffende sitzt
        const [gx, gy] = alongSide(side, guard.b, guard.h)
        // 5 mm Luft zur Wange: der Griff hängt an Zarge und Handlauf, nicht an der Wangenkante
        const ga = i === 0 ? a - sb / 2 - guard.b / 2 - 5 : a + sb / 2 + guard.b / 2 + 5
        add(`leiter-griff-${i}`, 'holm', P.guardCatalogId, pt(ga, guard.h / 2, railBottomAt(side) - 40), pt(ga, guard.h / 2, guardTop + 150), gx, gy, {
          name: t('Haltegriff {n}', { n: i + 1 }),
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
          name: t('Sprosse {n}', { n: i }),
        })
      } else {
        const depth = P.ladder === 'treppe' ? 2 : 1
        for (let k = 0; k < depth; k++) {
          add(`leiter-stufe-${i}-${k}`, 'stufe', 'geh-24x94', pt(a0 + sb, out + (k - (depth - 1) / 2) * 96, z - 12), pt(a1 - sb, out + (k - (depth - 1) / 2) * 96, z - 12), 94, 24, {
            name: t('Stufe {n}', { n: i }),
          })
        }
      }
    }
    standPts = [frame.at(a0, 0), frame.at(a1, 0), frame.at(a1, run + sh), frame.at(a0, run + sh)]
    const reach = run + sh + 600
    ladderFootprint = [frame.at(a0, 0), frame.at(a1, 0), frame.at(a1, reach), frame.at(a0, reach)].map((q) => to2(q.x, q.y))
  }

  // --- Geländer ------------------------------------------------------------------------
  let rodGap: Mm | undefined
  if (P.guard !== 'keins') {
    for (const s of ['hinten', 'vorne', 'links', 'rechts'] as Side[]) {
      if (!guardOn(s)) continue
      const frame = sideFrame(s, Lo, Wo)
      const [c0, c1] = SIDE_ENDS[s]
      const lengthwise0 = s === 'vorne' || s === 'hinten'
      // Ende ohne Pfosten: Längsseiten laufen bis in die Ecke, Querseiten stoßen an ein Längsgeländer
      // Zargen außen: die Pfosten stehen innen, das Geländer läuft wie an einer Ecke ohne Pfosten
      const edgePost = (c: Corner) => fullPost[c] && !aussen
      const endGap = (c: Corner) => {
        if (edgePost(c)) return p
        const other = cornerSides[c].find((x) => x !== s)!
        return !lengthwise0 && guardOn(other) ? guard.b : 0
      }
      const g0 = endGap(c0)
      const g1 = frame.length - endGap(c1)
      // Lage der Zarge dieser Seite entlang der Seite (dort wird der Geländerpfosten angeschraubt)
      const railAlong: [Mm, Mm] =
        s === 'vorne' ? [xStart(s), xEnd(s)] : s === 'hinten' ? [Lo - xEnd(s), Lo - xStart(s)] : s === 'links' ? [yStart(s), yEnd(s)] : [Wo - yEnd(s), Wo - yStart(s)] // i18n-ok
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
        // Lange Geländerfelder: Zwischenstützen außen an die Zarge geschraubt, höchstens ca. 1,2 m Feldweite.
        // Steht die Seite an der Wand, sitzt die Stütze innen hinter der Füllung auf der Zarge.
        const fields = Math.ceil((s1 - s0) / 1250)
        const inside = wallGap(s) < gh + 10
        const infill = P.guard === 'bretter' ? 18 : gb
        const lengthwise = s === 'vorne' || s === 'hinten'
        // innen: an der Längsseite in eine Lattenlücke setzen, an der Querseite flach an die Zarge
        const [sx, sy] = inside && !lengthwise ? alongSide(s, gh, gb) : alongSide(s, gb, gh)
        const depth = inside && !lengthwise ? gb : gh
        const out = inside ? -(infill + depth / 2) : gh / 2
        // außen 40 mm unter die Zarge verlängert: der untere Bolzen sitzt so ≥ 7·d vom Stützenende (DIN EN 1995)
        const z0 = inside ? (P.deck === 'latten' || netDeck ? railBottomAt(s) + rh : H) : railBottomAt(s) - 40
        // innen endet die Stütze unter dem Handlauf, der auf ihr aufliegt
        const z1 = inside ? guardTop - gh : guardTop
        const along = inside && !lengthwise ? gh : gb
        // innen stehende Stützen nicht auf Latten bzw. Mittelträger setzen
        const placeInside = (a: number) => {
          if (!inside) return a
          if (lengthwise && slatXs.length > 1) {
            const want = s === 'vorne' ? a : Lo - a
            const gaps = slatXs.slice(1).map((x, k) => (x + slatXs[k]) / 2)
            const best = gaps.reduce((b, x) => (Math.abs(x - want) < Math.abs(b - want) ? x : b), gaps[0])
            return s === 'vorne' ? best : Lo - best
          }
          if (!lengthwise && aussen) {
            // Querseite: neben den Mittelträger, der hier auf der Querzarge aufliegt
            const y = s === 'links' ? a : Wo - a
            const room = rb / 2 + along / 2 + 5
            const my = midYs.find((m) => Math.abs(m - y) < room)
            if (my !== undefined) {
              const y2 = my + (y >= my ? room : -room)
              return s === 'links' ? y2 : Wo - y2
            }
          }
          return a
        }
        for (let i = 1; i < fields; i++) {
          const a = placeInside(s0 + ((s1 - s0) * i) / fields)
          add(`gelaenderstuetze-${key}-${i}`, 'holm', P.guardCatalogId, pt(a, z0, out), pt(a, z1, out), sx, sy, { name: t('Geländerstütze {s}', { s: sideLabel(s) }) })
        }
        // Geländerende ohne Pfosten: Geländerpfosten wie eine Stütze an die Zarge dieser Seite geschraubt
        const ends: [Corner, number][] = []
        // 5 mm Abstand zum Zargenende, damit der Pfosten nur an seiner Zarge anliegt; bei Zargen außen
        // hinter dem eingerückten Pfosten, damit die Bolzen innen nicht auf ihn treffen
        const clear = aussen ? pIn + 5 : 0
        // Endet das Feld an der Leiteröffnung, hält dort der Haltegriff bzw. Holm; der Pfosten muss davor Platz haben
        const ladderRoom = stile.b + guard.b + 10
        const free0 = opening && P.ladderSide === s && s0 === opening[1] ? s0 + ladderRoom : s0
        const free1 = opening && P.ladderSide === s && s1 === opening[0] ? s1 - ladderRoom : s1
        if (si === 0 && !edgePost(c0)) {
          const a = placeInside(Math.max(s0, railAlong[0] + 5, clear) + along / 2)
          if (a + along / 2 <= free1) ends.push([c0, a])
        }
        if (si === segs.length - 1 && !edgePost(c1)) {
          const a = placeInside(Math.min(s1, railAlong[1] - 5, frame.length - clear) - along / 2)
          if (a - along / 2 >= free0) ends.push([c1, a])
        }
        for (const [c, a] of ends)
          add(`gelaenderpfosten-${c}-${s}`, 'holm', P.guardCatalogId, pt(a, z0, out), pt(a, z1, out), sx, sy, { name: t('Geländerpfosten {c}', { c: cornerLabel(c) }) })
        // Handlauf
        add(`handlauf-${key}`, 'holm', P.guardCatalogId, pt(s0, guardTop - gh / 2), pt(s1, guardTop - gh / 2), gb, gh, { name: t('Handlauf {s}', { s: sideLabel(s) }) })
        // Die Öffnungskanten halten die Leiterholme bzw. Haltegriffe.
        const innerTop = guardTop - gh
        const lowTop = H + gh
        switch (P.guard) {
          case 'staebe': {
            add(`unterholm-${key}`, 'holm', P.guardCatalogId, pt(s0, H + gh / 2), pt(s1, H + gh / 2), gb, gh, { name: t('Unterholm {s}', { s: sideLabel(s) }) })
            const d = 25
            const maxGap = 70
            const span = s1 - s0
            const n = Math.max(1, Math.ceil((span - maxGap) / (d + maxGap)))
            const gap = (span - n * d) / (n + 1)
            rodGap = rodGap === undefined ? gap : Math.max(rodGap, gap)
            for (let i = 0; i < n; i++) {
              const a = s0 + gap * (i + 1) + d * i + d / 2
              add(`stab-${key}-${i}`, 'stab', 'rund-buche-25', pt(a, lowTop), pt(a, innerTop), d, d, { round: true, name: t('Geländerstab {s}', { s: sideLabel(s) }) })
            }
            break
          }
          case 'bretter': {
            // So viele Bretter bzw. Latten, dass kein Spalt (auch der unter dem Handlauf) über 60 mm liegt,
            // gleichmäßig verteilt
            const bt = timber(P.guardBoardCatalogId ?? 'leimholz-fi-18x200')
            const thick = Math.min(bt.b, bt.h)
            const wide = Math.max(bt.b, bt.h)
            const maxGap = 60
            const space = innerTop - H
            const n = Math.max(1, Math.ceil((space - maxGap) / (wide + maxGap)))
            // passen die Bretter nicht mit mindestens 1 cm Luft, werden sie schmaler gesägt
            const board = Math.max(20, Math.min(wide, (space - (n + 1) * 10) / n))
            const gap = Math.max(0, (space - n * board) / (n + 1))
            for (let i = 0; i < n; i++) {
              const zc2 = H + gap * (i + 1) + board * i + board / 2
              add(`brett-${key}-${i}`, 'holm', bt.id, pt(s0, zc2, -thick / 2), pt(s1, zc2, -thick / 2), thick, board, { name: t('Geländerbrett {s}', { s: sideLabel(s) }) })
            }
            rodGap = rodGap === undefined ? gap : Math.max(rodGap, gap)
            break
          }
          case 'platte':
          case 'netz': {
            add(`unterholm-${key}`, 'holm', P.guardCatalogId, pt(s0, H + gh / 2), pt(s1, H + gh / 2), gb, gh, { name: t('Unterholm {s}', { s: sideLabel(s) }) })
            const a = frame.at(s0, -inPlane)
            const b = frame.at(s1, -inPlane)
            addPanel(`fuellung-${key}`, {
              kind: P.guard === 'netz' ? 'netz' : 'platte',
              name: P.guard === 'netz' ? t('Netz {s}', { s: sideLabel(s) }) : t('Geländerplatte {s}', { s: sideLabel(s) }),
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
              add(`seil-${key}-${i}`, 'sonstiges', 'seil-12', pt(s0, z), pt(s1, z), 12, 12, { round: true, name: t('Seil {s}', { s: sideLabel(s) }) })
            }
            rodGap = Math.round((innerTop - H) / 3)
            break
          }
        }
      })
    }
  }

  const undersides = members
    .filter((m) => (m.role === 'zarge' || m.role === 'quertraeger' || m.role === 'wandriegel') && !m.partKey?.startsWith('unten-')) // i18n-ok
    .map((m) => Math.min(m.start.z, m.end.z) - m.h / 2)
  const underside = undersides.length ? Math.min(...undersides) : railBottom

  return {
    members,
    panels,
    fixings,
    info: {
      outerLength: Lo,
      outerWidth: Wo,
      ...standSize([...rect(0, 0, Lo, Wo), ...standPts]),
      deckTop: H,
      mattressTop: H + P.mattressThickness,
      underside,
      lowerMattressTop: lower ? lowerRailTop + lowerSlat.b + P.mattressThickness : undefined,
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
/** Ecken am Anfang und Ende einer Seite in Laufrichtung von sideFrame */
const SIDE_ENDS: Record<Side, [Corner, Corner]> = { vorne: ['FL', 'FR'], hinten: ['BR', 'BL'], links: ['BL', 'FL'], rechts: ['FR', 'BR'] }

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

function standSize(pts: { x: number; y: number }[]) {
  const xs = pts.map((q) => q.x)
  const ys = pts.map((q) => q.y)
  return { standLength: Math.round(Math.max(...xs) - Math.min(...xs)), standWidth: Math.round(Math.max(...ys) - Math.min(...ys)) }
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
  switch (c) {
    case 'BL':
      return t('hinten links')
    case 'BR':
      return t('hinten rechts')
    case 'FL':
      return t('vorne links')
    case 'FR':
      return t('vorne rechts')
    default:
      return c
  }
}

/** Bezeichnung einer Bettseite für Bauteilnamen */
function sideLabel(s: Side): string {
  switch (s) {
    case 'vorne':
      return t('vorne')
    case 'hinten':
      return t('hinten')
    case 'links':
      return t('links')
    case 'rechts':
      return t('rechts')
  }
}

export const BED_TYPE_LABEL: Record<LoftBedParams['type'], string> = {
  freistehend: tk('Freistehend, 4 Pfosten'),
  deckenhoch: tk('Deckenhoch verspannt, 4 Pfosten'),
  wandseitig: tk('Wandseitig, 2 Pfosten'),
  eck: tk('Eckhochbett, 1 Pfosten'),
  nische: tk('Hochebene Wand zu Wand'),
  abgehaengt: tk('Abgehängt (Wand + Decke)'),
}


/** Bauart für Listen und Kopfzeilen; ohne Pfosten auf Möbeln eigens benannt */
export function bedTypeLabel(P: LoftBedParams): string {
  if (P.cornerSupport === 'moebel' && P.type !== 'deckenhoch' && P.type !== 'abgehaengt') return tk('Auf Regal/Schrank, ohne Pfosten')
  return BED_TYPE_LABEL[P.type]
}
