import { GROUP_LABEL, SHEETS, TIMBER, catalogItem, maxLength, timber } from '../model/catalog'
import { fmtCm, fmtM, memberLength, uid } from '../model/geometry'
import { JOINT_KIND_LABEL, jointType, typesForKind } from '../model/joints'
import { BED_TYPE_LABEL } from '../model/loftbed'
import { jointKey } from '../model/resolve'
import type { Assembly, BedType, DeckType, Furniture, GuardType, LadderType, LoftBedParams, Member, Project, Side, WallId, WallObject } from '../model/types'
import { WALL_IDS } from '../model/types'
import { useDerived, useStore } from '../state/store'
import { Check, Num, Section, Sel } from './fields'

export function Properties() {
  const sel = useStore((s) => s.selection)
  const p = useStore((s) => s.project)
  const d = useDerived()
  if (!sel)
    return (
      <div className="props empty">
        <p>
          <b>Nichts ausgewählt.</b>
        </p>
        <p>Klicke ein Bauteil, Fenster oder Möbel an. Doppelklick zentriert die Ansicht darauf.</p>
        <p>Links unter „Bett“ setzt du eine Vorlage ein, unter „Raum“ trägst du Maße, Stuck und Sockelleiste ein.</p>
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
          <Section title={pa.name ?? 'Fläche'}>
            <p className="kv">
              Material: <b>{(pa.catalogId && catalogItem(pa.catalogId)?.name) ?? '–'}</b>
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
        <Section title="Deckenrosette & Lampe">
          <p>Maße unter „Raum → Deckenrosette & Lampe“. In der Draufsicht oder 3D lässt sich die Rosette verschieben.</p>
        </Section>
      </div>
    )
  }
  return null
}

function catalogOptions(filter?: (t: (typeof TIMBER)[number]) => boolean): [string, string][] {
  const out: [string, string][] = []
  for (const g of Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[]) {
    for (const t of TIMBER.filter((x) => x.group === g && (!filter || filter(x)))) out.push([t.id, `${t.round ? `Ø ${t.b}` : `${t.b}×${t.h}`} · ${GROUP_LABEL[g].split(' ')[0]}${t.priceEstimated ? '' : ''}`])
  }
  return out
}

const SIDES: Side[] = ['hinten', 'vorne', 'links', 'rechts']

function BedProps({ a, nested }: { a: Assembly; nested?: boolean }) {
  const update = useStore((s) => s.update)
  const select = useStore((s) => s.select)
  const d = useDerived()
  const P = a.params
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
      <Section title={`🛏 ${a.name}`} right={<small>{BED_TYPE_LABEL[P.type]}</small>}>
        {info && clearance && (
          <div className="summary">
            <div>
              <b>{fmtM(info.underside)}</b>
              <span>frei darunter</span>
            </div>
            <div>
              <b>{fmtM(clearance.headroom)}</b>
              <span>über Matratze</span>
            </div>
            <div>
              <b>
                {fmtCm(info.outerLength, 0)} × {fmtCm(info.outerWidth, 0)}
              </b>
              <span>Außenmaß</span>
            </div>
          </div>
        )}
        <Sel<BedType> label="Bauart" value={P.type} options={(Object.keys(BED_TYPE_LABEL) as BedType[]).map((t) => [t, BED_TYPE_LABEL[t]])} onChange={(v) => setP({ type: v })} />
        {P.type === 'eck' && <Sel label="Wandseitiges Ende" value={P.wallEnd} options={[['links', 'links'], ['rechts', 'rechts']]} onChange={(v) => setP({ wallEnd: v })} />}
        <Num label="Liegehöhe (Oberkante Rost)" value={P.deckHeight} onChange={(v) => setP({ deckHeight: v })} min={300} />
        <div className="pair">
          <Num label="Matratze Länge" value={P.mattressLength} onChange={(v) => setP({ mattressLength: v })} min={1000} />
          <Num label="Breite" value={P.mattressWidth} onChange={(v) => setP({ mattressWidth: v })} min={600} />
        </div>
        <Num label="Matratzendicke" value={P.mattressThickness} onChange={(v) => setP({ mattressThickness: v })} min={50} />
      </Section>
      <Section title="Lage im Raum">
        <div className="pair">
          <Num label="x" value={P.x} onChange={(v) => setP({ x: v })} />
          <Num label="y" value={P.y} onChange={(v) => setP({ y: v })} />
        </div>
        <Sel label="Drehung" value={String(P.rotation) as '0'} options={[['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']]} onChange={(v) => setP({ rotation: Number(v) as 0 })} />
        <Sel label="An Sockelleiste" value={P.wallFit} options={[['ausklinken', 'Pfosten ausklinken'], ['abruecken', 'Bett abrücken']]} onChange={(v) => setP({ wallFit: v })} title="Wie das Bett an Wänden mit Sockelleiste anschließt" />
        {shift && <p className="hint">Automatisch {fmtCm(Math.hypot(shift.dx, shift.dy))} von der Wand abgerückt.</p>}
        {P.type === 'deckenhoch' && <Num label="Luft zur Decke (Stellfuß)" value={P.ceilingGap} unit="mm" onChange={(v) => setP({ ceilingGap: v })} />}
      </Section>
      <Section title="Hölzer">
        <Sel label="Pfosten" value={P.postCatalogId} options={catalogOptions((t) => !t.round && t.b === t.h && t.b >= 54)} onChange={(v) => setP({ postCatalogId: v })} />
        <Sel label="Zargen / Riegel" value={P.railCatalogId} options={catalogOptions((t) => !t.round && t.h >= 94)} onChange={(v) => setP({ railCatalogId: v })} />
        <Sel label="Querträger" value={P.joistCatalogId} options={catalogOptions((t) => !t.round && t.h >= 54)} onChange={(v) => setP({ joistCatalogId: v })} />
        <Check label="Kopfbänder (Aussteifung)" value={P.braces} onChange={(v) => setP({ braces: v })} />
      </Section>
      <Section title="Liegefläche">
        <Sel<DeckType>
          label="Art"
          value={P.deck}
          options={[
            ['latten', 'Latten lose aufgelegt (belüftet)'],
            ['rollrost', 'Rollrost'],
            ['lattenrost', 'Lattenrost (Fertigteil)'],
            ['platte', 'Platte'],
            ['dielen', 'Dielen / Rauspund'],
          ]}
          onChange={(v) => setP({ deck: v, deckCatalogId: v === 'latten' ? 'geh-24x94' : v === 'platte' ? 'osb-22' : v === 'dielen' ? 'nf-kiefer-27' : v })}
        />
        {P.deck === 'latten' && (
          <>
            <Sel label="Latten" value={P.deckCatalogId} options={catalogOptions((t) => !t.round && t.b <= 44 && t.h >= 44)} onChange={(v) => setP({ deckCatalogId: v })} />
            <Num label="Abstand der Latten" value={P.slatGap} unit="mm" onChange={(v) => setP({ slatGap: v })} min={10} />
          </>
        )}
        {(P.deck === 'platte' || P.deck === 'dielen') && (
          <>
            <Sel label="Material" value={P.deckCatalogId} options={SHEETS.filter((s) => (P.deck === 'dielen' ? s.group === 'diele' : ['osb', 'osb-nf', 'dreischicht', 'multiplex', 'leimholz'].includes(s.group))).map((s) => [s.id, s.name])} onChange={(v) => setP({ deckCatalogId: v })} />
            <Num label="Max. Querträgerabstand" value={P.joistSpacing} onChange={(v) => setP({ joistSpacing: v })} min={200} />
            {P.deck === 'platte' && <p className="hint">Geschlossene Platte unter der Matratze: Belüftung einplanen (Lattenrost auflegen oder Lüftungsbohrungen).</p>}
          </>
        )}
      </Section>
      <Section title="Absturzsicherung">
        <Sel<GuardType>
          label="Geländer"
          value={P.guard}
          options={[
            ['bretter', 'Bretter (Leimholz 18×200)'],
            ['staebe', 'Senkrechte Rundstäbe'],
            ['platte', 'Vollfläche (Leimholz)'],
            ['netz', 'Netz im Rahmen'],
            ['seil', 'Seile'],
            ['keins', 'keins'],
          ]}
          onChange={(v) => setP({ guard: v })}
        />
        {P.guard !== 'keins' && (
          <>
            <Num label="Höhe über Liegefläche" value={P.guardHeight} onChange={(v) => setP({ guardHeight: v })} min={100} />
            <p className="hint">
              Reicht für Matratzen bis {fmtCm(P.guardHeight - 160)} (16 cm Überstand).
            </p>
            <div className="checks4">
              {SIDES.map((s) => (
                <Check key={s} label={s} value={P.guardSides[s]} onChange={(v) => setP({ guardSides: { ...P.guardSides, [s]: v } })} />
              ))}
            </div>
            <Sel label="Handlauf/Holme" value={P.guardCatalogId} options={catalogOptions((t) => !t.round && t.h >= 44 && t.h <= 100)} onChange={(v) => setP({ guardCatalogId: v })} />
          </>
        )}
      </Section>
      <Section title="Leiter / Treppe">
        <Sel<LadderType>
          label="Art"
          value={P.ladder}
          options={[
            ['stufen', 'Stufenleiter (flache Tritte)'],
            ['senkrecht', 'Senkrechte Sprossenleiter'],
            ['schraeg', 'Schräge Sprossenleiter'],
            ['treppe', 'Treppe (breite Stufen)'],
            ['keine', 'keine'],
          ]}
          onChange={(v) => setP({ ladder: v, ladderAngle: v === 'treppe' ? 45 : v === 'stufen' ? 70 : v === 'schraeg' ? 75 : 90 })}
        />
        {P.ladder !== 'keine' && (
          <>
            <Sel label="Seite" value={P.ladderSide} options={SIDES.map((s) => [s, s])} onChange={(v) => setP({ ladderSide: v })} />
            <Num label="Abstand von links" value={P.ladderOffset} onChange={(v) => setP({ ladderOffset: v })} min={0} />
            <Num label="Breite außen" value={P.ladderWidth} onChange={(v) => setP({ ladderWidth: v })} min={300} />
            {P.ladder !== 'senkrecht' && <Num label="Neigung" value={P.ladderAngle} unit="°" onChange={(v) => setP({ ladderAngle: Math.max(30, Math.min(89, v)) })} />}
            <Sel label="Holme / Wangen" value={P.ladderCatalogId} options={catalogOptions((t) => !t.round && t.h >= 74)} onChange={(v) => setP({ ladderCatalogId: v })} />
            {(P.ladder === 'senkrecht' || P.ladder === 'schraeg') && <Sel label="Sprossen" value={P.rungCatalogId} options={catalogOptions((t) => !!t.round)} onChange={(v) => setP({ rungCatalogId: v })} />}
            {info?.rungPitch && <p className="hint">Stufenabstand {fmtCm(info.rungPitch)} · Einstieg {fmtCm(info.accessWidth ?? 0)}</p>}
          </>
        )}
      </Section>
      {!nested && (
        <Section title="Aktionen" open={false}>
          <div className="stack">
            <button
              onClick={() => {
                const id = uid('bett')
                update((dd) => void dd.assemblies.push({ ...JSON.parse(JSON.stringify(a)), id, name: `${a.name} (Kopie)`, params: { ...a.params, x: a.params.x - 300, y: a.params.y + 300 } }))
                select({ kind: 'assembly', id })
              }}
            >
              Duplizieren
            </button>
            {a.detached.length > 0 && <button onClick={() => update((dd) => void (dd.assemblies.find((y) => y.id === a.id)!.detached = []))}>Herausgelöste Teile wieder erzeugen ({a.detached.length})</button>}
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
              In Einzelteile auflösen
            </button>
            <button className="danger" onClick={() => (update((dd) => void (dd.assemblies = dd.assemblies.filter((y) => y.id !== a.id))), select(null))}>
              Bett löschen
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
      <Section title={`▬ ${m.name ?? 'Bauteil'}`} right={<small>{free ? 'frei' : 'aus Vorlage'}</small>}>
        <p className="kv">
          {item?.name ?? m.catalogId}
          <br />
          Länge <b>{fmtCm(L)}</b>
          {item?.kind === 'stab' && L > maxLength(item) && <em className="warn"> · länger als {fmtM(maxLength(item))}</em>}
        </p>
        {(m.notches ?? []).map((n, i) => (
          <p key={i} className="kv small">
            Ausklinkung {n.reason}: {fmtCm(n.length)} × {fmtCm(n.depth)}
          </p>
        ))}
        {free ? (
          <>
            <Sel
              label="Querschnitt"
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
              <Num label="Start x" value={m.start.x} onChange={(v) => setM((x) => void (x.start.x = v))} />
              <Num label="y" value={m.start.y} onChange={(v) => setM((x) => void (x.start.y = v))} />
              <Num label="z" value={m.start.z} onChange={(v) => setM((x) => void (x.start.z = v))} />
            </div>
            <div className="pair">
              <Num label="Ende x" value={m.end.x} onChange={(v) => setM((x) => void (x.end.x = v))} />
              <Num label="y" value={m.end.y} onChange={(v) => setM((x) => void (x.end.y = v))} />
              <Num label="z" value={m.end.z} onChange={(v) => setM((x) => void (x.end.z = v))} />
            </div>
            <Num
              label="Länge"
              value={L}
              onChange={(v) =>
                setM((x) => {
                  const k = v / Math.max(1, L)
                  x.end = { x: x.start.x + (x.end.x - x.start.x) * k, y: x.start.y + (x.end.y - x.start.y) * k, z: x.start.z + (x.end.z - x.start.z) * k }
                })
              }
            />
            <div className="stack">
              <button onClick={() => setM((x) => void ([x.b, x.h] = [x.h, x.b]))} title="Querschnitt um 90° drehen (R)">
                Hochkant/flach drehen
              </button>
              <button className="danger" onClick={() => (update((dd) => void (dd.members = dd.members.filter((x) => x.id !== m.id))), select(null))}>
                Löschen
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => {
              const [asmId, key] = m.id.split(':')
              const copy = { ...m, id: uid('balken'), assemblyId: undefined, partKey: undefined, notches: undefined, name: `${m.name ?? 'Bauteil'} (gelöst)` }
              update((dd) => {
                const a = dd.assemblies.find((x) => x.id === asmId)
                if (a && !a.detached.includes(key)) a.detached.push(key)
                dd.members.push(copy)
              })
              select({ kind: 'member', id: copy.id })
            }}
            title="Dieses Teil wird nicht mehr von der Vorlage erzeugt und lässt sich frei bearbeiten"
          >
            Aus Vorlage lösen und frei bearbeiten
          </button>
        )}
      </Section>
      <Section title={`Verbindungen (${joints.length})`}>
        {joints.length === 0 && <p className="hint">Keine Berührung mit anderen Teilen.</p>}
        {joints.map((j) => {
          const other = byId.get(j.a === m.id ? j.b : j.a)
          const jt = jointType(j.typeId)
          return (
            <div key={j.key} className="joint">
              <div className="joint-head">
                <b>{JOINT_KIND_LABEL[j.kind]}</b> mit {other?.name ?? 'Bauteil'}
              </div>
              <select value={j.typeId} onChange={(e) => update((dd) => setJoint(dd, j.key, e.target.value))}>
                {typesForKind(j.kind).map((t) => (
                  <option key={t.id} value={t.id}>
                    {'●'.repeat(t.difficulty)} {t.name}
                    {t.removable ? ' · zerlegbar' : ''}
                  </option>
                ))}
                {!typesForKind(j.kind).some((t) => t.id === j.typeId) && <option value={j.typeId}>{jt?.name ?? j.typeId}</option>}
              </select>
              {jt && (
                <p className="hint">
                  {jt.note} <br />
                  <small>
                    Werkzeug: {jt.tools.join(', ')} · {jt.stiffness}
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

function setJoint(d: Project, key: string, typeId: string) {
  const j = d.joints.find((x) => x.key === key)
  if (j) j.typeId = typeId
  else d.joints.push({ key, typeId })
}

function WallObjectProps({ id }: { id: string }) {
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const select = useStore((s) => s.select)
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
      <Section title={o.name} right={estimated ? <em className="est-tag">geschätzt</em> : undefined}>
        <label className="field">
          <span>Name</span>
          <input value={o.name} onChange={(e) => setO((x) => void (x.name = e.target.value), `name-${id}`)} />
        </label>
        <Sel<WallId> label="Wand" value={o.wall} options={WALL_IDS.map((w) => [w, `Wand ${w}`])} onChange={(v) => setO((x) => void (x.wall = v))} />
        <Num label="Abstand von links" value={o.offset} onChange={(v) => setO((x) => void (x.offset = v))} title="Vom Raum aus gesehen, ab der linken Wandecke" estimated={estimated} />
        <Num label="Breite" value={o.width} onChange={(v) => setO((x) => void (x.width = v))} estimated={estimated} />
        {o.kind === 'fenster' && (
          <>
            <Num label="Brüstungshöhe" value={o.sillHeight} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.sillHeight = v)))} estimated={estimated} />
            <Num label="Höhe" value={o.height} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.height = v)))} estimated={estimated} />
            <Num label="Laibungstiefe innen" value={o.revealDepth} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.revealDepth = v)))} title="Wie tief der Rahmen in der Wand sitzt" estimated={estimated} />
            <Check label="Nische reicht bis zum Boden (Heizkörpernische)" value={o.niche.below} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.niche.below = v)))} />
            {o.niche.below && <Num label="Tiefe der Nische unten" value={o.niche.belowDepth} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.niche.belowDepth = v)))} />}
            <Sel label="Flügel" value={String(o.sashes.length) as '1'} options={[['1', '1 Flügel'], ['2', '2 Flügel'], ['3', '3 Flügel']]} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.sashes = Array.from({ length: Number(v) }, (_, i) => x.sashes[i] ?? { opening: 'drehkipp', hinge: i === 0 ? 'links' : 'rechts' }))))} />
            {o.sashes.map((s, i) => {
              const res = d.analysis.windows.find((w) => w.windowId === id && w.sashIndex === i)
              return (
                <div key={i} className="sash">
                  <div className="pair">
                    <Sel label={`Flügel ${i + 1}`} value={s.opening} options={[['drehkipp', 'Dreh-Kipp'], ['dreh', 'Dreh'], ['kipp', 'Kipp'], ['fest', 'fest']]} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.sashes[i].opening = v)))} />
                    <Sel label="Band" value={s.hinge} options={[['links', 'links'], ['rechts', 'rechts']]} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.sashes[i].hinge = v)))} />
                  </div>
                  {res && s.opening !== 'fest' && s.opening !== 'kipp' && (
                    <p className={res.maxAngle >= 90 ? 'ok' : 'warn'}>
                      Öffnet bis {res.maxAngle}°{res.blockedBy ? ` – stößt an ${res.blockedBy.label}` : ''}
                    </p>
                  )}
                  {res?.tiltFree === false && <p className="warn">Kippstellung blockiert durch {res.tiltBlockedBy?.label}</p>}
                </div>
              )
            })}
            <label className="field">
              <span>Flügel öffnen (Ansicht)</span>
              <input type="range" min={0} max={180} value={o.displayAngle} onChange={(e) => setO((x) => void (x.kind === 'fenster' && (x.displayAngle = Number(e.target.value))), `angle-${id}`)} />
            </label>
            <Check label="Innere Fensterbank" value={o.sill.enabled} onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.sill.enabled = v)))} />
            {o.sill.enabled && <Num label="Überstand Fensterbank" value={o.sill.projection} unit="mm" onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.sill.projection = v)))} />}
            <Num label="Griff steht vor" value={o.handleProjection} unit="mm" onChange={(v) => setO((x) => void (x.kind === 'fenster' && (x.handleProjection = v)))} />
          </>
        )}
        {o.kind === 'tuer' && (
          <>
            <Num label="Höhe" value={o.height} onChange={(v) => setO((x) => void (x.kind === 'tuer' && (x.height = v)))} />
            <Sel label="Band" value={o.hinge} options={[['links', 'links'], ['rechts', 'rechts']]} onChange={(v) => setO((x) => void (x.kind === 'tuer' && (x.hinge = v)))} />
            <Check label="Öffnet in den Raum" value={o.opensInward} onChange={(v) => setO((x) => void (x.kind === 'tuer' && (x.opensInward = v)))} />
            <label className="field">
              <span>Tür öffnen (Ansicht)</span>
              <input type="range" min={0} max={110} value={o.displayAngle} onChange={(e) => setO((x) => void (x.kind === 'tuer' && (x.displayAngle = Number(e.target.value))), `angle-${id}`)} />
            </label>
          </>
        )}
        {o.kind === 'heizkoerper' && (
          <>
            <Num label="Unterkante" value={o.bottom} onChange={(v) => setO((x) => void (x.kind === 'heizkoerper' && (x.bottom = v)))} />
            <Num label="Höhe" value={o.height} onChange={(v) => setO((x) => void (x.kind === 'heizkoerper' && (x.height = v)))} />
            <Num label="Tiefe" value={o.depth} unit="mm" onChange={(v) => setO((x) => void (x.kind === 'heizkoerper' && (x.depth = v)))} />
            <Num label="Abstand zur Wand" value={o.wallGap} unit="mm" onChange={(v) => setO((x) => void (x.kind === 'heizkoerper' && (x.wallGap = v)))} title="Negativ, wenn der Heizkörper in einer Nische sitzt" />
            <Num label="Freiraum oben" value={o.convectionClearance} unit="mm" onChange={(v) => setO((x) => void (x.kind === 'heizkoerper' && (x.convectionClearance = v)))} />
          </>
        )}
        {o.kind === 'steckdose' && <Num label="Höhe über Boden" value={o.bottom} onChange={(v) => setO((x) => void (x.kind === 'steckdose' && (x.bottom = v)))} />}
        <button className="danger" onClick={() => (update((dd) => void (dd.wallObjects = dd.wallObjects.filter((x) => x.id !== id))), select(null))}>
          Entfernen
        </button>
      </Section>
    </div>
  )
}

function FurnitureProps({ id }: { id: string }) {
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const select = useStore((s) => s.select)
  const f = p.furniture.find((x) => x.id === id)
  if (!f) return null
  const setF = (fn: (x: Furniture) => void) => update((dd) => fn(dd.furniture.find((y) => y.id === id)!))
  const person = f.kind.startsWith('person')
  return (
    <div className="props">
      <Section title={f.name}>
        <label className="field">
          <span>Name</span>
          <input value={f.name} onChange={(e) => update((dd) => void (dd.furniture.find((y) => y.id === id)!.name = e.target.value), `name-${id}`)} />
        </label>
        <div className="pair">
          <Num label="x" value={f.x} onChange={(v) => setF((x) => void (x.x = v))} />
          <Num label="y" value={f.y} onChange={(v) => setF((x) => void (x.y = v))} />
          <Num label="z" value={f.z} onChange={(v) => setF((x) => void (x.z = v))} />
        </div>
        {person ? (
          <Num label="Größe" value={f.sz} onChange={(v) => setF((x) => void (x.sz = v))} />
        ) : (
          <div className="pair">
            <Num label="Breite" value={f.sx} onChange={(v) => setF((x) => void (x.sx = v))} />
            <Num label="Tiefe" value={f.sy} onChange={(v) => setF((x) => void (x.sy = v))} />
            <Num label="Höhe" value={f.sz} onChange={(v) => setF((x) => void (x.sz = v))} />
          </div>
        )}
        <Sel label="Drehung" value={String(f.rotation) as '0'} options={[['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']]} onChange={(v) => setF((x) => void (x.rotation = Number(v) as 0))} />
        <button className="danger" onClick={() => (update((dd) => void (dd.furniture = dd.furniture.filter((x) => x.id !== id))), select(null))}>
          Entfernen
        </button>
      </Section>
    </div>
  )
}

export { jointKey }
