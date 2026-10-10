import { useEffect, useRef } from 'react'
import { t, tk, tr, type LangSetting } from '../i18n'
import { useDerived, useStore, type Layers } from '../state/store'
import { useCheckCounts } from './Checks'
import { eur } from './fields'
import { ProjectMenu } from './Project'
import { CircleHelp, DraftingCompass, Ellipsis, Globe, Ico, Info, Layers as LayersIcon, Menu, MousePointer2, Play, ReceiptEuro, RectangleHorizontal, RectangleVertical, Redo2, Scale, TabletSmartphone, Undo2 } from './icons'

const LAYER_LABEL: Record<keyof Layers, string> = {
  joints: tk('Verbindungen'),
  persons: tk('Personen'),
  furniture: tk('Möbel'),
  labels: tk('Beschriftung & Maße'),
  swing: tk('Fenster-Schwenkbögen'),
}

export function Toolbar() {
  const bar = useRef<HTMLElement>(null)
  useFixedMenus(bar)
  const s = useStore()
  const d = useDerived()
  const counts = useCheckCounts()
  const util = s.statics?.maxUtil
  const utilClass = util === undefined ? '' : util > 1 ? ' util-err' : util > 0.6 ? ' util-warn' : ' util-ok'
  return (
    <header className="toolbar" ref={bar}>
      <button className="narrow-only" onClick={() => s.set({ leftOpen: !s.leftOpen, rightOpen: false })} title={t('Raum, Ausstattung, Vorlagen')} aria-label={t('Seitenleiste: Raum, Ausstattung, Vorlagen')}>
        <Ico i={Menu} />
      </button>
      <div className="brand" title={t('Luftschloss – Hochbettplaner')}>
        <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden>
          <rect x="4" y="6" width="4" height="22" fill="#b07a3b" />
          <rect x="24" y="6" width="4" height="22" fill="#b07a3b" />
          <rect x="4" y="12" width="24" height="5" fill="#d9a566" />
          <path d="M6 6 L16 1 L26 6" stroke="#8a5a2b" strokeWidth="2" fill="none" />
        </svg>
        <b>{'Luftschloss'}</b>
      </div>
      <ProjectMenu />
      <div className="group">
        <button className="undo" onClick={s.undo} disabled={!s.past.length} title={t('Rückgängig (Strg+Z)')} aria-label={t('Rückgängig')}>
          <Ico i={Undo2} />
        </button>
        <button className="redo" onClick={s.redo} disabled={!s.future.length} title={t('Wiederholen (Strg+Y)')} aria-label={t('Wiederholen')}>
          <Ico i={Redo2} />
        </button>
      </div>
      <div className="group">
        <button className={s.tool === 'select' ? 'on' : ''} onClick={() => s.set({ tool: 'select' })} title={t('Auswählen und verschieben (V)')}>
          <Ico i={MousePointer2} />
          <span className="lbl">{t('Auswahl')}</span>
        </button>
        <button className={s.tool === 'balken' ? 'on' : ''} onClick={() => s.set({ tool: 'balken' })} title={t('Balken zeichnen: zwei Klicks, Shift = gerade, Strg = weiterzeichnen (B)')}>
          <Ico i={RectangleHorizontal} />
          <span className="lbl">{t('Balken')}</span>
        </button>
        <button className={s.tool === 'pfosten' ? 'on' : ''} onClick={() => s.set({ tool: 'pfosten' })} title={t('Pfosten setzen: ein Klick (P)')}>
          <Ico i={RectangleVertical} />
          <span className="lbl">{t('Pfosten')}</span>
        </button>
      </div>
      <div className="group wide-only">
        <details className="dropdown">
          <summary title={t('Ebenen ein-/ausblenden, Tageslicht')}>
            <Ico i={LayersIcon} />
            <span className="lbl lbl-xl">{t('Ebenen')}</span> ▾
          </summary>
          <div className="menu">
            <SunControl />
            {(Object.keys(LAYER_LABEL) as (keyof Layers)[]).map((k) => (
              <label key={k} className="check">
                <input type="checkbox" checked={s.layers[k]} onChange={() => s.toggleLayer(k)} />
                <span>{tr(LAYER_LABEL[k])}</span>
              </label>
            ))}
          </div>
        </details>
      </div>
      <div className="group">
        <button
          className={`${s.staticsMode ? 'on' : ''}${utilClass}`}
          onClick={() => s.set({ staticsMode: !s.staticsMode, wobble: false })}
          title={
            util === undefined
              ? t('Statik des Gestells')
              : t('Statik: höchste Ausnutzung {u} % – {state}', { u: Math.round(util * 100), state: util > 1 ? t('überlastet') : util > 0.6 ? t('gut, aber nicht viel Reserve') : t('reichlich Reserve') })
          }
        >
          <Ico i={Scale} />
          <span className="lbl">{t('Statik')}</span>
          {util !== undefined && <span className="val">{util > 9.99 ? ` ${t('überlastet')}` : ` ${Math.round(util * 100)} %`}</span>}
        </button>
      </div>
      <div className="group wide-only">
        <button className={s.build ? 'on' : ''} onClick={() => s.set({ build: s.build ? null : { step: 0, start: performance.now(), auto: true } })} title={t('Aufbau Schritt für Schritt als Animation')}>
          <Ico i={Play} />
          <span className="lbl lbl-xl">{t('Aufbau')}</span>
        </button>
        <button onClick={() => s.set({ showPlan: true })} title={t('Bauplan mit Ansichten, Teileliste, Verbindungen und Montage – druckbar')}>
          <Ico i={DraftingCompass} />
          <span className="lbl">{t('Bauplan')}</span>
        </button>
      </div>
      <div className="spacer" />
      <button className="cost" onClick={() => s.set({ showMaterial: true })} title={t('Stückliste, Zuschnitt und Kosten')}>
        <Ico i={ReceiptEuro} />
        <span className="lbl lbl-xl">{t('Material')} ·</span> {eur(d.bom.total)}
      </button>
      <details className="dropdown more-menu narrow-more">
        <summary title={t('Weitere Funktionen')} aria-label={t('Weitere Funktionen')}>
          <Ico i={Ellipsis} />
        </summary>
        <div className="menu" onClick={(e) => (e.currentTarget.parentElement as HTMLDetailsElement).removeAttribute('open')}>
          <button onClick={() => s.set({ build: s.build ? null : { step: 0, start: performance.now(), auto: true } })}>
            <Ico i={Play} /> {t('Aufbau-Animation')}
          </button>
          <button onClick={() => s.set({ showPlan: true })}>
            <Ico i={DraftingCompass} /> {t('Bauplan')}
          </button>
          <button onClick={() => s.set({ showShare: true })}>
            <Ico i={TabletSmartphone} /> {t('Auf dem Tablet öffnen')}
          </button>
          <SunControl />
          <div className="menu-lang" onClick={(e) => e.stopPropagation()}>
            <LangSelect />
          </div>
          <b className="menu-head">{t('Ebenen')}</b>
          {(Object.keys(LAYER_LABEL) as (keyof Layers)[]).map((k) => (
            <label key={k} className="check" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={s.layers[k]} onChange={() => s.toggleLayer(k)} />
              <span>{tr(LAYER_LABEL[k])}</span>
            </label>
          ))}
        </div>
      </details>
      <button className={`sync wide-only ${s.server ? s.server.status : ''}`} onClick={() => s.set({ showShare: true })} title={s.server ? t('Abgleich im WLAN: {status}', { status: tr(s.server.status) }) : t('Auf dem Tablet öffnen')}>
        <Ico i={TabletSmartphone} />
        <span className="lbl lbl-xl">{t('Tablet')}</span>
      </button>
      {/* bleibt auf schmalen Bildschirmen am rechten Rand, auch wenn die Leiste scrollt */}
      <span className="tb-end">
      <button
        className={`narrow-only info-btn${counts.fehler ? ' has-err' : counts.warnung ? ' has-warn' : ''}`}
        onClick={() => s.set({ rightOpen: !s.rightOpen, leftOpen: false })}
        title={t('Eigenschaften und Prüfung')}
        aria-label={t('Eigenschaften und Prüfung: {e} Fehler, {w} Warnungen', { e: counts.fehler, w: counts.warnung })}
      >
        <Ico i={Info} />
        {counts.fehler > 0 ? <span className="b fehler">⛔ {counts.fehler}</span> : counts.warnung > 0 ? <span className="b warnung">⚠ {counts.warnung}</span> : null}
      </button>
      <span className="wide-only">
        <LangSelect />
      </span>
      <button onClick={() => s.set({ showHelp: true })} title={t('Bedienung und Tastenkürzel (?)')} aria-label={t('Hilfe')}>
        <Ico i={CircleHelp} />
      </button>
      </span>
    </header>
  )
}

/** Sonnenlicht ein/aus und Uhrzeit */
function SunControl() {
  const hour = useStore((s) => s.sunHour)
  const set = useStore((s) => s.set)
  const fmt = (h: number) => t('{time} Uhr', { time: `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}` })
  return (
    <div className="sun-control" onClick={(e) => e.stopPropagation()}>
      <label className="check">
        <input type="checkbox" checked={hour !== null} onChange={(e) => set({ sunHour: e.target.checked ? 15 : null })} />
        <span>☀ {t('Sonnenlicht')}{hour !== null ? ` · ${fmt(hour)}` : ''}</span>
      </label>
      {hour !== null && <input type="range" min={6} max={20} step={0.25} value={hour} onChange={(e) => set({ sunHour: Number(e.target.value) })} aria-label={t('Uhrzeit')} />}
    </div>
  )
}

const LANG_TITLE = 'Language / Sprache' // i18n-ok: in beiden Sprachen lesbar

/** Sprache: automatisch (Browser), Englisch oder Deutsch */
function LangSelect() {
  const setting = useStore((s) => s.langSetting)
  const lang = useStore((s) => s.lang)
  const setLangSetting = useStore((s) => s.setLangSetting)
  return (
    <label className="lang-wrap">
      <Ico i={Globe} size={15} />
    <select
      className="lang-select"
      value={setting}
      onChange={(e) => setLangSetting(e.target.value as LangSetting)}
      title={`${LANG_TITLE} · ${setting === 'auto' ? `auto → ${lang === 'de' ? 'Deutsch' : 'English'}` : lang === 'de' ? 'Deutsch' : 'English'}` /* i18n-ok */}
      aria-label={LANG_TITLE}
    >
      {/* kurz halten, die Werkzeugleiste ist voll; die Sprachwahl bleibt zweisprachig */}
      <option value="auto">Auto{/* i18n-ok */}</option>
      <option value="en">EN</option>
      <option value="de">DE</option>
    </select>
    </label>
  )
}

/**
 * Die Werkzeugleiste scrollt auf schmalen Bildschirmen waagrecht und schneidet dabei alles ab, was
 * darüber hinausragt – auch aufgeklappte Menüs. Deshalb liegen sie beim Öffnen fest am Bildschirm,
 * unter ihrem Knopf und ganz im sichtbaren Bereich.
 */
function useFixedMenus(bar: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = bar.current
    if (!el) return
    const place = (d: HTMLDetailsElement) => {
      const menu = d.querySelector<HTMLElement>(':scope > .menu')
      const sum = d.querySelector('summary')
      if (!menu || !sum || !d.open) return
      const r = sum.getBoundingClientRect()
      const right = d.classList.contains('more-menu')
      Object.assign(menu.style, { position: 'fixed', top: `${r.bottom + 4}px`, maxHeight: `${window.innerHeight - r.bottom - 12}px`, overflowY: 'auto', right: 'auto', left: '0px' })
      const w = menu.offsetWidth
      const left = right ? r.right - w : r.left
      menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - w - 8))}px`
    }
    const onToggle = (e: Event) => {
      if (e.target instanceof HTMLDetailsElement) place(e.target)
    }
    const onMove = () => el.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(place)
    // toggle steigt nicht auf – in der Capture-Phase kommt es trotzdem an
    el.addEventListener('toggle', onToggle, true)
    el.addEventListener('scroll', onMove)
    window.addEventListener('resize', onMove)
    return () => {
      el.removeEventListener('toggle', onToggle, true)
      el.removeEventListener('scroll', onMove)
      window.removeEventListener('resize', onMove)
    }
  }, [bar])
}
