import { useState } from 'react'
import { t, tk, tn, tr } from '../i18n'
import type { Severity } from '../analysis/checks'
import { selectionFor, useDerived, useStore } from '../state/store'
import { staticsFindings } from './Statics'

const ICON: Record<Severity, string> = { fehler: '⛔', warnung: '⚠️', hinweis: 'ℹ️' }

/** Offene (nicht quittierte) Befunde je Schwere – auch für die Werkzeugleiste auf dem Tablet */
export function useCheckCounts(): Record<Severity, number> {
  const d = useDerived()
  const p = useStore((s) => s.project)
  const statics = useStore((s) => s.statics)
  const ack = new Set(p.settings.acknowledged)
  const all = [...d.analysis.findings, ...staticsFindings(p, statics)].filter((f) => !ack.has(f.id))
  return { fehler: all.filter((f) => f.severity === 'fehler').length, warnung: all.filter((f) => f.severity === 'warnung').length, hinweis: all.filter((f) => f.severity === 'hinweis').length }
}

export function CountBadges({ c }: { c: Record<Severity, number> }) {
  const label = [tn(c.fehler, tk('1 Fehler'), tk('{n} Fehler')), tn(c.warnung, tk('1 Warnung'), tk('{n} Warnungen')), tn(c.hinweis, tk('1 Hinweis'), tk('{n} Hinweise'))].join(', ')
  return (
    <span className="badges" aria-label={label} title={label}>
      <span className="b fehler">⛔ {c.fehler}</span>
      <span className="b warnung">⚠ {c.warnung}</span>
      <span className="b hinweis">ℹ {c.hinweis}</span>
    </span>
  )
}

const ESTIMATED_LABEL: Record<string, string> = {
  'room.height': tk('Raumhöhe'),
  'room.ceiling': tk('Deckenart'),
  'room.cornice': tk('Stuckleiste'),
  'room.rosettes': tk('Deckenrosette und Lampe'),
  'room.skirting': tk('Sockelleiste'),
}

export function Checks() {
  const d = useDerived()
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const select = useStore((s) => s.select)
  const focus = useStore((s) => s.focus)
  const [open, setOpen] = useState<string | null>(null)
  const [showAck, setShowAck] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const statics = useStore((s) => s.statics)
  const ack = new Set(p.settings.acknowledged)
  const order: Record<Severity, number> = { fehler: 0, warnung: 1, hinweis: 2 }
  const all = [...d.analysis.findings, ...staticsFindings(p, statics)].sort((a, b) => Number(ack.has(a.id)) - Number(ack.has(b.id)) || order[a.severity] - order[b.severity])
  const visible = all.filter((f) => showAck || !ack.has(f.id))
  // Hinweise zusammengeklappt, damit Fehler und Warnungen auffallen
  const notes = visible.filter((f) => f.severity === 'hinweis')
  const list = showNotes ? visible : visible.filter((f) => f.severity !== 'hinweis')
  return (
    <section className="checks">
      <header>
        <label className="check small">
          <input type="checkbox" checked={showAck} onChange={(e) => setShowAck(e.target.checked)} />
          <span>{t('quittierte zeigen')}</span>
        </label>
      </header>
      <ul>
        {list.map((f) => {
          const isAck = ack.has(f.id)
          return (
            <li key={f.id} className={`${f.severity}${isAck ? ' ack' : ''}`}>
              <button
                className="title"
                aria-expanded={open === f.id}
                onClick={() => {
                  setOpen(open === f.id ? null : f.id)
                  const t = f.targets[0]
                  if (t) {
                    select(selectionFor(p, t))
                    focus(t)
                    // in der Prüfliste bleiben
                    useStore.setState({ rightTab: 'checks' })
                  }
                }}
              >
                <span aria-hidden>{ICON[f.severity]}</span>
                <span>{tr(f.title)}</span>
              </button>
              {open === f.id && (
                <div className="detail">
                  {f.detail && <p>{tr(f.detail)}</p>}
                  {f.id === 'geschaetzt' && (
                    <ul className="est-list">
                      {p.estimated.map((path) => {
                        const objId = path.startsWith('wallObjects.') ? path.slice('wallObjects.'.length) : undefined
                        const obj = objId ? p.wallObjects.find((o) => o.id === objId) : undefined
                        return (
                          <li key={path}>
                            <button
                              className="link"
                              onClick={() => {
                                if (obj) {
                                  useStore.getState().set({ sidebar: 'ausstattung' })
                                  select({ kind: 'wallObject', id: obj.id })
                                  focus(obj.id)
                                } else {
                                  select(null)
                                  useStore.getState().set({ sidebar: 'raum', leftOpen: true, rightOpen: false })
                                }
                              }}
                            >
                              {obj ? t('{name} → Ausstattung', { name: tr(obj.name) }) : t('{name} → Raum', { name: tr(ESTIMATED_LABEL[path] ?? path) })}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  <label className="check small">
                    <input
                      type="checkbox"
                      checked={isAck}
                      onChange={(e) =>
                        update((dd) => {
                          dd.settings.acknowledged = e.target.checked ? [...dd.settings.acknowledged, f.id] : dd.settings.acknowledged.filter((x) => x !== f.id)
                        })
                      }
                    />
                    <span>{t('Zur Kenntnis genommen (ausblenden)')}</span>
                  </label>
                </div>
              )}
            </li>
          )
        })}
        {!visible.length && <li className="empty">{t('Keine offenen Punkte.')}</li>}
        {notes.length > 0 && (
          <li className="notes-toggle">
            <button className="title" aria-expanded={showNotes} onClick={() => setShowNotes(!showNotes)}>
              <span aria-hidden>{showNotes ? '▾' : '▸'}</span>
              <span>{showNotes ? t('Hinweise ausblenden') : tn(notes.length, tk('1 Hinweis anzeigen'), tk('{n} Hinweise anzeigen'))}</span>
            </button>
          </li>
        )}
      </ul>
    </section>
  )
}
