import { t, tr } from '../i18n'
import { createGroup, groupParts, ungroup } from '../model/groups'
import { useStore } from '../state/store'
import { Section } from './fields'

/** Mehrere freie Teile ausgewählt (Shift-Klick) */
export function MultiProps() {
  const multi = useStore((s) => s.multi)
  const update = useStore((s) => s.update)
  return (
    <div className="props">
      <Section title={t('{n} Teile ausgewählt', { n: multi.length })}>
        <p className="hint">{t('Shift-Klick nimmt weitere Teile hinzu oder wieder heraus. Ziehen verschiebt alle gemeinsam.')}</p>
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
    <Section title={`🛏 ${tr(g.name)}`} right={<small>{t('eigene Konstruktion')}</small>} open={!nested}>
      <label className="field">
        <span>{t('Name')}</span>
        <input value={tr(g.name)} onChange={(e) => update((dd) => void (dd.groups.find((x) => x.id === id)!.name = e.target.value), `name-${id}`)} />
      </label>
      <p className="kv">{t('{n} Teile', { n: parts.length })}</p>
      <div className="stack">
        <button onClick={() => useStore.getState().focus(parts[0])}>{t('Heranholen')}</button>
        <button
          onClick={() => {
            let ids: string[] = []
            update((dd) => void (ids = ungroup(dd, id)))
            useStore.getState().select(null)
            if (ids.length > 1) useStore.setState({ multi: ids, selection: { kind: 'member', id: ids[0] } })
          }}
          title={t('Die Teile werden wieder einzelne freie Teile')}
        >
          {t('Zusammenfassung lösen')}
        </button>
      </div>
    </Section>
  )
}
