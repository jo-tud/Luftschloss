import { getLang, locale, t, tk, tr } from '../i18n'
import { HARDWARE, PRICE_STAND, catalogItem, type HardwareItem, type SheetItem, type TimberItem } from '../model/catalog'
import { fmtCm, fmtM, memberLength } from '../model/geometry'
import { cutLengths } from '../model/joinery'
import { jointFasteners, MODELED } from '../model/fasteners'
import { jointVariant } from '../model/jointPlan'
import { jointType } from '../model/joints'
import type { Resolved } from '../model/resolve'
import type { Panel, Project } from '../model/types'
import { packSheets, type SheetLayout, type SheetPiece } from './sheetcut'

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
  /** Zuschnitt je Platte (nur gesägte Plattenwerkstoffe) */
  layouts?: SheetLayout[]
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
      addHw(item.id, item.perMeter ? L : 1, m.name ?? t('Bauteil'))
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
  // je Material und Format eine Zeile: Platten verschiedener Größe brauchen ggf. verschiedene Formate
  const byFormat = new Map<string, { item: SheetItem; fmt: SheetItem['formats'][number]; count: number; notes: Set<string>; layouts?: SheetLayout[] }>()
  for (const [id, list] of sheetPanels) {
    const item = catalogItem(id) as SheetItem
    // gesägte Platten gemeinsam auf die Formate verteilen (2D-Zuschnitt)
    const sawn: SheetPiece[] = []
    for (const pa of list) {
      const { a, b } = panelSize(pa)
      let fmt = item.formats[0]
      let n = 0
      let note = ''
      if (item.group === 'diele') {
        // Dielen laufen entlang der längeren Seite; Reihen = Breite / Deckbreite
        const run = Math.max(a, b)
        const rows = Math.ceil(Math.min(a, b) / item.formats[0].w)
        const lens = item.formats.map((f) => f.l)
        const packed = packBars(Array.from({ length: rows }, () => ({ length: run, label: pa.name ?? '' })), lens)
        n = packed.bars.length + packed.oversize.length * Math.ceil(run / Math.max(...lens))
        fmt = item.formats.find((f) => f.l === Math.max(...packed.bars.map((x) => x.stock), lens[0])) ?? item.formats[0]
        note = t('{rows} Reihen à {len} cm', { rows, len: (run / 10).toFixed(0) })
      } else if (item.group === 'rollrost' || item.group === 'lattenrost') {
        fmt = item.formats.find((f) => f.w >= Math.min(a, b) - 30) ?? item.formats[item.formats.length - 1]
        n = 1
        note = t('Fertigteil passend zur Matratze')
      } else if (item.group === 'netz') {
        n = Math.ceil((a * b) / 1e6)
        fmt = { l: 1000, w: 1000, price: item.formats[0].price / ((item.formats[0].l * item.formats[0].w) / 1e6) }
        note = t('Meterware nach Maß (m²)')
      } else {
        sawn.push({ label: pa.name ?? tk('Platte'), l: Math.round(Math.max(a, b)), w: Math.round(Math.min(a, b)) })
        continue
      }
      const key = `${id}@${fmt.l}x${fmt.w}`
      const line = byFormat.get(key) ?? { item, fmt, count: 0, notes: new Set<string>() }
      line.count += n
      if (note) line.notes.add(note)
      byFormat.set(key, line)
    }
    const layouts = packSheets(sawn, item.formats)
    const split = layouts.some((s) => s.pieces.some((pc) => pc.part))
    for (const sh of layouts) {
      const key = `${id}@${sh.format.l}x${sh.format.w}`
      const line = byFormat.get(key) ?? { item, fmt: item.formats.find((f) => f.l === sh.format.l && f.w === sh.format.w)!, count: 0, notes: new Set<string>() }
      line.count += 1
      line.layouts = [...(line.layouts ?? []), sh]
      if (split) line.notes.add(t('Stoß über einem Querträger'))
      // je Teil zwei Schnitte (Länge und Breite), höchstens so viele wie nötig
      cuts += sh.pieces.length * 2
      byFormat.set(key, line)
    }
  }
  for (const [key, l] of byFormat) {
    const unit = priceOf(p, key, l.fmt.price)
    sheets.push({ item: l.item, count: l.count, format: l.fmt, note: [...l.notes].join(', '), price: l.count * unit, layouts: l.layouts })
  }

  // Befestigungsmittel so, wie sie im Modell sitzen; Verbindungsarten ohne eigene Liste mit ihrem Standardsatz
  const memberById = new Map(r.members.map((m) => [m.id, m]))
  for (const j of r.joints) {
    const jt = jointType(j.typeId)
    if (!jt) continue
    const items = jointFasteners(j, memberById, r).filter((f) => f.item)
    const name = tr(jointVariant(j.typeId, j, memberById)?.name ?? jt.name)
    if (items.length) for (const f of items) addHw(f.item!, 1, name)
    else if (!MODELED.has(j.typeId)) for (const h of jt.hardware) addHw(h.id, h.qty, name)
  }
  for (const f of r.fixings) addHw(f.hardwareId, f.count, tr(f.note))
  // Liegefläche verschrauben
  for (const pa of r.panels) {
    if (pa.kind === 'platte' || pa.kind === 'dielen') {
      const { a, b } = panelSize(pa)
      addHw('schraube-5x50', Math.ceil(((a + b) * 2) / 250 + (a * b) / 1e6 * 8), t('Liegefläche verschrauben'))
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
    sheets.filter((x) => x.item.priceEstimated && !p.settings.priceOverrides[`${x.item.id}@${x.format.l}x${x.format.w}`]).reduce((s, x) => s + x.price, 0) +
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

/** Prompt zum Kopieren in einen KI-Chat mit Websuche: liefert eine Preistabelle zum Zurückfügen. */
export function pricePrompt(p: Project, bom: Bom, market = ''): string {
  const lines: string[] = []
  for (const tl of bom.timber) {
    const counts = new Map<number, number>()
    for (const b of tl.bars) counts.set(b.stock, (counts.get(b.stock) ?? 0) + 1)
    for (const [len, n] of counts) lines.push(t('{id} | {name}, Länge {len} mm | {n} Stück | Preis je laufender Meter', { id: tl.item.id, name: tr(tl.item.name), len, n }))
  }
  for (const s of bom.sheets)
    lines.push(t('{id} | {name}, Format {l}×{w} mm | {n} Stück | Preis je Stück', { id: `${s.item.id}@${s.format.l}x${s.format.w}`, name: tr(s.item.name), l: s.format.l, w: s.format.w, n: s.count }))
  for (const h of bom.hardware)
    lines.push(
      h.item.perMeter
        ? t('{id} | {name} | {n} m | Preis je Meter', { id: h.item.id, name: tr(h.item.name), n: h.packs })
        : t('{id} | {name} | {n} Packung(en) | Preis je Packung', { id: h.item.id, name: tr(h.item.name), n: h.packs }),
    )
  return [
    t('Du bist mein Einkaufsassistent für ein Hochbett-Projekt („{name}“). Recherchiere bitte mit Websuche die aktuellen Preise bei HORNBACH Deutschland für die folgenden Artikel.', { name: p.name }) +
      (market ? ' ' + t('Markt: {market}.', { market }) : '') +
      ' ' +
      t('Wenn es einen Artikel nicht genau gibt, nimm den nächstpassenden aus dem Hornbach-Sortiment und nenne ihn. Wenn Hornbach nicht abrufbar ist, nimm OBI, Bauhaus oder toom und vermerke das.'),
    '',
    t('Artikel (ID | Beschreibung | Menge | gewünschte Preiseinheit):'),
    ...lines.map((l) => `- ${l}`),
    '',
    t('Antworte am Ende mit genau einem Codeblock im Format (Semikolon-getrennt, eine Zeile pro Artikel, Dezimalkomma oder -punkt):'),
    '```',
    'id;preis_eur;einheit;produktname;url',
    '```',
    t('Die Spalte "id" muss exakt die ID aus der Liste sein. "preis_eur" ist der Preis in der gewünschten Einheit.'),
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

/**
 * Einkaufsliste als CSV: eine Zeile pro Artikel und Länge, Summe. Deutsch: Semikolon und Dezimalkomma
 * (deutsches Excel/LibreOffice), Englisch: Komma und Dezimalpunkt.
 */
export function bomCsv(bom: Bom, overrides: Record<string, unknown> = {}): string {
  const sep = getLang() === 'de' ? ';' : ','
  const money = (x: number) => x.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
  const est = (id: string, e?: boolean) => (overrides[id] ? t('recherchiert') : e ? t('geschätzt') : '')
  const rows: string[][] = [[t('Gruppe'), t('Artikel'), t('Menge'), t('Einheit'), t('Länge/Format'), t('Einzelpreis EUR'), t('Summe EUR'), t('Preis')]]
  for (const tl of bom.timber) {
    const counts = new Map<number, number>()
    for (const b of tl.bars) counts.set(b.stock, (counts.get(b.stock) ?? 0) + 1)
    const totalLen = tl.bars.reduce((x, b) => x + b.stock, 0) || 1
    for (const [len, n] of [...counts].sort((a, b) => b[0] - a[0])) {
      const each = (tl.price * len) / totalLen
      rows.push([t('Holz'), tr(tl.item.name), String(n), t('Stange'), fmtM(len), money(each), money(each * n), est(tl.item.id, tl.item.priceEstimated)])
    }
  }
  for (const sh of bom.sheets) {
    const each = sh.price / Math.max(1, sh.count)
    rows.push([t('Platte'), tr(sh.item.name), String(sh.count), t('Stück'), `${fmtCm(sh.format.l, 0)} × ${fmtCm(sh.format.w, 0)}`, money(each), money(sh.price), est(`${sh.item.id}@${sh.format.l}x${sh.format.w}`, sh.item.priceEstimated)])
  }
  for (const h of bom.hardware) {
    const name = tr(h.item.name)
    if (h.item.perMeter) rows.push([t('Beschlag'), name, (h.qty / 1000).toLocaleString(locale(), { maximumFractionDigits: 2, useGrouping: false }), 'm', '', money(h.price / Math.max(0.001, h.qty / 1000)), money(h.price), est(h.item.id, h.item.priceEstimated)])
    else if (h.item.pack > 1) rows.push([t('Beschlag'), name, String(h.packs), t('Packung à {n} Stück', { n: h.item.pack }), t('{n} Stück benötigt', { n: h.qty }), money(h.price / Math.max(1, h.packs)), money(h.price), est(h.item.id, h.item.priceEstimated)])
    else rows.push([t('Beschlag'), name, String(h.qty), t('Stück'), '', money(h.price / Math.max(1, h.qty)), money(h.price), est(h.item.id, h.item.priceEstimated)])
  }
  rows.push([t('Summe'), '', '', '', '', '', money(bom.total), tr(bom.priceStand)])
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(sep)).join('\r\n')
}
