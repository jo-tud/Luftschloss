import { useMemo, useState } from 'react'
import { t, tr } from '../i18n'
import { fmtCm, fmtM, uid, wallFrame } from '../model/geometry'
import { BED_TYPE_LABEL } from '../model/loftbed'
import type { WallId } from '../model/types'
import { WALL_IDS } from '../model/types'
import { CLEARANCE, HEADROOM, defaultAnswers, proposals, roomProject, type BelowUse, type SleeperAge, type WallKind, type WizardAnswers, type WizardOpening } from '../model/wizard'
import { useStore } from '../state/store'
import { Check, Num, Sel, eur } from './fields'

/**
 * Planungsassistent für Einsteiger: in sechs Schritten vom leeren Raum zum ersten, geprüften
 * Hochbettentwurf. Alle Werte lassen sich danach in der App weiter anpassen.
 */
export function WizardDialog() {
  const show = useStore((s) => s.showWizard)
  const set = useStore((s) => s.set)
  const [a, setA] = useState<WizardAnswers>(defaultAnswers)
  const [step, setStep] = useState(0)
  if (!show) return null
  const patch = (p: Partial<WizardAnswers>) => setA((x) => ({ ...x, ...p }))
  const steps = [t('Raum'), t('Wände'), t('Fenster & Türen'), t('Wer schläft oben?'), t('Darunter'), t('Vorschläge')]
  const close = () => set({ showWizard: false })
  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal wizard" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('Planungsassistent')}>
        <header>
          <h2>🧭 {t('Planungsassistent')}</h2>
          <ol className="wiz-steps">
            {steps.map((s, i) => (
              <li key={i} className={i === step ? 'on' : i < step ? 'done' : ''}>
                <button onClick={() => setStep(i)}>
                  <span>{i + 1}</span> {s}
                </button>
              </li>
            ))}
          </ol>
          <button className="close" onClick={close} aria-label={t('Schließen')}>
            ✕
          </button>
        </header>
        <div className="modal-body wiz-body">
          <div className="wiz-main">
            {step === 0 && <RoomStep a={a} patch={patch} />}
            {step === 1 && <WallStep a={a} patch={patch} />}
            {step === 2 && <OpeningStep a={a} patch={patch} />}
            {step === 3 && <SleeperStep a={a} patch={patch} />}
            {step === 4 && <BelowStep a={a} patch={patch} />}
            {step === 5 && <ProposalStep a={a} onDone={close} />}
          </div>
          {step < 5 && (
            <aside className="wiz-side">
              <RoomSketch a={a} highlight={step === 1 ? 'walls' : step === 2 ? 'openings' : undefined} />
            </aside>
          )}
        </div>
        <footer className="wiz-foot">
          <button onClick={() => (step === 0 ? close() : setStep(step - 1))}>{step === 0 ? t('Abbrechen') : `← ${t('Zurück')}`}</button>
          <span className="muted">{t('Schritt {n} von {m}', { n: step + 1, m: steps.length })}</span>
          {step < 5 && (
            <button className="primary" onClick={() => setStep(step + 1)}>
              {step === 4 ? t('Vorschläge berechnen') : t('Weiter')} →
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

type StepProps = { a: WizardAnswers; patch: (p: Partial<WizardAnswers>) => void }

function RoomStep({ a, patch }: StepProps) {
  return (
    <>
      <h3>{t('Wie groß ist dein Zimmer?')}</h3>
      <p className="hint">{t('Miss innen von Wand zu Wand. Wand A ist die Wand mit dem Fenster, die anderen folgen im Uhrzeigersinn. Ungefähre Werte reichen für den Anfang – alles lässt sich später ändern.')}</p>
      <div className="pair">
        <Num label={t('Länge (Wand A)')} value={a.length} onChange={(v) => patch({ length: v })} min={1500} max={12000} />
        <Num label={t('Breite (Wand B)')} value={a.width} onChange={(v) => patch({ width: v })} min={1500} max={12000} />
      </div>
      <Num label={t('Raumhöhe')} value={a.height} onChange={(v) => patch({ height: v })} min={2000} max={6000} />
      <Sel
        label={t('Decke')}
        value={a.ceiling}
        options={[
          ['beton', t('Beton (Neubau, Plattenbau)')],
          ['holzbalken', t('Holzbalkendecke (Altbau)')],
          ['abgehaengt', t('Abgehängt (Gipskarton)')],
          ['schwach', t('Weiß nicht')],
        ]}
        onChange={(v) => patch({ ceiling: v })}
        title={t('Wichtig, falls das Bett bis zur Decke verspannt oder an ihr aufgehängt wird')}
      />
    </>
  )
}

function WallStep({ a, patch }: StepProps) {
  return (
    <>
      <h3>{t('Woraus sind die Wände?')}</h3>
      <p className="hint">{t('Klopf an die Wand: Massive Wände (Ziegel, Beton) klingen dumpf und tragen ein Hochbett mit. Leichtbauwände (Gipskarton) klingen hohl – dort nur Kippsicherung mit Hohlraumdübeln. Im Zweifel „weiß nicht“.')}</p>
      {WALL_IDS.map((w) => (
        <Sel<WallKind>
          key={w}
          label={t('Wand {w}', { w })}
          value={a.walls[w]}
          options={[
            ['massiv', t('massiv (Ziegel, Beton)')],
            ['leicht', t('Leichtbau (hohl)')],
            ['unbekannt', t('weiß nicht')],
          ]}
          onChange={(v) => patch({ walls: { ...a.walls, [w]: v } })}
        />
      ))}
    </>
  )
}

function OpeningStep({ a, patch }: StepProps) {
  const setO = (id: string, p: Partial<WizardOpening>) => patch({ openings: a.openings.map((o) => (o.id === id ? { ...o, ...p } : o)) })
  const add = (kind: WizardOpening['kind']) =>
    patch({
      openings: [
        ...a.openings,
        kind === 'fenster'
          ? { id: uid('fenster'), kind, wall: 'A', offset: 500, width: 1000, height: 1400, bottom: 850 }
          : kind === 'tuer'
            ? { id: uid('tuer'), kind, wall: 'C', offset: 300, width: 885, height: 2010, bottom: 0 }
            : { id: uid('heizung'), kind, wall: 'A', offset: 500, width: 1000, height: 600, bottom: 150 },
      ],
    })
  const label = (k: WizardOpening['kind']) => (k === 'fenster' ? `🪟 ${t('Fenster')}` : k === 'tuer' ? `🚪 ${t('Tür')}` : `♨ ${t('Heizkörper')}`)
  return (
    <>
      <h3>{t('Wo sind Fenster, Türen und Heizkörper?')}</h3>
      <p className="hint">{t('Abstand jeweils von der linken Ecke der Wand, vom Raum aus gesehen. Das Bett soll keine Fensterflügel blockieren und nicht vor der Tür stehen – darauf achtet der Assistent.')}</p>
      {a.openings.map((o) => (
        <fieldset key={o.id} className="wiz-opening">
          <legend>
            {label(o.kind)}
            <button className="link" onClick={() => patch({ openings: a.openings.filter((x) => x.id !== o.id) })} aria-label={t('Entfernen')}>
              🗑
            </button>
          </legend>
          <div className="pair">
            <Sel<WallId> label={t('Wand')} value={o.wall} options={WALL_IDS.map((w) => [w, t('Wand {w}', { w })])} onChange={(v) => setO(o.id, { wall: v })} />
            <Num label={t('Abstand von links')} value={o.offset} onChange={(v) => setO(o.id, { offset: v })} min={0} />
          </div>
          <div className="pair">
            <Num label={t('Breite')} value={o.width} onChange={(v) => setO(o.id, { width: v })} min={300} />
            <Num label={t('Höhe')} value={o.height} onChange={(v) => setO(o.id, { height: v })} min={300} />
            {o.kind !== 'tuer' && <Num label={o.kind === 'fenster' ? t('Brüstung') : t('Unterkante')} value={o.bottom} onChange={(v) => setO(o.id, { bottom: v })} min={0} />}
          </div>
        </fieldset>
      ))}
      <div className="add-row">
        <button onClick={() => add('fenster')}>+ {t('Fenster')}</button>
        <button onClick={() => add('tuer')}>+ {t('Tür')}</button>
        <button onClick={() => add('heizkoerper')}>+ {t('Heizkörper')}</button>
      </div>
    </>
  )
}

function SleeperStep({ a, patch }: StepProps) {
  const sizes: [string, string][] = [
    ['900x2000', '90 × 200'],
    ['1000x2000', '100 × 200'],
    ['1200x2000', '120 × 200'],
    ['1400x2000', '140 × 200'],
  ]
  return (
    <>
      <h3>{t('Wer schläft oben?')}</h3>
      <Sel
        label={t('Anzahl')}
        value={String(a.sleepers) as '1'}
        options={[
          ['1', t('eine Person')],
          ['2', t('zwei Kinder nebeneinander')],
        ]}
        onChange={(v) => patch({ sleepers: Number(v) as 1 | 2, mattressWidth: v === '2' ? 900 : a.mattressWidth })}
      />
      <Sel label={t('Matratze (cm)')} value={`${a.mattressWidth}x${a.mattressLength}`} options={sizes} onChange={(v) => patch({ mattressWidth: Number(v.split('x')[0]), mattressLength: Number(v.split('x')[1]) })} />
      <Sel<SleeperAge>
        label={t('Alter')}
        value={a.age}
        options={[
          ['klein', t('Kind unter 6 Jahren')],
          ['kind', t('Kind ab 6 Jahren')],
          ['jugend', t('Jugendliche')],
          ['erwachsen', t('Erwachsene')],
        ]}
        onChange={(v) => patch({ age: v })}
      />
      {a.age === 'klein' && <p className="hint warn">{t('Nach DIN EN 747 sind Hochbetten erst ab 6 Jahren geeignet. Der Assistent schlägt daher ein halbhohes Bett (höchstens 1 m) vor.')}</p>}
      <p className="hint">{t('Zum Aufsetzen im Bett braucht es über der Matratze etwa {h} Kopfraum.', { h: fmtM(HEADROOM[a.age]) })}</p>
    </>
  )
}

function BelowStep({ a, patch }: StepProps) {
  const uses: [BelowUse, string, string][] = [
    ['stauraum', '📦', t('Stauraum, Kisten')],
    ['spielen', '🧸', t('Spielecke')],
    ['sitzen', '🛋', t('Sitzecke, Sofa')],
    ['schreibtisch', '🪑', t('Schreibtisch')],
    ['stehen', '🧍', t('Stehen, Kleiderschrank')],
  ]
  return (
    <>
      <h3>{t('Was soll unter das Bett?')}</h3>
      <div className="wiz-cards">
        {uses.map(([k, icon, label]) => (
          <button key={k} className={`wiz-card${a.below === k ? ' on' : ''}`} onClick={() => patch({ below: k })}>
            <span className="icon">{icon}</span>
            <b>{label}</b>
            <small>{t('{h} frei', { h: fmtM(CLEARANCE[k]) })}</small>
          </button>
        ))}
      </div>
      <p className="hint">{t('Unten {u} frei und oben {o} Kopfraum ergeben zusammen mit Bett und Matratze die nötige Raumhöhe. Reicht sie nicht, schlägt der Assistent einen Kompromiss vor.', { u: fmtM(CLEARANCE[a.below]), o: fmtM(HEADROOM[a.age]) })}</p>
      <h3>{t('Befestigung')}</h3>
      <Check label={t('Das Bett darf an massive Wände geschraubt werden (tragend)')} value={a.wallFixing} onChange={(v) => patch({ wallFixing: v })} />
      <p className="hint">{t('In Mietwohnungen oft nicht gewünscht: Dann steht das Bett frei auf vier Pfosten, an der Wand nur gegen Kippen gesichert.')}</p>
    </>
  )
}

function cornerText(c: string): string {
  return t('Ecke Wand {a}/{b}', { a: c[0], b: c[1] })
}

function ProposalStep({ a, onDone }: { a: WizardAnswers; onDone: () => void }) {
  const list = useMemo(() => proposals(a), [a])
  const replace = useStore((s) => s.replaceProject)
  const take = (i: number) => {
    const pr = list[i]
    replace({ ...pr.project, assemblies: pr.project.assemblies.map((x) => ({ ...x, name: BED_TYPE_LABEL[pr.type] })) })
    const s = useStore.getState()
    const id = s.project.assemblies[0]?.id
    s.set({ sidebar: 'bett' })
    s.setView({ kind: '3d' })
    if (id) {
      s.select({ kind: 'assembly', id })
      setTimeout(() => useStore.getState().focus(id), 80)
    }
    onDone()
  }
  if (!list.length)
    return (
      <>
        <h3>{t('Keine passende Lösung gefunden')}</h3>
        <p>{t('Mit diesen Maßen passt kein Bett sinnvoll in eine Ecke. Prüfe Raummaße und Öffnungen – oder lege ein leeres Zimmer an und setze eine Vorlage von Hand.')}</p>
        <button onClick={() => (replace(roomProject(a)), onDone())}>{t('Nur das Zimmer übernehmen')}</button>
      </>
    )
  return (
    <>
      <h3>{t('Vorschläge für dein Zimmer')}</h3>
      <p className="hint">{t('Jeder Vorschlag ist schon geprüft: Kollisionen, Fenster und Tür, Kopfraum, Material. Übernimm einen und passe ihn danach frei an.')}</p>
      <div className="wiz-proposals">
        {list.map((p, i) => (
          <article key={p.key} className={`wiz-proposal${i === 0 ? ' best' : ''}`}>
            <header>
              {i === 0 && <span className="badge">{t('Empfehlung')}</span>}
              <b>{tr(BED_TYPE_LABEL[p.type])}</b>
              <small>{p.type === 'nische' ? t('Wand B bis Wand D') : cornerText(p.corner)}</small>
            </header>
            <ul>
              <li>
                {t('Darunter frei')}: <b>{fmtM(p.clearance)}</b>
              </li>
              <li>
                {t('Kopfraum über der Matratze')}: <b>{fmtM(p.headroom)}</b>
              </li>
              <li>
                {t('Liegefläche')}: {fmtCm(p.params.mattressWidth * p.params.mattressCount, 0)} × {fmtCm(p.params.mattressLength, 0)}
              </li>
              <li>
                {t('Material ca.')} <b>{eur(p.cost)}</b>
              </li>
            </ul>
            {p.reasons.map((r, k) => (
              <p key={k} className="hint">
                {r}
              </p>
            ))}
            {p.compromise && <p className="hint warn">⚠ {p.compromise}</p>}
            <p className={`wiz-status${p.errors ? ' err' : p.warnings ? ' warn' : ' ok'}`}>
              {p.errors ? `⛔ ${t('{n} Fehler', { n: p.errors })}` : p.warnings ? `⚠ ${t('{n} Hinweise zum Prüfen', { n: p.warnings })}` : `✓ ${t('Keine Probleme gefunden')}`}
            </p>
            {p.issues.length > 0 && (
              <ul className="wiz-issues">
                {p.issues.map((s, k) => (
                  <li key={k}>{s}</li>
                ))}
              </ul>
            )}
            <button className={i === 0 ? 'primary' : ''} onClick={() => take(i)}>
              {t('Diesen Vorschlag übernehmen')}
            </button>
          </article>
        ))}
      </div>
      <p className="hint">{t('Der aktuelle Plan wird ersetzt (Rückgängig mit Strg+Z ist möglich).')}</p>
    </>
  )
}

/** Grundriss-Skizze: Wand A unten, Fenster, Türen, Heizkörper, Wandart farbig */
function RoomSketch({ a, highlight }: { a: WizardAnswers; highlight?: 'walls' | 'openings' }) {
  const room = roomProject(a).room
  const W = 260
  const s = Math.min((W - 40) / a.length, 200 / a.width)
  const x = (mm: number) => 20 + mm * s
  const y = (mm: number) => 20 + (a.width - mm) * s
  const color: Record<WallKind, string> = { massiv: '#8a5a2b', leicht: '#9db7d4', unbekannt: '#b9b4ac' }
  const ends: Record<WallId, [number, number, number, number]> = {
    A: [0, 0, a.length, 0],
    B: [0, 0, 0, a.width],
    C: [0, a.width, a.length, a.width],
    D: [a.length, 0, a.length, a.width],
  }
  return (
    <svg viewBox={`0 0 ${W} ${a.width * s + 40}`} className="wiz-sketch" role="img" aria-label={t('Grundriss')}>
      <rect x={x(0)} y={y(a.width)} width={a.length * s} height={a.width * s} fill="#f7f3ec" />
      {WALL_IDS.map((w) => {
        const [x0, y0, x1, y1] = ends[w]
        const mx = (x(x0) + x(x1)) / 2
        const my = (y(y0) + y(y1)) / 2
        const off = 12
        const lx = w === 'B' ? mx - off : w === 'D' ? mx + off : mx
        const ly = w === 'A' ? my + off + 2 : w === 'C' ? my - off + 4 : my + 4
        return (
          <g key={w}>
            <line x1={x(x0)} y1={y(y0)} x2={x(x1)} y2={y(y1)} stroke={highlight === 'walls' ? color[a.walls[w]] : '#6f6a62'} strokeWidth={highlight === 'walls' ? 6 : 4} strokeLinecap="square" />
            <text x={lx} y={ly} textAnchor="middle" fontSize={11} fill="#444">
              {w}
            </text>
          </g>
        )
      })}
      {a.openings.map((o) => {
        const f = wallFrame(room, o.wall)
        const p0 = { x: f.start.x + f.u.x * o.offset, y: f.start.y + f.u.y * o.offset }
        const p1 = { x: f.start.x + f.u.x * (o.offset + o.width), y: f.start.y + f.u.y * (o.offset + o.width) }
        const c = o.kind === 'fenster' ? '#4a90d9' : o.kind === 'tuer' ? '#c8752e' : '#d64545'
        const inset = o.kind === 'heizkoerper' ? 6 : 0
        return (
          <line
            key={o.id}
            x1={x(p0.x + f.n.x * inset / s)}
            y1={y(p0.y + f.n.y * inset / s)}
            x2={x(p1.x + f.n.x * inset / s)}
            y2={y(p1.y + f.n.y * inset / s)}
            stroke={c}
            strokeWidth={highlight === 'openings' ? 7 : 5}
          />
        )
      })}
      <text x={W / 2} y={a.width * s + 36} textAnchor="middle" fontSize={10} fill="#777">
        {fmtCm(a.length, 0)} × {fmtCm(a.width, 0)} · {t('Höhe {h}', { h: fmtCm(a.height, 0) })}
      </text>
    </svg>
  )
}
