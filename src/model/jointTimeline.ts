import type { GuideAnim, GuideStep } from './jointGuide'

/**
 * Ablauf im Verbindungsdetail: Die Arbeitsschritte der Anleitung werden nacheinander gezeigt; Schritte
 * mit Bewegung setzen Leiste bzw. Balkenschuh an, fügen das helle Teil oder bringen Schrauben, Bolzen
 * und Holznägel – immer erst, wenn das Teil sitzt.
 */
export interface Seg {
  step: number
  anim?: GuideAnim
  /** befestigen: welcher Teil der Befestigungsmittel */
  chunk: number
  start: number
  dur: number
}

const DUR: Record<GuideAnim | 'lesen', number> = { lesen: 1.4, vorher: 1.8, fuegen: 2.2, befestigen: 2 }
export const HOLD = 2.5

export function timeline(steps: GuideStep[]): { segs: Seg[]; total: number; chunks: number } {
  const segs: Seg[] = []
  let t = 0
  let chunks = 0
  steps.forEach((s, i) => {
    if (!s.at.length) {
      segs.push({ step: i, chunk: -1, start: t, dur: DUR.lesen })
      t += DUR.lesen
    }
    for (const a of s.at) {
      segs.push({ step: i, anim: a, chunk: a === 'befestigen' ? chunks++ : -1, start: t, dur: DUR[a] })
      t += DUR[a]
    }
  })
  return { segs, total: t + HOLD, chunks }
}

/** Fortschritt der Bewegungen zur Zeit t (0 = noch nicht, 1 = fertig) */
export function progressAt(segs: Seg[], t: number): { step: number; vorher: number; fuegen: number; chunk: number[] } {
  const p = { step: 0, vorher: 0, fuegen: 0, chunk: [] as number[] }
  // ohne eigenen Schritt gelten Leiste und Fügen als von Anfang an erledigt
  if (!segs.some((s) => s.anim === 'vorher')) p.vorher = 1
  if (!segs.some((s) => s.anim === 'fuegen')) p.fuegen = 1
  for (const s of segs) {
    const k = Math.min(1, Math.max(0, (t - s.start) / s.dur))
    if (t >= s.start) p.step = s.step
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
    if (s.anim === 'vorher') p.vorher = Math.max(p.vorher, e)
    if (s.anim === 'fuegen') p.fuegen = Math.max(p.fuegen, e)
    if (s.anim === 'befestigen') p.chunk[s.chunk] = e
  }
  return p
}

export function stepTimes(steps: GuideStep[], i: number): [number, number] {
  const { segs } = timeline(steps)
  const own = segs.filter((s) => s.step === i)
  if (!own.length) return [0, 0]
  return [own[0].start, own[own.length - 1].start + own[own.length - 1].dur]
}

