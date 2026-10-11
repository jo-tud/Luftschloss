import { t, tk, tr, trv } from '../i18n'
import { DRILL_HELP } from '../model/jointGuide'
import type { JointPlan } from '../model/jointPlan'
import { catalogItem } from '../model/catalog'
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

/** Platzhalter einer Anleitung für die Anzeige: Bauteilnamen übersetzen */
export function guideVars(plan: JointPlan): Record<string, string | number> {
  return { ...plan.vars, E: plan.labels?.E ?? tr(String(plan.vars.E ?? '')), T: plan.labels?.T ?? tr(String(plan.vars.T ?? '')) }
}

const LEVEL = [tk('leicht'), tk('mittel'), tk('schwer')]
const DRILL = [tk('kaum Bohrungen'), tk('rechtwinklig bohren'), tk('Bohrungen müssen sich treffen')]

/** Aufwand: Schwierigkeit, Zeit, Anspruch beim Bohren, was es schwer macht */
export function JointEffortInfo({ plan }: { plan: JointPlan }) {
  const e = plan.effort
  return (
    <p className="joint-effort">
      <b>{t('Schwierigkeit:')}</b> {tr(LEVEL[e.difficulty - 1])} ({e.difficulty}/3) · <b>{t('Zeit:')}</b> {t('ca. {a} min (Anfänger), {b} min (geübt)', { a: e.minutes[0], b: e.minutes[1] })} · <b>{t('Bohren:')}</b> {tr(DRILL[e.drill])}
      <br />
      <span className="muted">{tr(e.hard)}</span>
    </p>
  )
}

/** Bohren und Anreißen ohne Bohrständer (aufklappbar) */
export function DrillHelp({ open }: { open?: boolean }) {
  return (
    <details className="drill-help" open={open}>
      <summary>{t('Gerade bohren ohne Bohrständer')}</summary>
      <ul>
        {DRILL_HELP.map((x, i) => (
          <li key={i}>{tr(x)}</li>
        ))}
      </ul>
    </details>
  )
}

/**
 * Erklärung, Arbeitsschritte mit den Maßen dieser Verbindung und typische Fehler. Mit onPick
 * (Verbindungsdetail) sind die Schritte anklickbar und spielen den Schritt in der 3D-Ansicht ab;
 * current ist hervorgehoben.
 */
export function JointGuide({ plan, hint, current, onPick }: { plan: JointPlan; hint?: string; current?: number; onPick?: (i: number) => void }) {
  const g = plan.guide
  const vars = guideVars(plan)
  return (
    <div className="joint-guide">
      <p>
        <b>{t('So funktioniert es:')}</b> {tr(g.how)}
      </p>
      {hint && <p className="joint-hint">{hint}</p>}
      <b>{t('So wird es gemacht:')}</b>
      <ol>
        {g.steps.map((s, i) => (
          <li key={i} className={i === current ? 'current' : undefined}>
            {onPick ? (
              <button className="step" onClick={() => onPick(i)} aria-current={i === current ? 'step' : undefined}>
                {trv(s.t, vars)}
              </button>
            ) : (
              trv(s.t, vars)
            )}
          </li>
        ))}
      </ol>
      {g.mistakes.length > 0 && (
        <>
          <b>{t('Typische Fehler:')}</b>
          <ul className="joint-mistakes">
            {g.mistakes.map((m, i) => (
              <li key={i}>{tr(m)}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** Material dieser Verbindung, gezählt aus den Befestigungsmitteln (wie in der Einkaufsliste) */
export function JointMaterial({ plan }: { plan: JointPlan }) {
  const counts = new Map<string, number>()
  for (const f of plan.fasteners) if (f.item) counts.set(f.item, (counts.get(f.item) ?? 0) + 1)
  const list = counts.size ? [...counts].map(([id, qty]) => ({ id, qty })) : plan.type.hardware
  if (!list.length) return null
  return (
    <p>
      <b>{t('Material je Verbindung:')}</b> {list.map((h) => `${h.qty} × ${tr(catalogItem(h.id)?.name ?? h.id)}`).join(', ')}
    </p>
  )
}
