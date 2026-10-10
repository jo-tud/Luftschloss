import { useDerived, useStore, type Layers } from '../state/store'
import { useCheckCounts } from './Checks'
import { eur } from './fields'
import { ProjectMenu } from './Project'

const LAYER_LABEL: Record<keyof Layers, string> = {
  joints: 'Verbindungen',
  obstacles: 'Hindernisse',
  persons: 'Personen',
  furniture: 'Möbel',
  labels: 'Beschriftung & Maße',
  swing: 'Fenster-Schwenkbögen',
}

export function Toolbar() {
  const s = useStore()
  const d = useDerived()
  const counts = useCheckCounts()
  const util = s.statics?.maxUtil
  const utilClass = util === undefined ? '' : util > 1 ? ' util-err' : util > 0.6 ? ' util-warn' : ' util-ok'
  return (
    <header className="toolbar">
      <button className="narrow-only" onClick={() => s.set({ leftOpen: !s.leftOpen, rightOpen: false })} title="Raum, Ausstattung, Vorlagen" aria-label="Seitenleiste: Raum, Ausstattung, Vorlagen">
        ☰
      </button>
      <div className="brand" title="Luftschloss – Hochbettplaner">
        <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden>
          <rect x="4" y="6" width="4" height="22" fill="#b07a3b" />
          <rect x="24" y="6" width="4" height="22" fill="#b07a3b" />
          <rect x="4" y="12" width="24" height="5" fill="#d9a566" />
          <path d="M6 6 L16 1 L26 6" stroke="#8a5a2b" strokeWidth="2" fill="none" />
        </svg>
        <b>Luftschloss</b>
      </div>
      <ProjectMenu />
      <div className="group">
        <button className="undo" onClick={s.undo} disabled={!s.past.length} title="Rückgängig (Strg+Z)" aria-label="Rückgängig">
          ↶
        </button>
        <button className="redo" onClick={s.redo} disabled={!s.future.length} title="Wiederholen (Strg+Y)" aria-label="Wiederholen">
          ↷
        </button>
      </div>
      <div className="group">
        <button className={s.tool === 'select' ? 'on' : ''} onClick={() => s.set({ tool: 'select' })} title="Auswählen und verschieben (V)">
          ➤<span className="lbl"> Auswahl</span>
        </button>
        <button className={s.tool === 'balken' ? 'on' : ''} onClick={() => s.set({ tool: 'balken' })} title="Balken zeichnen: zwei Klicks, Shift = gerade, Strg = weiterzeichnen (B)">
          ▬<span className="lbl"> Balken</span>
        </button>
        <button className={s.tool === 'pfosten' ? 'on' : ''} onClick={() => s.set({ tool: 'pfosten' })} title="Pfosten setzen: ein Klick (P)">
          ▮<span className="lbl"> Pfosten</span>
        </button>
      </div>
      <div className="group wide-only">
        <details className="dropdown">
          <summary title="Ebenen ein-/ausblenden">Ebenen ▾</summary>
          <div className="menu">
            {(Object.keys(LAYER_LABEL) as (keyof Layers)[]).map((k) => (
              <label key={k} className="check">
                <input type="checkbox" checked={s.layers[k]} onChange={() => s.toggleLayer(k)} />
                <span>{LAYER_LABEL[k]}</span>
              </label>
            ))}
          </div>
        </details>
      </div>
      <div className="group">
        <button
          className={`${s.staticsMode ? 'on' : ''}${utilClass}`}
          onClick={() => s.set({ staticsMode: !s.staticsMode, wobble: false })}
          title={util === undefined ? 'Statik des Gestells' : `Statik: höchste Ausnutzung ${Math.round(util * 100)} % – ${util > 1 ? 'überlastet' : util > 0.6 ? 'gut, aber nicht viel Reserve' : 'reichlich Reserve'}`}
        >
          ⚖<span className="lbl"> Statik</span>
          {util !== undefined && (util > 9.99 ? ' überlastet' : ` ${Math.round(util * 100)} %`)}
        </button>
      </div>
      <div className="group wide-only">
        <button className={s.build ? 'on' : ''} onClick={() => s.set({ build: s.build ? null : { step: 0, start: performance.now(), auto: true } })} title="Aufbau Schritt für Schritt als Animation">
          ▶<span className="lbl"> Aufbau</span>
        </button>
        <button onClick={() => s.set({ showPlan: true })} title="Bauplan mit Ansichten, Teileliste, Verbindungen und Montage – druckbar">
          📐<span className="lbl"> Bauplan</span>
        </button>
      </div>
      <div className="spacer" />
      <button className="cost" onClick={() => s.set({ showMaterial: true })} title="Stückliste, Zuschnitt und Kosten">
        🧾<span className="lbl"> Material ·</span> {eur(d.bom.total)}
      </button>
      <details className="dropdown more-menu narrow-more">
        <summary title="Weitere Funktionen" aria-label="Weitere Funktionen">⋯</summary>
        <div className="menu" onClick={(e) => (e.currentTarget.parentElement as HTMLDetailsElement).removeAttribute('open')}>
          <button onClick={() => s.set({ build: s.build ? null : { step: 0, start: performance.now(), auto: true } })}>▶ Aufbau-Animation</button>
          <button onClick={() => s.set({ showPlan: true })}>📐 Bauplan</button>
          <button onClick={() => s.set({ showShare: true })}>📱 Auf dem Tablet öffnen</button>
          <b className="menu-head">Ebenen</b>
          {(Object.keys(LAYER_LABEL) as (keyof Layers)[]).map((k) => (
            <label key={k} className="check" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={s.layers[k]} onChange={() => s.toggleLayer(k)} />
              <span>{LAYER_LABEL[k]}</span>
            </label>
          ))}
        </div>
      </details>
      <button className={`sync wide-only ${s.server ? s.server.status : ''}`} onClick={() => s.set({ showShare: true })} title={s.server ? `Abgleich im WLAN: ${s.server.status}` : 'Auf dem Tablet öffnen'}>
        📱<span className="lbl"> Tablet</span>
      </button>
      <button
        className={`narrow-only info-btn${counts.fehler ? ' has-err' : counts.warnung ? ' has-warn' : ''}`}
        onClick={() => s.set({ rightOpen: !s.rightOpen, leftOpen: false })}
        title="Eigenschaften und Prüfung"
        aria-label={`Eigenschaften und Prüfung: ${counts.fehler} Fehler, ${counts.warnung} Warnungen`}
      >
        ⓘ{counts.fehler > 0 ? <span className="b fehler">⛔ {counts.fehler}</span> : counts.warnung > 0 ? <span className="b warnung">⚠ {counts.warnung}</span> : null}
      </button>
      <button onClick={() => s.set({ showHelp: true })} title="Bedienung und Tastenkürzel (?)" aria-label="Hilfe">
        ?
      </button>
    </header>
  )
}
