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

/** Befunde aus der Statik für die Prüfliste */
export function staticsFindings(p: Project, s: StaticsResult | null): Finding[] {
  if (!s) return []
  const d = derive(p)
  const names = new Map(d.resolved.members.map((m) => [m.id, m.name ?? 'Bauteil']))
  const out: Finding[] = []
  for (const c of s.members.values()) {
    if (c.util <= 1) continue
    out.push({ id: `statik:${c.memberId}`, severity: c.util > 1.5 ? 'fehler' : 'warnung', category: 'Stabilität', title: `${names.get(c.memberId)}: Statik ${pct(c.util)} ausgelastet`, detail: `Maßgebend: ${c.governing}. Größeren Querschnitt wählen (Teil anklicken → „Querschnitte vergleichen“) oder zusätzlich unterstützen.`, targets: [c.memberId] })
  }
  const jointNames = new Map(d.resolved.joints.map((j) => [j.key, `${names.get(j.a)} ↔ ${names.get(j.b)}`]))
  for (const c of s.joints.values()) {
    if (c.util <= 1) continue
    const j = d.resolved.joints.find((x) => x.key === c.key)
    out.push({ id: `statik-v:${c.key}`, severity: 'warnung', category: 'Stabilität', title: `Verbindung ${jointNames.get(c.key)}: ${pct(c.util)} ausgelastet`, detail: `Kraft ca. ${c.forceKN.toFixed(1)} kN, Verbindung trägt grob ${c.capacityKN} kN (charakteristisch). Stärkere Verbindung wählen, z. B. Schlossschrauben oder Auflage.`, targets: j ? [j.a, j.b] : [], pos: j?.pos })
  }
  const sMax = Math.max(s.sway.x, s.sway.y)
  if (s.swayClass !== 'steif')
    out.push({ id: 'statik-wackeln', severity: s.swayClass === 'wackelt' ? 'warnung' : 'hinweis', category: 'Stabilität', title: s.swayClass === 'wackelt' ? `Gestell wackelt (${sMax.toFixed(0)} mm bei 0,5 kN Seitenlast)` : `Gestell gibt spürbar nach (${sMax.toFixed(0)} mm bei 0,5 kN)`, detail: 'Kopfbänder oder Diagonalen einbauen, zwei Pfosten an der Wand befestigen oder steifere Verbindungen wählen. In der Statik-Ansicht „Wackeln“ abspielen.', targets: [] })
  out.push({ id: 'statik-info', severity: 'hinweis', category: 'Stabilität', title: `Statik-Abschätzung: höchste Ausnutzung ${pct(s.maxUtil)}`, detail: 'Vereinfachte Rechnung des ganzen Gestells (EC5, Lastprofil unter Raum → Einstellungen). Keine Tragwerksplanung.', targets: [] })
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
        <b>Statik</b>
        {stale && <span className="muted"> · rechnet…</span>}
        <button className="link" onClick={() => s.set({ staticsMode: false, wobble: false })}>
          schließen
        </button>
      </header>
      {!st && <p className="hint">Wird berechnet…</p>}
      {st && (
        <>
          <div className="summary">
            <div>
              <b style={{ color: UTIL_COLOR(st.maxUtil) }}>{pct(st.maxUtil)}</b>
              <span>höchste Ausnutzung</span>
            </div>
            <div>
              <b style={{ color: st.swayClass === 'steif' ? '#2f9e5b' : st.swayClass === 'spürbar' ? '#e0a400' : '#d64545' }}>{Math.max(st.sway.x, st.sway.y).toFixed(1)} mm</b>
              <span>Wackeln ({st.swayClass})</span>
            </div>
          </div>
          <label className="field">
            <span>Verformung zeigen</span>
            <select value={s.staticsCase} onChange={(e) => s.set({ staticsCase: e.target.value as typeof s.staticsCase })}>
              <option value="gq">Eigengewicht + Nutzlast</option>
              <option value="jump">Toben (2 kN)</option>
              <option value="hx">Seitenlast längs (0,5 kN)</option>
              <option value="hy">Seitenlast quer (0,5 kN)</option>
            </select>
          </label>
          <label className="field">
            <span>Überhöhung ×{s.staticsScale}</span>
            <input type="range" min={1} max={100} value={s.staticsScale} onChange={(e) => s.set({ staticsScale: Number(e.target.value) })} />
          </label>
          <button className={s.wobble ? 'on' : ''} onClick={() => s.set({ wobble: !s.wobble, staticsCase: s.staticsCase === 'gq' || s.staticsCase === 'jump' ? (st.sway.y > st.sway.x ? 'hy' : 'hx') : s.staticsCase })}>
            {s.wobble ? '⏸ Wackeln stoppen' : '▶ Wackeln abspielen'}
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
                {names.get(c.memberId)?.name ?? 'Bauteil'} <b>{pct(c.util)}</b>
                <small>{c.governing}</small>
              </li>
            ))}
          </ul>
          <p className="hint">Abschätzung nach EC5 (vereinfacht) für das ganze Gestell. Ersetzt keine Tragwerksplanung.</p>
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
            ['Biegung/Normalkraft', c.bending],
            ['Schub', c.shear],
            ['Durchbiegung', c.deflection],
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
      {c.span > 0 && <p className="hint">Durchbiegung im Endzustand {c.w.toFixed(1)} mm auf {fmtCm(c.span, 0)} (Grenze L/200).</p>}
      {!compare ? (
        <button onClick={() => setCompare(true)}>Querschnitte vergleichen</button>
      ) : (
        <table className="compare">
          <tbody>
            {options.map((o) => (
              <tr key={o.t.id}>
                <td>{o.t.name.replace(/, gehobelt/, '')}</td>
                <td style={{ color: UTIL_COLOR(o.util) }}>{pct(o.util)}</td>
                <td>{eur(o.t.pricePerM)}/m</td>
                <td>
                  <button className="link" onClick={() => apply(o.t.id)}>
                    nehmen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {m.assemblyId && compare && <p className="hint">Gilt für alle gleichartigen Teile der Vorlage.</p>}
    </div>
  )
}
