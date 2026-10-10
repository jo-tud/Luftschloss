import { useEffect, useState, type ReactNode } from 'react'

/** Zahleneingabe in cm (intern mm). Übernimmt beim Verlassen oder Enter. */
export function Num({ label, value, onChange, unit = 'cm', step, min, max, title, estimated }: { label: string; value: number; onChange: (mm: number) => void; unit?: 'cm' | 'mm' | '°' | ''; step?: number; min?: number; max?: number; title?: string; estimated?: boolean }) {
  const factor = unit === 'cm' ? 10 : 1
  const shown = Math.round((value / factor) * 10) / 10
  const [text, setText] = useState(String(shown))
  useEffect(() => setText(String(shown)), [shown])
  const commit = () => {
    const n = Number(text.replace(',', '.'))
    if (!Number.isFinite(n)) return setText(String(shown))
    let mm = Math.round(n * factor)
    if (min !== undefined) mm = Math.max(min, mm)
    if (max !== undefined) mm = Math.min(max, mm)
    if (mm !== value) onChange(mm)
    else setText(String(shown))
  }
  return (
    <label className={`field${estimated ? ' est' : ''}`} title={estimated ? 'Geschätzt – bitte nachmessen' : title}>
      <span>{label}</span>
      <span className="num">
        <input
          type="number"
          value={text}
          step={step ?? (unit === 'cm' ? 0.5 : 1)}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
        />
        {unit && <em>{unit}</em>}
      </span>
    </label>
  )
}

export function Sel<T extends string>({ label, value, options, onChange, title }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; title?: string }) {
  return (
    <label className="field" title={title}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Check({ label, value, onChange, title }: { label: string; value: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <label className="check" title={title}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function Section({ title, children, open = true, right }: { title: string; children: ReactNode; open?: boolean; right?: ReactNode }) {
  return (
    <details className="section" open={open}>
      <summary>
        <span>{title}</span>
        {right}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  )
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="row">{children}</div>
}

export const eur = (x: number) => x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
