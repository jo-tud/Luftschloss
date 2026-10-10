import { HARDWARE, PRICE_STAND, catalogItem, type HardwareItem, type SheetItem, type TimberItem } from '../model/catalog'
import { fmtCm, fmtM, memberLength } from '../model/geometry'
import { cutLengths } from '../model/joinery'
import { jointType } from '../model/joints'
import type { Resolved } from '../model/resolve'
import type { Panel, Project } from '../model/types'

export const KERF = 3

export interface Bar {
  stock: number
  pieces: { length: number; label: string }[]
  waste: number
}

export interface TimberLine {
  item: TimberItem
  pieces: { length: number; label: string; id: string }[]
  bars: Bar[]
  /** Teile länger als die längste Handelslänge */
  oversize: { length: number; label: string }[]
  price: number
  totalLength: number
}

export interface SheetLine {
  item: SheetItem
  count: number
  format: { l: number; w: number; price: number }
  note: string
  price: number
}

export interface HardwareLine {
  item: HardwareItem
  qty: number
  packs: number
  price: number
  reasons: string[]
}

export interface Bom {
  timber: TimberLine[]
  sheets: SheetLine[]
  hardware: HardwareLine[]
  cuts: number
  total: number
  estimatedShare: number
  priceStand: string
}

/** First-Fit-Decreasing auf die längste Handelslänge, danach jede Stange auf die kürzeste passende Länge verkleinern. */
export function packBars(pieces: { length: number; label: string }[], lengths: number[]): { bars: Bar[]; oversize: { length: number; label: string }[] } {
  const stockLengths = [...lengths].sort((a, b) => a - b)
  const longest = stockLengths[stockLengths.length - 1]
  const sorted = [...pieces].sort((a, b) => b.length - a.length)
  const bars: { used: number; pieces: { length: number; label: string }[] }[] = []
  const oversize: { length: number; label: string }[] = []
  for (const pc of sorted) {
    if (pc.length > longest) {
      oversize.push(pc)
      continue
    }
    const need = (bar: { used: number; pieces: unknown[] }) => (bar.pieces.length ? KERF : 0) + pc.length
    const bar = bars.find((b) => b.used + need(b) <= longest)
    if (bar) {
      bar.used += need(bar)
      bar.pieces.push(pc)
    } else bars.push({ used: pc.length, pieces: [pc] })
  }
  return {
    bars: bars.map((b) => {
      const stock = stockLengths.find((l) => l >= b.used) ?? longest
      return { stock, pieces: b.pieces, waste: stock - b.used }
    }),
    oversize,
  }
}

export function priceOf(p: Project, id: string, fallback: number): number {
  return p.settings.priceOverrides[id]?.price ?? fallback
}

export function computeBom(p: Project, r: Resolved): Bom {
  const byTimber = new Map<string, TimberLine>()
  const hw = new Map<string, { qty: number; reasons: Set<string> }>()
  const addHw = (id: string, qty: number, reason: string) => {
    const e = hw.get(id) ?? { qty: 0, reasons: new Set<string>() }
    e.qty += qty
    e.reasons.add(reason)
    hw.set(id, e)
  }

  // mit Zapfen, Blättern usw. – nicht nur von Knoten zu Knoten
  const cutLen = cutLengths(r.joints, r.members)
  for (const m of r.members) {
    const item = catalogItem(m.catalogId)
    if (!item) continue
    const L = Math.ceil(cutLen.get(m.id) ?? memberLength(m))
    if (item.kind === 'beschlag') {
      addHw(item.id, item.perMeter ? L : 1, m.name ?? 'Bauteil')
      continue
    }
    if (item.kind !== 'stab') continue
    const line = byTimber.get(item.id) ?? { item, pieces: [], bars: [], oversize: [], price: 0, totalLength: 0 }
    line.pieces.push({ length: L, label: m.name ?? m.role, id: m.id })
    byTimber.set(item.id, line)
  }
  let cuts = 0
  for (const line of byTimber.values()) {
    const { bars, oversize } = packBars(line.pieces, line.item.lengths)
    line.bars = bars
    line.oversize = oversize
    line.totalLength = line.pieces.reduce((s, x) => s + x.length, 0)
    const perM = priceOf(p, line.item.id, line.item.pricePerM)
    line.price = (bars.reduce((s, b) => s + b.stock, 0) + oversize.reduce((s, x) => s + x.length, 0)) / 1000 * perM
    cuts += bars.reduce((s, b) => s + b.pieces.length, 0)
  }

  const sheets: SheetLine[] = []
  const sheetPanels = new Map<string, Panel[]>()
  for (const pa of r.panels) {
    if (!pa.catalogId || pa.kind === 'matratze') continue
    const item = catalogItem(pa.catalogId)
    if (!item || item.kind !== 'platte') continue
    sheetPanels.set(item.id, [...(sheetPanels.get(item.id) ?? []), pa])
  }
  for (const [id, list] of sheetPanels) {
    const item = catalogItem(id) as SheetItem
    let count = 0
    let fmt = item.formats[0]
    let note = ''
    for (const pa of list) {
      const { a, b } = panelSize(pa)
      if (item.group === 'diele') {
        // Dielen laufen entlang der längeren Seite; Reihen = Breite / Deckbreite
        const run = Math.max(a, b)
        const rows = Math.ceil(Math.min(a, b) / item.formats[0].w)
        const lens = item.formats.map((f) => f.l)
        const packed = packBars(Array.from({ length: rows }, () => ({ length: run, label: pa.name ?? '' })), lens)
        count += packed.bars.length + packed.oversize.length * Math.ceil(run / Math.max(...lens))
        fmt = item.formats.find((f) => f.l === Math.max(...packed.bars.map((x) => x.stock), lens[0])) ?? item.formats[0]
        note = `${rows} Reihen à ${(run / 10).toFixed(0)} cm`
      } else if (item.group === 'rollrost' || item.group === 'lattenrost') {
        fmt = item.formats.find((f) => f.w >= Math.min(a, b) - 30) ?? item.formats[item.formats.length - 1]
        count += 1
        note = 'Fertigteil passend zur Matratze'
      } else if (item.group === 'netz') {
        count += Math.ceil((a * b) / 1e6)
        fmt = { l: 1000, w: 1000, price: item.formats[0].price / ((item.formats[0].l * item.formats[0].w) / 1e6) }
        note = 'Meterware nach Maß (m²)'
      } else {
        const best = item.formats
          .map((f) => ({ f, n: sheetsNeeded(a, b, f.l, f.w) }))
          .sort((x, y) => x.n * x.f.price - y.n * y.f.price)[0]
        fmt = best.f
        count += best.n
        note = best.n > 1 ? 'Stoß über einem Querträger' : ''
        cuts += 2
      }
    }
    const unit = priceOf(p, `${id}@${fmt.l}x${fmt.w}`, fmt.price)
    sheets.push({ item, count, format: fmt, note, price: count * unit })
  }

  for (const j of r.joints) {
    const t = jointType(j.typeId)
    if (!t) continue
    for (const h of t.hardware) addHw(h.id, h.qty, t.name)
  }
  for (const f of r.fixings) addHw(f.hardwareId, f.count, f.note)
  // Liegefläche verschrauben
  for (const pa of r.panels) {
    if (pa.kind === 'platte' || pa.kind === 'dielen') {
      const { a, b } = panelSize(pa)
      addHw('schraube-5x50', Math.ceil(((a + b) * 2) / 250 + (a * b) / 1e6 * 8), 'Liegefläche verschrauben')
    }
  }

  const hardware: HardwareLine[] = []
  for (const [id, e] of hw) {
    const item = HARDWARE.find((h) => h.id === id)
    if (!item) continue
    const packs = Math.ceil(e.qty / item.pack)
    hardware.push({ item, qty: e.qty, packs, price: packs * priceOf(p, id, item.packPrice), reasons: [...e.reasons] })
  }
  hardware.sort((a, b) => a.item.group.localeCompare(b.item.group))

  const timber = [...byTimber.values()].sort((a, b) => a.item.group.localeCompare(b.item.group) || b.item.h - a.item.h)
  const total = timber.reduce((s, x) => s + x.price, 0) + sheets.reduce((s, x) => s + x.price, 0) + hardware.reduce((s, x) => s + x.price, 0)
  const estimated =
    timber.filter((x) => x.item.priceEstimated && !p.settings.priceOverrides[x.item.id]).reduce((s, x) => s + x.price, 0) +
    sheets.filter((x) => x.item.priceEstimated).reduce((s, x) => s + x.price, 0) +
    hardware.filter((x) => x.item.priceEstimated && !p.settings.priceOverrides[x.item.id]).reduce((s, x) => s + x.price, 0)
  return { timber, sheets, hardware, cuts, total, estimatedShare: total ? estimated / total : 0, priceStand: PRICE_STAND }
}

function panelSize(pa: Panel): { a: number; b: number } {
  if (pa.vertical) {
    const l = Math.hypot(pa.vertical.b.x - pa.vertical.a.x, pa.vertical.b.y - pa.vertical.a.y)
    return { a: l, b: pa.vertical.height }
  }
  const xs = pa.outline.map((q) => q.x)
  const ys = pa.outline.map((q) => q.y)
  return { a: Math.max(...xs) - Math.min(...xs), b: Math.max(...ys) - Math.min(...ys) }
}

function sheetsNeeded(a: number, b: number, l: number, w: number): number {
  const fit = (x: number, y: number) => Math.ceil(x / l) * Math.ceil(y / w)
  return Math.min(fit(a, b), fit(b, a))
}

/** Prompt zum Kopieren in einen KI-Chat mit Websuche: liefert eine Preistabelle zum Zurückfügen. */
export function pricePrompt(p: Project, bom: Bom, market = ''): string {
  const lines: string[] = []
  for (const t of bom.timber) {
    const counts = new Map<number, number>()
    for (const b of t.bars) counts.set(b.stock, (counts.get(b.stock) ?? 0) + 1)
    for (const [len, n] of counts) lines.push(`${t.item.id} | ${t.item.name}, Länge ${len} mm | ${n} Stück | Preis je laufender Meter`)
  }
  for (const s of bom.sheets) lines.push(`${s.item.id}@${s.format.l}x${s.format.w} | ${s.item.name}, Format ${s.format.l}×${s.format.w} mm | ${s.count} Stück | Preis je Stück`)
  for (const h of bom.hardware) lines.push(`${h.item.id} | ${h.item.name} | ${h.packs} ${h.item.perMeter ? 'm' : 'Packung(en)'} | Preis je ${h.item.perMeter ? 'Meter' : 'Packung'}`)
  return [
    `Du bist mein Einkaufsassistent für ein Hochbett-Projekt („${p.name}“). Recherchiere bitte mit Websuche die aktuellen Preise bei HORNBACH Deutschland${market ? ` (Markt: ${market})` : ''} für die folgenden Artikel. Wenn es einen Artikel nicht genau gibt, nimm den nächstpassenden aus dem Hornbach-Sortiment und nenne ihn. Wenn Hornbach nicht abrufbar ist, nimm OBI, Bauhaus oder toom und vermerke das.`,
    '',
    'Artikel (ID | Beschreibung | Menge | gewünschte Preiseinheit):',
    ...lines.map((l) => `- ${l}`),
    '',
    'Antworte am Ende mit genau einem Codeblock im Format (Semikolon-getrennt, eine Zeile pro Artikel, Dezimalkomma oder -punkt):',
    '```',
    'id;preis_eur;einheit;produktname;url',
    '```',
    'Die Spalte "id" muss exakt die ID aus der Liste sein. "preis_eur" ist der Preis in der gewünschten Einheit.',
  ].join('\n')
}

/** Liest die Antwort des Recherche-Prompts zurück. */
export function parsePriceAnswer(text: string): { id: string; price: number; url?: string; name?: string }[] {
  const out: { id: string; price: number; url?: string; name?: string }[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*|]\s*/, '')
    if (!line || line.startsWith('id;') || line.startsWith('```')) continue
    const parts = line.split(';').map((x) => x.trim())
    if (parts.length < 2) continue
    const price = Number(parts[1].replace(/[€\s]/g, '').replace(',', '.'))
    if (!parts[0] || !Number.isFinite(price) || price <= 0) continue
    out.push({ id: parts[0], price, name: parts[3], url: parts[4] })
  }
  return out
}

/** Einkaufsliste als CSV für deutsches Excel/LibreOffice: eine Zeile pro Artikel und Länge, Dezimalkomma, Summe */
export function bomCsv(bom: Bom, overrides: Record<string, unknown> = {}): string {
  const money = (x: number) => x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
  const est = (id: string, e?: boolean) => (overrides[id] ? 'recherchiert' : e ? 'geschätzt' : '')
  const rows: string[][] = [['Gruppe', 'Artikel', 'Menge', 'Einheit', 'Länge/Format', 'Einzelpreis EUR', 'Summe EUR', 'Preis']]
  for (const t of bom.timber) {
    const counts = new Map<number, number>()
    for (const b of t.bars) counts.set(b.stock, (counts.get(b.stock) ?? 0) + 1)
    const totalLen = t.bars.reduce((x, b) => x + b.stock, 0) || 1
    for (const [len, n] of [...counts].sort((a, b) => b[0] - a[0])) {
      const each = (t.price * len) / totalLen
      rows.push(['Holz', t.item.name, String(n), 'Stange', fmtM(len), money(each), money(each * n), est(t.item.id, t.item.priceEstimated)])
    }
  }
  for (const sh of bom.sheets) {
    const each = sh.price / Math.max(1, sh.count)
    rows.push(['Platte', sh.item.name, String(sh.count), 'Stück', `${fmtCm(sh.format.l, 0)} × ${fmtCm(sh.format.w, 0)}`, money(each), money(sh.price), est(`${sh.item.id}@${sh.format.l}x${sh.format.w}`, sh.item.priceEstimated)])
  }
  for (const h of bom.hardware) {
    if (h.item.perMeter) rows.push(['Beschlag', h.item.name, (h.qty / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 }), 'm', '', money(h.price / Math.max(0.001, h.qty / 1000)), money(h.price), est(h.item.id, h.item.priceEstimated)])
    else if (h.item.pack > 1) rows.push(['Beschlag', h.item.name, String(h.packs), `Packung à ${h.item.pack} Stück`, `${h.qty} Stück benötigt`, money(h.price / Math.max(1, h.packs)), money(h.price), est(h.item.id, h.item.priceEstimated)])
    else rows.push(['Beschlag', h.item.name, String(h.qty), 'Stück', '', money(h.price / Math.max(1, h.qty)), money(h.price), est(h.item.id, h.item.priceEstimated)])
  }
  rows.push(['Summe', '', '', '', '', '', money(bom.total), bom.priceStand])
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\r\n')
}

