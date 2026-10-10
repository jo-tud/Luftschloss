import { useEffect, useRef, useState } from 'react'
import { t, tr } from '../i18n'
import en from '../i18n/en'
import { emptyProject, testProject } from '../model/defaults'
import type { Project } from '../model/types'
import { migrate, useStore } from '../state/store'

export function exportProject(p: Project) {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${p.name.replace(/\s+/g, '-').toLowerCase()}.hochbett.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function importProject() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text()) as Project
      if (data.version !== 1 || !data.room) throw new Error(t('kein Luftschloss-Projekt'))
      useStore.getState().replaceProject(migrate(data))
    } catch (err) {
      alert(t('Datei konnte nicht gelesen werden: {msg}', { msg: (err as Error).message }))
    }
  }
  input.click()
}

/** Planungsassistent öffnen: Schritt für Schritt vom leeren Raum zum ersten Entwurf */
export function openWizard() {
  useStore.getState().set({ showWizard: true, leftOpen: false, rightOpen: false })
}

export function newEmptyRoom() {
  if (!confirm(t('Aktuellen Plan verwerfen und mit einem leeren Zimmer beginnen? (Rückgängig ist möglich.)'))) return
  const s = useStore.getState()
  s.replaceProject(emptyProject())
  s.set({ sidebar: 'raum', leftOpen: true, rightOpen: false })
}

export function loadExample() {
  if (!confirm(t('Aktuellen Plan durch das Beispielzimmer ersetzen? (Rückgängig ist möglich.)'))) return
  useStore.getState().replaceProject(testProject())
}

export function ProjectActions() {
  const p = useStore((s) => s.project)
  return (
    <div className="stack">
      <label className="field">
        <span>{t('Name')}</span>
        <input value={p.name} onChange={(e) => useStore.getState().update((d) => void (d.name = e.target.value), 'name')} />
      </label>
      <button onClick={() => exportProject(p)}>{t('Projekt speichern als Datei (.json)')}</button>
      <button onClick={importProject}>{t('Projektdatei öffnen…')}</button>
      <button onClick={loadExample}>{t('Beispielzimmer laden')}</button>
      <button onClick={openWizard}>🧭 {t('Planungsassistent')}</button>
      <button onClick={newEmptyRoom}>{t('Neues, leeres Zimmer')}</button>
    </div>
  )
}

/** Projektmenü im Kopf: Name, Speicherstatus, Neu/Öffnen/Speichern */
export function ProjectMenu() {
  const p = useStore((s) => s.project)
  const savedAt = useStore((s) => s.savedAt)
  const ref = useRef<HTMLDetailsElement>(null)
  const close = () => ref.current?.removeAttribute('open')
  const status = savedAt < 0 ? t('nicht gespeichert – bitte als Datei sichern') : t('automatisch im Browser gespeichert')
  return (
    <details className="dropdown project-menu" ref={ref}>
      <summary title={t('Projekt: {name} · {status}', { name: tr(p.name), status })}>
        <span className="proj">{tr(p.name)}</span>
        <span className={`saved${savedAt < 0 ? ' err' : ''}`} aria-label={status}>
          {savedAt < 0 ? '⚠' : '✓'}
        </span>
        <span className="lbl"> ▾</span>
      </summary>
      <div className="menu" onClick={close}>
        <p className="hint">{status}</p>
        <button onClick={openWizard}>🧭 {t('Planungsassistent')}</button>
        <button onClick={newEmptyRoom}>{t('Neues, leeres Zimmer')}</button>
        <button onClick={importProject}>{t('Öffnen…')}</button>
        <button onClick={() => exportProject(p)}>{t('Als Datei speichern')}</button>
        <button onClick={loadExample}>{t('Beispielzimmer laden')}</button>
      </div>
    </details>
  )
}

const SEEN_KEY = 'luftschloss.beispiel-gesehen'

/** Name des Beispielzimmers – in jeder Sprache, in der es angelegt sein kann */
function isExampleName(name: string): boolean {
  return name === testProject().name || name === 'Beispielzimmer' || name === en['Beispielzimmer'] // i18n-ok
}

/** Beim ersten Start: Hinweis, dass ein Beispielzimmer geladen ist */
export function ExampleBanner() {
  const name = useStore((s) => s.project.name)
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) === '1'
    } catch {
      return false
    }
  })
  const dismiss = () => {
    setSeen(true)
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      // nur Komfort
    }
  }
  useEffect(() => {
    if (!isExampleName(name)) dismiss()
  }, [name])
  if (seen || !isExampleName(name)) return null
  return (
    <div className="example-banner" role="status">
      <span>
        <b>{t('Beispielzimmer')}</b> – {t('zum Ausprobieren. Maße und Bett lassen sich direkt anpassen.')}
      </span>
      <button
        className="primary"
        onClick={() => {
          dismiss()
          openWizard()
        }}
      >
        🧭 {t('Eigenes Zimmer planen')}
      </button>
      <button onClick={dismiss}>{t('Beispiel ansehen')}</button>
    </div>
  )
}
