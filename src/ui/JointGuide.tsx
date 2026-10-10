import { t, tr } from '../i18n'
import { JOINT_GUIDE } from '../model/jointGuide'
import { assemblyDir, CARPENTRY, jointFrame } from '../model/joinery'
import type { DetectedJoint } from '../model/resolve'
import type { Member } from '../model/types'

/** Wie das Teil eingesetzt wird – nur bei Verbindungen, die sich nur in einer Richtung fügen lassen */
export function assemblyHint(j: DetectedJoint, byId: Map<string, Member>): string | undefined {
  if (!CARPENTRY.has(j.typeId) && j.typeId !== 'balkenschuh') return undefined
  const a = byId.get(j.a)
  const b = byId.get(j.b)
  const F = a && b ? jointFrame(j, a, b) : undefined
  if (!F) return undefined
  const d = assemblyDir(j, F)
  const along = Math.abs(d.x * F.into.x + d.y * F.into.y + d.z * F.into.z) > 0.9
  if (d.z > 0.7) return t('Fügen: das helle Teil von oben einlegen.')
  if (d.z < -0.7) return t('Fügen: das helle Teil von unten einsetzen.')
  if (along) return t('Fügen: das helle Teil in Längsrichtung einstecken.')
  if (j.typeId === 'ueberblattung' || j.typeId === 'schwalbenschwanz') return t('Fügen: das helle Teil von der Seite einlegen.')
  return t('Fügen: das helle Teil von der Seite einschieben.')
}

/** Erklärung und Arbeitsschritte einer Verbindungsart */
export function JointGuide({ typeId, hint }: { typeId: string; hint?: string }) {
  const g = JOINT_GUIDE[typeId]
  if (!g) return null
  return (
    <div className="joint-guide">
      <p>
        <b>{t('So funktioniert es:')}</b> {tr(g.how)}
      </p>
      {hint && <p className="joint-hint">{hint}</p>}
      <b>{t('So wird es gemacht:')}</b>
      <ol>
        {g.steps.map((s, i) => (
          <li key={i}>{tr(s)}</li>
        ))}
      </ol>
    </div>
  )
}
