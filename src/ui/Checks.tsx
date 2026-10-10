import { useState } from 'react'
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
  return (
    <span className="badges" aria-label={`${c.fehler} Fehler, ${c.warnung} Warnungen, ${c.hinweis} Hinweise`} title={`${c.fehler} Fehler, ${c.warnung} Warnungen, ${c.hinweis} Hinweise`}>
      <span className="b fehler">⛔ {c.fehler}</span>
      <span className="b warnung">⚠ {c.warnung}</span>
      <span className="b hinweis">ℹ {c.hinweis}</span>
    </span>
  )
}

const ESTIMATED_LABEL: Record<string, string> = {
  'room.height': 'Raumhöhe',
  'room.ceiling': 'Deckenart',
  'room.cornice': 'Stuckleiste',
  'room.rosettes': 'Deckenrosette und Lampe',
  'room.skirting': 'Sockelleiste',
}

export function Checks() {
  const d = useDerived()
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const select = useStore((s) => s.select)
  const focus = useStore((s) => s.focus)
  const [open, setOpen] = useState<string | null>(null)
  const [showAck, setShowAck] = useState(false)
  const statics = useStore((s) => s.statics)
  const ack = new Set(p.settings.acknowledged)
  const order: Record<Severity, number> = { fehler: 0, warnung: 1, hinweis: 2 }
  const all = [...d.analysis.findings, ...staticsFindings(p, statics)].sort((a, b) => Number(ack.has(a.id)) - Number(ack.has(b.id)) || order[a.severity] - order[b.severity])
  const list = all.filter((f) => showAck || !ack.has(f.id))
  const count = (s: Severity) => all.filter((f) => f.severity === s && !ack.has(f.id)).length
  return (
    <section className="checks">
      <header>
        <b>Prüfung</b>
        <CountBadges c={{ fehler: count('fehler'), warnung: count('warnung'), hinweis: count('hinweis') }} />
        <label className="check small">
          <input type="checkbox" checked={showAck} onChange={(e) => setShowAck(e.target.checked)} />
          <span>quittierte zeigen</span>
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
                  }
                }}
              >
                <span aria-hidden>{ICON[f.severity]}</span>
                <span>{f.title}</span>
              </button>
              {open === f.id && (
                <div className="detail">
                  {f.detail && <p>{f.detail}</p>}
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
                              {obj ? `${obj.name} → Ausstattung` : `${ESTIMATED_LABEL[path] ?? path} → Raum`}
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
                    <span>Zur Kenntnis genommen (ausblenden)</span>
                  </label>
                </div>
              )}
            </li>
          )
        })}
        {!list.length && <li className="empty">Keine offenen Punkte.</li>}
      </ul>
    </section>
  )
}
