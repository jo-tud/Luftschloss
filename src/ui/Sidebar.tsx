import { locale, t, tk, tr } from '../i18n'
import { bestCorner, deckOnFurniture, placeBed, shelvesUnderBed, type Corner } from '../model/placement'
import { Ico, Plus, Sym, WALL_OBJECT_SYM } from './icons'
import { openWizard } from './Project'
import { uid } from '../model/geometry'
import { SLOPE_ANGLE } from '../model/ceiling'
import { bedTypeLabel } from '../model/loftbed'
import type { BedType, CeilingMaterial, LoftBedParams, CorniceProfile, FloorMaterial, Furniture, FurnitureKind, Project, WallId, WallMaterial, WallObject } from '../model/types'
import { WALL_IDS } from '../model/types'
import { useStore } from '../state/store'
import { Check, Num, Section, Sel } from './fields'
import { ProjectActions } from './Project'

const WALL_MAT: [WallMaterial, string][] = [
  ['beton', tk('Beton')],
  ['kalksandstein', tk('Kalksandstein')],
  ['vollziegel', tk('Vollziegel')],
  ['lochziegel', tk('Hochlochziegel')],
  ['porenbeton', tk('Porenbeton')],
  ['trockenbau', tk('Trockenbau')],
  ['holzstaender', tk('Holzständer/Fachwerk')],
  ['leichtbau', tk('Leichtbau/Altbau-Innenwand (nicht tragend)')],
]

/** Listeneintrag per Klick, Enter oder Leertaste auslösen (Tastaturbedienung) */
const activate = (fn: () => void) => ({
  role: 'button',
  tabIndex: 0,
  onClick: fn,
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fn()
    }
  },
})

export function Sidebar() {
  const tab = useStore((s) => s.sidebar)
  const set = useStore((s) => s.set)
  const tabs: [typeof tab, string][] = [
    ['raum', t('Raum')],
    ['ausstattung', t('Ausstattung')],
    ['bett', t('Bett')],
    ['moebel', t('Möbel')],
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
      <Section title={t('Maße')}>
        <Num label={t('Länge (Wand A/C)')} value={r.length} onChange={(v) => setRoom((d) => void (d.room.length = v))} min={1000} max={20000} />
        <Num label={t('Breite (Wand B/D)')} value={r.width} onChange={(v) => setRoom((d) => void (d.room.width = v))} min={1000} max={20000} />
        <Num label={t('Raumhöhe')} value={r.height} onChange={(v) => setRoom((d) => void (d.room.height = v), 'room.height')} min={1800} max={6000} estimated={est(p, 'room.height')} />
        <Num label={t('Wanddicke (Fensterwand)')} value={r.wallThickness} onChange={(v) => setRoom((d) => void (d.room.wallThickness = v))} min={80} />
      </Section>
      <Section title={t('Dachschräge')} open={WALL_IDS.some((w) => r.slopes?.[w])}>
        {WALL_IDS.map((w) => {
          const sl = r.slopes?.[w]
          return (
            <div key={w} className="sub-row">
              <Check
                label={t('Schräge über Wand {w}', { w })}
                value={!!sl}
                onChange={(v) =>
                  setRoom((d) => {
                    d.room.slopes = { ...d.room.slopes }
                    if (v) d.room.slopes[w] = { kneeHeight: Math.min(1000, d.room.height - 200), angle: 45 }
                    else delete d.room.slopes[w]
                  })
                }
              />
              {sl && (
                <>
                  <Num label={t('Kniestock')} value={sl.kneeHeight} onChange={(v) => setRoom((d) => void (d.room.slopes![w]!.kneeHeight = v))} min={0} max={r.height - 50} title={t('Höhe der senkrechten Wand bis zum Beginn der Schräge')} />
                  <Num label={t('Neigung')} value={sl.angle} unit="°" onChange={(v) => setRoom((d) => void (d.room.slopes![w]!.angle = v))} min={SLOPE_ANGLE.min} max={SLOPE_ANGLE.max} title={t('Dachneigung gegen die Waagrechte')} />
                </>
              )}
            </div>
          )
        })}
      </Section>
      <Section title={t('Stuckleiste')}>
        <Check label={t('Stuck an der Decke')} value={r.cornice.enabled} onChange={(v) => setCornice({ enabled: v })} />
        {r.cornice.enabled && (
          <>
            <Num label={t('Höhe an der Wand')} value={r.cornice.height} onChange={(v) => setCornice({ height: v })} estimated={est(p, 'room.cornice')} />
            <Num label={t('Ausladung an der Decke')} value={r.cornice.projection} onChange={(v) => setCornice({ projection: v })} estimated={est(p, 'room.cornice')} />
            <Sel
              label={t('Profil')}
              value={r.cornice.shape}
              options={[
                ['kehle', t('Hohlkehle')],
                ['schraege', t('Schräge')],
                ['rechteck', t('Rechteck (voll)')],
              ]}
              onChange={(v) => setCornice({ shape: v })}
            />
            <details className="sub">
              <summary>{t('Abweichend je Wand')}</summary>
              {WALL_IDS.map((w) => {
                const o = r.corniceOverrides[w]
                return (
                  <div key={w} className="sub-row">
                    <Check label={t('Wand {w} abweichend', { w })} value={!!o} onChange={(v) => setRoom((d) => void (v ? (d.room.corniceOverrides[w] = { ...d.room.cornice }) : delete d.room.corniceOverrides[w]))} />
                    {o && (
                      <>
                        <Check label={t('Stuck vorhanden')} value={o.enabled} onChange={(v) => setRoom((d) => void (d.room.corniceOverrides[w]!.enabled = v))} />
                        <Num label={t('Höhe')} value={o.height} onChange={(v) => setRoom((d) => void (d.room.corniceOverrides[w]!.height = v))} />
                        <Num label={t('Ausladung')} value={o.projection} onChange={(v) => setRoom((d) => void (d.room.corniceOverrides[w]!.projection = v))} />
                      </>
                    )}
                  </div>
                )
              })}
            </details>
          </>
        )}
      </Section>
      <Section title={t('Sockelleiste')}>
        <Check label={t('Sockel-/Parkettleiste')} value={r.skirting.enabled} onChange={(v) => setRoom((d) => void (d.room.skirting.enabled = v), 'room.skirting')} />
        {r.skirting.enabled && (
          <>
            <Num label={t('Höhe')} value={r.skirting.height} unit="mm" onChange={(v) => setRoom((d) => void (d.room.skirting.height = v), 'room.skirting')} estimated={est(p, 'room.skirting')} />
            <Num label={t('Tiefe')} value={r.skirting.depth} unit="mm" onChange={(v) => setRoom((d) => void (d.room.skirting.depth = v), 'room.skirting')} estimated={est(p, 'room.skirting')} />
          </>
        )}
      </Section>
      <Section title={t('Deckenrosette & Lampe')}>
        {r.rosettes.map((ro, i) => (
          <div key={ro.id} className="sub-row">
            <Num label={t('Position x')} value={ro.x} onChange={(v) => setRoom((d) => void (d.room.rosettes[i].x = v), 'room.rosettes')} />
            <Num label={t('Position y')} value={ro.y} onChange={(v) => setRoom((d) => void (d.room.rosettes[i].y = v), 'room.rosettes')} />
            <Num label={t('Durchmesser')} value={ro.diameter} onChange={(v) => setRoom((d) => void (d.room.rosettes[i].diameter = v), 'room.rosettes')} estimated={est(p, 'room.rosettes')} />
            <Num label={t('Lampe hängt bis')} value={ro.lampDrop} onChange={(v) => setRoom((d) => void (d.room.rosettes[i].lampDrop = v), 'room.rosettes')} title={t('Abstand von der Decke bis zur Unterkante der Lampe')} />
            <Num label={t('Lampendurchmesser')} value={ro.lampDiameter} onChange={(v) => setRoom((d) => void (d.room.rosettes[i].lampDiameter = v), 'room.rosettes')} />
            <button className="link danger" onClick={() => setRoom((d) => void d.room.rosettes.splice(i, 1))}>
              {t('Rosette entfernen')}
            </button>
          </div>
        ))}
        <button className="add" onClick={() => setRoom((d) => void d.room.rosettes.push({ id: uid('rosette'), x: r.length / 2, y: r.width / 2, diameter: 600, depth: 30, lampDrop: 700, lampDiameter: 350 }))}>
          + {t('Rosette/Lampe')}
        </button>
      </Section>
      <Section title={t('Wände, Boden, Decke')} open={false}>
        {WALL_IDS.map((w) => (
          <Sel key={w} label={t('Wand {w}', { w })} value={r.walls[w].material} options={WALL_MAT.map(([k, l]) => [k, tr(l)])} onChange={(v) => setRoom((d) => void (d.room.walls[w].material = v))} />
        ))}
        <Sel<FloorMaterial>
          label={t('Boden')}
          value={r.floor}
          options={[
            ['estrich', t('Estrich mit Belag')],
            ['fussbodenheizung', t('Fußbodenheizung (nicht bohren)')],
            ['holzdielen', t('Dielen/Holzbalkendecke')],
          ]}
          onChange={(v) => setRoom((d) => void (d.room.floor = v))}
        />
        <Sel<CeilingMaterial>
          label={t('Decke')}
          value={r.ceiling}
          options={[
            ['beton', t('Betondecke')],
            ['holzbalken', t('Holzbalkendecke')],
            ['abgehaengt', t('Abgehängte Decke')],
            ['schwach', t('Nicht tragfähig (keine Abhängung)')],
          ]}
          onChange={(v) => setRoom((d) => void (d.room.ceiling = v))}
        />
      </Section>
      <Section title={t('Einstellungen')}>
        <Sel
          label={t('Sicherheitsempfehlungen')}
          value={p.settings.safetyProfile}
          options={[
            ['kinder', t('Kinder (streng)')],
            ['jugendliche', t('Jugendliche')],
            ['erwachsene', t('Erwachsene (nur Hinweise)')],
          ]}
          onChange={(v) => update((d) => void (d.settings.safetyProfile = v))}
        />
        <Num label={t('Körpergröße (für Freiraum)')} value={p.settings.personHeight} onChange={(v) => update((d) => void (d.settings.personHeight = v))} />
        <Check label={t('Mietwohnung – möglichst wenig bohren')} value={p.settings.rentalMode} onChange={(v) => update((d) => void (d.settings.rentalMode = v))} />
        <Sel
          label={t('Lastannahme Statik')}
          value={p.settings.loadProfile}
          options={[
            ['bett', t('Bett ({load} kN/m²)', { load: (1).toLocaleString(locale(), { minimumFractionDigits: 1 }) })],
            ['hochebene', t('Hochebene/Spielfläche ({load} kN/m²)', { load: (2).toLocaleString(locale(), { minimumFractionDigits: 1 }) })],
          ]}
          onChange={(v) => update((d) => void (d.settings.loadProfile = v))}
        />
        <MouseProfile />
        <QualitySetting />
        <Sel
          label={t('Verbindungen bevorzugt')}
          value={p.settings.jointPreference}
          options={[
            ['einfach', t('möglichst einfach (Winkel)')],
            ['zerlegbar', t('zerlegbar (Schlossschrauben)')],
            ['wenig-metall', t('wenig Metall (Holzverbindungen)')],
          ]}
          onChange={(v) => update((d) => void ((d.settings.jointPreference = v), (d.joints = [])))}
        />
      </Section>
      <Section title={t('Projekt')} open={false}>
        <ProjectActions />
      </Section>
    </>
  )
}

function QualitySetting() {
  const q = useStore((s) => s.quality)
  return (
    <Sel
      label={t('Darstellung')}
      value={q}
      options={[
        ['hoch', t('Hoch (scharf, für Desktop)')],
        ['normal', t('Normal')],
        ['einfach', t('Einfach (schnell, ältere Geräte)')],
      ]}
      onChange={(v) => {
        useStore.setState({ quality: v })
        try {
          localStorage.setItem('luftschloss.qualitaet', v)
        } catch {
          // nur Komfort
        }
      }}
    />
  )
}

function MouseProfile() {
  const profile = useStore((s) => s.mouseProfile)
  return (
    <Sel
      label={t('Mausbelegung')}
      value={profile}
      options={[
        ['standard', t('Standard (links ziehen dreht)')],
        ['cad', t('CAD (links verschiebt, Shift + mittlere Taste oder Alt + links dreht)')],
      ]}
      onChange={(v) => {
        useStore.setState({ mouseProfile: v })
        try {
          localStorage.setItem('luftschloss.maus', v)
        } catch {
          // nur Komfort
        }
      }}
    />
  )
}

function FixturesTab() {
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const select = useStore((s) => s.select)
  const sel = useStore((s) => s.selection)
  // Neues Objekt an die erste freie Wandstelle setzen und die Ansicht hinfahren
  const addObj = (o: WallObject) => {
    const clash: Record<WallObject['kind'], WallObject['kind'][]> = {
      fenster: ['fenster', 'tuer', 'vorsprung'],
      tuer: ['fenster', 'tuer', 'heizkoerper', 'vorsprung'],
      heizkoerper: ['tuer', 'heizkoerper', 'vorsprung'],
      steckdose: ['tuer', 'steckdose', 'vorsprung'],
      vorsprung: ['fenster', 'tuer', 'heizkoerper', 'steckdose', 'vorsprung'],
    }
    const margin = 150
    for (const w of WALL_IDS) {
      const len = w === 'A' || w === 'C' ? p.room.length : p.room.width
      const busy = p.wallObjects.filter((x) => x.wall === w && clash[o.kind].includes(x.kind)).map((x) => [x.offset - margin, x.offset + x.width + margin] as const)
      busy.sort((a1, b1) => a1[0] - b1[0])
      let at = margin
      for (const [b0, b1] of busy) {
        if (at + o.width <= b0) break
        at = Math.max(at, b1)
      }
      if (at + o.width <= len - margin) {
        o = { ...o, wall: w, offset: Math.round(at) }
        break
      }
    }
    update((d) => void d.wallObjects.push(o))
    select({ kind: 'wallObject', id: o.id })
    setTimeout(() => useStore.getState().focus(o.id), 50)
  }
  const wall: WallId = 'A'
  // L-Form: Block in einer Ecke, die noch frei ist (Ecke = linkes Ende einer Wand)
  const addCorner = () => {
    const w = WALL_IDS.find((x) => !p.wallObjects.some((o) => o.wall === x && o.offset < 1200)) ?? 'C'
    const len = w === 'A' || w === 'C' ? p.room.length : p.room.width
    const across = w === 'A' || w === 'C' ? p.room.width : p.room.length
    const o: WallObject = { id: uid('ecke'), kind: 'vorsprung', name: tk('Raumecke'), wall: w, offset: 0, width: Math.round(Math.min(1500, len / 2)), depth: Math.round(Math.min(1200, across / 2)) }
    update((d) => void d.wallObjects.push(o))
    select({ kind: 'wallObject', id: o.id })
    setTimeout(() => useStore.getState().focus(o.id), 50)
  }
  return (
    <>
      <Section title={t('Fenster, Türen, Heizkörper')}>
        <ul className="list">
          {p.wallObjects.map((o) => (
            <li key={o.id} className={sel?.id === o.id ? 'on' : ''} {...activate(() => (select({ kind: 'wallObject', id: o.id }), useStore.getState().focus(o.id)))}>
              <Sym k={WALL_OBJECT_SYM[o.kind] ?? 'wandobjekt'} />
              {tr(o.name)} <small>{t('Wand {w}', { w: o.wall })}</small>
              {p.estimated.includes(`wallObjects.${o.id}`) && <em className="est-tag">{t('geschätzt')}</em>}
            </li>
          ))}
        </ul>
        <div className="add-row">
          <button
            onClick={() =>
              addObj({ id: uid('fenster'), kind: 'fenster', name: tk('Fenster'), wall, offset: 500, width: 1000, sillHeight: 850, height: 1400, revealDepth: 150, frameWidth: 60, niche: { below: false, belowDepth: 100 }, sashes: [{ opening: 'drehkipp', hinge: 'links' /* i18n-ok */ }], sashThickness: 75, handleProjection: 70, sill: { enabled: true, projection: 40, thickness: 30, sideOverhang: 30 }, displayAngle: 0 })
            }
          >
            + {t('Fenster')}
          </button>
          <button onClick={() => addObj({ id: uid('tuer'), kind: 'tuer', name: tk('Tür'), wall, offset: 300, width: 885, height: 2010, hinge: 'links' /* i18n-ok */, opensInward: true, displayAngle: 0 })}>+ {t('Tür')}</button>
          <button onClick={() => addObj({ id: uid('heizung'), kind: 'heizkoerper', name: tk('Heizkörper'), wall, offset: 500, width: 1000, bottom: 150, height: 600, depth: 100, wallGap: 50, convectionClearance: 100 })}>+ {t('Heizkörper')}</button>
          <button onClick={() => addObj({ id: uid('dose'), kind: 'steckdose', name: tk('Steckdose'), wall, offset: 300, width: 80, bottom: 300, height: 80 })}>+ {t('Steckdose')}</button>
          <button onClick={() => addObj({ id: uid('vorsprung'), kind: 'vorsprung', name: tk('Vorsprung'), wall, offset: 500, width: 500, depth: 400 })} title={t('Kamin, Pfeiler oder Schacht vom Boden bis zur Decke')}>
            + {t('Vorsprung')}
          </button>
          <button onClick={addCorner} title={t('Ausgesparte Ecke für einen L-förmigen Raum; Wand, Breite und Tiefe danach anpassen')}>
            + {t('Raumecke (L-Form)')}
          </button>
        </div>
        <p className="hint">{t('Objekte lassen sich in der Seitenansicht direkt an der Wand verschieben (waagrecht und in der Höhe).')}</p>
      </Section>
    </>
  )
}

interface Preset {
  key: string
  label: string
  hint: string
  type: BedType
  patch: Partial<LoftBedParams>
}

const PRESETS: Preset[] = [
  { key: 'frei', label: tk('Freistehend, 4 Pfosten'), hint: tk('Am häufigsten. Vier Pfosten tragen, die Wand nur als Kippsicherung. Mietwohnungs-tauglich.'), type: 'freistehend', patch: {} },
  { key: 'wandbalken', label: tk('Wandbalken, Latten drauf'), hint: tk('Balken direkt an die massive Wand (Ziegel/Beton), vorne ein Balken auf zwei Pfosten, Latten einfach auflegen. Sehr effizient.'), type: 'wandseitig', patch: { frameStyle: 'aufgelegt' } },
  { key: 'eck', label: tk('Eckbett, 1 Pfosten'), hint: tk('Zwei Wände tragen, ein freier Pfosten. Viel Platz darunter.'), type: 'eck', patch: { frameStyle: 'aufgelegt' } },
  { key: 'eck-decke', label: tk('Eckbett, Ecke abgehängt'), hint: tk('Zwei Wandbalken, die freie Ecke hängt an einer Gewindestange von der Decke. Nur bei sehr tragfähiger Decke.'), type: 'eck', patch: { frameStyle: 'aufgelegt', cornerSupport: 'decke' } },
  { key: 'deckenhoch', label: tk('Deckenhoch verspannt'), hint: tk('Pfosten bis zur Decke verspannt, sehr steif. Stuck und Deckenart beachten.'), type: 'deckenhoch', patch: {} },
  { key: 'nische', label: tk('Hochebene Wand zu Wand'), hint: tk('Wandbalken an beiden Enden, Querträger aufgelegt – für Nischen bis ca. 2,5 m.'), type: 'nische', patch: { frameStyle: 'aufgelegt' } },
  { key: 'zwei', label: tk('Zwei Kinder oben'), hint: tk('Freistehend, zwei Matratzen 90 × 200 nebeneinander. Mittelträger unter der Fuge, Kopfbänder.'), type: 'freistehend', patch: { mattressCount: 2, mattressWidth: 900, railCatalogId: 'kvh-80x160', joistCatalogId: 'kvh-60x120' } },
  { key: 'halbhoch', label: tk('Halbhoch, 1,20 m'), hint: tk('Für jüngere Kinder: niedrig, darunter Spielecke oder Kiste. Geländer und Leiter wie beim Hochbett.'), type: 'freistehend', patch: { deckHeight: 1200, braces: false } },
  { key: 'etage', label: tk('Etagenbett'), hint: tk('Zwei Betten übereinander zwischen vier Pfosten. Unten 0,30 m, oben so hoch, dass man unten aufrecht sitzt.'), type: 'freistehend', patch: { lowerBed: true, deckHeight: 1550, braces: false } },
  { key: 'galerie', label: tk('Galerie mit Mittelstütze'), hint: tk('Lange Hochebene (2,80 × 1,40 m) zum Spielen oder für zwei Matratzen. Eine Stütze in der Mitte jeder Längsseite.'), type: 'wandseitig', patch: { mattressLength: 2800, mattressWidth: 1400, midPosts: 1, frameStyle: 'aufgelegt', railCatalogId: 'kvh-80x160', joistCatalogId: 'kvh-60x120' } },
  { key: 'netz', label: tk('Netz-Hochebene'), hint: tk('Begehbares Netz zum Chillen, 2,00 × 1,40 m. Das Netz zieht stark nach innen – daher kräftige Zargen 12×12 cm. Für Geübte.'), type: 'freistehend', patch: { deck: 'netz', deckCatalogId: 'netz-begehbar', mattressWidth: 1400, railCatalogId: 'kvh-120x120', postCatalogId: 'kvh-120x120', ladder: 'senkrecht' } },
  { key: 'regal', label: tk('Auf Regal/Schrank'), hint: tk('Ohne Pfosten: Der Rahmen liegt auf zwei stabilen Regalen unter Kopf- und Fußende. Regale verschrauben und an der Wand sichern.'), type: 'freistehend', patch: { cornerSupport: 'moebel', braces: false, railCatalogId: 'kvh-80x160' } },
  { key: 'abgehaengt', label: tk('Wandbalken + Decke'), hint: tk('Wandbalken hinten, vorne an Gewindestangen von der Decke. Nur mit besonderer Sorgfalt.'), type: 'abgehaengt', patch: { frameStyle: 'aufgelegt' } },
]


function BedTab() {
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const select = useStore((s) => s.select)
  const sel = useStore((s) => s.selection)
  // freie Teile, die zu keinem Bett gehören – Balken und Flächen (z. B. Matratze eines aufgelösten Betts)
  const freeIds = [...p.members.filter((m) => !m.groupId).map((m) => m.id), ...p.panels.filter((x) => !x.groupId).map((x) => x.id)]
  const insert = (preset: Preset, corner: Corner) => {
    const params = placeBed(p.room, preset.type, preset.patch, corner)
    const id = uid('bett')
    // Bett auf Regalen: die Regale gleich mit hinstellen und die Liegehöhe darauf abstimmen
    const shelves = preset.patch.cornerSupport === 'moebel' ? shelvesUnderBed(params) : []
    if (shelves.length) {
      const asm = { id, kind: 'hochbett' as const, name: preset.label, params, detached: [] }
      params.deckHeight = deckOnFurniture({ ...p, furniture: [...p.furniture, ...shelves] }, asm) ?? params.deckHeight
    }
    update((d) => {
      d.assemblies.push({ id, kind: 'hochbett', name: preset.label, params, detached: [] })
      d.furniture.push(...shelves)
    })
    select({ kind: 'assembly', id })
    // neues Bett ins Bild holen
    setTimeout(() => useStore.getState().focus(id), 50)
  }
  return (
    <>
      <Section title={t('Hochbetten im Projekt')}>
        <ul className="list">
          {p.assemblies.map((a) => (
            <li key={a.id} className={sel?.id === a.id ? 'on' : ''} {...activate(() => (select({ kind: 'assembly', id: a.id }), useStore.getState().focus(a.id)))}>
              <Sym k="bett" /> {tr(a.name)} <small>{tr(bedTypeLabel(a.params))}</small>
            </li>
          ))}
          {p.groups.map((g) => {
            const first = p.members.find((m) => m.groupId === g.id)?.id ?? p.panels.find((x) => x.groupId === g.id)?.id
            return (
              <li key={g.id} className={sel?.id === g.id ? 'on' : ''} {...activate(() => (select({ kind: 'group', id: g.id }), first && useStore.getState().focus(first)))}>
                <Sym k="bett" /> {tr(g.name)} <small>{t('eigene Konstruktion')}</small>
              </li>
            )
          })}
          {freeIds.length > 0 && (
            <li
              {...activate(() =>
                freeIds.length > 1 ? useStore.setState({ multi: freeIds, selection: { kind: 'member', id: freeIds[0] } }) : select({ kind: 'member', id: freeIds[0] }),
              )}
              title={t('Alle freien Teile auswählen, z. B. um sie als Bett zusammenzufassen')}
            >
              <Sym k="teile" /> {t('Freie Teile ({n})', { n: freeIds.length })}
            </li>
          )}
          {!p.assemblies.length && !p.groups.length && <li className="empty">{t('Noch kein Bett – unten eine Vorlage einsetzen oder mit dem Balken-Werkzeug frei zeichnen.')}</li>}
        </ul>
        {!p.assemblies.length && !p.groups.length && (
          <button className="primary wide" onClick={openWizard}>
            <Sym k="assistent" /> {t('Mit dem Planungsassistenten starten')}
          </button>
        )}
      </Section>
      <Section title={t('Vorlage einsetzen')}>
        <div className="templates">
          {PRESETS.map((pr) => (
            <div key={pr.key} className="template">
              <TemplateIcon shelf={pr.patch.cornerSupport === 'moebel'} type={pr.type} aufgelegt={pr.patch.frameStyle === 'aufgelegt'} hang={pr.patch.cornerSupport === 'decke' || pr.type === 'abgehaengt'} lower={pr.patch.lowerBed} net={pr.patch.deck === 'netz'} two={(pr.patch.mattressCount ?? 1) > 1} mid={!!pr.patch.midPosts} low={pr.patch.deckHeight === 1200} />
              <div>
                <b>{tr(pr.label)}</b>
                <p>{tr(pr.hint)}</p>
                <button className="insert" onClick={() => insert(pr, bestCorner(p, pr.type, pr.patch))} title={t('„{name}“ in die günstigste Ecke des Raums einsetzen – die Ecke lässt sich danach unter „Lage im Raum“ ändern', { name: tr(pr.label) })}>
                  <Ico i={Plus} /> {t('Einsetzen')}
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="hint">{t('„Einsetzen“ stellt ein zusätzliches Bett in die günstigste Ecke. Ecke, Maße, Bauart, Hölzer, Geländer und Leiter änderst du danach rechts in den Eigenschaften.')}</p>
      </Section>
    </>
  )
}

function TemplateIcon({ type, aufgelegt, hang, lower, net, mid, low, two, shelf }: { type: BedType; aufgelegt?: boolean; hang?: boolean; lower?: boolean; net?: boolean; mid?: boolean; low?: boolean; two?: boolean; shelf?: boolean }) {
  const post = (x: number, h = 44) => <rect x={x} y={52 - h} width={5} height={h} fill="#b07a3b" />
  if (shelf)
    return (
      <svg viewBox="0 0 64 56" width="56" height="49" className="ticon" aria-hidden>
        <line x1="0" y1="53" x2="64" y2="53" stroke="#999" />
        {[3, 47].map((x) => (
          <g key={x}>
            <rect x={x} y="26" width="14" height="27" fill="#e9e2d6" stroke="#9b8f7c" strokeWidth="1" />
            {[33, 40, 47].map((y) => (
              <line key={y} x1={x} y1={y} x2={x + 14} y2={y} stroke="#9b8f7c" strokeWidth="1" />
            ))}
          </g>
        ))}
        <rect x="3" y="20" width="58" height="6" fill="#d9a566" />
        <rect x="8" y="15" width="48" height="5" fill="#eef" stroke="#99a" strokeWidth="0.5" />
      </svg>
    )
  if (low)
    return (
      <svg viewBox="0 0 64 56" width="56" height="49" className="ticon" aria-hidden>
        <line x1="0" y1="53" x2="64" y2="53" stroke="#999" />
        <rect x="6" y="26" width="5" height="27" fill="#b07a3b" />
        <rect x="52" y="26" width="5" height="27" fill="#b07a3b" />
        <rect x="3" y="34" width="58" height="6" fill="#d9a566" />
        <rect x="8" y="29" width="48" height="5" fill="#eef" stroke="#99a" strokeWidth="0.5" />
      </svg>
    )
  return (
    <svg viewBox="0 0 64 56" width="56" height="49" className="ticon" aria-hidden>
      <line x1="0" y1="53" x2="64" y2="53" stroke="#999" />
      {type === 'deckenhoch' && <line x1="0" y1="2" x2="64" y2="2" stroke="#999" />}
      {(type === 'wandseitig' || type === 'eck' || type === 'nische' || type === 'abgehaengt') && <rect x="0" y="0" width="3" height="53" fill="#ccc" />}
      {type === 'nische' && <rect x="61" y="0" width="3" height="53" fill="#ccc" />}
      {(type === 'freistehend' || type === 'deckenhoch') && post(6, type === 'deckenhoch' ? 50 : 44)}
      {type !== 'nische' && !hang && post(52, type === 'deckenhoch' ? 50 : 44)}
      {hang && <line x1="56" y1="0" x2="56" y2="22" stroke="#777" strokeWidth="1.5" />}
      {aufgelegt && [12, 22, 32, 42, 52].map((x) => <rect key={x} x={x} y={17} width={4} height={3} fill="#c08a4a" />)}
      {mid && post(29, 33)}
      {lower && (
        <>
          <rect x="3" y="44" width="58" height="4" fill="#d9a566" />
          <rect x="8" y="40" width="48" height="4" fill="#eef" stroke="#99a" strokeWidth="0.5" />
        </>
      )}
      {net ? (
        <path d="M3 21 Q32 30 61 21" fill="none" stroke="#5a6b7a" strokeWidth="1.5" strokeDasharray="2 1.5" />
      ) : (
        <>
          <rect x="3" y="20" width="58" height="6" fill="#d9a566" />
          <rect x="8" y="15" width="48" height="5" fill="#eef" stroke="#99a" strokeWidth="0.5" />
          {two && <rect x="31.5" y="14" width="1" height="7" fill="#99a" />}
        </>
      )}
      {type === 'freistehend' && <path d="M11 32 L18 26 M52 32 L45 26" stroke="#b07a3b" strokeWidth="2" />}
    </svg>
  )
}

const FURN: [FurnitureKind, string, [number, number, number]][] = [
  ['schreibtisch', tk('Schreibtisch'), [1400, 700, 750]],
  ['stuhl', tk('Stuhl'), [500, 500, 900]],
  ['sofa', tk('Sofa'), [1800, 850, 800]],
  ['schrank', tk('Kleiderschrank'), [1000, 600, 2000]],
  ['regal', tk('Regal'), [800, 400, 1800]],
  ['kommode', tk('Kommode'), [1200, 500, 800]],
  ['koerper', tk('Freier Körper'), [500, 500, 500]],
  ['person-stehend', tk('Person stehend'), [450, 280, 1750]],
  ['person-sitzend', tk('Person sitzend'), [450, 550, 1300]],
]

function FurnitureTab() {
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const select = useStore((s) => s.select)
  const sel = useStore((s) => s.selection)
  const add = (k: FurnitureKind, name: string, size: [number, number, number]) => {
    const ph = p.settings.personHeight
    const sz = k === 'person-stehend' ? ph : k === 'person-sitzend' ? Math.round(ph * 0.74) : size[2]
    const f: Furniture = { id: uid('moebel'), kind: k, name: k.startsWith('person') ? `${name} ${(ph / 1000).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m` : name, x: p.room.length / 2 - size[0] / 2, y: p.room.width / 2, z: 0, sx: size[0], sy: size[1], sz, rotation: 0 }
    update((d) => void d.furniture.push(f))
    select({ kind: 'furniture', id: f.id })
  }
  return (
    <>
      <Section title={t('Möbel und Personen')}>
        <ul className="list">
          {p.furniture.map((f) => (
            <li key={f.id} className={sel?.id === f.id ? 'on' : ''} {...activate(() => (select({ kind: 'furniture', id: f.id }), useStore.getState().focus(f.id)))}>
              <Sym k={f.kind.startsWith('person') ? 'person' : 'moebel'} /> {tr(f.name)}
            </li>
          ))}
        </ul>
        <div className="add-row">
          {FURN.map(([k, n, s]) => (
            <button key={k} onClick={() => add(k, n, s)}>
              + {tr(n)}
            </button>
          ))}
        </div>
        <p className="hint">{t('Möbel sind einfache Platzhalter für die Platz- und Höhenprüfung. Personen zeigen, wo man stehen und sitzen kann.')}</p>
      </Section>
    </>
  )
}
