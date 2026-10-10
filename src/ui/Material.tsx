import { useRef, useState } from 'react'
import { t, tr } from '../i18n'
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
    if (!rows.length) return setMsg(t('Keine Zeilen im Format id;preis;… gefunden.'))
    const date = new Date().toISOString().slice(0, 10)
    update((dd) => {
      for (const r of rows) dd.settings.priceOverrides[r.id] = { price: r.price, url: r.url, date }
    })
    setMsg(t('{n} Preise übernommen (Stand {date}).', { n: rows.length, date }))
  }
  return (
    <div className="modal-bg" onClick={() => set({ showMaterial: false })}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('Material & Kosten')}</h2>
          <nav className="tabs">
            <button className={tab === 'liste' ? 'on' : ''} onClick={() => setTab('liste')}>
              {t('Einkaufsliste')}
            </button>
            <button className={tab === 'zuschnitt' ? 'on' : ''} onClick={() => setTab('zuschnitt')}>
              {t('Zuschnitt')}
            </button>
            <button className={tab === 'preise' ? 'on' : ''} onClick={() => setTab('preise')}>
              {t('Preise recherchieren')}
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
                {t(
                  'Hornbach bietet keine offene Schnittstelle. Der einfachste Weg: Diesen Recherche-Prompt in einen KI-Chat mit Websuche kopieren (z. B. Claude), die Antwort hier einfügen – die gefundenen Preise ersetzen dann die Richtpreise.',
                )}
              </p>
              <label className="field">
                <span>{t('Markt (optional)')}</span>
                <input value={market} placeholder={t('z. B. Hornbach Leipzig')} onChange={(e) => setMarket(e.target.value)} />
              </label>
              <PriceAgent prompt={prompt} onAnswer={(text) => (setAnswer(text), setMsg(t('{n} Preise gefunden – bitte kurz prüfen und übernehmen.', { n: parsePriceAnswer(text).length })))} />
              <h3>{t('Oder per Chat')}</h3>
              <textarea readOnly value={prompt} rows={12} />
              <button onClick={() => navigator.clipboard?.writeText(prompt).then(() => setMsg(t('Prompt kopiert.')))}>📋 {t('Prompt kopieren')}</button>
              <h3>{t('Antwort einfügen')}</h3>
              <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={8} placeholder={t('id;preis_eur;einheit;produktname;url\nkvh-80x80;6,49;m;Konsta KVH 80×80;https://…')} />
              <div className="row">
                <button onClick={importAnswer}>{t('Preise übernehmen')}</button>
                {Object.keys(p.settings.priceOverrides).length > 0 && (
                  <button className="link" onClick={() => update((dd) => void (dd.settings.priceOverrides = {}))}>
                    {t('Recherchierte Preise verwerfen ({n})', { n: Object.keys(p.settings.priceOverrides).length })}
                  </button>
                )}
              </div>
              {msg && <p className="ok">{msg}</p>}
            </div>
          )}
        </div>
        <footer>
          <span>
            {t('Summe')} <b>{eur(bom.total)}</b> · {tr(bom.priceStand)}
            {bom.estimatedShare > 0.05 && ` · ${t('{n} % davon geschätzt', { n: Math.round(bom.estimatedShare * 100) })}`}
          </span>
          <button onClick={() => downloadCsv(bom, p.settings.priceOverrides)}>{t('Einkaufsliste als CSV')}</button>
          <button onClick={() => window.print()}>{t('Drucken')}</button>
        </footer>
      </div>
    </div>
  )
}

function ShoppingList({ bom, overrides }: { bom: Bom; overrides: Record<string, { price: number; url?: string; date: string }> }) {
  const mark = (id: string, estimated?: boolean) => (overrides[id] ? <em className="tag ok">{t('recherchiert {date}', { date: overrides[id].date })}</em> : estimated ? <em className="tag">{t('geschätzt')}</em> : null)
  return (
    <table className="bom">
      <thead>
        <tr>
          <th>{t('Artikel')}</th>
          <th>{t('Menge')}</th>
          <th>{t('Teile')}</th>
          <th className="r">{t('Preis')}</th>
        </tr>
      </thead>
      <tbody>
        <tr className="group">
          <td colSpan={4}>{t('Holz')}</td>
        </tr>
        {bom.timber.map((tl) => {
          const counts = new Map<number, number>()
          for (const b of tl.bars) counts.set(b.stock, (counts.get(b.stock) ?? 0) + 1)
          return (
            <tr key={tl.item.id}>
              <td>
                {tr(tl.item.name)} {mark(tl.item.id, tl.item.priceEstimated)}
                {!tl.item.sorted && <small className="muted"> · {t('unsortiert')}</small>}
              </td>
              <td>
                {[...counts].map(([l, n]) => `${n} × ${fmtM(l)}`).join(', ')}
                {tl.oversize.length > 0 && <em className="warn"> + {t('{n} Überlänge', { n: tl.oversize.length })}</em>}
              </td>
              <td className="muted">
                {t('{n} Teile', { n: tl.pieces.length })}, {fmtM(tl.totalLength)}
              </td>
              <td className="r">{eur(tl.price)}</td>
            </tr>
          )
        })}
        {bom.sheets.length > 0 && (
          <tr className="group">
            <td colSpan={4}>{t('Platten, Dielen, Roste, Netze')}</td>
          </tr>
        )}
        {bom.sheets.map((s) => (
          <tr key={s.item.id}>
            <td>
              {tr(s.item.name)} {mark(`${s.item.id}@${s.format.l}x${s.format.w}`, s.item.priceEstimated)}
            </td>
            <td>
              {s.count} × {fmtCm(s.format.l, 0)} × {fmtCm(s.format.w, 0)}
            </td>
            <td className="muted">{tr(s.note)}</td>
            <td className="r">{eur(s.price)}</td>
          </tr>
        ))}
        <tr className="group">
          <td colSpan={4}>{t('Beschläge und Befestigung')}</td>
        </tr>
        {bom.hardware.map((h) => (
          <tr key={h.item.id}>
            <td>
              {tr(h.item.name)} {mark(h.item.id, h.item.priceEstimated)}
            </td>
            <td>{h.item.perMeter ? fmtM(h.qty) : h.item.pack > 1 ? t('{packs} Pck. ({n} Stk.)', { packs: h.packs, n: h.qty }) : t('{n} Stk.', { n: h.qty })}</td>
            <td className="muted" title={h.reasons.map(tr).join(', ')}>
              {h.reasons.slice(0, 2).map(tr).join(', ')}
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
        {t('Je Handelslänge eine Stange; Sägeschnitt 3 mm. {n} Schnitte – der Baumarkt-Zuschnitt kostet ab ca. 0,10–0,50 € je Schnitt.', { n: bom.cuts })}
      </p>
      {bom.timber.map((tl) => (
        <div key={tl.item.id} className="cut-group">
          <h4>{tr(tl.item.name)}</h4>
          {tl.bars.map((b, i) => (
            <div key={i} className="bar" title={t('{len} · Rest {rest}', { len: fmtM(b.stock), rest: fmtCm(b.waste, 0) })}>
              <span className="len">{fmtM(b.stock)}</span>
              <div className="track">
                {b.pieces.map((pc, j) => (
                  <div key={j} className="piece" style={{ width: `${(pc.length / b.stock) * 100}%` }} title={`${tr(pc.label)}: ${fmtCm(pc.length)}`}>
                    {fmtCm(pc.length, 0)}
                  </div>
                ))}
                <div className="waste" style={{ width: `${(b.waste / b.stock) * 100}%` }} />
              </div>
            </div>
          ))}
          {tl.oversize.map((pc, j) => (
            <p key={j} className="warn">
              {t('{label}: {len} – länger als jede Handelslänge', { label: tr(pc.label), len: fmtCm(pc.length) })}
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
  a.download = t('luftschloss-einkaufsliste.csv')
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
      setInfo(t('{n} Suchen · {k} Tsd. Tokens · {model}', { n: res.usage.searches, k: Math.round((res.usage.input + res.usage.output) / 1000), model: res.servedBy }))
    } catch (e) {
      const m = (e as Error).message ?? String(e)
      setError(
        abort.current?.signal.aborted
          ? t('Abgebrochen.')
          : /401|authentication|api.key/i.test(m)
            ? t('Der API-Schlüssel wurde abgelehnt.')
            : /connection|network|fetch/i.test(m)
              ? t('Keine Verbindung zur Anthropic-API – Netzwerk, Proxy oder Werbeblocker prüfen.')
              : /429|rate/i.test(m)
                ? t('Zu viele Anfragen – in einer Minute nochmal versuchen.')
                : m,
      )
    } finally {
      setBusy(false)
    }
  }
  if (!open)
    return (
      <div className="agent-box">
        <button onClick={() => setOpen(true)}>🔎 {t('Direkt recherchieren lassen')}</button>
        <span className="hint"> {t('mit eigenem Claude-API-Schlüssel, dauert einige Minuten')}</span>
      </div>
    )
  return (
    <div className="agent-box open">
      <b>{t('Direkt recherchieren')}</b>
      <p className="hint">
        {t(
          'Claude sucht im Netz nach den aktuellen Preisen und füllt die Antwort unten aus. Dafür braucht es einen eigenen API-Schlüssel von console.anthropic.com; die Kosten (meist einige Cent bis wenige Euro je Recherche) laufen über dieses Konto. Der Schlüssel geht nur vom Browser direkt an Anthropic.',
        )}
      </p>
      <label className="field">
        <span>{t('API-Schlüssel')}</span>
        <input type="password" value={key} placeholder="sk-ant-…" /* i18n-ok */ autoComplete="off" onChange={(e) => setKey(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>{t('In diesem Browser merken')}</span>
      </label>
      <div className="row">
        {busy ? (
          <button onClick={() => abort.current?.abort()}>{t('Abbrechen')}</button>
        ) : (
          <button className="primary" disabled={!key.trim()} onClick={start}>
            {t('Recherche starten')}
          </button>
        )}
        {busy && <span className="hint">{t('Sucht … {n} Suchen, {m} Seiten', { n: progress.searches.length, m: progress.sources.length })}</span>}
      </div>
      {busy && progress.searches.length > 0 && <p className="hint">{t('Zuletzt: „{q}“', { q: progress.searches[progress.searches.length - 1] })}</p>}
      {info && <p className="hint">{info}</p>}
      {error && <p className="warn">{error}</p>}
      {!busy && progress.sources.length > 0 && (
        <details>
          <summary>{t('{n} Quellen', { n: progress.sources.length })}</summary>
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
