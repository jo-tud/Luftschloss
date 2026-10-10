import { useState } from 'react'
import { t, tr } from '../i18n'
import { MemberStatics } from './Statics'
import { GROUP_LABEL, SHEETS, TIMBER, catalogItem, maxLength, timber, type TimberGroup } from '../model/catalog'
import { fmtCm, fmtM, memberLength, uid } from '../model/geometry'
import { JOINT_KIND_LABEL, jointType, typesForKind } from '../model/joints'
import { BED_TYPE_LABEL } from '../model/loftbed'
import { jointKey } from '../model/resolve'
import type { Assembly, BedType, DeckType, Furniture, GuardType, LadderType, LoftBedParams, Member, Project, Side, WallId, WallObject } from '../model/types'
import { WALL_IDS } from '../model/types'
import { useDerived, useStore } from '../state/store'
import { Check, Num, Section, Sel } from './fields'
import { deleteLabel, deleteSelection } from './actions'

export function Properties() {
  const sel = useStore((s) => s.selection)
  const label = sel ? deleteLabel(sel) : null
  return (
    <>
      {sel && label && (
        <div className="props-actions">
          <button className="danger" onClick={() => deleteSelection(sel)} title={t('{label} (Entf) – rückgängig mit ↶', { label: tr(label) })}>
            🗑 {tr(label)}
          </button>
        </div>
      )}
      <PropertiesBody />
    </>
  )
}

function PropertiesBody() {
  const sel = useStore((s) => s.selection)
  const p = useStore((s) => s.project)
  const d = useDerived()
  if (!sel)
    return (
      <div className="props empty">
        <p>
          <b>{t('Nichts ausgewählt.')}</b>
        </p>
        <p>{t('Klicke ein Bauteil, Fenster oder Möbel an. Doppelklick fliegt zu dieser Stelle heran, jeder weitere geht näher.')}</p>
        <p>{t('Links unter „Bett“ setzt du eine Vorlage ein, unter „Raum“ trägst du Maße, Stuck und Sockelleiste ein.')}</p>
      </div>
    )
  if (sel.kind === 'assembly') {
    const a = p.assemblies.find((x) => x.id === sel.id)
    return a ? <BedProps a={a} /> : null
  }
  if (sel.kind === 'member' || sel.kind === 'panel') {
    const m = d.resolved.members.find((x) => x.id === sel.id)
    const pa = d.resolved.panels.find((x) => x.id === sel.id)
    const asmId = sel.id.includes(':') ? sel.id.split(':')[0] : undefined
    const a = asmId ? p.assemblies.find((x) => x.id === asmId) : undefined
    return (
      <div className="props">
        {m && <MemberProps m={m} free={!m.assemblyId} />}
        {pa && !m && (
          <Section title={pa.name ? tr(pa.name) : t('Fläche')}>
            <p className="kv">
              {t('Material')}: <b>{tr((pa.catalogId && catalogItem(pa.catalogId)?.name) || '–')}</b>
            </p>
          </Section>
        )}
        {a && <BedProps a={a} nested />}
      </div>
    )
  }
  if (sel.kind === 'wallObject') return <WallObjectProps id={sel.id} />
  if (sel.kind === 'furniture') return <FurnitureProps id={sel.id} />
  if (sel.kind === 'rosette') {
    return (
      <div className="props">
        <Section title={t('Deckenrosette & Lampe')}>
          <p>{t('Maße unter „Raum → Deckenrosette & Lampe“. In der Draufsicht oder 3D lässt sich die Rosette verschieben.')}</p>
        </Section>
      </div>
    )
  }
  return null
}

function catalogOptions(filter?: (t: (typeof TIMBER)[number]) => boolean): [string, string][] {
  const out: [string, string][] = []
  for (const g of Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[]) {
    for (const t of TIMBER.filter((x) => x.group === g && (!filter || filter(x)))) out.push([t.id, `${t.round ? `Ø ${t.b}` : `${t.b}×${t.h}`} · ${groupShort(g)}`])
  }
  return out
}

const SIDES: Side[] = ['hinten', 'vorne', 'links', 'rechts'] // i18n-ok

/** Kurzname der Holzgruppe für Auswahllisten (erstes Wort von GROUP_LABEL) */
function groupShort(g: TimberGroup): string {
  switch (g) {
    case 'kvh':
      return 'KVH'
    case 'bsh':
      return t('Brettschichtholz')
    case 'kantholz':
    case 'gehobelt':
      return t('Kantholz')
    case 'latte':
      return t('Latten')
    case 'leiste':
      return t('Leisten')
    case 'rundstab':
      return t('Rundstäbe')
  }
  return tr(GROUP_LABEL[g])
}

/** Seitenname zur Anzeige */
function sideLabel(s: Side | 'links' | 'rechts'): string {
  switch (s) {
    case 'hinten':
      return t('hinten')
    case 'vorne':
      return t('vorne')
    case 'links':
      return t('links')
    case 'rechts':
      return t('rechts')
  }
  return s
}

/** Steifigkeit einer Verbindung zur Anzeige */
function stiffnessLabel(s: string): string {
  switch (s) {
    case 'gelenkig':
      return t('gelenkig')
    case 'halbsteif':
      return t('halbsteif')
    case 'steif':
      return t('steif')
  }
  return tr(s)
}

const LEFT_RIGHT = (): ['links' | 'rechts', string][] => [
  ['links', sideLabel('links')], // i18n-ok
  ['rechts', sideLabel('rechts')], // i18n-ok
]

function BedProps({ a, nested }: { a: Assembly; nested?: boolean }) {
  const update = useStore((s) => s.update)
  const select = useStore((s) => s.select)
  const d = useDerived()
  // Querträger gibt es nicht bei jeder Liegefläche – dann die Auswahl nicht scheinbar wirkungslos anbieten
  const hasJoists = d.resolved.members.some((m) => m.assemblyId === a.id && m.role === 'quertraeger')
  const wallToWall = a.params.type === 'nische'
  const styleMatters = a.params.deck === 'platte' || a.params.deck === 'dielen' || a.params.deck === 'lattenrost' || (a.params.deck === 'latten' && wallToWall)
  const P = a.params
  const roomHeight = useStore((s) => s.project.room.height)
  const info = d.resolved.beds.get(a.id)
  const clearance = d.analysis.clearances.find((c) => c.assemblyId === a.id)
  const setP = (patch: Partial<LoftBedParams>, key?: string) =>
    update((dd) => {
      const x = dd.assemblies.find((y) => y.id === a.id)!
      Object.assign(x.params, patch)
    }, key)
  const shift = d.resolved.shifts.find((s) => s.assemblyId === a.id)
  return (
    <div className={nested ? '' : 'props'}>
      <Section title={`🛏 ${tr(a.name)}`} right={<small>{tr(BED_TYPE_LABEL[P.type])}</small>}>
        {info && clearance && (
          <div className="summary">
            <div>
              <b>{fmtM(info.underside)}</b>
              <span>{t('frei darunter')}</span>
            </div>
            <div>
              <b>{fmtM(clearance.headroom)}</b>
              <span>{t('über Matratze')}</span>
            </div>
            <div>
              <b>
                {fmtCm(info.outerLength, 0)} × {fmtCm(info.outerWidth, 0)}
              </b>
              <span>{t('Außenmaß')}</span>
            </div>
          </div>
        )}
        {info && (info.standLength > info.outerLength + 5 || info.standWidth > info.outerWidth + 5) && (
          <p className="hint">
            {t('Mit Leiter braucht das Bett {l} × {w} Stellfläche.', { l: fmtCm(info.standLength, 0), w: fmtCm(info.standWidth, 0) })}
          </p>
        )}
        <Sel<BedType> label={t('Bauart')} value={P.type} options={(Object.keys(BED_TYPE_LABEL) as BedType[]).map((b) => [b, tr(BED_TYPE_LABEL[b])])} onChange={(v) => setP({ type: v })} />
        {P.type === 'eck' && <Sel label={t('Wandseitiges Ende')} value={P.wallEnd} options={LEFT_RIGHT()} onChange={(v) => setP({ wallEnd: v })} />}
        <Num label={t('Liegehöhe (Oberkante Rost)')} value={P.deckHeight} onChange={(v) => setP({ deckHeight: v })} min={300} max={roomHeight - P.mattressThickness - 200} />
        <div className="pair">
          <Num label={(P.mattressCount ?? 1) > 1 ? t('Matratze Länge (je)') : t('Matratze Länge')} value={P.mattressLength} onChange={(v) => setP({ mattressLength: v })} min={1000} max={3000} />
          <Num label={t('Breite')} value={P.mattressWidth} onChange={(v) => setP({ mattressWidth: v })} min={600} max={2000} />
        </div>
        <Num label={t('Matratzendicke')} value={P.mattressThickness} onChange={(v) => setP({ mattressThickness: v })} min={50} />
        <div className="pair">
          <Sel label={t('Matratzen')} value={String(P.mattressCount ?? 1) as '1'} options={[['1', '1'], ['2', '2'], ['3', '3']]} onChange={(v) => setP({ mattressCount: Number(v) })} title={t('Mehrere Matratzen auf der oberen Liegefläche, z. B. für zwei Kinder')} />
          {(P.mattressCount ?? 1) > 1 && (
            <Sel
              label={t('Anordnung')}
              value={P.mattressLayout ?? 'nebeneinander'}
              options={[
                ['nebeneinander', t('nebeneinander')],
                ['hintereinander', t('hintereinander')],
              ]}
              onChange={(v) => setP({ mattressLayout: v })}
            />
          )}
        </div>
        {(P.mattressCount ?? 1) > 1 && (
          <Num
            label={t('Abstand zwischen den Matratzen')}
            value={P.mattressSpacing ?? P.mattressGap}
            onChange={(v) => setP({ mattressSpacing: v })}
            min={0}
            max={1000}
            title={t('Platz zwischen den Matratzen, z. B. für eine Ablage, ein Brett als Trennung oder einfach mehr Luft. Das Bett wird entsprechend breiter bzw. länger.')}
          />
        )}
        {(P.type === 'freistehend' || P.type === 'deckenhoch') && (
          <>
            <Check label={t('Etagenbett (zweites Bett unten)')} value={P.lowerBed} onChange={(v) => setP({ lowerBed: v })} />
            {P.lowerBed && <Num label={t('Untere Liegehöhe (Oberkante Rost)')} value={P.lowerDeckHeight} onChange={(v) => setP({ lowerDeckHeight: v })} min={150} />}
          </>
        )}
      </Section>
      <Section title={t('Lage im Raum')}>
        {info && <BedPlacement a={a} fp={info.footprint} shift={(dx, dy) => setP({ x: Math.round(P.x + dx), y: Math.round(P.y + dy) }, `lage:${a.id}`)} />}
        <Sel label={t('Drehung')} value={String(P.rotation) as '0'} options={[['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']]} onChange={(v) => setP({ rotation: Number(v) as 0 })} />
        <Check label={t('Gespiegelt (links ↔ rechts)')} value={P.mirror} onChange={(v) => setP({ mirror: v })} />
        <Sel
          label={t('An Sockelleiste')}
          value={P.wallFit}
          options={[
            ['ausklinken', t('Pfosten ausklinken')],
            ['abruecken', t('Bett abrücken')],
          ]}
          onChange={(v) => setP({ wallFit: v })}
          title={t('Wie das Bett an Wänden mit Sockelleiste anschließt')}
        />
        {shift && <p className="hint">{t('Automatisch {d} von der Wand abgerückt.', { d: fmtCm(Math.hypot(shift.dx, shift.dy)) })}</p>}
        {P.type === 'deckenhoch' && <Num label={t('Luft zur Decke (Stellfuß)')} value={P.ceilingGap} unit="mm" onChange={(v) => setP({ ceilingGap: v })} />}
      </Section>
      <Section title={t('Hölzer')}>
        <Sel label={t('Pfosten')} value={P.postCatalogId} options={catalogOptions((t) => !t.round && t.b === t.h && t.b >= 54)} onChange={(v) => setP({ postCatalogId: v })} />
        <Sel label={t('Zargen / Riegel')} value={P.railCatalogId} options={catalogOptions((t) => !t.round && t.h >= 94)} onChange={(v) => setP({ railCatalogId: v })} />
        {hasJoists ? (
          <Sel label={t('Querträger')} value={P.joistCatalogId} options={catalogOptions((t) => !t.round && t.h >= 54)} onChange={(v) => setP({ joistCatalogId: v })} />
        ) : (
          <p className="hint">{t('Querträger: bei dieser Liegefläche nicht nötig – die Latten liegen direkt auf den Längszargen.')}</p>
        )}
        {styleMatters ? (
          <Sel
            label={t('Bauweise')}
            value={P.frameStyle}
            options={[
              ['zargen', t('Querträger zwischen Zargen')],
              ['aufgelegt', t('Aufgelegt (Träger + Latten drauf)')],
            ]}
            onChange={(v) => setP({ frameStyle: v })}
            title={t('Aufgelegt: Querträger bzw. Latten liegen oben auf Wand- und Frontbalken')}
          />
        ) : (
          <p className="hint">{t('Bauweise: bei Latten bzw. Netz ohne Wahl – erst mit Platte, Dielen oder Lattenrost gibt es Querträger, die zwischen den Zargen hängen oder oben aufliegen.')}</p>
        )}
        {(P.type === 'wandseitig' || P.type === 'eck') && (
          <Sel
            label={t('Freie Ecke getragen von')}
            value={P.cornerSupport}
            options={[
              ['pfosten', t('Pfosten')],
              ['decke', t('Abhängung von der Decke')],
            ]}
            onChange={(v) => setP({ cornerSupport: v })}
          />
        )}
        <Check label={t('Kopfbänder (Aussteifung)')} value={P.braces} onChange={(v) => setP({ braces: v })} />
        {P.type !== 'nische' && P.type !== 'abgehaengt' && (
          <Sel
            label={t('Mittelstützen je freier Längsseite')}
            value={String(P.midPosts ?? 0) as '0'}
            options={[['0', t('keine')], ['1', '1'], ['2', '2'], ['3', '3']]}
            onChange={(v) => setP({ midPosts: Number(v) })}
            title={t('Zusätzliche Stützen unter den Längszargen – für lange Betten und Galerien')}
          />
        )}
      </Section>
      <Section title={t('Liegefläche')}>
        <Sel<DeckType>
          label={t('Art')}
          value={P.deck}
          options={[
            ['latten', t('Latten lose aufgelegt (belüftet)')],
            ['rollrost', t('Rollrost')],
            ['lattenrost', t('Lattenrost (Fertigteil)')],
            ['platte', t('Platte')],
            ['dielen', t('Dielen / Rauspund')],
            ['netz', t('Begehbares Netz (für Geübte)')],
          ]}
          onChange={(v) => setP({ deck: v, deckCatalogId: v === 'latten' ? 'geh-44x74' : v === 'platte' ? 'osb-22' : v === 'dielen' ? 'nf-kiefer-27' : v === 'netz' ? 'netz-begehbar' : v })}
        />
        {P.deck === 'netz' && <p className="hint">{t('Zum Chillen statt Schlafen: Das Netz hängt durch und zieht kräftig an den Zargen. Ringsum Zargen, am besten an zwei Wänden – die Prüfung nennt die Kräfte.')}</p>}
        {P.deck === 'latten' && (
          <>
            <Sel label={t('Latten')} value={P.deckCatalogId} options={catalogOptions((t) => !t.round && t.b <= 44 && t.h >= 44)} onChange={(v) => setP({ deckCatalogId: v })} />
            <Num label={t('Abstand der Latten')} value={P.slatGap} unit="mm" onChange={(v) => setP({ slatGap: v })} min={10} />
          </>
        )}
        {(P.deck === 'platte' || P.deck === 'dielen') && (
          <>
            <Sel label={t('Material')} value={P.deckCatalogId} options={SHEETS.filter((s) => (P.deck === 'dielen' ? s.group === 'diele' : ['osb', 'osb-nf', 'dreischicht', 'multiplex', 'leimholz'].includes(s.group))).map((s) => [s.id, tr(s.name)])} onChange={(v) => setP({ deckCatalogId: v })} />
            <Num label={t('Max. Querträgerabstand')} value={P.joistSpacing} onChange={(v) => setP({ joistSpacing: v })} min={200} />
            {P.deck === 'platte' && <p className="hint">{t('Geschlossene Platte unter der Matratze: Belüftung einplanen (Lattenrost auflegen oder Lüftungsbohrungen).')}</p>}
          </>
        )}
      </Section>
      <Section title={t('Absturzsicherung')}>
        <Sel<GuardType>
          label={t('Geländer')}
          value={P.guard}
          options={[
            ['bretter', t('Bretter (Leimholz 18×200)')],
            ['staebe', t('Senkrechte Rundstäbe')],
            ['platte', t('Vollfläche (Leimholz)')],
            ['netz', t('Netz im Rahmen')],
            ['seil', t('Seile')],
            ['keins', t('keins')],
          ]}
          onChange={(v) => setP({ guard: v })}
        />
        {P.guard !== 'keins' && (
          <>
            <Num label={t('Höhe über Liegefläche')} value={P.guardHeight} onChange={(v) => setP({ guardHeight: v })} min={100} />
            <p className="hint">
              {t('Reicht für Matratzen bis {h} (16 cm Überstand).', { h: fmtCm(P.guardHeight - 160) })}
            </p>
            <div className="checks4">
              {SIDES.map((s) => (
                <Check key={s} label={sideLabel(s)} value={P.guardSides[s]} onChange={(v) => setP({ guardSides: { ...P.guardSides, [s]: v } })} />
              ))}
            </div>
            <Sel label={t('Handlauf/Holme')} value={P.guardCatalogId} options={catalogOptions((t) => !t.round && t.h >= 44 && t.h <= 100)} onChange={(v) => setP({ guardCatalogId: v })} />
          </>
        )}
      </Section>
      <Section title={t('Leiter / Treppe')}>
        <Sel<LadderType>
          label={t('Art')}
          value={P.ladder}
          options={[
            ['stufen', t('Stufenleiter (flache Tritte)')],
            ['senkrecht', t('Senkrechte Sprossenleiter')],
            ['schraeg', t('Schräge Sprossenleiter')],
            ['treppe', t('Treppe (breite Stufen)')],
            ['keine', t('keine')], // i18n-ok
          ]}
          onChange={(v) => setP({ ladder: v, ladderAngle: v === 'treppe' ? 45 : v === 'stufen' ? 70 : v === 'schraeg' ? 75 : 90 })}
        />
        {P.ladder !== 'keine' && (
          <>
            <Sel label={t('Seite')} value={P.ladderSide} options={SIDES.map((s) => [s, sideLabel(s)])} onChange={(v) => setP({ ladderSide: v })} />
            <Num label={t('Abstand von links')} value={P.ladderOffset} onChange={(v) => setP({ ladderOffset: v })} min={0} />
            <Num label={t('Breite außen')} value={P.ladderWidth} onChange={(v) => setP({ ladderWidth: v })} min={300} />
            {P.ladder !== 'senkrecht' && <Num label={t('Neigung')} value={P.ladderAngle} unit="°" onChange={(v) => setP({ ladderAngle: Math.max(30, Math.min(89, v)) })} />}
            <Sel label={t('Holme / Wangen')} value={P.ladderCatalogId} options={catalogOptions((t) => !t.round && t.h >= 74)} onChange={(v) => setP({ ladderCatalogId: v })} />
            {(P.ladder === 'senkrecht' || P.ladder === 'schraeg') && <Sel label={t('Sprossen')} value={P.rungCatalogId} options={catalogOptions((t) => !!t.round)} onChange={(v) => setP({ rungCatalogId: v })} />}
            {info?.rungPitch && <p className="hint">{t('Stufenabstand {pitch} · Einstieg {width}', { pitch: fmtCm(info.rungPitch), width: fmtCm(info.accessWidth ?? 0) })}</p>}
          </>
        )}
      </Section>
      {!nested && (
        <Section title={t('Aktionen')} open={false}>
          <div className="stack">
            <button
              onClick={() => {
                const id = uid('bett')
                update((dd) => void dd.assemblies.push({ ...JSON.parse(JSON.stringify(a)), id, name: t('{name} (Kopie)', { name: tr(a.name) }), params: { ...a.params, x: a.params.x - 300, y: a.params.y + 300 } }))
                select({ kind: 'assembly', id })
              }}
            >
              {t('Duplizieren')}
            </button>
            {a.detached.length > 0 && <button onClick={() => update((dd) => void (dd.assemblies.find((y) => y.id === a.id)!.detached = []))}>{t('Herausgelöste Teile wieder erzeugen ({n})', { n: a.detached.length })}</button>}
            <button
              onClick={() => {
                // Baugruppe in freie Bauteile umwandeln
                const r = d.resolved
                const members = r.members.filter((m) => m.assemblyId === a.id).map((m) => ({ ...m, id: uid('balken'), assemblyId: undefined, partKey: undefined, notches: m.notches }))
                const panels = r.panels.filter((x) => x.assemblyId === a.id).map((x) => ({ ...x, id: uid('flaeche'), assemblyId: undefined, partKey: undefined }))
                update((dd) => {
                  dd.assemblies = dd.assemblies.filter((y) => y.id !== a.id)
                  dd.members.push(...members)
                  dd.panels.push(...panels)
                })
                select(null)
              }}
            >
              {t('In Einzelteile auflösen')}
            </button>
            <button className="danger" onClick={() => (update((dd) => void (dd.assemblies = dd.assemblies.filter((y) => y.id !== a.id))), select(null))}>
              {t('Bett löschen')}
            </button>
          </div>
        </Section>
      )}
    </div>
  )
}

function MemberProps({ m, free }: { m: Member; free: boolean }) {
  const update = useStore((s) => s.update)
  const select = useStore((s) => s.select)
  const d = useDerived()
  const item = catalogItem(m.catalogId)
  const L = memberLength(m)
  const joints = d.resolved.joints.filter((j) => j.a === m.id || j.b === m.id)
  const byId = new Map(d.resolved.members.map((x) => [x.id, x]))
  const setM = (fn: (x: Member) => void) =>
    update((dd) => {
      const x = dd.members.find((y) => y.id === m.id)
      if (x) fn(x)
    })
  return (
    <>
      <Section title={`▬ ${m.name ? tr(m.name) : t('Bauteil')}`} right={<small>{free ? t('frei') : t('aus Vorlage')}</small>}>
        <p className="kv">
          {item?.name ? tr(item.name) : m.catalogId}
          <br />
          {t('Länge')} <b>{fmtCm(L)}</b>
          {item?.kind === 'stab' && L > maxLength(item) && <em className="warn"> · {t('länger als {max}', { max: fmtM(maxLength(item)) })}</em>}
        </p>
        {(m.notches ?? []).map((n, i) => (
          <p key={i} className="kv small">
            {t('Ausklinkung {reason}: {l} × {d}', { reason: tr(n.reason), l: fmtCm(n.length), d: fmtCm(n.depth) })}
          </p>
        ))}
        {free ? (
          <>
            <Sel
              label={t('Querschnitt')}
              value={m.catalogId}
              options={catalogOptions()}
              onChange={(v) =>
                setM((x) => {
                  const t = timber(v)
                  x.catalogId = v
                  x.b = t.b
                  x.h = t.h
                  x.round = t.round
                })
              }
            />
            <div className="pair">
              <Num label={t('Start x')} value={m.start.x} onChange={(v) => setM((x) => void (x.start.x = v))} />
              <Num label="y" value={m.start.y} onChange={(v) => setM((x) => void (x.start.y = v))} />
              <Num label="z" value={m.start.z} onChange={(v) => setM((x) => void (x.start.z = v))} />
            </div>
            <div className="pair">
              <Num label={t('Ende x')} value={m.end.x} onChange={(v) => setM((x) => void (x.end.x = v))} />
              <Num label="y" value={m.end.y} onChange={(v) => setM((x) => void (x.end.y = v))} />
              <Num label="z" value={m.end.z} onChange={(v) => setM((x) => void (x.end.z = v))} />
            </div>
            <Num
              label={t('Länge')}
              value={L}
              onChange={(v) =>
                setM((x) => {
                  const k = v / Math.max(1, L)
                  x.end = { x: x.start.x + (x.end.x - x.start.x) * k, y: x.start.y + (x.end.y - x.start.y) * k, z: x.start.z + (x.end.z - x.start.z) * k }
                })
              }
            />
            <ArrayTool m={m} />
            <div className="stack">
              <button onClick={() => setM((x) => void ([x.b, x.h] = [x.h, x.b]))} title={t('Querschnitt um 90° drehen (R)')}>
                {t('Hochkant/flach drehen')}
              </button>
              <button className="danger" onClick={() => (update((dd) => void (dd.members = dd.members.filter((x) => x.id !== m.id))), select(null))}>
                {t('Löschen')}
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => {
              const [asmId, key] = m.id.split(':')
              const copy = { ...m, id: uid('balken'), assemblyId: undefined, partKey: undefined, notches: undefined, name: t('{name} (gelöst)', { name: m.name ? tr(m.name) : t('Bauteil') }) }
              update((dd) => {
                const a = dd.assemblies.find((x) => x.id === asmId)
                if (a && !a.detached.includes(key)) a.detached.push(key)
                dd.members.push(copy)
              })
              select({ kind: 'member', id: copy.id })
            }}
            title={t('Dieses Teil wird nicht mehr von der Vorlage erzeugt und lässt sich frei bearbeiten')}
          >
            {t('Aus Vorlage lösen und frei bearbeiten')}
          </button>
        )}
      </Section>
      <Section title={t('Statik')}>
        <MemberStatics m={m} />
      </Section>
      <Section title={t('Verbindungen ({n})', { n: joints.length })}>
        {joints.length === 0 && <p className="hint">{t('Keine Berührung mit anderen Teilen.')}</p>}
        {joints.map((j) => {
          const other = byId.get(j.a === m.id ? j.b : j.a)
          const jt = jointType(j.typeId)
          return (
            <div key={j.key} className="joint">
              <div className="joint-head">
                <b>{tr(JOINT_KIND_LABEL[j.kind])}</b> {t('mit {name}', { name: other?.name ? tr(other.name) : t('Bauteil') })}
                <button className="link" onClick={() => useStore.getState().set({ jointDetail: j.key })}>
                  {t('3D-Detail')}
                </button>
              </div>
              <select value={j.typeId} onChange={(e) => update((dd) => setJoint(dd, j.key, e.target.value))}>
                {typesForKind(j.kind).map((jt2) => (
                  <option key={jt2.id} value={jt2.id}>
                    {'●'.repeat(jt2.difficulty)} {tr(jt2.name)}
                    {jt2.removable ? ` · ${t('zerlegbar')}` : ''}
                  </option>
                ))}
                {!typesForKind(j.kind).some((x) => x.id === j.typeId) && <option value={j.typeId}>{jt ? tr(jt.name) : j.typeId}</option>}
              </select>
              {jt && (
                <p className="hint">
                  {tr(jt.note)} <br />
                  <small>
                    {t('Werkzeug: {tools}', { tools: jt.tools.map(tr).join(', ') })} · {stiffnessLabel(jt.stiffness)}
                  </small>
                </p>
              )}
            </div>
          )
        })}
      </Section>
    </>
  )
}

/** Reihe erzeugen: Kopien in gleichem Abstand */
function ArrayTool({ m }: { m: Member }) {
  const update = useStore((s) => s.update)
  const [count, setCount] = useState(3)
  const [step, setStep] = useState(500)
  const [axis, setAxis] = useState<'x' | 'y' | 'z'>('x')
  return (
    <details className="sub">
      <summary>{t('Reihe erzeugen…')}</summary>
      <div className="sub-row">
        <Num label={t('Anzahl Kopien')} value={count} unit="" onChange={setCount} min={1} max={50} />
        <Num label={t('Abstand')} value={step} onChange={setStep} />
        <Sel
          label={t('Richtung')}
          value={axis}
          options={[
            ['x', t('entlang x')],
            ['y', t('entlang y')],
            ['z', t('nach oben')],
          ]}
          onChange={setAxis}
        />
        <button
          onClick={() =>
            update((d) => {
              for (let i = 1; i <= count; i++) {
                const off = { x: 0, y: 0, z: 0, [axis]: step * i }
                d.members.push({ ...m, id: uid('balken'), notches: undefined, start: { x: m.start.x + off.x, y: m.start.y + off.y, z: m.start.z + off.z }, end: { x: m.end.x + off.x, y: m.end.y + off.y, z: m.end.z + off.z } })
              }
            })
          }
        >
          {t('{n} Kopien anlegen', { n: count })}
        </button>
      </div>
    </details>
  )
}

function setJoint(d: Project, key: string, typeId: string) {
  const j = d.joints.find((x) => x.key === key)
  if (j) j.typeId = typeId
  else d.joints.push({ key, typeId })
}

function WallObjectProps({ id }: { id: string }) {
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const d = useDerived()
  const o = p.wallObjects.find((x) => x.id === id)
  if (!o) return null
  const setO = (fn: (x: WallObject) => void, coalesce?: string) =>
    update((dd) => {
      const x = dd.wallObjects.find((y) => y.id === id)!
      fn(x)
      dd.estimated = dd.estimated.filter((k) => k !== `wallObjects.${id}`)
    }, coalesce)
  const estimated = p.estimated.includes(`wallObjects.${id}`)
  return (
    <div className="props">
      <Section title={tr(o.name)} right={estimated ? <em className="est-tag">{t('geschätzt')}</em> : undefined}>
        <label className="field">
          <span>{t('Name')}</span>
          <input value={o.name} onChange={(e) => setO((x) => void (x.name = e.target.value), `name-${id}`)} />
        </label>
        <Sel<WallId> label={t('Wand')} value={o.wall} options={WALL_IDS.map((w) => [w, t('Wand {w}', { w })])} onChange={(v) => setO((x) => void (x.wall = v))} />
        <Num label={t('Abstand von links')} value={o.offset} onChange={(v) => setO((x) => void (x.offset = v))} title={t('Vom Raum aus gesehen, ab der linken Wandecke')} estimated={estimated} />
        <Num label={t('Breite')} value={o.width} onChange={(v) => setO((x) => void (x.width = v))} estimated={estimated} />
        {o.kind === 'fenster' && (
          <>
            <Num label={t('Brüstungshöhe')} value={o.sillHeight} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.sillHeight = v)))} estimated={estimated} />
            <Num label={t('Höhe')} value={o.height} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.height = v)))} estimated={estimated} />
            <Num label={t('Laibungstiefe innen')} value={o.revealDepth} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.revealDepth = v)))} title={t('Wie tief der Rahmen in der Wand sitzt')} estimated={estimated} />
            <Check label={t('Nische reicht bis zum Boden (Heizkörpernische)')} value={o.niche.below} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.niche.below = v)))} />
            {o.niche.below && <Num label={t('Tiefe der Nische unten')} value={o.niche.belowDepth} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.niche.belowDepth = v)))} />}
            <Sel
              label={t('Flügel')}
              value={String(o.sashes.length) as '1'}
              options={[
                ['1', t('1 Flügel')],
                ['2', t('{n} Flügel', { n: 2 })],
                ['3', t('{n} Flügel', { n: 3 })],
              ]}
              onChange={(v) =>
                setO(
                  (x) =>
                    void (x.kind === 'fenster' &&
                      (x.sashes = Array.from({ length: Number(v) }, (_, i) => x.sashes[i] ?? { opening: 'drehkipp', hinge: i === 0 ? 'links' : 'rechts' }))), // i18n-ok
                )
              }
            />
            {o.sashes.map((s, i) => {
              const res = d.analysis.windows.find((w) => w.windowId === id && w.sashIndex === i)
              return (
                <div key={i} className="sash">
                  <div className="pair">
                    <Sel
                      label={t('Flügel {n}', { n: i + 1 })}
                      value={s.opening}
                      options={[
                        ['drehkipp', t('Dreh-Kipp')],
                        ['dreh', t('Dreh')],
                        ['kipp', t('Kipp')],
                        ['fest', t('fest')],
                      ]}
                      onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.sashes[i].opening = v)))}
                    />
                    <Sel label={t('Band')} value={s.hinge} options={LEFT_RIGHT()} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.sashes[i].hinge = v)))} />
                  </div>
                  {res && s.opening !== 'fest' && s.opening !== 'kipp' && (
                    <p className={res.maxAngle >= 90 ? 'ok' : 'warn'}>
                      {res.blockedBy ? t('Öffnet bis {angle}° – stößt an {obj}', { angle: res.maxAngle, obj: tr(res.blockedBy.label) }) : t('Öffnet bis {angle}°', { angle: res.maxAngle })}
                    </p>
                  )}
                  {res?.tiltFree === false && <p className="warn">{t('Kippstellung blockiert durch {obj}', { obj: tr(res.tiltBlockedBy?.label ?? '') })}</p>}
                </div>
              )
            })}
            <label className="field">
              <span>{t('Flügel öffnen (Ansicht)')}</span>
              <input type="range" min={0} max={180} value={o.displayAngle} onChange={(e) => setO((x) => void (x.kind === 'fenster' && (x.displayAngle = Number(e.target.value))), `angle-${id}`)} />
            </label>
            <Check label={t('Innere Fensterbank')} value={o.sill.enabled} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.sill.enabled = v)))} />
            {o.sill.enabled && <Num label={t('Überstand Fensterbank')} value={o.sill.projection} unit="mm" onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.sill.projection = v)))} />}
            <Num label={t('Griff steht vor')} value={o.handleProjection} unit="mm" onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.handleProjection = v)))} />
          </>
        )}
        {o.kind === 'tuer' && (
          <>
            <Num label={t('Höhe')} value={o.height} onChange={(v) => setO((x) => void (x.kind === 'tuer' && (x.height = v)))} />
            <Sel label={t('Band')} value={o.hinge} options={LEFT_RIGHT()} onChange={(v) => setO((x) => void (x.kind === 'tuer' && (x.hinge = v)))} />
            <Check label={t('Öffnet in den Raum')} value={o.opensInward} onChange={(v) => setO((x) => void (x.kind === 'tuer' && (x.opensInward = v)))} />
            <label className="field">
              <span>{t('Tür öffnen (Ansicht)')}</span>
              <input type="range" min={0} max={110} value={o.displayAngle} onChange={(e) => setO((x) => void (x.kind === 'tuer' && (x.displayAngle = Number(e.target.value))), `angle-${id}`)} />
            </label>
          </>
        )}
        {o.kind === 'heizkoerper' && (
          <>
            <Num label={t('Unterkante')} value={o.bottom} onChange={(v) => setO((x) => void (x.kind === 'heizkoerper' && (x.bottom = v)))} />
            <Num label={t('Höhe')} value={o.height} onChange={(v) => setO((x) => void (x.kind === 'heizkoerper' && (x.height = v)))} />
            <Num label={t('Tiefe')} value={o.depth} unit="mm" onChange={(v) => setO((x) => void (x.kind === 'heizkoerper' && (x.depth = v)))} />
            <Num label={t('Abstand zur Wand')} value={o.wallGap} unit="mm" onChange={(v) => setO((x) => void (x.kind === 'heizkoerper' && (x.wallGap = v)))} title={t('Negativ, wenn der Heizkörper in einer Nische sitzt')} />
            <Num label={t('Freiraum oben')} value={o.convectionClearance} unit="mm" onChange={(v) => setO((x) => void (x.kind === 'heizkoerper' && (x.convectionClearance = v)))} />
          </>
        )}
        {o.kind === 'steckdose' && <Num label={t('Höhe über Boden')} value={o.bottom} onChange={(v) => setO((x) => void (x.kind === 'steckdose' && (x.bottom = v)))} />}
      </Section>
    </div>
  )
}

function FurnitureProps({ id }: { id: string }) {
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const f = p.furniture.find((x) => x.id === id)
  if (!f) return null
  const setF = (fn: (x: Furniture) => void) => update((dd) => fn(dd.furniture.find((y) => y.id === id)!))
  const person = f.kind.startsWith('person')
  return (
    <div className="props">
      <Section title={tr(f.name)}>
        <label className="field">
          <span>{t('Name')}</span>
          <input value={f.name} onChange={(e) => update((dd) => void (dd.furniture.find((y) => y.id === id)!.name = e.target.value), `name-${id}`)} />
        </label>
        <div className="pair">
          <Num label="x" value={f.x} onChange={(v) => setF((x) => void (x.x = v))} />
          <Num label="y" value={f.y} onChange={(v) => setF((x) => void (x.y = v))} />
          <Num label="z" value={f.z} onChange={(v) => setF((x) => void (x.z = v))} />
        </div>
        {person ? (
          <Num label={t('Größe')} value={f.sz} onChange={(v) => setF((x) => void (x.sz = v))} />
        ) : (
          <div className="pair">
            <Num label={t('Breite')} value={f.sx} onChange={(v) => setF((x) => void (x.sx = v))} />
            <Num label={t('Tiefe')} value={f.sy} onChange={(v) => setF((x) => void (x.sy = v))} />
            <Num label={t('Höhe')} value={f.sz} onChange={(v) => setF((x) => void (x.sz = v))} />
          </div>
        )}
        <Sel label={t('Drehung')} value={String(f.rotation) as '0'} options={[['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']]} onChange={(v) => setF((x) => void (x.rotation = Number(v) as 0))} />
      </Section>
    </div>
  )
}

export { jointKey }

/** Lage über Wandabstände, Schubknöpfe und „In Ecke schieben“ statt roher Koordinaten */
function BedPlacement({ a, fp, shift }: { a: Assembly; fp: { x: number; y: number }[]; shift: (dx: number, dy: number) => void }) {
  const room = useStore((s) => s.project.room)
  const [step, setStep] = useState(100)
  const minX = Math.min(...fp.map((q) => q.x))
  const maxX = Math.max(...fp.map((q) => q.x))
  const minY = Math.min(...fp.map((q) => q.y))
  const maxY = Math.max(...fp.map((q) => q.y))
  void a
  const corner = (c: 'AD' | 'AB' | 'CB' | 'CD') => {
    const dx = c === 'AB' || c === 'CB' ? -minX : room.length - maxX
    const dy = c.startsWith('A') ? -minY : room.width - maxY
    shift(dx, dy)
  }
  return (
    <>
      <div className="pair">
        <Num label={t('Abstand zu Wand {w}', { w: 'A' })} value={Math.round(minY)} onChange={(v) => shift(0, v - minY)} />
        <Num label={t('zu Wand {w}', { w: 'C' })} value={Math.round(room.width - maxY)} onChange={(v) => shift(0, room.width - maxY - v)} />
      </div>
      <div className="pair">
        <Num label={t('Abstand zu Wand {w}', { w: 'B' })} value={Math.round(minX)} onChange={(v) => shift(v - minX, 0)} />
        <Num label={t('zu Wand {w}', { w: 'D' })} value={Math.round(room.length - maxX)} onChange={(v) => shift(room.length - maxX - v, 0)} />
      </div>
      <div className="nudge" role="group" aria-label={t('Bett schieben')}>
        <span className="hint">{t('Schieben')}</span>
        <button onClick={() => shift(0, -step)} title={t('Richtung Wand {w} um {d} cm', { w: 'A', d: step / 10 })}>
          ↑ A
        </button>
        <button onClick={() => shift(0, step)} title={t('Richtung Wand {w} um {d} cm', { w: 'C', d: step / 10 })}>
          ↓ C
        </button>
        <button onClick={() => shift(-step, 0)} title={t('Richtung Wand {w} um {d} cm', { w: 'B', d: step / 10 })}>
          ← B
        </button>
        <button onClick={() => shift(step, 0)} title={t('Richtung Wand {w} um {d} cm', { w: 'D', d: step / 10 })}>
          → D
        </button>
        <select value={step} onChange={(e) => setStep(Number(e.target.value))} aria-label={t('Schrittweite')}>
          <option value={10}>1 cm</option>
          <option value={100}>10 cm</option>
          <option value={500}>50 cm</option>
        </select>
      </div>
      <div className="corners">
        {t('In Ecke schieben:')}
        {(['AD', 'AB', 'CB', 'CD'] as const).map((c) => (
          <button key={c} onClick={() => corner(c)} title={t('Bett in die Ecke Wand {a}/{b} schieben', { a: c[0], b: c[1] })}>
            {c[0]}/{c[1]}
          </button>
        ))}
      </div>
    </>
  )
}
