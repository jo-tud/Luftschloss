import { locale, t, tr } from '../i18n'
import { useEffect, useMemo, useState } from 'react'
import type { Finding } from '../analysis/checks'
import { computeStatics, UTIL_COLOR, type StaticsResult } from '../analysis/statics'
import { TIMBER, catalogItem, timber } from '../model/catalog'
import { fmtCm } from '../model/geometry'
import type { LoftBedParams, Member, Project } from '../model/types'
import { derive, selectionFor, useDerived, useStore } from '../state/store'
import { eur } from './fields'

/** Rechnet die Statik verzögert nach jeder Änderung (damit Ziehen flüssig bleibt). */
export function StaticsRunner() {
  const project = useStore((s) => s.project)
  useEffect(() => {
    const t = setTimeout(() => {
      const d = derive(project)
      try {
        const res = computeStatics(project, d.resolved)
        useStore.setState({ statics: res, staticsFor: project })
      } catch (e) {
        console.error('Statik', e)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [project])
  return null
}

const pct = (u: number) => `${Math.round(u * 100)} %`
const STAB = 'Stabilität' as const // i18n-ok: Kategorie (Wert), angezeigt mit tr()
const num1 = (x: number) => x.toLocaleString(locale(), { maximumFractionDigits: 1 })

/** Befunde aus der Statik für die Prüfliste */
export function staticsFindings(p: Project, s: StaticsResult | null): Finding[] {
  if (!s) return []
  const d = derive(p)
  const names = new Map(d.resolved.members.map((m) => [m.id, m.name ? tr(m.name) : t('Bauteil')]))
  const out: Finding[] = []
  for (const c of s.members.values()) {
    if (c.util <= 1) continue
    out.push({ id: `statik:${c.memberId}`, severity: c.util > 1.5 ? 'fehler' : 'warnung', category: STAB, title: t('{name}: Statik {pct} ausgelastet', { name: names.get(c.memberId) ?? '', pct: pct(c.util) }), detail: t('Maßgebend: {gov}. Größeren Querschnitt wählen (Teil anklicken → „Querschnitte vergleichen“) oder zusätzlich unterstützen.', { gov: tr(c.governing) }), targets: [c.memberId] })
  }
  const jointNames = new Map(d.resolved.joints.map((j) => [j.key, `${names.get(j.a)} ↔ ${names.get(j.b)}`]))
  for (const c of s.joints.values()) {
    if (c.util <= 1) continue
    const j = d.resolved.joints.find((x) => x.key === c.key)
    out.push({ id: `statik-v:${c.key}`, severity: 'warnung', category: STAB, title: t('Verbindung {name}: {pct} ausgelastet', { name: jointNames.get(c.key) ?? '', pct: pct(c.util) }), detail: t('Kraft ca. {f} kN, Verbindung trägt grob {cap} kN (charakteristisch). Stärkere Verbindung wählen, z. B. Schlossschrauben oder Auflage.', { f: num1(c.forceKN), cap: num1(c.capacityKN) }), targets: j ? [j.a, j.b] : [], pos: j?.pos })
  }
  // Rechenhinweise (z. B. Gestell ohne Halt) als Fehler zeigen – sonst sähe man nur eine absurde Zahl
  if (s.members.size) s.warnings.forEach((w, i) => out.push({ id: `statik-warnung:${i}`, severity: 'fehler', category: STAB, title: w, targets: [] }))
  const sMax = Math.max(s.sway.x, s.sway.y)
  if (s.swayClass !== 'steif')
    out.push({ id: 'statik-wackeln', severity: s.swayClass === 'wackelt' ? 'warnung' : 'hinweis', category: STAB, title: s.swayClass === 'wackelt' ? t('Gestell wackelt ({mm} mm bei 0,5 kN Seitenlast)', { mm: sMax.toFixed(0) }) : t('Gestell gibt spürbar nach ({mm} mm bei 0,5 kN)', { mm: sMax.toFixed(0) }), detail: t('Kopfbänder oder Diagonalen einbauen, zwei Pfosten an der Wand befestigen oder steifere Verbindungen wählen. In der Statik-Ansicht „Wackeln“ abspielen.'), targets: [] })
  out.push({ id: 'statik-info', severity: 'hinweis', category: STAB, title: t('Statik-Abschätzung: höchste Ausnutzung {pct}', { pct: pct(s.maxUtil) }), detail: t('Vereinfachte Rechnung des ganzen Gestells nach Eurocode 5; die Belastung (Bett oder Spiel-Hochebene) lässt sich unter Raum → Einstellungen wählen. Keine Tragwerksplanung.'), targets: [] })
  return out
}

export function StaticsPanel() {
  const s = useStore()
  const d = useDerived()
  if (!s.staticsMode) return null
  const st = s.statics
  const names = new Map(d.resolved.members.map((m) => [m.id, m]))
  const critical = st ? [...st.members.values()].sort((a, b) => b.util - a.util).slice(0, 5) : []
  const stale = st && s.staticsFor !== s.project
  return (
    <div className="statics-panel">
      <header>
        <b>{t('Statik')}</b>
        {stale && <span className="muted"> · {t('rechnet…')}</span>}
        <button className="link" onClick={() => s.set({ staticsMode: false, wobble: false })}>
          {t('schließen')}
        </button>
      </header>
      {!st && <p className="hint">{t('Wird berechnet…')}</p>}
      {st && (
        <>
          <div className="summary">
            <div>
              <b style={{ color: UTIL_COLOR(st.maxUtil) }}>{pct(st.maxUtil)}</b>
              <span>{t('höchste Ausnutzung')}</span>
            </div>
            <div>
              <b style={{ color: st.swayClass === 'steif' ? '#2f9e5b' : st.swayClass === 'spürbar' ? '#e0a400' : '#d64545' }}>{num1(Math.max(st.sway.x, st.sway.y))} mm</b>
              <span>{t('Wackeln ({cls})', { cls: tr(st.swayClass) })}</span>
            </div>
          </div>
          <label className="field">
            <span>{t('Verformung zeigen')}</span>
            <select value={s.staticsCase} onChange={(e) => s.set({ staticsCase: e.target.value as typeof s.staticsCase })}>
              <option value="gq">{t('Liegen, Eigengewicht')}</option>
              <option value="jump">{t('Toben, Springen (≈ 200 kg)')}</option>
              <option value="hx">{t('Seitlich schieben, längs (≈ 50 kg)')}</option>
              <option value="hy">{t('Seitlich schieben, quer (≈ 50 kg)')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('Verformung {n}-fach vergrößert', { n: s.staticsScale })}</span>
            <input type="range" min={1} max={100} value={s.staticsScale} onChange={(e) => s.set({ staticsScale: Number(e.target.value) })} />
          </label>
          <button className={s.wobble ? 'on' : ''} onClick={() => s.set({ wobble: !s.wobble, staticsCase: s.staticsCase === 'gq' || s.staticsCase === 'jump' ? (st.sway.y > st.sway.x ? 'hy' : 'hx') : s.staticsCase })}>
            {s.wobble ? `⏸ ${t('Wackeln stoppen')}` : `▶ ${t('Wackeln abspielen')}`}
          </button>
          <div className="legend">
            <span style={{ background: '#2f9e5b' }} /> ≤ 60 % <span style={{ background: '#e0a400' }} /> ≤ 100 % <span style={{ background: '#d64545' }} /> &gt; 100 %
          </div>
          <ul className="crit">
            {critical.map((c) => (
              <li
                key={c.memberId}
                onClick={() => {
                  s.select(selectionFor(s.project, c.memberId))
                  s.focus(c.memberId)
                }}
              >
                <span className="dot" style={{ background: UTIL_COLOR(c.util) }} />
                {tr(names.get(c.memberId)?.name ?? t('Bauteil'))} <b>{pct(c.util)}</b>
                <small>{tr(c.governing)}</small>
              </li>
            ))}
          </ul>
          <p className="hint">{t('Vereinfachte Abschätzung für das ganze Gestell nach den Holzbau-Regeln (Eurocode 5). Ersetzt keine Tragwerksplanung.')}</p>
        </>
      )}
    </div>
  )
}

/** Auslastung des gewählten Stabs und Vergleich anderer Querschnitte */
export function MemberStatics({ m }: { m: Member }) {
  const st = useStore((s) => s.statics)
  const project = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const d = useDerived()
  const [compare, setCompare] = useState(false)
  const c = st?.members.get(m.id)
  const options = useMemo(() => {
    if (!compare) return []
    const cur = catalogItem(m.catalogId)
    if (!cur || cur.kind !== 'stab') return []
    const cands = TIMBER.filter((t) => !t.round && t.id !== cur.id && Math.abs(t.b * t.h - cur.b * cur.h) / (cur.b * cur.h) < 1.6)
      .sort((a, b) => a.b * a.h - b.b * b.h)
      .slice(0, 8)
    return cands.map((t) => {
      const flat = m.b > m.h
      const [b, h] = flat ? [Math.max(t.b, t.h), Math.min(t.b, t.h)] : [t.b, t.h]
      const res = computeStatics(project, d.resolved, { memberId: m.id, b, h, catalogId: t.id })
      return { t, util: res.members.get(m.id)?.util ?? 0 }
    })
  }, [compare, m, project, d])
  if (!c) return null
  const apply = (id: string) => {
    if (!m.assemblyId) {
      const t = timber(id)
      update((dd) => {
        const x = dd.members.find((y) => y.id === m.id)
        if (x) Object.assign(x, { catalogId: id, b: m.b > m.h ? Math.max(t.b, t.h) : t.b, h: m.b > m.h ? Math.min(t.b, t.h) : t.h })
      })
      return
    }
    const key: keyof LoftBedParams | undefined = m.role === 'pfosten' ? 'postCatalogId' : m.role === 'zarge' || m.role === 'wandriegel' ? 'railCatalogId' : m.role === 'quertraeger' ? 'joistCatalogId' : m.role === 'leiste' ? 'deckCatalogId' : m.role === 'holm' || m.role === 'strebe' ? 'guardCatalogId' : undefined
    if (!key) return
    update((dd) => {
      const a = dd.assemblies.find((y) => y.id === m.assemblyId)
      if (a) (a.params as unknown as Record<string, unknown>)[key] = id
    })
  }
  return (
    <div className="member-statics">
      <div className="bars">
        {(
          [
            [t('Biegung/Normalkraft'), c.bending],
            [t('Schub'), c.shear],
            [t('Durchbiegung'), c.deflection],
          ] as const
        ).map(([l, u]) => (
          <div key={l} className="bar-row">
            <span>{l}</span>
            <div className="ubar">
              <div style={{ width: `${Math.min(100, u * 100)}%`, background: UTIL_COLOR(u) }} />
            </div>
            <b>{pct(u)}</b>
          </div>
        ))}
      </div>
      {c.span > 0 && <p className="hint">{t('Durchbiegung im Endzustand {w} mm auf {span} (Grenze L/200).', { w: num1(c.w), span: fmtCm(c.span, 0) })}</p>}
      {!compare ? (
        <button onClick={() => setCompare(true)}>{t('Querschnitte vergleichen')}</button>
      ) : (
        <table className="compare">
          <tbody>
            {options.map((o) => (
              <tr key={o.t.id}>
                <td>{tr(o.t.name).replace(/, (gehobelt|planed)\b/i, '')}</td>
                <td style={{ color: UTIL_COLOR(o.util) }}>{pct(o.util)}</td>
                <td>{eur(o.t.pricePerM)}/m</td>
                <td>
                  <button className="link" onClick={() => apply(o.t.id)}>
                    {t('nehmen')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {m.assemblyId && compare && <p className="hint">{t('Gilt für alle gleichartigen Teile der Vorlage.')}</p>}
    </div>
  )
}
