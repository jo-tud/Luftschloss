import { Component, type ReactNode } from 'react'
import { t } from '../i18n'
import { STORAGE_KEY } from '../state/store'

/**
 * Letzte Rettung bei einem Darstellungsfehler: statt einer weißen Seite (die nach dem Neuladen wieder
 * käme, weil der Stand gespeichert ist) den Stand sichern lassen und neu anfangen können.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const raw = (() => {
      try {
        return localStorage.getItem(STORAGE_KEY)
      } catch {
        return null
      }
    })()
    const download = () => {
      if (!raw) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
      a.download = 'luftschloss-sicherung.json'
      a.click()
    }
    const reset = () => {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // dann eben nur neu laden
      }
      location.reload()
    }
    return (
      <div className="crash" role="alert">
        <h1>{t('Da ist etwas schiefgegangen')}</h1>
        <p>{t('Luftschloss konnte dieses Projekt nicht darstellen. Sichere den Stand als Datei, bevor du neu anfängst – so geht nichts verloren.')}</p>
        <pre>{error.message}</pre>
        <div className="crash-actions">
          {raw && (
            <button className="primary" onClick={download}>
              {t('Stand als Datei sichern')}
            </button>
          )}
          <button onClick={reset}>{t('Mit dem Beispielzimmer neu starten')}</button>
          <button onClick={() => location.reload()}>{t('Neu laden')}</button>
        </div>
      </div>
    )
  }
}
