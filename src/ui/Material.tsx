import { useState } from 'react'
import { parsePriceAnswer, pricePrompt, type Bom } from '../analysis/bom'
import { fmtCm, fmtM } from '../model/geometry'
import { useDerived, useStore } from '../state/store'
import { eur } from './fields'

export function MaterialDialog() {
  const show = useStore((s) => s.showMaterial)
  const set = useStore((s) => s.set)
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const d = useDerived()
  const bom = d.bom
  const [tab, setTab] = useState<'liste' | 'zuschnitt' | 'preise'>('liste')
  const [answer, setAnswer] = useState('')
  const [market, setMarket] = useState('')
  const [msg, setMsg] = useState('')
  if (!show) return null
  const prompt = pricePrompt(p, bom, market)
  const importAnswer = () => {
    const rows = parsePriceAnswer(answer)
    if (!rows.length) return setMsg('Keine Zeilen im Format id;preis;… gefunden.')
    const date = new Date().toISOString().slice(0, 10)
    update((dd) => {
      for (const r of rows) dd.settings.priceOverrides[r.id] = { price: r.price, url: r.url, date }
    })
    setMsg(`${rows.length} Preise übernommen (Stand ${date}).`)
  }
  return (
    <div className="modal-bg" onClick={() => set({ showMaterial: false })}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Material & Kosten</h2>
          <nav className="tabs">
            <button className={tab === 'liste' ? 'on' : ''} onClick={() => setTab('liste')}>
              Einkaufsliste
            </button>
            <button className={tab === 'zuschnitt' ? 'on' : ''} onClick={() => setTab('zuschnitt')}>
              Zuschnitt
            </button>
            <button className={tab === 'preise' ? 'on' : ''} onClick={() => setTab('preise')}>
              Preise recherchieren
            </button>
          </nav>
          <button className="close" onClick={() => set({ showMaterial: false })}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          {tab === 'liste' && <ShoppingList bom={bom} overrides={p.settings.priceOverrides} />}
          {tab === 'zuschnitt' && <CutPlan bom={bom} />}
          {tab === 'preise' && (
            <div className="prices">
              <p>
                Hornbach bietet keine offene Schnittstelle. Der einfachste Weg: Diesen Recherche-Prompt in einen KI-Chat mit Websuche kopieren (z. B. Claude), die Antwort hier einfügen – die gefundenen Preise ersetzen dann die Richtpreise.
              </p>
              <label className="field">
                <span>Markt (optional)</span>
                <input value={market} placeholder="z. B. Hornbach Leipzig" onChange={(e) => setMarket(e.target.value)} />
              </label>
              <textarea readOnly value={prompt} rows={12} />
              <button onClick={() => navigator.clipboard?.writeText(prompt).then(() => setMsg('Prompt kopiert.'))}>📋 Prompt kopieren</button>
              <h3>Antwort einfügen</h3>
              <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={8} placeholder={'id;preis_eur;einheit;produktname;url\nkvh-80x80;6,49;m;Konsta KVH 80×80;https://…'} />
              <div className="row">
                <button onClick={importAnswer}>Preise übernehmen</button>
                {Object.keys(p.settings.priceOverrides).length > 0 && (
                  <button className="link" onClick={() => update((dd) => void (dd.settings.priceOverrides = {}))}>
                    Recherchierte Preise verwerfen ({Object.keys(p.settings.priceOverrides).length})
                  </button>
                )}
              </div>
              {msg && <p className="ok">{msg}</p>}
            </div>
          )}
        </div>
        <footer>
          <span>
            Summe <b>{eur(bom.total)}</b> · {bom.priceStand}
            {bom.estimatedShare > 0.05 && ` · ${Math.round(bom.estimatedShare * 100)} % davon geschätzt`}
          </span>
          <button onClick={() => downloadCsv(bom)}>CSV exportieren</button>
          <button onClick={() => window.print()}>Drucken</button>
        </footer>
      </div>
    </div>
  )
}

function ShoppingList({ bom, overrides }: { bom: Bom; overrides: Record<string, { price: number; url?: string; date: string }> }) {
  const mark = (id: string, estimated?: boolean) => (overrides[id] ? <em className="tag ok">recherchiert {overrides[id].date}</em> : estimated ? <em className="tag">geschätzt</em> : null)
  return (
    <table className="bom">
      <thead>
        <tr>
          <th>Artikel</th>
          <th>Menge</th>
          <th>Teile</th>
          <th className="r">Preis</th>
        </tr>
      </thead>
      <tbody>
        <tr className="group">
          <td colSpan={4}>Holz</td>
        </tr>
        {bom.timber.map((t) => {
          const counts = new Map<number, number>()
          for (const b of t.bars) counts.set(b.stock, (counts.get(b.stock) ?? 0) + 1)
          return (
            <tr key={t.item.id}>
              <td>
                {t.item.name} {mark(t.item.id, t.item.priceEstimated)}
                {!t.item.sorted && <small className="muted"> · unsortiert</small>}
              </td>
              <td>
                {[...counts].map(([l, n]) => `${n} × ${fmtM(l)}`).join(', ')}
                {t.oversize.length > 0 && <em className="warn"> + {t.oversize.length} Überlänge</em>}
              </td>
              <td className="muted">
                {t.pieces.length} Teile, {fmtM(t.totalLength)}
              </td>
              <td className="r">{eur(t.price)}</td>
            </tr>
          )
        })}
        {bom.sheets.length > 0 && (
          <tr className="group">
            <td colSpan={4}>Platten, Dielen, Roste, Netze</td>
          </tr>
        )}
        {bom.sheets.map((s) => (
          <tr key={s.item.id}>
            <td>
              {s.item.name} {mark(`${s.item.id}@${s.format.l}x${s.format.w}`, s.item.priceEstimated)}
            </td>
            <td>
              {s.count} × {fmtCm(s.format.l, 0)} × {fmtCm(s.format.w, 0)}
            </td>
            <td className="muted">{s.note}</td>
            <td className="r">{eur(s.price)}</td>
          </tr>
        ))}
        <tr className="group">
          <td colSpan={4}>Beschläge und Befestigung</td>
        </tr>
        {bom.hardware.map((h) => (
          <tr key={h.item.id}>
            <td>
              {h.item.name} {mark(h.item.id, h.item.priceEstimated)}
            </td>
            <td>{h.item.perMeter ? fmtM(h.qty) : h.item.pack > 1 ? `${h.packs} Pck. (${h.qty} Stk.)` : `${h.qty} Stk.`}</td>
            <td className="muted" title={h.reasons.join(', ')}>
              {h.reasons.slice(0, 2).join(', ')}
              {h.reasons.length > 2 ? ' …' : ''}
            </td>
            <td className="r">{eur(h.price)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CutPlan({ bom }: { bom: Bom }) {
  return (
    <div className="cutplan">
      <p className="hint">
        Je Handelslänge eine Stange; Sägeschnitt 3 mm. {bom.cuts} Schnitte – der Baumarkt-Zuschnitt kostet ab ca. 0,10–0,50 € je Schnitt.
      </p>
      {bom.timber.map((t) => (
        <div key={t.item.id} className="cut-group">
          <h4>{t.item.name}</h4>
          {t.bars.map((b, i) => (
            <div key={i} className="bar" title={`${fmtM(b.stock)} · Rest ${fmtCm(b.waste, 0)}`}>
              <span className="len">{fmtM(b.stock)}</span>
              <div className="track">
                {b.pieces.map((pc, j) => (
                  <div key={j} className="piece" style={{ width: `${(pc.length / b.stock) * 100}%` }} title={`${pc.label}: ${fmtCm(pc.length)}`}>
                    {fmtCm(pc.length, 0)}
                  </div>
                ))}
                <div className="waste" style={{ width: `${(b.waste / b.stock) * 100}%` }} />
              </div>
            </div>
          ))}
          {t.oversize.map((pc, j) => (
            <p key={j} className="warn">
              {pc.label}: {fmtCm(pc.length)} – länger als jede Handelslänge
            </p>
          ))}
        </div>
      ))}
    </div>
  )
}

function downloadCsv(bom: Bom) {
  const rows = [['Gruppe', 'Artikel', 'Menge', 'Einheit', 'Preis EUR']]
  for (const t of bom.timber) for (const b of t.bars) rows.push(['Holz', t.item.name, '1', `Stange ${b.stock} mm`, ''])
  for (const t of bom.timber) rows.push(['Holz Summe', t.item.name, String(t.bars.length), 'Stangen', t.price.toFixed(2)])
  for (const s of bom.sheets) rows.push(['Platte', s.item.name, String(s.count), `${s.format.l}×${s.format.w} mm`, s.price.toFixed(2)])
  for (const h of bom.hardware) rows.push(['Beschlag', h.item.name, String(h.packs), h.item.perMeter ? 'm' : 'Packung', h.price.toFixed(2)])
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
  a.download = 'luftschloss-material.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}
