import { useEffect, useMemo } from 'react'
import { buildSteps } from '../analysis/assembly'
import { useDerived, useStore } from '../state/store'

/** Abspieler für die Aufbau-Animation: Schritt für Schritt fliegen die Teile an ihren Platz. */
export function BuildPlayer() {
  const build = useStore((s) => s.build)
  const set = useStore((s) => s.set)
  const project = useStore((s) => s.project)
  const d = useDerived()
  const steps = useMemo(() => buildSteps(project, d.resolved), [project, d])
  useEffect(() => {
    if (!build?.auto) return
    const st = steps[build.step]
    const n = (st?.memberIds.length ?? 0) + (st?.panelIds.length ?? 0)
    const t = setTimeout(() => {
      if (build.step < steps.length - 1) set({ build: { step: build.step + 1, start: performance.now(), auto: true } })
      else set({ build: { ...build, auto: false } })
    }, 900 + n * 120 + 1400)
    return () => clearTimeout(t)
  }, [build, steps, set])
  if (!build) return null
  const st = steps[build.step]
  const go = (i: number) => set({ build: { step: Math.max(0, Math.min(steps.length - 1, i)), start: performance.now(), auto: false } })
  return (
    <div className="build-player">
      <div className="bp-head">
        <b>
          Aufbau · Schritt {build.step + 1}/{steps.length}: {st?.title}
        </b>
        <button className="link" onClick={() => set({ build: null })}>
          beenden
        </button>
      </div>
      <p>{st?.text}</p>
      {st?.tools.length ? <p className="hint">Werkzeug: {st.tools.join(', ')}</p> : null}
      <div className="row">
        <button onClick={() => go(build.step - 1)} disabled={build.step === 0} title="Schritt zurück">
          ◀
        </button>
        <button onClick={() => set({ build: { ...build, start: performance.now(), auto: !build.auto } })}>{build.auto ? '⏸ Pause' : '▶ Abspielen'}</button>
        <button onClick={() => go(build.step + 1)} disabled={build.step >= steps.length - 1} title="Nächster Schritt">
          ▶
        </button>
        <div className="bp-dots">
          {steps.map((s, i) => (
            <span key={i} className={i === build.step ? 'on' : i < build.step ? 'done' : ''} onClick={() => go(i)} title={s.title} />
          ))}
        </div>
      </div>
    </div>
  )
}
