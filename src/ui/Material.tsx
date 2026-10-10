import { useRef, useState } from 'react'
import { bomCsv, parsePriceAnswer, pricePrompt, type Bom } from '../analysis/bom'
import { loadApiKey, runPriceAgent, storeApiKey, type PriceAgentProgress } from '../analysis/priceAgent'
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
              <PriceAgent prompt={prompt} onAnswer={(t) => (setAnswer(t), setMsg(`${parsePriceAnswer(t).length} Preise gefunden – bitte kurz prüfen und übernehmen.`))} />
              <h3>Oder per Chat</h3>
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
          <button onClick={() => downloadCsv(bom, p.settings.priceOverrides)}>Einkaufsliste als CSV</button>
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

export function CutPlan({ bom }: { bom: Bom }) {
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

function downloadCsv(bom: Bom, overrides: Record<string, unknown>) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['\ufeff' + bomCsv(bom, overrides)], { type: 'text/csv;charset=utf-8' }))
  a.download = 'luftschloss-einkaufsliste.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}
/** Recherche direkt aus der App mit eigenem Claude-API-Schlüssel */
function PriceAgent({ prompt, onAnswer }: { prompt: string; onAnswer: (text: string) => void }) {
  const [key, setKey] = useState(loadApiKey)
  const [remember, setRemember] = useState(() => !!loadApiKey())
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<PriceAgentProgress>({ searches: [], sources: [] })
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  const start = async () => {
    setBusy(true)
    setError('')
    setInfo('')
    setProgress({ searches: [], sources: [] })
    storeApiKey(remember ? key : null)
    abort.current = new AbortController()
    try {
      const res = await runPriceAgent(key.trim(), prompt, setProgress, abort.current.signal)
      onAnswer(res.text)
      setInfo(`${res.usage.searches} Suchen · ${Math.round((res.usage.input + res.usage.output) / 1000)} Tsd. Tokens · ${res.servedBy}`)
    } catch (e) {
      const m = (e as Error).message ?? String(e)
      setError(
        abort.current?.signal.aborted
          ? 'Abgebrochen.'
          : /401|authentication|api.key/i.test(m)
            ? 'Der API-Schlüssel wurde abgelehnt.'
            : /connection|network|fetch/i.test(m)
              ? 'Keine Verbindung zur Anthropic-API – Netzwerk, Proxy oder Werbeblocker prüfen.'
              : /429|rate/i.test(m)
                ? 'Zu viele Anfragen – in einer Minute nochmal versuchen.'
                : m,
      )
    } finally {
      setBusy(false)
    }
  }
  if (!open)
    return (
      <div className="agent-box">
        <button onClick={() => setOpen(true)}>🔎 Direkt recherchieren lassen</button>
        <span className="hint"> mit eigenem Claude-API-Schlüssel, dauert einige Minuten</span>
      </div>
    )
  return (
    <div className="agent-box open">
      <b>Direkt recherchieren</b>
      <p className="hint">
        Claude sucht im Netz nach den aktuellen Preisen und füllt die Antwort unten aus. Dafür braucht es einen eigenen API-Schlüssel von console.anthropic.com; die Kosten
        (meist einige Cent bis wenige Euro je Recherche) laufen über dieses Konto. Der Schlüssel geht nur vom Browser direkt an Anthropic.
      </p>
      <label className="field">
        <span>API-Schlüssel</span>
        <input type="password" value={key} placeholder="sk-ant-…" autoComplete="off" onChange={(e) => setKey(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>In diesem Browser merken</span>
      </label>
      <div className="row">
        {busy ? (
          <button onClick={() => abort.current?.abort()}>Abbrechen</button>
        ) : (
          <button className="primary" disabled={!key.trim()} onClick={start}>
            Recherche starten
          </button>
        )}
        {busy && <span className="hint">Sucht … {progress.searches.length} Suchen, {progress.sources.length} Seiten</span>}
      </div>
      {busy && progress.searches.length > 0 && <p className="hint">Zuletzt: „{progress.searches[progress.searches.length - 1]}“</p>}
      {info && <p className="hint">{info}</p>}
      {error && <p className="warn">{error}</p>}
      {!busy && progress.sources.length > 0 && (
        <details>
          <summary>{progress.sources.length} Quellen</summary>
          <ul className="sources">
            {progress.sources.slice(0, 40).map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
