import { t, tr } from '../i18n'
import { createGroup, detectDeck, groupParts, ungroup } from '../model/groups'
import type { BedGroup } from '../model/types'
import { fmtCm } from '../model/geometry'
import { useStore } from '../state/store'
import { Num, Section } from './fields'
import { deleteSelection } from './actions'
import { Crosshair, Ico, Trash2, Ungroup } from './icons'
import { FindingsHint, ObjectHeader } from './ObjectHeader'

/** Mehrere freie Teile ausgewählt (Shift-Klick) */
export function MultiProps() {
  const multi = useStore((s) => s.multi)
  const update = useStore((s) => s.update)
  return (
    <div className="props">
      <Section title={t('{n} Teile ausgewählt', { n: multi.length })}>
        <p className="hint">{t('Shift-Klick nimmt weitere Teile hinzu oder wieder heraus, Shift + Ziehen wählt alle Teile im Rahmen. Ziehen verschiebt alle gemeinsam.')}</p>
        <div className="stack">
          <button
            className="primary"
            onClick={() => {
              let id = ''
              update((d) => void (id = createGroup(d, multi)))
              useStore.getState().select({ kind: 'group', id })
            }}
            title={t('Die Teile als ein Bett behandeln: gemeinsam auswählen, verschieben und prüfen')}
          >
            🛏 {t('Als Bett zusammenfassen')}
          </button>
        </div>
      </Section>
    </div>
  )
}

/** Selbst konstruiertes Bett */
export function GroupProps({ id, nested }: { id: string; nested?: boolean }) {
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const g = p.groups.find((x) => x.id === id)
  if (!g) return null
  const parts = groupParts(p, id)
  return (
    <>
      {!nested && (
        <>
          <ObjectHeader
            icon="🛏"
            title={tr(g.name)}
            sub={t('eigene Konstruktion · {n} Teile', { n: parts.length })}
            actions={[
              { icon: <Ico i={Crosshair} />, label: t('Heranholen (F)'), onClick: () => useStore.getState().focus(parts[0]) },
              {
                icon: <Ico i={Ungroup} />,
                label: t('Zusammenfassung lösen'),
                more: true,
                onClick: () => {
                  let ids: string[] = []
                  update((dd) => void (ids = ungroup(dd, id)))
                  useStore.getState().select(null)
                  if (ids.length > 1) useStore.setState({ multi: ids, selection: { kind: 'member', id: ids[0] } })
                },
              },
              { icon: <Ico i={Trash2} />, label: t('Bett löschen'), danger: true, more: true, onClick: () => deleteSelection({ kind: 'group', id }) },
            ]}
          />
          <FindingsHint ids={[id, ...parts]} prefix={`${id}:`} />
        </>
      )}
    <Section title={nested ? `🛏 ${tr(g.name)}` : t('Name')} id={nested ? 'teil-eigenbett' : 'eigenbett'} right={nested ? <small>{t('eigene Konstruktion')}</small> : undefined}>
      <label className="field">
        <span>{t('Name')}</span>
        <input value={tr(g.name)} onChange={(e) => update((dd) => void (dd.groups.find((x) => x.id === id)!.name = e.target.value), `name-${id}`)} />
      </label>
    </Section>
    <Section title={t('Liegefläche')} id={nested ? 'teil-eigenbett-deck' : 'eigenbett-deck'} summary={g.deck ? `${fmtCm(g.deck.length, 0)} × ${fmtCm(g.deck.width, 0)}` : t('fehlt')}>
      <DeckProps g={g} />
    </Section>
    </>
  )
}

/** Liegefläche des eigenen Betts: liefert die Last für die Statik und den Bezug für die Prüfungen */
function DeckProps({ g }: { g: BedGroup }) {
  const update = useStore((s) => s.update)
  const D = g.deck
  const detect = () =>
    update((dd) => {
      const x = dd.groups.find((y) => y.id === g.id)
      if (x) x.deck = detectDeck(dd, g.id)
    })
  const setD = (patch: Partial<NonNullable<BedGroup['deck']>>) =>
    update((dd) => {
      const x = dd.groups.find((y) => y.id === g.id)
      if (x?.deck) Object.assign(x.deck, patch)
    }, `deck-${g.id}-${Object.keys(patch)[0]}`)
  return (
    <>
      {!D && (
        <>
          <p className="hint">{t('Noch keine Liegefläche: ohne sie fehlen die Lasten für die Statik und die Prüfungen für Kopfraum und Absturzsicherung.')}</p>
          <button className="primary" onClick={detect}>
            {t('Liegefläche erkennen')}
          </button>
        </>
      )}
      {D && (
        <>
          <Num label={t('Länge')} value={D.length} onChange={(v) => setD({ length: Math.max(500, v) })} />
          <Num label={t('Breite')} value={D.width} onChange={(v) => setD({ width: Math.max(500, v) })} />
          <Num label={t('Höhe (Unterkante Matratze)')} value={D.z} onChange={(v) => setD({ z: Math.max(0, v) })} />
          <Num label={t('Matratzendicke')} value={D.thickness} onChange={(v) => setD({ thickness: Math.max(20, v) })} />
          <Num label={t('Lage x')} value={D.x} onChange={(v) => setD({ x: v })} title={t('Ecke der Matratze, gemessen von Wand B')} />
          <Num label={t('Lage y')} value={D.y} onChange={(v) => setD({ y: v })} title={t('Ecke der Matratze, gemessen von Wand A')} />
          <div className="stack">
            <button onClick={detect}>{t('Neu erkennen')}</button>
            <button onClick={() => update((dd) => void delete dd.groups.find((y) => y.id === g.id)!.deck)}>{t('Liegefläche entfernen')}</button>
          </div>
        </>
      )}
    </>
  )
}
