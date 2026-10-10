import { GROUP_LABEL, TIMBER } from '../model/catalog'
import { t, tr } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { fmtCm } from '../model/geometry'
import { useStore } from '../state/store'
import { JointDetailDialog } from '../views/JointDetail'
import { Viewport } from '../views/Viewport'
import { Checks } from './Checks'
import { Num } from './fields'
import { MaterialDialog } from './Material'
import { Properties } from './Properties'
import { Sidebar } from './Sidebar'
import { StaticsRunner } from './Statics'
import { BauplanDialog } from './Bauplan'
import { WizardDialog } from './Wizard'
import { ServerSync, ShareDialog, Toast } from './Sync'
import { Toolbar } from './Toolbar'
import { ExampleBanner } from './Project'
import { deleteSelection } from './actions'

export function App() {
  useShortcuts()
  useDialogFocus()
  const leftOpen = useStore((s) => s.leftOpen)
  const rightOpen = useStore((s) => s.rightOpen)
  const [panels, setPanels] = usePanelSizes()
  const style = {
    '--left-w': `${panels.left}px`,
    '--right-w': `${panels.right}px`,
    ...(panels.checks ? { '--checks-h': `${panels.checks}px` } : {}),
  } as React.CSSProperties
  return (
    <div className={`app${leftOpen ? ' left-open' : ''}${rightOpen ? ' right-open' : ''}`} style={style}>
      <Toolbar />
      <ExampleBanner />
      <Sidebar />
      <main className="center">
        <Viewport />
        <StatusBar />
      </main>
      <aside className="right">
        <div className="right-top">
          <Properties />
        </div>
        <Checks />
        <Splitter
          dir="h"
          style={{ bottom: panels.checks ? panels.checks - 4 : 'calc(38% - 4px)' }}
          title={t('Ziehen: Prüfliste höher oder niedriger · Doppelklick: zurücksetzen')}
          onDrag={(_dx, dy, start) => {
            const h = (start.checks ?? 260) - dy
            const max = window.innerHeight - 46 - 160
            setPanels({ checks: Math.round(Math.max(120, Math.min(max, h))) })
          }}
          onReset={() => setPanels({ checks: null })}
          panels={panels}
        />
      </aside>
      <Splitter
        dir="v"
        style={{ left: panels.left - 5 }}
        title={t('Ziehen: Seitenleiste breiter oder schmaler · Doppelklick: zurücksetzen')}
        onDrag={(dx, _dy, start) => setPanels({ left: clampW(start.left + dx, start.right) })}
        onReset={() => setPanels({ left: PANEL_DEFAULT.left })}
        panels={panels}
      />
      <Splitter
        dir="v"
        style={{ right: panels.right - 4 }}
        title={t('Ziehen: Eigenschaften breiter oder schmaler · Doppelklick: zurücksetzen')}
        onDrag={(dx, _dy, start) => setPanels({ right: clampW(start.right - dx, start.left) })}
        onReset={() => setPanels({ right: PANEL_DEFAULT.right })}
        panels={panels}
      />
      <StaticsRunner />
      <ServerSync />
      <ShareDialog />
      <Toast />
      <div className="drawer-scrim" onClick={() => useStore.setState({ leftOpen: false, rightOpen: false })} />
      <MaterialDialog />
      <JointDetailDialog />
      <BauplanDialog />
      <WizardDialog />
      <Help />
    </div>
  )
}

interface PanelSizes {
  left: number
  right: number
  /** Höhe der Prüfliste in px, null = automatisch */
  checks: number | null
}
const PANEL_DEFAULT: PanelSizes = { left: 290, right: 340, checks: null }
const PANEL_KEY = 'luftschloss.panels'

/** Seitenleiste zwischen 220 und 640 px, die Mitte behält mindestens 420 px */
function clampW(w: number, other: number): number {
  return Math.round(Math.max(220, Math.min(640, window.innerWidth - other - 420, w)))
}

function usePanelSizes(): [PanelSizes, (patch: Partial<PanelSizes>) => void] {
  const [sizes, setSizes] = useState<PanelSizes>(() => {
    try {
      const raw = localStorage.getItem(PANEL_KEY)
      if (raw) return { ...PANEL_DEFAULT, ...JSON.parse(raw) }
    } catch {
      /* ohne Speicher: Standardgrößen */
    }
    return PANEL_DEFAULT
  })
  const update = (patch: Partial<PanelSizes>) =>
    setSizes((old) => {
      const next = { ...old, ...patch }
      try {
        localStorage.setItem(PANEL_KEY, JSON.stringify(next))
      } catch {
        /* egal */
      }
      return next
    })
  return [sizes, update]
}

/** Ziehleiste: meldet die Verschiebung seit Beginn des Ziehens zusammen mit den Größen beim Start */
function Splitter({
  dir,
  style,
  title,
  onDrag,
  onReset,
  panels,
}: {
  dir: 'v' | 'h'
  style: React.CSSProperties
  title: string
  onDrag: (dx: number, dy: number, start: PanelSizes) => void
  onReset: () => void
  panels: PanelSizes
}) {
  const drag = useRef<{ x: number; y: number; start: PanelSizes } | null>(null)
  const [active, setActive] = useState(false)
  return (
    <div
      className={`splitter ${dir}${active ? ' active' : ''}`}
      style={style}
      title={title}
      role="separator"
      aria-orientation={dir === 'v' ? 'vertical' : 'horizontal'}
      onPointerDown={(e) => {
        e.preventDefault()
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        // Prüfliste ohne feste Höhe: aktuelle Höhe als Startwert messen
        const checks = panels.checks ?? (document.querySelector('.checks') as HTMLElement | null)?.offsetHeight ?? null
        drag.current = { x: e.clientX, y: e.clientY, start: { ...panels, checks } }
        setActive(true)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (d) onDrag(e.clientX - d.x, e.clientY - d.y, d.start)
      }}
      onPointerUp={() => {
        drag.current = null
        setActive(false)
      }}
      onPointerCancel={() => {
        drag.current = null
        setActive(false)
      }}
      onDoubleClick={onReset}
    />
  )
}

function StatusBar() {
  const s = useStore()
  const c = s.cursor
  const hint =
    s.tool === 'balken'
      ? t('Balken: Startpunkt klicken, dann Endpunkt. Shift = gerade, Strg = weiterzeichnen, Esc = abbrechen. Höhe = Oberkante.')
      : s.tool === 'pfosten'
        ? t('Pfosten: in Draufsicht oder 3D auf den Boden klicken. Höhe = Arbeitshöhe.')
        : s.view.kind === 'person'
          ? t('Ich-Perspektive: Ziehen = umsehen, W/A/S/D = gehen, Q/E = runter/hoch, Mausrad = Blickwinkel.')
          : t('Ziehen = drehen (3D) bzw. verschieben (2D) · Ausgewähltes ziehen = verschieben · Rechte Maustaste = drehen · Mittlere Maustaste = verschieben · Mausrad = Zoom · Doppelklick = heranholen')
  return (
    <footer className="statusbar">
      <span className="coords">{c ? `x ${fmtCm(c.x)} · y ${fmtCm(c.y)} · z ${fmtCm(c.z)}` : '–'}</span>
      {s.tool !== 'select' && (
        <span className="ctl">
          <label className="field compact">
            <span>{t('Querschnitt')}</span>
            <select value={s.toolCatalogId} onChange={(e) => s.set({ toolCatalogId: e.target.value })} title={t('Querschnitt für neue Bauteile')}>
              {Object.entries(GROUP_LABEL).map(([g, label]) => (
                <optgroup key={g} label={tr(label)}>
                  {TIMBER.filter((t) => t.group === g).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.round ? `Ø ${t.b}` : `${t.b}×${t.h}`} – {tr(t.name)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </span>
      )}
      <span className="ctl">
        <Num label={t('Arbeitshöhe')} value={s.workingHeight} onChange={(v) => s.set({ workingHeight: v })} />
      </span>
      {s.view.kind === 'elev' && (
        <span className="ctl">
          <Num label={t('Abstand zur Wand')} value={s.workingDepth} onChange={(v) => s.set({ workingDepth: v })} />
        </span>
      )}
      {s.view.kind === 'plan' && (
        <span className="ctl range">
          <span>{t('Schnitt bei {h}', { h: fmtCm(s.planCut, 0) })}</span>
          <input type="range" min={300} max={s.project.room.height} step={50} value={s.planCut} onChange={(e) => s.set({ planCut: Number(e.target.value) })} />
        </span>
      )}
      <span className="ctl">
        <label className="check small">
          <input type="checkbox" checked={s.snap} onChange={(e) => s.set({ snap: e.target.checked })} />
          <span>{t('Fang')}</span>
        </label>
        <select value={s.grid} onChange={(e) => s.set({ grid: Number(e.target.value) })} title={t('Raster')}>
          {[1, 5, 10, 50, 100].map((g) => (
            <option key={g} value={g}>
              {g < 10 ? `${g} mm` : `${g / 10} cm`}
            </option>
          ))}
        </select>
      </span>
      <span className="hint">{hint}</span>
    </footer>
  )
}

function Help() {
  const show = useStore((s) => s.showHelp)
  const set = useStore((s) => s.set)
  if (!show) return null
  return (
    <div className="modal-bg" onClick={() => set({ showHelp: false })}>
      <div className="modal help" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('Bedienung')}</h2>
          <button className="close" onClick={() => set({ showHelp: false })} aria-label={t('Schließen')}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <h3>{t('Ansichten')}</h3>
          <p>
            {t('Draufsicht, Seitenansicht (auf Wand A–D), 3D und Ich-Perspektive sind')} <b>{t('eine')}</b> {t('Kamera: Beim Wechsel fliegt sie weich zur neuen Ansicht. Die kleinen Ansichten unten rechts tauschen per Klick mit der großen. Aus der Draufsicht heraus mit der rechten Maustaste ziehen kippt direkt in 3D.')}
          </p>
          <ul>
            <li>
              <kbd>1</kbd> {t('Draufsicht')} · <kbd>2</kbd> {t('Seitenansicht (nochmal drücken: nächste Wand)')} · <kbd>3</kbd> 3D · <kbd>4</kbd> {t('Ich-Perspektive (nochmal: nächster Standpunkt)')} · <kbd>5</kbd> {t('Abwicklung')} · <kbd>0</kbd> {t('Ansicht zurücksetzen')}
            </li>
            <li>{t('Ziehen auf leerer Fläche: in 3D drehen, in 2D verschieben · rechte Maustaste: drehen · mittlere Maustaste: verschieben · Mausrad: zum Zeiger zoomen')}</li>
            <li>{t('Doppelklick (Doppeltipp): weich zu dieser Stelle heranfliegen, jeder weitere Doppelklick geht näher heran – z. B. an eine Verbindung · „⌂ Zurück“ zeigt wieder das ganze Zimmer · Übersichtskarte oben rechts: Klick setzt Blickziel bzw. Standort')}</li>
            <li>{t('„✂ Schnitt“ in 3D: Raum mit Reglern zuschneiden, um z. B. von oben unter das Bett zu schauen')}</li>
            <li>{t('Abwicklung: der Raum aufgeklappt wie eine Schachtel – Fenster, Heizkörper und Steckdosen direkt auf der Wand ziehen')}</li>
            <li>{t('Mausbelegung „CAD“ (unter Raum → Einstellungen): links ziehen und mittlere Taste verschieben, Shift + mittlere Taste dreht')}</li>
            <li>{t('In der 3D-Ansicht werden Wände, die vor dem Bett stehen, automatisch ausgeblendet (Puppenhaus). Die Draufsicht schneidet oberhalb der Schnitthöhe ab (Regler unten).')}</li>
            <li>
              {t('Ich-Perspektive: Ziehen = umsehen,')} <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> {t('gehen,')} <kbd>Q</kbd>/<kbd>E</kbd> {t('runter/hoch, Mausrad = Blickwinkel')}
            </li>
          </ul>
          <h3>{t('Bearbeiten')}</h3>
          <ul>
            <li>{t('Bett verschieben: erst anklicken bzw. antippen, dann ziehen (rastet an Wänden ein und hält dort an); in der Seitenansicht hoch/runter = Liegehöhe. Genau geht es rechts unter „Lage im Raum“: Abstand zu jeder Wand, Schieben in Schritten, „In Ecke schieben“.')}</li>
            <li>{t('Tablet: antippen = auswählen, Ausgewähltes mit einem Finger ziehen, leere Fläche mit einem Finger = drehen, zwei Finger = zoomen und verschieben, Doppeltipp = heranholen. ☰ öffnet Raum und Vorlagen, ⓘ Eigenschaften und Prüfung.')}</li>
            <li>{t('Frei gezeichnete Balken: orange Griffe an den Enden ziehen, Länge im Etikett anklicken und eintippen')}</li>
            <li>{t('Verbindungen: Ebene „Verbindungen“ einblenden und auf einen Punkt klicken – zeigt die Verbindung in 3D mit Beschlägen')}</li>
            <li>{t('Fenster, Heizkörper, Steckdosen in der Seitenansicht entlang der Wand und in der Höhe ziehen')}</li>
            <li>
              <kbd>V</kbd> {t('Auswahl')} · <kbd>B</kbd> {t('Balken (zwei Klicks,')} <kbd>{'Shift'}</kbd> {t('gerade,')} <kbd>{t('Strg')}</kbd> {t('weiterzeichnen)')} · <kbd>P</kbd> {t('Pfosten')} · <kbd>{'Esc'}</kbd> {t('abbrechen')}
            </li>
            <li>
              <kbd>{t('Entf')}</kbd> {t('löschen')} · <kbd>{t('Strg')}</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd> {t('rückgängig/wiederholen')} · <kbd>R</kbd> {t('Querschnitt drehen')} · <kbd>F</kbd> {t('Fokus')}
            </li>
          </ul>
          <h3>{t('Prüfung')}</h3>
          <p>{t('Rechts unten stehen alle Befunde: Kollisionen (auch mit Stuck und Sockelleiste), Fensteröffnung, Freiraum, Sicherheitsempfehlungen. Alles sind Empfehlungen – jeder Punkt lässt sich quittieren.')}</p>
          <h3>{t('Sprache')}</h3>
          <p>{t('Die Sprache (English/Deutsch/Auto) lässt sich oben rechts in der Werkzeugleiste umstellen.')}</p>
        </div>
      </div>
    </div>
  )
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      // Esc schließt zuerst Dialoge und Schubladen, dann Aufbau/Statik, sonst Werkzeug abbrechen
      if (e.key === 'Escape') {
        if (s.jointDetail) return s.set({ jointDetail: null })
        if (s.showHelp || s.showShare || s.showMaterial || s.showPlan) return s.set({ showHelp: false, showShare: false, showMaterial: false, showPlan: false })
        if (s.leftOpen || s.rightOpen) return s.set({ leftOpen: false, rightOpen: false })
        if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
        if (s.build) return s.set({ build: null })
        if (s.staticsMode) return s.set({ staticsMode: false, wobble: false })
      }
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && k === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (s.view.kind === 'person' && ['w', 'a', 's', 'd', 'q', 'e'].includes(k)) return
      const walls = ['A', 'B', 'C', 'D'] as const
      const presets = ['tuer', 'unter', 'matratze', 'liegen'] as const
      if (k === '1') s.setView({ kind: 'plan' })
      else if (k === '2') s.setView({ kind: 'elev', wall: s.view.kind === 'elev' ? walls[(walls.indexOf(s.view.wall) + 1) % 4] : 'A' })
      else if (k === '3') s.setView({ kind: '3d' })
      else if (k === '5') s.setView({ kind: 'unfold' })
      else if (k === '6') s.setView({ kind: 'foto' })
      else if (k === '0') s.setView({ kind: '3d' })
      else if (k === '4') s.setView({ kind: 'person', preset: s.view.kind === 'person' ? presets[(presets.indexOf(s.view.preset) + 1) % 4] : 'tuer' })
      else if (k === 'v' || k === 'escape') s.set({ tool: 'select' })
      else if (k === 'b') s.set({ tool: 'balken' })
      else if (k === 'p') s.set({ tool: 'pfosten' })
      else if (k === '?') s.set({ showHelp: !s.showHelp })
      else if (k === 'f' && s.selection) s.focus(s.selection.id.includes(':') ? s.selection.id.split(':')[0] : s.selection.id)
      else if (k === 'r' && s.selection?.kind === 'member') {
        const id = s.selection.id
        s.update((d) => {
          const m = d.members.find((x) => x.id === id)
          if (m) [m.b, m.h] = [m.h, m.b]
        })
      } else if ((k === 'delete' || k === 'backspace') && s.selection) {
        deleteSelection(s.selection)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Fokus beim Öffnen eines Dialogs auf dessen Schließen-Knopf, beim Schließen zurück */
function useDialogFocus() {
  const open = useStore((s) => s.showHelp || s.showShare || s.showMaterial || s.showPlan || !!s.jointDetail)
  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    const t = setTimeout(() => (document.querySelector('.modal .close, .modal button') as HTMLElement | null)?.focus(), 30)
    return () => {
      clearTimeout(t)
      before?.focus?.()
    }
  }, [open])
}
