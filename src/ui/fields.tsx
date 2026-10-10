import { locale, t } from '../i18n'
import { useEffect, useState, type ReactNode } from 'react'

/** Zahl deutsch anzeigen (Dezimalkomma, ohne Tausenderpunkt) */
export const fmtNum = (x: number, digits = 1) => x.toLocaleString(locale(), { maximumFractionDigits: digits, useGrouping: false })

/** Liest „412,5“, „412.5“ und „1.234,5“; gibt NaN für alles andere */
export function parseNum(text: string): number {
  let s = text.trim().replace(/\s/g, '')
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '')
  s = s.replace(',', '.')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN
  return Number(s)
}

/**
 * Zahleneingabe in cm (intern mm). Nimmt Komma und Punkt an, übernimmt beim Verlassen oder Enter.
 * Werte außerhalb der Grenzen werden nicht still korrigiert, sondern am Feld erklärt.
 */
export function Num({ label, value, onChange, unit = 'cm', step, min, max, title, estimated }: { label: string; value: number; onChange: (mm: number) => void; unit?: 'cm' | 'mm' | '°' | ''; step?: number; min?: number; max?: number; title?: string; estimated?: boolean }) {
  const factor = unit === 'cm' ? 10 : 1
  const shown = Math.round((value / factor) * 10) / 10
  const [text, setText] = useState(fmtNum(shown))
  const [error, setError] = useState('')
  useEffect(() => {
    setText(fmtNum(shown))
    setError('')
  }, [shown])
  const show = (mm: number) => `${fmtNum(mm / factor)}${unit ? ` ${unit}` : ''}`
  // Grundplausibilität, wenn das Feld nichts Genaueres vorgibt: höchstens 50 m
  const hi = max ?? (unit === 'cm' || unit === 'mm' ? 50000 : undefined)
  const commit = () => {
    const n = parseNum(text)
    if (!Number.isFinite(n)) return setError(t('Bitte eine Zahl eingeben, z. B. {example}', { example: fmtNum(shown || 412.5) }))
    const mm = Math.round(n * factor)
    if (min !== undefined && mm < min) return setError(t('Nicht übernommen: mindestens {min}', { min: show(min) }))
    if (hi !== undefined && mm > hi) return setError(t('Nicht übernommen: höchstens {max}', { max: show(hi) }))
    setError('')
    if (mm !== value) onChange(mm)
    else setText(fmtNum(shown))
  }
  return (
    <label className={`field${estimated ? ' est' : ''}${error ? ' invalid' : ''}`} title={estimated ? t('Geschätzt – bitte nachmessen') : title}>
      <span>
        {label}
        {estimated && <small className="est-tag"> {t('geschätzt')}</small>}
      </span>
      <span className="num">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          aria-invalid={!!error}
          data-step={step}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setText(fmtNum(shown))
              setError('')
            }
          }}
        />
        {unit && <em>{unit}</em>}
      </span>
      {error && <small className="field-error">{error}</small>}
    </label>
  )
}

export function Sel<T extends string>({ label, value, options, onChange, title }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; title?: string }) {
  // Lange Einträge passen nicht in die schmale Spalte: dann Beschriftung oben, Auswahl volle Breite
  const long = options.some(([, l]) => l.length > 13)
  return (
    <label className={long ? 'field stacked' : 'field'} title={title}>
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

export const eur = (x: number) => x.toLocaleString(locale(), { style: 'currency', currency: 'EUR' })
