import { t, tr, trv } from '../i18n'
import type { DrawHole, PartDrawing, Seg, Text, View2D } from '../model/drawing'

const txt = (x: Text) => (x.vars ? trv(x.key, x.vars) : tr(x.key))

/**
 * Werkstattzeichnung eines Werkstücks: Ansichten mit steigender Bemaßung vom Bezugsende (x) und von
 * der Bezugskante (y), Abfall schraffiert, Bohrungen mit Mittelkreuz, dazu die Bohrtabelle. Die
 * Ansicht der Fläche mit Bohrungen gibt es als Schablone im Maßstab 1:1 zum Ausdrucken.
 */

const FS = 7

function segPath(segs: Seg[]): string {
  return segs.map((s) => `M${s.a[0].toFixed(1)},${(-s.a[1]).toFixed(1)}L${s.b[0].toFixed(1)},${(-s.b[1]).toFixed(1)}`).join('')
}

function Hole({ h, cross = true }: { h: DrawHole; cross?: boolean }) {
  if (h.round) {
    const r = h.d / 2
    return (
      <g>
        <circle cx={h.x} cy={-h.y} r={r} fill="none" stroke="#1f2328" strokeWidth={0.6} strokeDasharray={h.visible ? undefined : '2 1.5'} />
        {cross && <path d={`M${h.x - r - 3},${-h.y}H${h.x + r + 3}M${h.x},${-h.y - r - 3}V${-h.y + r + 3}`} stroke="#c8752e" strokeWidth={0.4} />}
      </g>
    )
  }
  // seitlich gesehen: zwei gestrichelte Linien im Abstand des Durchmessers
  const [a, b] = [h.from!, h.to!]
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l = Math.hypot(dx, dy) || 1
  const nx = (-dy / l) * (h.d / 2)
  const ny = (dx / l) * (h.d / 2)
  return (
    <path
      d={`M${a[0] + nx},${-(a[1] + ny)}L${b[0] + nx},${-(b[1] + ny)}M${a[0] - nx},${-(a[1] - ny)}L${b[0] - nx},${-(b[1] - ny)}`}
      stroke="#1f2328"
      strokeWidth={0.5}
      strokeDasharray="2 1.5"
      fill="none"
    />
  )
}

/** Eine Ansicht als SVG-Gruppe; liefert ihre Ausdehnung für das Layout */
function ViewSvg({ v, dims = true, fs = FS, refName }: { v: View2D; dims?: boolean; fs?: number; refName: string }) {
  const [xa, xb] = v.x
  const H = v.y[1]
  const base = H + fs * 1.2
  // Maßzahlen nicht übereinander: zu dichte Werte etwas versetzen
  let lastX = -Infinity
  let lane = 0
  return (
    <g>
      <defs>
        <pattern id="abfall" width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={4} stroke="#c8752e" strokeWidth={0.6} />
        </pattern>
      </defs>
      {v.waste.map((w, i) => (
        <rect key={i} x={w.x[0]} y={-w.y[1]} width={w.x[1] - w.x[0]} height={w.y[1] - w.y[0]} fill="url(#abfall)" />
      ))}
      <path d={segPath(v.edges)} stroke="#1f2328" strokeWidth={0.8} fill="none" strokeLinecap="round" />
      <path d={segPath(v.hidden)} stroke="#1f2328" strokeWidth={0.5} fill="none" strokeDasharray="3 2" />
      {v.holes.map((h, i) => (
        <Hole key={i} h={h} />
      ))}
      {v.broken.left && <path d={`M${xa},${2}l-3,${-H * 0.25 - 2}l6,${-H * 0.25}l-6,${-H * 0.25}l6,${-H * 0.25}l-3,${-2}`} stroke="#59606a" strokeWidth={0.5} fill="none" />}
      {v.broken.right && <path d={`M${xb},${2}l-3,${-H * 0.25 - 2}l6,${-H * 0.25}l-6,${-H * 0.25}l6,${-H * 0.25}l-3,${-2}`} stroke="#59606a" strokeWidth={0.5} fill="none" />}
      {dims && (
        <g fontSize={fs} fill="#1f2328" fontFamily="system-ui, sans-serif">
          {/* steigende Bemaßung entlang x: Hilfslinie und Maßzahl je Kante */}
          <line x1={xa} y1={-base} x2={xb} y2={-base} stroke="#59606a" strokeWidth={0.35} />
          {v.dimX.map((x) => {
            lane = x - lastX < fs * 1.1 ? (lane + 1) % 2 : 0
            lastX = x
            const ty = -base - 1.5 - lane * fs * 2.4
            return (
              <g key={`x${x}`}>
                <line x1={x} y1={-H - 1} x2={x} y2={-base - 1} stroke="#59606a" strokeWidth={0.3} />
                <circle cx={x} cy={-base} r={0.9} fill="#59606a" />
                <text x={x} y={ty} transform={`rotate(-90 ${x} ${ty})`} dominantBaseline="middle">
                  {x}
                </text>
              </g>
            )
          })}
          {/* quer: von der Bezugskante (unten) */}
          <line x1={xa - fs * 1.2} y1={0} x2={xa - fs * 1.2} y2={-H} stroke="#59606a" strokeWidth={0.35} />
          {v.dimY.map((y) => (
            <g key={`y${y}`}>
              <line x1={xa - fs * 1.2 - 1} y1={-y} x2={xa - 1} y2={-y} stroke="#59606a" strokeWidth={0.3} />
              <text x={xa - fs * 1.5} y={-y} textAnchor="end" dominantBaseline="middle">
                {y}
              </text>
            </g>
          ))}
          {v.x[0] === 0 && (
            <text x={0} y={fs * 1.4} fontSize={fs * 0.8} fill="#59606a">
              ▲ {refName}
            </text>
          )}
        </g>
      )}
    </g>
  )
}

/** Zeichnung eines Werkstücks mit allen Ansichten und der Bohrtabelle */
export function WorkDrawing({ d, title, onTemplate }: { d: PartDrawing; title: string; onTemplate?: () => void }) {
  return (
    <div className="work-drawing">
      <div className="wd-head">
        <b>{title}</b>
        <span className="muted">
          {d.member.round ? `Ø ${d.member.b}` : `${Math.min(d.member.b, d.member.h)} × ${Math.max(d.member.b, d.member.h)}`} · {t('Zuschnitt {len} mm', { len: Math.round(d.length) })} · {t('Bezug: {ende}', { ende: txt(d.refName) })}
        </span>
        {onTemplate && (
          <button className="small" onClick={onTemplate}>
            {t('Schablone 1:1 drucken')}
          </button>
        )}
      </div>
      {d.views.map((v) => {
        const fs = Math.max(6, (v.x[1] - v.x[0]) / 45)
        const top = v.y[1] + fs * 1.2 + fs * 5.5
        const left = fs * 6
        const w = v.x[1] - v.x[0] + left + 8
        const h = top + fs * 2.5
        return (
          <figure key={v.key}>
            <figcaption>
              {txt(v.title)} <span className="muted">({t('quer {n} mm', { n: Math.round(v.across) })})</span>
            </figcaption>
            <svg viewBox={`${v.x[0] - left} ${-top} ${w} ${h}`} className="wd-svg" role="img" aria-label={txt(v.title)}>
              <ViewSvg v={v} fs={fs} refName={txt(d.refName)} />
            </svg>
          </figure>
        )
      })}
      {d.holes.length > 0 && (
        <table className="wd-holes">
          <thead>
            <tr>
              <th>{t('Abstand vom Bezug')}</th>
              <th>{t('von der Kante')}</th>
              <th>{t('Seite')}</th>
              <th>Ø</th>
              <th>{t('Tiefe')}</th>
              <th>{t('Hinweis')}</th>
            </tr>
          </thead>
          <tbody>
            {d.holes.map((h, i) => (
              <tr key={i}>
                <td>{h.x}</td>
                <td>{h.y}</td>
                <td>{txt(h.face)}</td>
                <td>{h.d}</td>
                <td>{h.through ? t('durch') : h.depth}</td>
                <td>{[h.note ? tr(h.note) : '', h.both ? t('von beiden Seiten') : '', h.with ? t('im Verbund mit {p} bohren', { p: h.with }) : ''].filter(Boolean).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/**
 * Schablone im Maßstab 1:1 für die Fläche mit den meisten Bohrungen bzw. Ausnehmungen, in einem
 * eigenen Fenster zum Drucken. Lange Ausschnitte werden auf mehrere Blätter (Querformat) verteilt.
 */
export function printTemplate(d: PartDrawing, title: string) {
  const score = (v: View2D) => v.holes.filter((h) => h.round).length * 3 + v.waste.length
  const v = [...d.views].sort((a, b) => score(b) - score(a))[0]
  if (!v) return
  // nur der Bereich mit Bearbeitungen, dazu das Bezugsende, wenn es nah ist
  const feats = [...v.holes.map((h) => h.x), ...v.waste.flatMap((w) => w.x), ...v.edges.filter((s) => s.a[0] === s.b[0] && s.a[0] > v.x[0] && s.a[0] < v.x[1]).map((s) => s.a[0])]
  let xa = feats.length ? Math.min(...feats) - 30 : v.x[0]
  let xb = feats.length ? Math.max(...feats) + 30 : v.x[1]
  if (xa < 60) xa = 0
  xa = Math.max(v.x[0], xa)
  xb = Math.min(v.x[1], xb)
  const PAGE = 250
  const pages: [number, number][] = []
  for (let x = xa; x < xb - 0.5; x += PAGE) pages.push([x, Math.min(xb, x + PAGE)])
  const H = v.y[1]
  const svgs = pages
    .map(([a, b], i) => {
      const w = b - a + 20
      const h = H + 48
      const clip = { ...v, x: [a, b] as [number, number], broken: { left: a > 0, right: b < d.length }, dimX: v.dimX.filter((x) => x >= a - 0.5 && x <= b + 0.5) }
      const body = renderStatic(clip)
      return `<section class="page"><h2>${esc(title)} – ${esc(txt(v.title))} ${pages.length > 1 ? `(${i + 1}/${pages.length})` : ''}</h2>
<p>${esc(t('Ausschnitt {a} bis {b} mm vom Bezug ({ende}). Ausschneiden, an der Bezugskante (unten) anlegen, Lochmitten mit einem Nagel durchstechen.', { a: Math.round(a), b: Math.round(b), ende: txt(d.refName) }))}</p>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="${a - 10} ${-H - 30} ${w} ${h}">${body}
<g transform="translate(${a}, 6)"><line x1="0" y1="0" x2="100" y2="0" stroke="#000" stroke-width="0.6"/><line x1="0" y1="-2" x2="0" y2="2" stroke="#000" stroke-width="0.4"/><line x1="100" y1="-2" x2="100" y2="2" stroke="#000" stroke-width="0.4"/><text x="50" y="5" font-size="3.2" text-anchor="middle">${esc(t('Kontrolle: genau 100 mm'))}</text></g></svg></section>`
    })
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: A4 landscape; margin: 10mm; }
body { font-family: system-ui, sans-serif; margin: 0; }
.page { page-break-after: always; }
h2 { font-size: 14px; margin: 0 0 4px; }
p { font-size: 11px; margin: 0 0 6px; }
.hint { font-size: 12px; background: #fbeee2; padding: 6px 10px; }
@media print { .hint { display: none; } }
</style></head><body><p class="hint">${esc(t('Mit 100 % drucken (nicht „an Seite anpassen“). Danach die Kontrollstrecke nachmessen.'))}</p>${svgs}</body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

/** Ansicht als SVG-Text (für die Schablone im eigenen Fenster) */
function renderStatic(v: View2D): string {
  const [xa, xb] = v.x
  const inX = (s: Seg) => Math.max(s.a[0], s.b[0]) >= xa - 0.5 && Math.min(s.a[0], s.b[0]) <= xb + 0.5
  const clipSeg = (s: Seg): Seg => {
    const c = (p: [number, number]): [number, number] => [Math.max(xa, Math.min(xb, p[0])), p[1]]
    return { a: c(s.a), b: c(s.b) }
  }
  const edges = v.edges.filter(inX).map(clipSeg)
  // Außenkanten des Ausschnitts (das Holz läuft weiter)
  const H = v.y[1]
  const frame = `<path d="M${xa},0H${xb}M${xa},${-H}H${xb}${v.broken.left ? '' : `M${xa},0V${-H}`}${v.broken.right ? '' : `M${xb},0V${-H}`}" stroke="#000" stroke-width="0.4" fill="none"/>`
  const parts = [
    frame,
    `<path d="${segPath(edges)}" stroke="#000" stroke-width="0.5" fill="none"/>`,
    `<path d="${segPath(v.hidden.filter(inX).map(clipSeg))}" stroke="#000" stroke-width="0.3" stroke-dasharray="2 1.5" fill="none"/>`,
    ...v.waste
      .filter((w) => w.x[1] > xa && w.x[0] < xb)
      .map((w) => {
        const a = Math.max(xa, w.x[0])
        const b = Math.min(xb, w.x[1])
        return `<rect x="${a}" y="${-w.y[1]}" width="${b - a}" height="${w.y[1] - w.y[0]}" fill="#f2d3b3" stroke="#000" stroke-width="0.3"/>`
      }),
    ...v.holes
      .filter((h) => h.round && h.x >= xa - 1 && h.x <= xb + 1)
      .map((h) => {
        const r = h.d / 2
        return `<circle cx="${h.x}" cy="${-h.y}" r="${r}" fill="none" stroke="#000" stroke-width="0.3"/><path d="M${h.x - r - 4},${-h.y}H${h.x + r + 4}M${h.x},${-h.y - r - 4}V${-h.y + r + 4}" stroke="#000" stroke-width="0.2"/><text x="${h.x + r + 1}" y="${-h.y - r - 1}" font-size="2.6">Ø ${h.d}</text>`
      }),
    ...v.dimX.map((x) => `<line x1="${x}" y1="${-H}" x2="${x}" y2="${-H - 6}" stroke="#000" stroke-width="0.2"/><text x="${x}" y="${-H - 7}" font-size="2.8" text-anchor="middle">${x}</text>`),
    ...v.dimY.map((y) => `<text x="${xa - 2}" y="${-y + 1}" font-size="2.6" text-anchor="end">${y}</text>`),
    `<text x="${xa}" y="5" font-size="2.6">${esc(t('Bezugskante'))}</text>`,
    // nicht am Holzende: Anlegelinie, die vorher mit Maßband und Winkel angerissen wird
    ...(xa > 0.5 ? [`<line x1="${xa}" y1="4" x2="${xa}" y2="${-H - 12}" stroke="#c00" stroke-width="0.35" stroke-dasharray="2 1"/><text x="${xa + 1}" y="${-H - 9}" font-size="2.6" fill="#c00">${esc(t('{x} mm: hier am Anriss anlegen', { x: Math.round(xa) }))}</text>`] : []),
  ]
  return parts.join('')
}
