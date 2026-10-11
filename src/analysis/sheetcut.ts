/**
 * Plattenzuschnitt in 2D: Teile aus Plattenwerkstoff (Liegefläche, Geländerbretter, Verkleidungen)
 * auf Handelsformate verteilen. Guillotine-Schnitte (jeder Schnitt geht durch die ganze Restplatte –
 * so schneidet auch der Baumarkt-Zuschnitt), Teile dürfen gedreht werden, Sägefuge 4 mm.
 *
 * Vorgehen wie bei den Stangen: erst auf ein Format packen, danach jede Platte auf das günstigste
 * Format verkleinern, auf das ihre Teile noch passen. Das wird für jedes Format als Ausgang versucht,
 * das günstigste Ergebnis gewinnt.
 */

export const KERF = 4

export interface SheetFormat {
  l: number
  w: number
  price: number
}

export interface SheetPiece {
  /** Name des Bauteils (Übersetzungsschlüssel oder eigener Name, Anzeige mit tr()) */
  label: string
  l: number
  w: number
  /** Stück eines geteilten Teils, z. B. „1/2“ */
  part?: string
}

export interface PlacedPiece extends SheetPiece {
  x: number
  y: number
  /** quer eingelegt: l liegt entlang der Plattenbreite */
  rotated: boolean
}

export interface SheetLayout {
  format: SheetFormat
  pieces: PlacedPiece[]
  /** Anteil der genutzten Fläche */
  used: number
}

interface Free {
  x: number
  y: number
  l: number
  w: number
}

/**
 * Teil größer als jede Platte: in gleich große Stücke teilen (Stoß über einem Träger). Gewählt wird
 * die Lage mit den wenigsten Stücken auf dem größten Format.
 */
export function splitOversize(pc: SheetPiece, formats: SheetFormat[]): SheetPiece[] {
  if (formats.some((f) => fits(pc, f))) return [pc]
  const big = [...formats].sort((a, b) => b.l * b.w - a.l * a.w)[0]
  const opts = [
    { nx: Math.ceil(pc.l / big.l), ny: Math.ceil(pc.w / big.w) },
    { nx: Math.ceil(pc.l / big.w), ny: Math.ceil(pc.w / big.l) },
  ].sort((a, b) => a.nx * a.ny - b.nx * b.ny)[0]
  const l = Math.ceil(pc.l / opts.nx)
  const w = Math.ceil(pc.w / opts.ny)
  const n = opts.nx * opts.ny
  return Array.from({ length: n }, (_, i) => ({ label: pc.label, part: `${i + 1}/${n}`, l, w }))
}

function fits(pc: { l: number; w: number }, f: { l: number; w: number }): boolean {
  return (pc.l <= f.l && pc.w <= f.w) || (pc.l <= f.w && pc.w <= f.l)
}

/** Teile auf Platten eines Formats verteilen (Guillotine, beste kurze Seite) */
export function packOnFormat(pieces: SheetPiece[], f: SheetFormat): SheetLayout[] {
  const sorted = [...pieces].sort((a, b) => b.l * b.w - a.l * a.w || Math.max(b.l, b.w) - Math.max(a.l, a.w))
  const sheets: { free: Free[]; pieces: PlacedPiece[] }[] = []
  for (const pc of sorted) {
    let best: { s: number; i: number; rot: boolean; score: number } | undefined
    const tryIn = (s: number) => {
      sheets[s].free.forEach((fr, i) => {
        for (const rot of [false, true]) {
          const pl = rot ? pc.w : pc.l
          const pw = rot ? pc.l : pc.w
          if (pl > fr.l || pw > fr.w) continue
          const score = Math.min(fr.l - pl, fr.w - pw)
          if (!best || score < best.score) best = { s, i, rot, score }
        }
      })
    }
    for (let s = 0; s < sheets.length; s++) tryIn(s)
    if (!best) {
      sheets.push({ free: [{ x: 0, y: 0, l: f.l, w: f.w }], pieces: [] })
      tryIn(sheets.length - 1)
    }
    // vorher geteilt bzw. geprüft – kommt nicht vor
    if (!best) throw new Error(`piece ${pc.l}x${pc.w} does not fit ${f.l}x${f.w}`) // i18n-ok
    const sh = sheets[best.s]
    const fr = sh.free[best.i]
    const pl = best.rot ? pc.w : pc.l
    const pw = best.rot ? pc.l : pc.w
    sh.pieces.push({ ...pc, x: fr.x, y: fr.y, rotated: best.rot })
    sh.free.splice(best.i, 1)
    // Rest in zwei Rechtecke teilen, entlang der kürzeren Restseite (ergibt größere Reststücke)
    const restL = fr.l - pl - KERF
    const restW = fr.w - pw - KERF
    if (restL < restW) {
      if (restL > 0) sh.free.push({ x: fr.x + pl + KERF, y: fr.y, l: restL, w: pw })
      if (restW > 0) sh.free.push({ x: fr.x, y: fr.y + pw + KERF, l: fr.l, w: restW })
    } else {
      if (restL > 0) sh.free.push({ x: fr.x + pl + KERF, y: fr.y, l: restL, w: fr.w })
      if (restW > 0) sh.free.push({ x: fr.x, y: fr.y + pw + KERF, l: pl, w: restW })
    }
  }
  return sheets.map((s) => ({ format: f, pieces: s.pieces, used: s.pieces.reduce((a, p) => a + p.l * p.w, 0) / (f.l * f.w) }))
}

/** Günstigste Verteilung über alle Formate eines Plattenwerkstoffs */
export function packSheets(pieces: SheetPiece[], formats: SheetFormat[]): SheetLayout[] {
  if (!pieces.length || !formats.length) return []
  const parts = pieces.flatMap((pc) => splitOversize(pc, formats))
  let best: { layouts: SheetLayout[]; cost: number } | undefined
  for (const base of formats) {
    if (!parts.every((pc) => fits(pc, base))) continue
    const layouts = packOnFormat(parts, base).map((sh) => {
      // jede Platte auf das günstigste Format verkleinern, das ihre Teile allein aufnimmt
      for (const f of [...formats].sort((a, b) => a.price - b.price)) {
        if (f.price >= sh.format.price) break
        if (!sh.pieces.every((pc) => fits(pc, f))) continue
        const again = packOnFormat(sh.pieces, f)
        if (again.length === 1 && again[0].pieces.length === sh.pieces.length) return again[0]
      }
      return sh
    })
    const cost = layouts.reduce((s, x) => s + x.format.price, 0)
    if (!best || cost < best.cost - 1e-6) best = { layouts, cost }
  }
  return best?.layouts ?? []
}
