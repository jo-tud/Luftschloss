import { t, tr } from '../i18n'
import { jointOptions, jointType } from '../model/joints'
import type { DetectedJoint } from '../model/resolve'
import type { Member } from '../model/types'

/**
 * Auswahl der Verbindungsart: nur Arten, die sich für genau diese zwei Bauteile herstellen und
 * fügen lassen. Eine schon gewählte, unpassende Art bleibt sichtbar und wird begründet.
 */
export function JointTypeSelect({ j, byId, onChange }: { j: DetectedJoint; byId: Map<string, Member>; onChange: (typeId: string) => void }) {
  const a = byId.get(j.a)
  const b = byId.get(j.b)
  if (!a || !b) return null
  const opts = jointOptions({ kind: j.kind, a, b, ending: j.ending ? byId.get(j.ending) : undefined })
  const current = opts.find((o) => o.type.id === j.typeId)
  const jt = jointType(j.typeId)
  const label = (id: string) => {
    const ty = jointType(id)
    if (!ty) return id
    return `${'●'.repeat(ty.difficulty)} ${tr(ty.name)}${ty.removable ? ` · ${t('zerlegbar')}` : ''}`
  }
  return (
    <>
      <select value={j.typeId} onChange={(e) => onChange(e.target.value)}>
        {opts
          .filter((o) => !o.reason)
          .map((o) => (
            <option key={o.type.id} value={o.type.id}>
              {label(o.type.id)}
            </option>
          ))}
        {(!current || current.reason) && <option value={j.typeId}>{t('{name} (nicht empfohlen)', { name: jt ? label(j.typeId) : j.typeId })}</option>}
      </select>
      {current?.reason && <p className="hint warn">{tr(current.reason)}</p>}
    </>
  )
}
