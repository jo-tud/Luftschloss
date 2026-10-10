import { defaultBedParams, emptyProject, testProject } from '../model/defaults'
import { uid } from '../model/geometry'
import { BED_TYPE_LABEL, bedOuterSize } from '../model/loftbed'
import type { BedType, CeilingMaterial, CorniceProfile, FloorMaterial, Furniture, FurnitureKind, Project, WallId, WallMaterial, WallObject } from '../model/types'
import { WALL_IDS } from '../model/types'
import { migrate, useStore } from '../state/store'
import { Check, Num, Section, Sel } from './fields'

const WALL_MAT: [WallMaterial, string][] = [
  ['beton', 'Beton'],
  ['kalksandstein', 'Kalksandstein'],
  ['vollziegel', 'Vollziegel'],
  ['lochziegel', 'Hochlochziegel'],
  ['porenbeton', 'Porenbeton'],
  ['trockenbau', 'Trockenbau'],
  ['holzstaender', 'Holzständer/Fachwerk'],
]

export function Sidebar() {
  const tab = useStore((s) => s.sidebar)
  const set = useStore((s) => s.set)
  const tabs: [typeof tab, string][] = [
    ['raum', 'Raum'],
    ['ausstattung', 'Ausstattung'],
    ['bett', 'Bett'],
    ['moebel', 'Möbel'],
  ]
  return (
    <aside className="sidebar">
      <nav className="tabs">
        {tabs.map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => set({ sidebar: k })}>
            {l}
          </button>
        ))}
      </nav>
      <div className="sidebar-body">
        {tab === 'raum' && <RoomTab />}
        {tab === 'ausstattung' && <FixturesTab />}
        {tab === 'bett' && <BedTab />}
        {tab === 'moebel' && <FurnitureTab />}
      </div>
    </aside>
  )
}

function est(p: Project, key: string) {
  return p.estimated.includes(key)
}

function RoomTab() {
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const r = p.room
  const setRoom = (fn: (d: Project) => void, key?: string) =>
    update((d) => {
      fn(d)
      if (key) d.estimated = d.estimated.filter((k) => k !== key)
    })
  const setCornice = (patch: Partial<CorniceProfile>) => setRoom((d) => void (d.room.cornice = { ...d.room.cornice, ...patch }), 'room.cornice')
  return (
    <>
      <Section title="Maße">
        <Num label="Länge (Wand A/C)" value={r.length} onChange={(v) => setRoom((d) => void (d.room.length = v))} min={1000} />
        <Num label="Breite (Wand B/D)" value={r.width} onChange={(v) => setRoom((d) => void (d.room.width = v))} min={1000} />
        <Num label="Raumhöhe" value={r.height} onChange={(v) => setRoom((d) => void (d.room.height = v), 'room.height')} min={1800} estimated={est(p, 'room.height')} />
        <Num label="Wanddicke (Fensterwand)" value={r.wallThickness} onChange={(v) => setRoom((d) => void (d.room.wallThickness = v))} min={80} />
      </Section>
      <Section title="Stuckleiste">
        <Check label="Stuck an der Decke" value={r.cornice.enabled} onChange={(v) => setCornice({ enabled: v })} />
        {r.cornice.enabled && (
          <>
            <Num label="Höhe an der Wand" value={r.cornice.height} onChange={(v) => setCornice({ height: v })} estimated={est(p, 'room.cornice')} />
            <Num label="Ausladung an der Decke" value={r.cornice.projection} onChange={(v) => setCornice({ projection: v })} estimated={est(p, 'room.cornice')} />
            <Sel label="Profil" value={r.cornice.shape} options={[['kehle', 'Hohlkehle'], ['schraege', 'Schräge'], ['rechteck', 'Rechteck (voll)']]} onChange={(v) => setCornice({ shape: v })} />
            <details className="sub">
              <summary>Abweichend je Wand</summary>
              {WALL_IDS.map((w) => {
                const o = r.corniceOverrides[w]
                return (
                  <div key={w} className="sub-row">
                    <Check label={`Wand ${w} abweichend`} value={!!o} onChange={(v) => setRoom((d) => void (v ? (d.room.corniceOverrides[w] = { ...d.room.cornice }) : delete d.room.corniceOverrides[w]))} />
                    {o && (
                      <>
                        <Check label="Stuck vorhanden" value={o.enabled} onChange={(v) => setRoom((d) => void (d.room.corniceOverrides[w]!.enabled = v))} />
                        <Num label="Höhe" value={o.height} onChange={(v) => setRoom((d) => void (d.room.corniceOverrides[w]!.height = v))} />
                        <Num label="Ausladung" value={o.projection} onChange={(v) => setRoom((d) => void (d.room.corniceOverrides[w]!.projection = v))} />
                      </>
                    )}
                  </div>
                )
              })}
            </details>
          </>
        )}
      </Section>
      <Section title="Sockelleiste">
        <Check label="Sockel-/Parkettleiste" value={r.skirting.enabled} onChange={(v) => setRoom((d) => void (d.room.skirting.enabled = v), 'room.skirting')} />
        {r.skirting.enabled && (
          <>
            <Num label="Höhe" value={r.skirting.height} unit="mm" onChange={(v) => setRoom((d) => void (d.room.skirting.height = v), 'room.skirting')} estimated={est(p, 'room.skirting')} />
            <Num label="Tiefe" value={r.skirting.depth} unit="mm" onChange={(v) => setRoom((d) => void (d.room.skirting.depth = v), 'room.skirting')} estimated={est(p, 'room.skirting')} />
          </>
        )}
      </Section>
      <Section title="Deckenrosette & Lampe">
        {r.rosettes.map((ro, i) => (
          <div key={ro.id} className="sub-row">
            <Num label="Position x" value={ro.x} onChange={(v) => setRoom((d) => void (d.room.rosettes[i].x = v), 'room.rosettes')} />
            <Num label="Position y" value={ro.y} onChange={(v) => setRoom((d) => void (d.room.rosettes[i].y = v), 'room.rosettes')} />
            <Num label="Durchmesser" value={ro.diameter} onChange={(v) => setRoom((d) => void (d.room.rosettes[i].diameter = v), 'room.rosettes')} estimated={est(p, 'room.rosettes')} />
            <Num label="Lampe hängt bis" value={ro.lampDrop} onChange={(v) => setRoom((d) => void (d.room.rosettes[i].lampDrop = v), 'room.rosettes')} title="Abstand von der Decke bis zur Unterkante der Lampe" />
            <Num label="Lampendurchmesser" value={ro.lampDiameter} onChange={(v) => setRoom((d) => void (d.room.rosettes[i].lampDiameter = v), 'room.rosettes')} />
            <button className="link danger" onClick={() => setRoom((d) => void d.room.rosettes.splice(i, 1))}>
              Rosette entfernen
            </button>
          </div>
        ))}
        <button className="add" onClick={() => setRoom((d) => void d.room.rosettes.push({ id: uid('rosette'), x: r.length / 2, y: r.width / 2, diameter: 600, depth: 30, lampDrop: 700, lampDiameter: 400 }))}>
          + Rosette/Lampe
        </button>
      </Section>
      <Section title="Wände, Boden, Decke" open={false}>
        {WALL_IDS.map((w) => (
          <Sel key={w} label={`Wand ${w}`} value={r.walls[w].material} options={WALL_MAT} onChange={(v) => setRoom((d) => void (d.room.walls[w].material = v))} />
        ))}
        <Sel<FloorMaterial> label="Boden" value={r.floor} options={[['estrich', 'Estrich mit Belag'], ['fussbodenheizung', 'Fußbodenheizung (nicht bohren)'], ['holzdielen', 'Dielen/Holzbalkendecke']]} onChange={(v) => setRoom((d) => void (d.room.floor = v))} />
        <Sel<CeilingMaterial> label="Decke" value={r.ceiling} options={[['beton', 'Betondecke'], ['holzbalken', 'Holzbalkendecke'], ['abgehaengt', 'Abgehängte Decke']]} onChange={(v) => setRoom((d) => void (d.room.ceiling = v))} />
      </Section>
      <Section title="Einstellungen">
        <Sel label="Sicherheitsempfehlungen" value={p.settings.safetyProfile} options={[['kinder', 'Kinder (streng)'], ['jugendliche', 'Jugendliche'], ['erwachsene', 'Erwachsene (nur Hinweise)']]} onChange={(v) => update((d) => void (d.settings.safetyProfile = v))} />
        <Num label="Körpergröße (für Freiraum)" value={p.settings.personHeight} onChange={(v) => update((d) => void (d.settings.personHeight = v))} />
        <Check label="Mietwohnung – möglichst wenig bohren" value={p.settings.rentalMode} onChange={(v) => update((d) => void (d.settings.rentalMode = v))} />
        <Sel label="Verbindungen bevorzugt" value={p.settings.jointPreference} options={[['einfach', 'möglichst einfach (Winkel)'], ['zerlegbar', 'zerlegbar (Schlossschrauben)'], ['wenig-metall', 'wenig Metall (Holzverbindungen)']]} onChange={(v) => update((d) => void ((d.settings.jointPreference = v), (d.joints = [])))} />
      </Section>
      <Section title="Projekt" open={false}>
        <ProjectActions />
      </Section>
    </>
  )
}

function ProjectActions() {
  const p = useStore((s) => s.project)
  const replace = useStore((s) => s.replaceProject)
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${p.name.replace(/\s+/g, '-').toLowerCase()}.hochbett.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importJson = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const data = JSON.parse(await file.text()) as Project
        if (data.version !== 1 || !data.room) throw new Error('kein Luftschloss-Projekt')
        replace(migrate(data))
      } catch (err) {
        alert(`Datei konnte nicht gelesen werden: ${(err as Error).message}`)
      }
    }
    input.click()
  }
  return (
    <div className="stack">
      <label className="field">
        <span>Name</span>
        <input value={p.name} onChange={(e) => useStore.getState().update((d) => void (d.name = e.target.value), 'name')} />
      </label>
      <button onClick={exportJson}>Projekt exportieren (.json)</button>
      <button onClick={importJson}>Projekt importieren…</button>
      <button onClick={() => confirm('Testzimmer neu laden? Der aktuelle Stand lässt sich mit Rückgängig wiederholen.') && replace(testProject())}>Testzimmer laden</button>
      <button onClick={() => confirm('Leeres Zimmer beginnen?') && replace(emptyProject())}>Leeres Zimmer</button>
    </div>
  )
}

function FixturesTab() {
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const select = useStore((s) => s.select)
  const sel = useStore((s) => s.selection)
  const addObj = (o: WallObject) => {
    update((d) => void d.wallObjects.push(o))
    select({ kind: 'wallObject', id: o.id })
  }
  const wall: WallId = 'A'
  return (
    <>
      <Section title="Fenster, Türen, Heizkörper">
        <ul className="list">
          {p.wallObjects.map((o) => (
            <li key={o.id} className={sel?.id === o.id ? 'on' : ''} onClick={() => select({ kind: 'wallObject', id: o.id })}>
              <span>{o.kind === 'fenster' ? '🪟' : o.kind === 'tuer' ? '🚪' : o.kind === 'heizkoerper' ? '♨' : '🔌'}</span>
              {o.name} <small>Wand {o.wall}</small>
              {p.estimated.includes(`wallObjects.${o.id}`) && <em className="est-tag">geschätzt</em>}
            </li>
          ))}
        </ul>
        <div className="add-row">
          <button
            onClick={() =>
              addObj({ id: uid('fenster'), kind: 'fenster', name: 'Fenster', wall, offset: 500, width: 1000, sillHeight: 850, height: 1400, revealDepth: 150, frameWidth: 60, niche: { below: false, belowDepth: 100 }, sashes: [{ opening: 'drehkipp', hinge: 'links' }], sashThickness: 75, handleProjection: 70, sill: { enabled: true, projection: 40, thickness: 30, sideOverhang: 30 }, displayAngle: 0 })
            }
          >
            + Fenster
          </button>
          <button onClick={() => addObj({ id: uid('tuer'), kind: 'tuer', name: 'Tür', wall, offset: 300, width: 885, height: 2010, hinge: 'links', opensInward: true, displayAngle: 0 })}>+ Tür</button>
          <button onClick={() => addObj({ id: uid('heizung'), kind: 'heizkoerper', name: 'Heizkörper', wall, offset: 500, width: 1000, bottom: 150, height: 600, depth: 100, wallGap: 50, convectionClearance: 100 })}>+ Heizkörper</button>
          <button onClick={() => addObj({ id: uid('dose'), kind: 'steckdose', name: 'Steckdose', wall, offset: 300, width: 80, bottom: 300, height: 80 })}>+ Steckdose</button>
        </div>
        <p className="hint">Objekte lassen sich in der Seitenansicht direkt an der Wand verschieben (waagrecht und in der Höhe).</p>
      </Section>
    </>
  )
}

const BED_TYPES: BedType[] = ['freistehend', 'deckenhoch', 'wandseitig', 'eck', 'nische', 'abgehaengt']
const BED_HINT: Record<BedType, string> = {
  freistehend: 'Am häufigsten. Vier Pfosten tragen, die Wand nur als Kippsicherung. Mietwohnungs-tauglich.',
  deckenhoch: 'Pfosten bis zur Decke verspannt, sehr steif. Stuck und Deckenart beachten.',
  wandseitig: 'Längsseite auf Wandriegel, vorne zwei Pfosten. Braucht tragfähige Wand.',
  eck: 'Zwei Wände tragen, ein freier Pfosten. Viel Platz darunter.',
  nische: 'Wand zu Wand ohne Pfosten – für Nischen bis ca. 2,5 m.',
  abgehaengt: 'Wandriegel hinten, vorne an Gewindestangen von der Decke. Nur mit besonderer Sorgfalt.',
}

/** Ecke des Raums, in die ein neues Bett gestellt wird */
type Corner = 'AD' | 'AB' | 'CB' | 'CD'

function BedTab() {
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const select = useStore((s) => s.select)
  const sel = useStore((s) => s.selection)
  const insert = (type: BedType, corner: Corner) => {
    const params = defaultBedParams({ type, deckHeight: Math.min(1900, p.room.height - 1100), wallEnd: corner === 'AD' || corner === 'CB' ? 'rechts' : 'links', braces: type === 'freistehend' })
    const { length } = bedOuterSize(params)
    const r = p.room
    // Bett läuft entlang Wand A (bzw. C), die Rückseite liegt an der Wand
    if (corner === 'AD') Object.assign(params, { x: r.length - length, y: 0, rotation: 0 })
    if (corner === 'AB') Object.assign(params, { x: 0, y: 0, rotation: 0 })
    if (corner === 'CB') Object.assign(params, { x: length, y: r.width, rotation: 180 })
    if (corner === 'CD') Object.assign(params, { x: r.length, y: r.width, rotation: 180 })
    if (type === 'nische') Object.assign(params, { mattressLength: Math.max(1600, r.length - 2 * 80 - 20), x: 0, rotation: corner.startsWith('C') ? 180 : 0, y: corner.startsWith('C') ? r.width : 0 })
    if (type === 'nische' && corner.startsWith('C')) params.x = r.length
    const id = uid('bett')
    update((d) => void d.assemblies.push({ id, kind: 'hochbett', name: BED_TYPE_LABEL[type], params, detached: [] }))
    select({ kind: 'assembly', id })
  }
  return (
    <>
      <Section title="Hochbetten im Projekt">
        <ul className="list">
          {p.assemblies.map((a) => (
            <li key={a.id} className={sel?.id === a.id ? 'on' : ''} onClick={() => select({ kind: 'assembly', id: a.id })}>
              🛏 {a.name} <small>{BED_TYPE_LABEL[a.params.type]}</small>
            </li>
          ))}
          {!p.assemblies.length && <li className="empty">Noch kein Bett – unten eine Vorlage einsetzen oder mit dem Balken-Werkzeug frei zeichnen.</li>}
        </ul>
      </Section>
      <Section title="Vorlage einsetzen">
        <div className="templates">
          {BED_TYPES.map((t) => (
            <div key={t} className="template">
              <TemplateIcon type={t} />
              <div>
                <b>{BED_TYPE_LABEL[t]}</b>
                <p>{BED_HINT[t]}</p>
                <div className="corners">
                  in Ecke:
                  {(['AD', 'AB', 'CB', 'CD'] as Corner[]).map((c) => (
                    <button key={c} onClick={() => insert(t, c)} title={`Ecke Wand ${c[0]}/${c[1]}`}>
                      {c[0]}/{c[1]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="hint">Alle Vorlagen bleiben voll anpassbar: Bett auswählen und rechts Maße, Bauart, Hölzer, Geländer und Leiter ändern. Einzelne Teile lassen sich herauslösen.</p>
      </Section>
    </>
  )
}

function TemplateIcon({ type }: { type: BedType }) {
  const post = (x: number, h = 44) => <rect x={x} y={52 - h} width={5} height={h} fill="#b07a3b" />
  return (
    <svg viewBox="0 0 64 56" width="56" height="49" className="ticon" aria-hidden>
      <line x1="0" y1="53" x2="64" y2="53" stroke="#999" />
      {type === 'deckenhoch' && <line x1="0" y1="2" x2="64" y2="2" stroke="#999" />}
      {(type === 'wandseitig' || type === 'eck' || type === 'nische' || type === 'abgehaengt') && <rect x="0" y="0" width="3" height="53" fill="#ccc" />}
      {type === 'nische' && <rect x="61" y="0" width="3" height="53" fill="#ccc" />}
      {(type === 'freistehend' || type === 'deckenhoch') && post(6, type === 'deckenhoch' ? 50 : 44)}
      {type !== 'nische' && type !== 'abgehaengt' && post(52, type === 'deckenhoch' ? 50 : 44)}
      {type === 'abgehaengt' && <line x1="56" y1="0" x2="56" y2="22" stroke="#777" strokeWidth="1.5" />}
      <rect x="3" y="20" width="58" height="6" fill="#d9a566" />
      <rect x="8" y="15" width="48" height="5" fill="#eef" stroke="#99a" strokeWidth="0.5" />
      {type === 'freistehend' && <path d="M11 32 L18 26 M52 32 L45 26" stroke="#b07a3b" strokeWidth="2" />}
    </svg>
  )
}

const FURN: [FurnitureKind, string, [number, number, number]][] = [
  ['schreibtisch', 'Schreibtisch', [1400, 700, 750]],
  ['stuhl', 'Stuhl', [500, 500, 900]],
  ['sofa', 'Sofa', [1800, 850, 800]],
  ['schrank', 'Kleiderschrank', [1000, 600, 2000]],
  ['regal', 'Regal', [800, 400, 1800]],
  ['kommode', 'Kommode', [1200, 500, 800]],
  ['koerper', 'Freier Körper', [500, 500, 500]],
  ['person-stehend', 'Person stehend', [450, 280, 1750]],
  ['person-sitzend', 'Person sitzend', [450, 550, 1300]],
]

function FurnitureTab() {
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const select = useStore((s) => s.select)
  const sel = useStore((s) => s.selection)
  const add = (k: FurnitureKind, name: string, size: [number, number, number]) => {
    const ph = p.settings.personHeight
    const sz = k === 'person-stehend' ? ph : k === 'person-sitzend' ? Math.round(ph * 0.74) : size[2]
    const f: Furniture = { id: uid('moebel'), kind: k, name: k.startsWith('person') ? `${name} ${(ph / 1000).toFixed(2).replace('.', ',')} m` : name, x: p.room.length / 2 - size[0] / 2, y: p.room.width / 2, z: 0, sx: size[0], sy: size[1], sz, rotation: 0 }
    update((d) => void d.furniture.push(f))
    select({ kind: 'furniture', id: f.id })
  }
  return (
    <>
      <Section title="Möbel und Personen">
        <ul className="list">
          {p.furniture.map((f) => (
            <li key={f.id} className={sel?.id === f.id ? 'on' : ''} onClick={() => select({ kind: 'furniture', id: f.id })}>
              {f.kind.startsWith('person') ? '🧍' : '▭'} {f.name}
            </li>
          ))}
        </ul>
        <div className="add-row">
          {FURN.map(([k, n, s]) => (
            <button key={k} onClick={() => add(k, n, s)}>
              + {n}
            </button>
          ))}
        </div>
        <p className="hint">Möbel sind einfache Platzhalter für die Platz- und Höhenprüfung. Personen zeigen, wo man stehen und sitzen kann.</p>
      </Section>
    </>
  )
}
