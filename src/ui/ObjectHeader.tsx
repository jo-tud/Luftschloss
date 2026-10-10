import { useEffect, useRef, useState, type ReactNode } from 'react'
import { t, tr } from '../i18n'
import { useDerived, useStore } from '../state/store'
import { staticsFindings } from './Statics'

export interface HeaderAction {
  icon?: string
  label: string
  onClick: () => void
  danger?: boolean
  /** nur im ⋯-Menü */
  more?: boolean
}

/**
 * Kopfzeile der Eigenschaften: was ausgewählt ist und was man damit tun kann. Häufige Aktionen als
 * Symbolknöpfe, seltene und zerstörende im ⋯-Menü.
 */
export function ObjectHeader({ icon, title, sub, actions }: { icon: string; title: string; sub?: ReactNode; actions: HeaderAction[] }) {
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setMenu(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])
  const main = actions.filter((a) => !a.more)
  const more = actions.filter((a) => a.more)
  return (
    <div className="obj-head">
      <span className="obj-icon" aria-hidden>
        {icon}
      </span>
      <div className="obj-title">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </div>
      <div className="obj-actions" ref={ref}>
        {main.map((a) => (
          <button key={a.label} className={`icon${a.danger ? ' danger' : ''}`} onClick={a.onClick} title={a.label} aria-label={a.label}>
            {a.icon}
          </button>
        ))}
        {more.length > 0 && (
          <>
            <button className="icon" onClick={() => setMenu(!menu)} aria-expanded={menu} title={t('Weitere Aktionen')} aria-label={t('Weitere Aktionen')}>
              ⋯
            </button>
            {menu && (
              <div className="obj-menu" role="menu">
                {more.map((a) => (
                  <button
                    key={a.label}
                    role="menuitem"
                    className={a.danger ? 'danger' : ''}
                    onClick={() => {
                      setMenu(false)
                      a.onClick()
                    }}
                  >
                    {a.icon && <span aria-hidden>{a.icon}</span>} {a.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Offene Fehler und Warnungen, die dieses Objekt (oder seine Teile) betreffen – führt zur Prüfliste */
export function FindingsHint({ ids, prefix }: { ids: string[]; prefix?: string }) {
  const d = useDerived()
  const p = useStore((s) => s.project)
  const statics = useStore((s) => s.statics)
  const ack = new Set(p.settings.acknowledged)
  const mine = [...d.analysis.findings, ...staticsFindings(p, statics)].filter(
    (f) => f.severity !== 'hinweis' && !ack.has(f.id) && f.targets.some((x) => ids.includes(x) || (prefix !== undefined && x.startsWith(prefix))),
  )
  if (!mine.length) return null
  const err = mine.some((f) => f.severity === 'fehler')
  return (
    <button className={`findings-hint${err ? ' err' : ''}`} onClick={() => useStore.setState({ rightTab: 'checks' })} title={mine.map((f) => tr(f.title)).join('\n')}>
      {err ? '⛔' : '⚠'} {mine.length === 1 ? tr(mine[0].title) : t('{n} Befunde dazu', { n: mine.length })} <span aria-hidden>→</span>
    </button>
  )
}
