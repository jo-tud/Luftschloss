import { GROUP_LABEL, TIMBER } from '../model/catalog'
import { useDerived, useStore, type Layers } from '../state/store'
import { eur } from './fields'

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
  return (
    <header className="toolbar">
      <button className="narrow-only" onClick={() => s.set({ leftOpen: !s.leftOpen, rightOpen: false })} title="Raum, Ausstattung, Vorlagen">
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
        <span className="proj">{s.project.name}</span>
      </div>
      <div className="group">
        <button onClick={s.undo} disabled={!s.past.length} title="Rückgängig (Strg+Z)">
          ↶
        </button>
        <button onClick={s.redo} disabled={!s.future.length} title="Wiederholen (Strg+Y)">
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
        {s.tool !== 'select' && (
          <select value={s.toolCatalogId} onChange={(e) => s.set({ toolCatalogId: e.target.value })} title="Querschnitt für neue Bauteile">
            {Object.entries(GROUP_LABEL).map(([g, label]) => (
              <optgroup key={g} label={label}>
                {TIMBER.filter((t) => t.group === g).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.round ? `Ø ${t.b}` : `${t.b}×${t.h}`} – {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </div>
      <div className="group">
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
        <button className={s.staticsMode ? 'on' : ''} onClick={() => s.set({ staticsMode: !s.staticsMode, wobble: false })} title="Statik des Gestells: Ausnutzung, Verformung, Wackeln">
          ⚖<span className="lbl"> Statik</span>{s.statics ? ` ${Math.round(s.statics.maxUtil * 100)} %` : ''}
        </button>
      </div>
      <div className="group">
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
      <button className={`sync ${s.server ? s.server.status : ''}`} onClick={() => s.set({ showShare: true })} title={s.server ? `Abgleich im WLAN: ${s.server.status}` : 'Auf dem Tablet öffnen'}>
        📱<span className="lbl"> Tablet</span>
      </button>
      <button className="narrow-only" onClick={() => s.set({ rightOpen: !s.rightOpen, leftOpen: false })} title="Eigenschaften und Prüfung">
        ⓘ
      </button>
      <button onClick={() => s.set({ showHelp: true })} title="Bedienung (?)">
        ?
      </button>
    </header>
  )
}
