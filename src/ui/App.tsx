import { useEffect } from 'react'
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
import { Toolbar } from './Toolbar'

export function App() {
  useShortcuts()
  return (
    <div className="app">
      <Toolbar />
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
      </aside>
      <StaticsRunner />
      <MaterialDialog />
      <JointDetailDialog />
      <Help />
    </div>
  )
}

function StatusBar() {
  const s = useStore()
  const c = s.cursor
  const hint =
    s.tool === 'balken'
      ? 'Balken: Startpunkt klicken, dann Endpunkt. Shift = gerade, Strg = weiterzeichnen, Esc = abbrechen. Höhe = Oberkante.'
      : s.tool === 'pfosten'
        ? 'Pfosten: in Draufsicht oder 3D auf den Boden klicken. Höhe = Arbeitshöhe.'
        : s.view.kind === 'person'
          ? 'Ich-Perspektive: Ziehen = umsehen, W/A/S/D = gehen, Q/E = runter/hoch, Mausrad = Blickwinkel.'
          : 'Ziehen auf leerer Fläche = drehen (3D) bzw. verschieben (2D) · Rechte Maustaste = drehen (auch aus 2D heraus) · Mausrad = Zoom zum Zeiger · Doppelklick = Fokus'
  return (
    <footer className="statusbar">
      <span className="coords">{c ? `x ${fmtCm(c.x)} · y ${fmtCm(c.y)} · z ${fmtCm(c.z)}` : '–'}</span>
      <span className="ctl">
        <Num label="Arbeitshöhe" value={s.workingHeight} onChange={(v) => s.set({ workingHeight: v })} />
      </span>
      {s.view.kind === 'elev' && (
        <span className="ctl">
          <Num label="Abstand zur Wand" value={s.workingDepth} onChange={(v) => s.set({ workingDepth: v })} />
        </span>
      )}
      {s.view.kind === 'plan' && (
        <span className="ctl range">
          <span>Schnitt bei {fmtCm(s.planCut, 0)}</span>
          <input type="range" min={300} max={s.project.room.height} step={50} value={s.planCut} onChange={(e) => s.set({ planCut: Number(e.target.value) })} />
        </span>
      )}
      <span className="ctl">
        <label className="check small">
          <input type="checkbox" checked={s.snap} onChange={(e) => s.set({ snap: e.target.checked })} />
          <span>Fang</span>
        </label>
        <select value={s.grid} onChange={(e) => s.set({ grid: Number(e.target.value) })} title="Raster">
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
          <h2>Bedienung</h2>
          <button className="close" onClick={() => set({ showHelp: false })}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <h3>Ansichten</h3>
          <p>
            Draufsicht, Seitenansicht (auf Wand A–D), 3D und Ich-Perspektive sind <b>eine</b> Kamera: Beim Wechsel fliegt sie weich zur neuen Ansicht. Die kleinen Ansichten unten rechts tauschen per Klick mit der großen. Aus der Draufsicht heraus mit der rechten Maustaste ziehen kippt direkt in 3D.
          </p>
          <ul>
            <li>
              <kbd>1</kbd> Draufsicht · <kbd>2</kbd> Seitenansicht (nochmal drücken: nächste Wand) · <kbd>3</kbd> 3D · <kbd>4</kbd> Ich-Perspektive (nochmal: nächster Standpunkt) · <kbd>5</kbd> Abwicklung · <kbd>0</kbd> Ansicht zurücksetzen
            </li>
            <li>Ziehen auf leerer Fläche: in 3D drehen, in 2D verschieben · rechte Maustaste: drehen · mittlere Maustaste: verschieben · Mausrad: zum Zeiger zoomen</li>
            <li>Doppelklick auf ein Teil: Ansicht darauf zentrieren · Übersichtskarte oben rechts: Klick setzt Blickziel bzw. Standort</li>
            <li>„✂ Schnitt“ in 3D: Raum mit Reglern zuschneiden, um z. B. von oben unter das Bett zu schauen</li>
            <li>Abwicklung: der Raum aufgeklappt wie eine Schachtel – Fenster, Heizkörper und Steckdosen direkt auf der Wand ziehen</li>
            <li>Mausbelegung „CAD“ (unter Raum → Einstellungen): mittlere Taste dreht, Shift+Mitte verschiebt, links nur Auswahl</li>
            <li>In der 3D-Ansicht werden Wände, die vor dem Bett stehen, automatisch ausgeblendet (Puppenhaus). Die Draufsicht schneidet oberhalb der Schnitthöhe ab (Regler unten).</li>
            <li>Ich-Perspektive: Ziehen = umsehen, <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> gehen, <kbd>Q</kbd>/<kbd>E</kbd> runter/hoch, Mausrad = Blickwinkel</li>
          </ul>
          <h3>Bearbeiten</h3>
          <ul>
            <li>Bett ziehen: in Draufsicht/3D verschieben (rastet an Wänden ein), in der Seitenansicht hoch/runter = Liegehöhe</li>
            <li>Frei gezeichnete Balken: orange Griffe an den Enden ziehen, Länge im Etikett anklicken und eintippen</li>
            <li>Verbindungen: Ebene „Verbindungen“ einblenden und auf einen Punkt klicken – zeigt die Verbindung in 3D mit Beschlägen</li>
            <li>Fenster, Heizkörper, Steckdosen in der Seitenansicht entlang der Wand und in der Höhe ziehen</li>
            <li>
              <kbd>V</kbd> Auswahl · <kbd>B</kbd> Balken (zwei Klicks, <kbd>Shift</kbd> gerade, <kbd>Strg</kbd> weiterzeichnen) · <kbd>P</kbd> Pfosten · <kbd>Esc</kbd> abbrechen
            </li>
            <li>
              <kbd>Entf</kbd> löschen · <kbd>Strg</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd> rückgängig/wiederholen · <kbd>R</kbd> Querschnitt drehen · <kbd>F</kbd> Fokus
            </li>
          </ul>
          <h3>Prüfung</h3>
          <p>Rechts unten stehen alle Befunde: Kollisionen (auch mit Stuck und Sockelleiste), Fensteröffnung, Freiraum, Sicherheitsempfehlungen. Alles sind Empfehlungen – jeder Punkt lässt sich quittieren.</p>
        </div>
      </div>
    </div>
  )
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      const s = useStore.getState()
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
        const sel = s.selection
        s.update((d) => {
          if (sel.kind === 'assembly') d.assemblies = d.assemblies.filter((a) => a.id !== sel.id)
          else if (sel.kind === 'member' && !sel.id.includes(':')) d.members = d.members.filter((m) => m.id !== sel.id)
          else if (sel.kind === 'member' && sel.id.includes(':')) {
            const [a, key] = sel.id.split(':')
            const asm = d.assemblies.find((x) => x.id === a)
            if (asm && !asm.detached.includes(key)) asm.detached.push(key)
          } else if (sel.kind === 'wallObject') d.wallObjects = d.wallObjects.filter((o) => o.id !== sel.id)
          else if (sel.kind === 'furniture') d.furniture = d.furniture.filter((f) => f.id !== sel.id)
          else if (sel.kind === 'panel') d.panels = d.panels.filter((x) => x.id !== sel.id)
        })
        s.select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
