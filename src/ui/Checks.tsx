import { useState } from 'react'
import type { Severity } from '../analysis/checks'
import { selectionFor, useDerived, useStore } from '../state/store'

const ICON: Record<Severity, string> = { fehler: '⛔', warnung: '⚠️', hinweis: 'ℹ️' }

export function Checks() {
  const d = useDerived()
  const p = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const select = useStore((s) => s.select)
  const focus = useStore((s) => s.focus)
  const [open, setOpen] = useState<string | null>(null)
  const [showAck, setShowAck] = useState(false)
  const ack = new Set(p.settings.acknowledged)
  const list = d.analysis.findings.filter((f) => showAck || !ack.has(f.id))
  const count = (s: Severity) => d.analysis.findings.filter((f) => f.severity === s && !ack.has(f.id)).length
  return (
    <section className="checks">
      <header>
        <b>Prüfung</b>
        <span className="badges">
          <span className="b fehler">{count('fehler')}</span>
          <span className="b warnung">{count('warnung')}</span>
          <span className="b hinweis">{count('hinweis')}</span>
        </span>
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
              <div
                className="title"
                onClick={() => {
                  setOpen(open === f.id ? null : f.id)
                  const t = f.targets[0]
                  if (t) {
                    select(selectionFor(p, t))
                    focus(t)
                  }
                }}
              >
                <span>{ICON[f.severity]}</span>
                <span>{f.title}</span>
              </div>
              {open === f.id && (
                <div className="detail">
                  {f.detail && <p>{f.detail}</p>}
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
