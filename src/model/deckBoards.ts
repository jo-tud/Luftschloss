/**
 * Liegefläche aus breiten Leimholzplatten: Die Bretter liegen quer zum Bett von Zarge zu Zarge (Faser
 * in Spannrichtung), nebeneinander entlang der Bettlänge. Unter jeden Stoß kommt ein Querträger, so
 * liegt jedes Brett ringsum auf. Gesucht ist die Mischung der Handelsbreiten (z. B. 60 und 40 cm), die
 * wenig kostet und wenig Bretter braucht; das letzte Brett wird auf Breite gesägt.
 */

export interface BoardFormat {
  l: number
  w: number
  price: number
}

/** Aufwand je Brett (Zuschnitt, Montage) in Euro – damit wenige breite Bretter gewinnen */
const EFFORT = 2

/**
 * Brettbreiten entlang run (Bettlänge), jedes Brett span lang (Bettbreite). Die Summe der Breiten ist
 * genau run; nur das letzte Brett ist schmaler als sein Handelsformat. undefined, wenn kein Format
 * lang genug ist.
 */
export function deckBoards(run: number, span: number, formats: BoardFormat[]): { widths: number[]; ripped: number } | undefined {
  // je Breite das günstigste Format, das lang genug ist
  const byWidth = new Map<number, number>()
  for (const f of formats) {
    if (f.l < span || f.w < 100) continue
    byWidth.set(f.w, Math.min(byWidth.get(f.w) ?? Infinity, f.price))
  }
  const widths = [...byWidth.keys()].sort((a, b) => b - a)
  if (!widths.length) return undefined
  let best: { counts: number[]; score: number } | undefined
  const counts = widths.map(() => 0)
  const search = (i: number, total: number, cost: number, n: number) => {
    if (i === widths.length) {
      if (total < run || n === 0) return
      const excess = total - run
      // das gesägte Brett darf nicht ganz wegfallen
      if (excess >= Math.min(...widths.filter((_, k) => counts[k] > 0))) return
      const score = cost + EFFORT * n + excess * 0.001
      if (!best || score < best.score - 1e-9) best = { counts: [...counts], score }
      return
    }
    const w = widths[i]
    const max = Math.ceil(Math.max(0, run - total) / w)
    for (let c = 0; c <= max; c++) {
      counts[i] = c
      search(i + 1, total + c * w, cost + c * byWidth.get(w)!, n + c)
    }
    counts[i] = 0
  }
  search(0, 0, 0, 0)
  if (!best) return undefined
  const list = widths.flatMap((w, k) => Array.from({ length: best!.counts[k] }, () => w))
  const excess = list.reduce((s, w) => s + w, 0) - run
  list[list.length - 1] -= excess
  return { widths: list, ripped: excess }
}
